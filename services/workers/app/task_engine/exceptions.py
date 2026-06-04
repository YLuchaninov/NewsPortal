from __future__ import annotations

from services.workers.app.error_taxonomy import (
    SignalOpsErrorDiagnostic,
    SignalOpsErrorDomain,
    SignalOpsRetryHint,
    create_error_diagnostic,
)


class TaskExecutionError(Exception):
    """Expected task execution failure."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        error_code: str | None = None,
        error_domain: SignalOpsErrorDomain = "task_plugin",
        retry_hint: SignalOpsRetryHint | None = None,
    ):
        super().__init__(message)
        self.retryable = retryable
        self.error_code = error_code or "task_plugin.failed"
        self.error_domain = error_domain
        self.retry_hint = retry_hint or ("retry" if retryable else None)

    def to_diagnostic(self) -> SignalOpsErrorDiagnostic:
        return create_error_diagnostic(
            code=self.error_code,
            message=str(self),
            domain=self.error_domain,
            retry_hint=self.retry_hint,
        )


class TaskValidationError(Exception):
    """Raised when task options are invalid."""

    def __init__(self, errors: list[str]):
        super().__init__(f"Validation failed: {'; '.join(errors)}")
        self.errors = errors
