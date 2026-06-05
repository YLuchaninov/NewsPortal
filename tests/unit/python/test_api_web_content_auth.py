from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from services.api.app.web_content_auth import require_api_content_read_session


def _request_with_cookie(cookie: str = "") -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie:
        headers.append((b"cookie", cookie.encode("utf-8")))
    return Request({"type": "http", "method": "GET", "path": "/content-items", "headers": headers})


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _test_google_token(email: str, secret: str = "test-secret") -> str:
    payload = {
        "v": 1,
        "kind": "web-test-google",
        "sub": f"test-google:{email.lower()}",
        "email": email.lower(),
        "exp": int(time.time() * 1000) + 60_000,
    }
    encoded_payload = _base64url(json.dumps(payload).encode("utf-8"))
    signature = _base64url(
        hmac.new(
            f"web-test-auth:{secret}".encode("utf-8"),
            encoded_payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    return f"test-google.{encoded_payload}.{signature}"


class ApiWebContentAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_guard_is_noop_when_api_content_auth_flag_is_off(self) -> None:
        with patch.dict(os.environ, {"SIGNALOPS_API_CONTENT_AUTH_REQUIRED": "false"}, clear=False):
            await require_api_content_read_session(_request_with_cookie())

    async def test_guard_rejects_missing_cookie_when_api_content_auth_flag_is_on(self) -> None:
        with patch.dict(os.environ, {"SIGNALOPS_API_CONTENT_AUTH_REQUIRED": "true"}, clear=False):
            with self.assertRaises(HTTPException) as context:
                await require_api_content_read_session(_request_with_cookie())
            self.assertEqual(context.exception.status_code, 401)

    async def test_guard_accepts_valid_test_google_cookie_when_fixture_is_enabled(self) -> None:
        token = _test_google_token("web-user@example.com")
        with patch.dict(
            os.environ,
            {
                "SIGNALOPS_API_CONTENT_AUTH_REQUIRED": "true",
                "SIGNALOPS_WEB_TEST_AUTH_ENABLED": "true",
                "SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN": "example.com",
                "APP_SECRET": "test-secret",
            },
            clear=False,
        ):
            await require_api_content_read_session(
                _request_with_cookie(f"np_web_session={token}")
            )

    async def test_guard_rejects_user_path_mismatch(self) -> None:
        token = _test_google_token("web-user@example.com")
        with patch.dict(
            os.environ,
            {
                "SIGNALOPS_API_CONTENT_AUTH_REQUIRED": "true",
                "SIGNALOPS_WEB_TEST_AUTH_ENABLED": "true",
                "SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN": "example.com",
                "APP_SECRET": "test-secret",
            },
            clear=False,
        ), patch(
            "services.api.app.web_content_auth.query_one",
            return_value={"user_id": "other-user"},
        ):
            with self.assertRaises(HTTPException) as context:
                await require_api_content_read_session(
                    _request_with_cookie(f"np_web_session={token}"),
                    user_id="expected-user",
                )
            self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
