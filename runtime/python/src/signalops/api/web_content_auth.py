from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from http.cookies import SimpleCookie
from typing import Any
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import HTTPException
from starlette.requests import Request

from signalops.api.database import query_one

WEB_SESSION_COOKIE = "np_web_session"


def api_content_auth_required() -> bool:
    normalized = str(os.getenv("SIGNALOPS_API_CONTENT_AUTH_REQUIRED", "")).strip().lower()
    return normalized in {"1", "true"}


def _test_auth_enabled() -> bool:
    normalized = str(os.getenv("SIGNALOPS_WEB_TEST_AUTH_ENABLED", "")).strip().lower()
    return normalized in {"1", "true"}


def _allowed_domain() -> str:
    return str(os.getenv("SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN", "")).strip().lower().lstrip("@")


def _email_allowed(email: str) -> bool:
    normalized_email = str(email).strip().lower()
    domain = _allowed_domain()
    if not normalized_email:
        return False
    if not domain:
        return True
    _, separator, email_domain = normalized_email.rpartition("@")
    return bool(separator and email_domain == domain)


def _read_session_cookie(request: Request) -> str:
    cookie_header = request.headers.get("cookie", "")
    cookies = SimpleCookie()
    cookies.load(cookie_header)
    morsel = cookies.get(WEB_SESSION_COOKIE)
    return str(morsel.value).strip() if morsel else ""


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _sign_test_payload(encoded_payload: str) -> str:
    secret = str(os.getenv("APP_SECRET", "")).strip()
    if not secret:
        raise HTTPException(status_code=401, detail="API content auth is not configured.")
    digest = hmac.new(
        f"web-test-auth:{secret}".encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _base64url_encode(digest)


def _verify_test_identity(token: str) -> dict[str, str] | None:
    if not _test_auth_enabled() or not token.startswith("test-google."):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    _, encoded_payload, signature = parts
    if not hmac.compare_digest(signature, _sign_test_payload(encoded_payload)):
        return None
    try:
        payload = json.loads(_base64url_decode(encoded_payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if (
        payload.get("v") != 1
        or payload.get("kind") != "web-test-google"
        or not isinstance(payload.get("sub"), str)
        or not isinstance(payload.get("email"), str)
        or not isinstance(payload.get("exp"), (int, float))
        or float(payload["exp"]) < time.time() * 1000
    ):
        return None
    email = str(payload["email"]).strip().lower()
    if not _email_allowed(email):
        return None
    return {"subject": str(payload["sub"]), "email": email}


def _firebase_lookup(token: str) -> dict[str, Any] | None:
    api_key = str(os.getenv("FIREBASE_WEB_API_KEY", "")).strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="API content auth is not configured.")
    request = UrlRequest(
        f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={api_key}",
        data=json.dumps({"idToken": token}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - external auth failures collapse to unauthorized.
        raise HTTPException(status_code=401, detail="Invalid web session.") from exc
    users = payload.get("users")
    return users[0] if isinstance(users, list) and users else None


def _verify_firebase_google_identity(token: str) -> dict[str, str] | None:
    test_identity = _verify_test_identity(token)
    if test_identity:
        return test_identity

    user = _firebase_lookup(token)
    if not user:
        return None
    provider_info = user.get("providerUserInfo")
    provider_ids = [
        str(item.get("providerId", ""))
        for item in provider_info
        if isinstance(item, dict)
    ] if isinstance(provider_info, list) else []
    email = str(user.get("email", "")).strip().lower()
    if (
        "google.com" not in provider_ids
        or user.get("emailVerified") is not True
        or not _email_allowed(email)
    ):
        return None
    subject = str(user.get("localId", "")).strip()
    return {"subject": subject, "email": email} if subject else None


def _assert_user_path_matches(identity: dict[str, str], user_id: str | None) -> None:
    if not user_id:
        return
    row = query_one(
        """
          select user_id
          from users
          where auth_provider = %s
            and auth_subject = %s
            and status = 'active'
        """,
        ("firebase_google", identity["subject"]),
    )
    if not row or str(row.get("user_id")) != str(user_id):
        raise HTTPException(status_code=403, detail="Forbidden.")


async def require_api_content_read_session(
    request: Request,
    user_id: str | None = None,
) -> None:
    if not api_content_auth_required():
        return

    token = _read_session_cookie(request)
    if not token:
        raise HTTPException(status_code=401, detail="Web session is required.")
    identity = _verify_firebase_google_identity(token)
    if not identity:
        raise HTTPException(status_code=401, detail="Authorized Google web session is required.")
    _assert_user_path_matches(identity, user_id)
