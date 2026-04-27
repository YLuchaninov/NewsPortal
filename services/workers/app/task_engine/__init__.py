from .context import ContextManager
from .content_analysis_plugins import (
    CONTENT_ANALYSIS_PLUGIN_CLASSES,
    register_content_analysis_plugins,
)
from .dispatch import (
    build_redis_connection_options as build_sequence_redis_connection_options,
    build_redis_url as build_sequence_redis_url,
    enqueue_sequence_run_job,
    enqueue_sequence_run_job_async,
    SequenceQueueDispatchError,
)
from .discovery_plugins import (
    DISCOVERY_ENRICHMENT_PLUGIN_CLASSES,
    DISCOVERY_PLUGIN_CLASSES,
    ENRICHMENT_PLUGIN_CLASSES,
    register_discovery_enrichment_plugins,
    register_discovery_plugins,
    register_enrichment_plugins,
    register_utility_plugins,
    UTILITY_PLUGIN_CLASSES,
)
from .discovery_runtime import (
    configure_discovery_runtime,
    DiscoveryRuntime,
    get_discovery_runtime,
    reset_discovery_runtime,
)
from .exceptions import TaskExecutionError, TaskValidationError
from .executor import SequenceExecutor
from .models import (
    DEFAULT_RETRY_ATTEMPTS,
    DEFAULT_RETRY_DELAY_MS,
    DEFAULT_TASK_TIMEOUT_MS,
    SequenceDefinition,
    SequenceRunRecord,
    TaskDefinition,
    TaskRetryPolicy,
)
from .pipeline_plugins import (
    BUILTIN_PLUGIN_CLASSES as PIPELINE_BUILTIN_PLUGIN_CLASSES,
    CORE_PIPELINE_PLUGIN_CLASSES,
    MAINTENANCE_PLUGIN_CLASSES,
    register_builtin_plugins as register_pipeline_builtin_plugins,
    register_core_pipeline_plugins,
    register_maintenance_plugins,
)
from .orchestrator_plugins import ORCHESTRATOR_PLUGIN_CLASSES, register_orchestrator_plugins
from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry
from .repository import PostgresSequenceRepository, SequenceRepository
from .runner import (
    extract_sequence_job_payload,
    SequenceJobPayloadError,
    SequenceRunJobProcessor,
)
from .scheduler import (
    CronExpression,
    parse_cron_expression,
    SequenceCronRepository,
    SequenceCronScheduler,
)


BUILTIN_PLUGIN_CLASSES = (
    PIPELINE_BUILTIN_PLUGIN_CLASSES
    + CONTENT_ANALYSIS_PLUGIN_CLASSES
    + DISCOVERY_ENRICHMENT_PLUGIN_CLASSES
    + ORCHESTRATOR_PLUGIN_CLASSES
)


def register_builtin_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    register_core_pipeline_plugins(target_registry)
    register_content_analysis_plugins(target_registry)
    register_maintenance_plugins(target_registry)
    register_discovery_plugins(target_registry)
    register_utility_plugins(target_registry)
    register_enrichment_plugins(target_registry)
    register_orchestrator_plugins(target_registry)
    return target_registry

__all__ = [
    "BUILTIN_PLUGIN_CLASSES",
    "CORE_PIPELINE_PLUGIN_CLASSES",
    "CONTENT_ANALYSIS_PLUGIN_CLASSES",
    "CronExpression",
    "ContextManager",
    "build_sequence_redis_connection_options",
    "build_sequence_redis_url",
    "configure_discovery_runtime",
    "DEFAULT_RETRY_ATTEMPTS",
    "DEFAULT_RETRY_DELAY_MS",
    "DEFAULT_TASK_TIMEOUT_MS",
    "DISCOVERY_ENRICHMENT_PLUGIN_CLASSES",
    "DISCOVERY_PLUGIN_CLASSES",
    "DiscoveryRuntime",
    "ENRICHMENT_PLUGIN_CLASSES",
    "get_discovery_runtime",
    "MAINTENANCE_PLUGIN_CLASSES",
    "ORCHESTRATOR_PLUGIN_CLASSES",
    "PostgresSequenceRepository",
    "SequenceCronRepository",
    "SequenceCronScheduler",
    "register_builtin_plugins",
    "register_content_analysis_plugins",
    "register_core_pipeline_plugins",
    "register_discovery_enrichment_plugins",
    "register_discovery_plugins",
    "register_enrichment_plugins",
    "register_maintenance_plugins",
    "register_orchestrator_plugins",
    "register_pipeline_builtin_plugins",
    "register_utility_plugins",
    "reset_discovery_runtime",
    "SequenceDefinition",
    "SequenceExecutor",
    "SequenceJobPayloadError",
    "SequenceQueueDispatchError",
    "SequenceRepository",
    "SequenceRunJobProcessor",
    "SequenceRunRecord",
    "TASK_REGISTRY",
    "TaskDefinition",
    "TaskExecutionError",
    "TaskPlugin",
    "TaskPluginRegistry",
    "TaskRetryPolicy",
    "TaskValidationError",
    "UTILITY_PLUGIN_CLASSES",
    "enqueue_sequence_run_job",
    "enqueue_sequence_run_job_async",
    "extract_sequence_job_payload",
    "parse_cron_expression",
]
