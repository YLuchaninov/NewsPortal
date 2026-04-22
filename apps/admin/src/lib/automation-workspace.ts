import type { Edge, Node, Viewport } from "@xyflow/react";

export interface AutomationTaskRetryPolicy {
  attempts: number;
  delay_ms: number;
}

export interface AutomationTaskDefinition {
  key: string;
  module: string;
  options: Record<string, unknown>;
  label?: string | null;
  notes?: string | null;
  enabled?: boolean;
  retry?: Partial<AutomationTaskRetryPolicy> | null;
  timeout_ms?: number | null;
}

export interface AutomationEditorState {
  viewport?: Viewport | null;
  nodePositions?: Record<string, { x: number; y: number }>;
}

export interface AutomationSequenceDefinition {
  sequence_id?: string;
  title: string;
  description?: string | null;
  status?: string | null;
  trigger_event?: string | null;
  cron?: string | null;
  max_runs?: number | null;
  run_count?: number | null;
  tags?: string[] | null;
  created_by?: string | null;
  task_graph: AutomationTaskDefinition[];
  editor_state?: AutomationEditorState | null;
}

export interface AutomationPluginRecord {
  module: string;
  category?: string | null;
  description?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}

export interface AutomationPaletteGroup {
  id: string;
  label: string;
  plugins: AutomationPluginRecord[];
}

export interface AutomationNodeData {
  [key: string]: unknown;
  type: "trigger" | "task";
  order: number;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  task?: AutomationTaskDefinition;
  plugin?: AutomationPluginRecord | null;
}

export interface AutomationEditorGraph {
  nodes: Node<AutomationNodeData>[];
  edges: Edge[];
  viewport: Viewport;
}

export interface AutomationTemplateDescriptor {
  id: string;
  title: string;
  category: string;
  description: string;
  accent: string;
  status: "draft" | "active";
  triggerEvent?: string;
  cron?: string;
  tags: string[];
  taskGraph: AutomationTaskDefinition[];
}

const DEFAULT_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  zoom: 0.9,
};

const X_GAP = 280;
const Y_BASE = 160;
const X_START = 120;

export const AUTOMATION_TEMPLATES: AutomationTemplateDescriptor[] = [
  {
    id: "article_ingest_pipeline",
    title: "Article Ingest Pipeline",
    category: "Content",
    description:
      "The default editorial lane from extract through notify, ready for operator tuning.",
    accent: "from-amber-400/20 via-orange-500/10 to-rose-500/20",
    status: "active",
    triggerEvent: "article.ingest.requested",
    tags: ["content", "default", "pipeline"],
    taskGraph: [
      { key: "extract", module: "enrichment.article_extract", options: {}, label: "Extract" },
      { key: "normalize", module: "article.normalize", options: {}, label: "Normalize" },
      { key: "dedup", module: "article.dedup", options: {}, label: "Deduplicate" },
      { key: "embed", module: "article.embed", options: {}, label: "Embed" },
      { key: "criteria", module: "article.match_criteria", options: {}, label: "Criteria" },
      { key: "cluster", module: "article.cluster", options: {}, label: "Cluster" },
      { key: "interests", module: "article.match_interests", options: {}, label: "Interests" },
      { key: "notify", module: "article.notify", options: {}, label: "Notify" },
    ],
  },
  {
    id: "article_quality_review",
    title: "Article Quality Review",
    category: "Content",
    description:
      "Add an LLM review lane after criteria when editors need human-facing guardrails.",
    accent: "from-sky-400/20 via-cyan-500/10 to-emerald-400/20",
    status: "draft",
    triggerEvent: "article.ingest.requested",
    tags: ["content", "review"],
    taskGraph: [
      { key: "extract", module: "enrichment.article_extract", options: {}, label: "Extract" },
      { key: "normalize", module: "article.normalize", options: {}, label: "Normalize" },
      { key: "dedup", module: "article.dedup", options: {}, label: "Deduplicate" },
      { key: "embed", module: "article.embed", options: {}, label: "Embed" },
      { key: "criteria", module: "article.match_criteria", options: {}, label: "Criteria" },
      { key: "llm_review", module: "article.llm_review", options: {}, label: "LLM Review" },
      { key: "cluster", module: "article.cluster", options: {}, label: "Cluster" },
      { key: "interests", module: "article.match_interests", options: {}, label: "Interests" },
      { key: "notify", module: "article.notify", options: {}, label: "Notify" },
    ],
  },
  {
    id: "maintenance_reindex",
    title: "Reindex Repair",
    category: "Maintenance",
    description:
      "Bounded rebuild lane for index refreshes and historical repair controlled by operators.",
    accent: "from-zinc-300/20 via-stone-500/10 to-lime-500/20",
    status: "draft",
    triggerEvent: "reindex.requested",
    tags: ["maintenance", "reindex"],
    taskGraph: [
      {
        key: "reindex",
        module: "maintenance.reindex",
        options: { jobKind: "backfill" },
        label: "Reindex",
        notes: "Change jobKind to rebuild for index-only refreshes.",
      },
    ],
  },
  {
    id: "feedback_compile",
    title: "Feedback To Relevance",
    category: "Maintenance",
    description:
      "Compile feedback and refresh system scoring after operator triage events arrive.",
    accent: "from-emerald-400/20 via-teal-500/10 to-sky-500/20",
    status: "draft",
    triggerEvent: "notification.feedback.recorded",
    tags: ["maintenance", "feedback"],
    taskGraph: [
      {
        key: "feedback_ingest",
        module: "maintenance.feedback_ingest",
        options: {},
        label: "Feedback Ingest",
      },
      {
        key: "interest_compile",
        module: "maintenance.interest_compile",
        options: {},
        label: "Interest Compile",
      },
      {
        key: "criterion_compile",
        module: "maintenance.criterion_compile",
        options: {},
        label: "Criterion Compile",
      },
    ],
  },
];

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeRetryPolicy(
  value: Partial<AutomationTaskRetryPolicy> | null | undefined
): AutomationTaskRetryPolicy {
  const attempts = Number.parseInt(String(value?.attempts ?? "1"), 10);
  const delayMs = Number.parseInt(String(value?.delay_ms ?? "1000"), 10);
  return {
    attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 1,
    delay_ms: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1000,
  };
}

function normalizeTaskDefinition(
  task: AutomationTaskDefinition,
  index: number
): AutomationTaskDefinition {
  const key = normalizeText(task.key) ?? `task_${index + 1}`;
  const module = normalizeText(task.module) ?? "";
  const timeoutMs = Number(task.timeout_ms ?? 60_000);
  return {
    key,
    module,
    options:
      task.options && typeof task.options === "object" && !Array.isArray(task.options)
        ? task.options
        : {},
    label: normalizeText(task.label),
    notes: normalizeText(task.notes),
    enabled: task.enabled !== false,
    retry: normalizeRetryPolicy(task.retry),
    timeout_ms: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
  };
}

function getTaskNodeId(taskKey: string): string {
  return `task:${taskKey}`;
}

export function getAutomationTemplate(templateId: string): AutomationTemplateDescriptor | null {
  return AUTOMATION_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function instantiateAutomationTemplate(
  templateId: string,
  input: {
    title?: string | null;
    createdBy?: string | null;
  } = {}
): Record<string, unknown> {
  const template = getAutomationTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown automation template ${templateId}.`);
  }

  const title = normalizeText(input.title) ?? template.title;
  return {
    title,
    description: template.description,
    status: template.status,
    triggerEvent: template.triggerEvent ?? null,
    cron: template.cron ?? null,
    tags: template.tags,
    createdBy: normalizeText(input.createdBy),
    taskGraph: template.taskGraph.map((task, index) => normalizeTaskDefinition(task, index)),
    editorState: {
      viewport: DEFAULT_VIEWPORT,
      nodePositions: Object.fromEntries(
        template.taskGraph.map((task, index) => [
          getTaskNodeId(task.key),
          { x: X_START + (index + 1) * X_GAP, y: Y_BASE },
        ])
      ),
    },
  };
}

export function createBlankLinearAutomation(input: {
  title?: string | null;
  createdBy?: string | null;
} = {}): Record<string, unknown> {
  return {
    title: normalizeText(input.title) ?? "Blank Linear Workflow",
    description:
      "Start from a single truthful task and extend the linear lane in the editor.",
    status: "draft",
    triggerEvent: null,
    cron: null,
    tags: ["blank", "linear"],
    createdBy: normalizeText(input.createdBy),
    taskGraph: [
      normalizeTaskDefinition(
        {
          key: "normalize",
          module: "article.normalize",
          options: {},
          label: "Normalize",
        },
        0
      ),
    ],
    editorState: {
      viewport: DEFAULT_VIEWPORT,
      nodePositions: {
        [getTaskNodeId("normalize")]: { x: X_START + X_GAP, y: Y_BASE },
      },
    },
  };
}

export function groupAutomationPlugins(
  plugins: AutomationPluginRecord[]
): AutomationPaletteGroup[] {
  const groups = new Map<string, AutomationPluginRecord[]>();
  for (const plugin of plugins) {
    const label = normalizeText(plugin.category) ?? "Other";
    const key = label.toLowerCase().replace(/\s+/g, "-");
    const current = groups.get(key) ?? [];
    current.push(plugin);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([id, entries]) => ({
      id,
      label:
        entries[0]?.category && normalizeText(entries[0].category)
          ? String(entries[0].category)
          : "Other",
      plugins: [...entries].sort((left, right) =>
        String(left.module ?? "").localeCompare(String(right.module ?? ""))
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function sequenceToEditorGraph(input: {
  sequence: AutomationSequenceDefinition;
  plugins: AutomationPluginRecord[];
}): AutomationEditorGraph {
  const pluginMap = new Map(
    input.plugins.map((plugin) => [plugin.module, plugin] as const)
  );
  const editorState = input.sequence.editor_state ?? {};
  const positions = editorState.nodePositions ?? {};

  const triggerLabel = input.sequence.trigger_event
    ? `Event: ${input.sequence.trigger_event}`
    : input.sequence.cron
      ? `Cron: ${input.sequence.cron}`
      : "Manual / API trigger";

  const nodes: Node<AutomationNodeData>[] = [
    {
      id: "trigger:start",
      type: "input",
      position: { x: X_START, y: Y_BASE },
      draggable: false,
      data: {
        type: "trigger",
        order: -1,
        title: "Start",
        subtitle: triggerLabel,
        description: "Every workflow starts from one truthful trigger node in v1.",
        category: "Trigger",
      },
    },
  ];

  for (const [index, rawTask] of input.sequence.task_graph.entries()) {
    const task = normalizeTaskDefinition(rawTask, index);
    const plugin = pluginMap.get(task.module) ?? null;
    const position =
      positions[getTaskNodeId(task.key)] ?? {
        x: X_START + (index + 1) * X_GAP,
        y: Y_BASE,
      };
    nodes.push({
      id: getTaskNodeId(task.key),
      type: "default",
      position,
      data: {
        type: "task",
        order: index,
        title: task.label ?? task.key,
        subtitle: task.module,
        description:
          normalizeText(task.notes) ??
          normalizeText(plugin?.description) ??
          "Linear workflow step",
        category: normalizeText(plugin?.category) ?? "Task",
        task,
        plugin,
      },
    });
  }

  const orderedTaskNodes = nodes
    .filter((node) => node.data.type === "task")
    .sort((left, right) => left.data.order - right.data.order);
  const edges: Edge[] = [];

  for (const [index, node] of orderedTaskNodes.entries()) {
    const previousId = index === 0 ? "trigger:start" : orderedTaskNodes[index - 1]?.id;
    if (!previousId) {
      continue;
    }
    edges.push({
      id: `${previousId}->${node.id}`,
      source: previousId,
      target: node.id,
      animated: index === 0,
      type: "smoothstep",
    });
  }

  return {
    nodes,
    edges,
    viewport: editorState.viewport ?? DEFAULT_VIEWPORT,
  };
}

export function editorGraphToTaskGraph(
  nodes: Array<Node<AutomationNodeData>>
): AutomationTaskDefinition[] {
  return nodes
    .filter((node) => node.data.type === "task" && node.data.task)
    .sort((left, right) => left.data.order - right.data.order)
    .map((node, index) => {
      const task = normalizeTaskDefinition(node.data.task as AutomationTaskDefinition, index);
      return {
        ...task,
        key: task.key || `task_${index + 1}`,
      };
    });
}

export function buildEditorStateFromNodes(input: {
  nodes: Array<Node<AutomationNodeData>>;
  viewport: Viewport;
}): AutomationEditorState {
  const nodePositions: Record<string, { x: number; y: number }> = {};
  for (const node of input.nodes) {
    if (node.data.type !== "task") {
      continue;
    }
    nodePositions[node.id] = {
      x: Number(node.position.x ?? 0),
      y: Number(node.position.y ?? 0),
    };
  }
  return {
    viewport: input.viewport,
    nodePositions,
  };
}

export function buildSequenceUpdateFromEditor(input: {
  base: Record<string, unknown>;
  nodes: Array<Node<AutomationNodeData>>;
  viewport: Viewport;
}): Record<string, unknown> {
  return {
    ...input.base,
    taskGraph: editorGraphToTaskGraph(input.nodes),
    editorState: buildEditorStateFromNodes({
      nodes: input.nodes,
      viewport: input.viewport,
    }),
  };
}
