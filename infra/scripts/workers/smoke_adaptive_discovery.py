from __future__ import annotations

import json
import os
import threading
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from services.workers.app.task_engine.adapters import web_search as web_search_module


class _FakeGeminiHandler(BaseHTTPRequestHandler):
    response_payload: dict[str, Any] = {}
    request_paths: list[str] = []

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        if content_length > 0:
            self.rfile.read(content_length)
        type(self).request_paths.append(self.path)
        encoded = json.dumps(type(self).response_payload, ensure_ascii=True).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003 - stdlib signature
        return None


class _FakeDdgsClient:
    calls: list[tuple[str, dict[str, Any]]] = []

    def text(self, **kwargs: Any) -> list[dict[str, Any]]:
        type(self).calls.append(("text", dict(kwargs)))
        return [
            {
                "href": "https://feeds.example.com/eu-ai.xml",
                "title": "EU AI feed",
                "body": "European AI coverage feed.",
            }
        ]

    def news(self, **kwargs: Any) -> list[dict[str, Any]]:
        type(self).calls.append(("news", dict(kwargs)))
        return [
            {
                "url": "https://news.example.com/eu-ai",
                "title": "EU AI daily",
                "body": "European AI daily roundup.",
                "source": "Example News",
                "date": "2026-03-28",
            }
        ]


def stable_uuid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"signalops-smoke:{name}"))


@contextmanager
def temporary_environment(values: dict[str, str]):
    previous: dict[str, str | None] = {key: os.environ.get(key) for key in values}
    try:
        for key, value in values.items():
            os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@contextmanager
def fake_ddgs_client():
    original_client = web_search_module._DDGS
    _FakeDdgsClient.calls = []
    web_search_module._DDGS = _FakeDdgsClient
    try:
        yield _FakeDdgsClient.calls
    finally:
        web_search_module._DDGS = original_client


@contextmanager
def fake_gemini_server(response_payload: dict[str, Any]):
    _FakeGeminiHandler.response_payload = response_payload
    _FakeGeminiHandler.request_paths = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeGeminiHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f"http://{host}:{port}", _FakeGeminiHandler.request_paths
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
