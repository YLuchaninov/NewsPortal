from __future__ import annotations


class TaskExecutionError(Exception):
    """Expected task execution failure."""

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class TaskValidationError(Exception):
    """Raised when task options are invalid."""

    def __init__(self, errors: list[str]):
        super().__init__(f"Validation failed: {'; '.join(errors)}")
        self.errors = errors
