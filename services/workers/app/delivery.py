from __future__ import annotations

import json
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class DeliveryAttempt:
    status: str
    detail: str


def send_telegram_message(config_json: dict[str, Any], title: str, body: str) -> DeliveryAttempt:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = str(config_json.get("chat_id") or config_json.get("chatId") or "").strip()

    if not bot_token or not chat_id:
        return DeliveryAttempt(status="failed", detail="Telegram bot token or chat id is missing.")

    text = f"{title}\n\n{body}".strip()
    payload = {
        "chat_id": chat_id,
        "text": text[:4096],
        "disable_web_page_preview": False,
    }
    request = Request(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data=json.dumps(payload, ensure_ascii=True).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
            if response_payload.get("ok") is True:
                return DeliveryAttempt(status="sent", detail="telegram")
            return DeliveryAttempt(status="failed", detail=json.dumps(response_payload))
    except (HTTPError, URLError, TimeoutError) as error:
        return DeliveryAttempt(status="failed", detail=str(error))


def send_email_digest(config_json: dict[str, Any], title: str, body: str) -> DeliveryAttempt:
    smtp_url = os.getenv("EMAIL_DIGEST_SMTP_URL", "").strip()
    recipient = str(config_json.get("email") or "").strip()
    if not smtp_url or not recipient:
        return DeliveryAttempt(status="failed", detail="SMTP url or recipient email is missing.")

    from urllib.parse import urlparse

    parsed = urlparse(smtp_url)
    if not parsed.hostname:
        return DeliveryAttempt(status="failed", detail="SMTP url is invalid.")

    scheme = parsed.scheme.lower()
    if scheme not in {"smtp", "smtps", "smtp+starttls"}:
        return DeliveryAttempt(status="failed", detail=f"Unsupported SMTP scheme: {parsed.scheme}")

    username = parsed.username or ""
    password = parsed.password or ""
    port = parsed.port or (465 if scheme == "smtps" else 587)
    message = EmailMessage()
    message["Subject"] = title[:255]
    message["From"] = os.getenv("EMAIL_DIGEST_FROM", username or "newsportal@example.test")
    message["To"] = recipient
    message.set_content(body)

    try:
        if scheme == "smtps":
            with smtplib.SMTP_SSL(parsed.hostname, port, context=ssl.create_default_context()) as client:
                if username:
                    client.login(username, password)
                client.send_message(message)
        else:
            with smtplib.SMTP(parsed.hostname, port, timeout=20) as client:
                if scheme == "smtp+starttls":
                    client.starttls(context=ssl.create_default_context())
                if username:
                    client.login(username, password)
                client.send_message(message)
        return DeliveryAttempt(status="sent", detail="email_digest")
    except (OSError, smtplib.SMTPException) as error:
        return DeliveryAttempt(status="failed", detail=str(error))


def send_web_push(config_json: dict[str, Any], title: str, body: str) -> DeliveryAttempt:
    try:
        from pywebpush import webpush
    except Exception as error:  # pragma: no cover - optional dependency path
        return DeliveryAttempt(status="failed", detail=f"pywebpush is unavailable: {error}")

    subscription = config_json.get("subscription")
    if not isinstance(subscription, dict):
        return DeliveryAttempt(status="failed", detail="Web push subscription is missing.")

    vapid_private_key = os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()
    vapid_subject = os.getenv("WEB_PUSH_VAPID_SUBJECT", "mailto:admin@newsportal.local").strip()
    if not vapid_private_key:
        return DeliveryAttempt(status="failed", detail="WEB_PUSH_VAPID_PRIVATE_KEY is missing.")

    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body}, ensure_ascii=True),
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": vapid_subject},
            timeout=20,
        )
        return DeliveryAttempt(status="sent", detail="web_push")
    except Exception as error:  # pragma: no cover - dependency and network path
        return DeliveryAttempt(status="failed", detail=str(error))


def dispatch_channel_message(
    channel_type: str,
    config_json: dict[str, Any],
    title: str,
    body: str,
) -> DeliveryAttempt:
    if channel_type == "telegram":
        return send_telegram_message(config_json, title, body)
    if channel_type == "email_digest":
        return send_email_digest(config_json, title, body)
    if channel_type == "web_push":
        return send_web_push(config_json, title, body)
    return DeliveryAttempt(status="failed", detail=f"Unsupported channel type: {channel_type}")
