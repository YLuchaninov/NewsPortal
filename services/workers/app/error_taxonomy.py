from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

NewsPortalErrorDomain = Literal[
    "acquisition_url",
    "provider_fetch",
    "feed_parse",
    "website_discovery",
    "api_provider",
    "imap_provider",
    "content_analysis",
    "task_plugin",
    "delivery",
    "control_plane",
    "unknown",
]
NewsPortalErrorSeverity = Literal["info", "warning", "error"]
NewsPortalRetryHint = Literal["none", "retry", "after_operator_fix", "after_budget_reset"]


class NewsPortalErrorDiagnostic(BaseModel):
    code: str
    domain: NewsPortalErrorDomain
    severity: NewsPortalErrorSeverity
    retry_hint: NewsPortalRetryHint
    message: str | None = None


ERROR_CODE_DEFAULTS: dict[str, tuple[NewsPortalErrorDomain, NewsPortalErrorSeverity, NewsPortalRetryHint]] = {
    "acquisition_url.blocked": ("acquisition_url", "warning", "after_operator_fix"),
    "acquisition_url.final_blocked": ("acquisition_url", "warning", "after_operator_fix"),
    "provider_fetch.failed": ("provider_fetch", "warning", "retry"),
    "provider_fetch.body_too_large": ("provider_fetch", "warning", "after_operator_fix"),
    "feed_parse.no_valid_feed": ("feed_parse", "warning", "none"),
    "feed_parse.probe_failed": ("feed_parse", "warning", "retry"),
    "task_plugin.output_too_many_keys": ("task_plugin", "error", "after_operator_fix"),
    "task_plugin.output_too_large": ("task_plugin", "error", "after_operator_fix"),
    "task_plugin.output_not_serializable": ("task_plugin", "error", "after_operator_fix"),
    "task_plugin.failed": ("task_plugin", "error", "retry"),
}


def create_error_diagnostic(
    *,
    code: str,
    message: str | None = None,
    domain: NewsPortalErrorDomain | None = None,
    severity: NewsPortalErrorSeverity | None = None,
    retry_hint: NewsPortalRetryHint | None = None,
) -> NewsPortalErrorDiagnostic:
    default_domain, default_severity, default_retry_hint = ERROR_CODE_DEFAULTS.get(
        code,
        ("unknown", "error", "none"),
    )
    return NewsPortalErrorDiagnostic(
        code=code,
        domain=domain or default_domain,
        severity=severity or default_severity,
        retry_hint=retry_hint or default_retry_hint,
        message=message,
    )
