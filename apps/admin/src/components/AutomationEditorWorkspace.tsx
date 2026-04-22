import { useEffect, useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@newsportal/ui";

import {
  buildEditorStateFromNodes,
  buildSequenceUpdateFromEditor,
  editorGraphToTaskGraph,
  groupAutomationPlugins,
  sequenceToEditorGraph,
  type AutomationNodeData,
  type AutomationPluginRecord,
  type AutomationSequenceDefinition,
  type AutomationTaskDefinition,
} from "../lib/automation-workspace";

type JsonRecord = Record<string, unknown>;

interface AutomationEditorWorkspaceProps {
  sequence: JsonRecord;
  plugins: JsonRecord[];
  automationBffPath: string;
  automationRootPath: string;
  executionsHref: string;
  templatesHref: string;
}

function readText(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

function readMaybeText(value: unknown): string | null {
  const normalized = readText(value, "");
  return normalized || null;
}

function readBool(value: unknown, fallback = true): boolean {
  return value == null ? fallback : value !== false;
}

function readInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusClass(status: string): string {
  if (status === "active") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  }
  if (status === "archived") {
    return "bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/20";
  }
  return "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20";
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(readText(json.error ?? json.detail, `Request failed with ${response.status}`));
  }
  return json;
}

function moduleToKey(module: string, existingKeys: string[]): string {
  const base = module.split(".").at(-1)?.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "task";
  let candidate = base;
  let index = 2;
  while (existingKeys.includes(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function buildEdges(nodes: Node<AutomationNodeData>[]): Edge[] {
  const orderedTaskNodes = nodes
    .filter((node) => node.data.type === "task")
    .sort((left, right) => left.data.order - right.data.order);

  return orderedTaskNodes.map((node, index) => ({
    id: `${index === 0 ? "trigger:start" : orderedTaskNodes[index - 1]?.id}->${node.id}`,
    source: index === 0 ? "trigger:start" : String(orderedTaskNodes[index - 1]?.id),
    target: node.id,
    type: "smoothstep",
    animated: index === 0,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "rgba(251, 146, 60, 0.72)",
    },
    style: {
      stroke: "rgba(251, 146, 60, 0.52)",
      strokeWidth: 2,
    },
  }));
}

function reindexTaskNodes(nodes: Node<AutomationNodeData>[]): Node<AutomationNodeData>[] {
  const trigger = nodes.find((node) => node.id === "trigger:start");
  const tasks = nodes
    .filter((node) => node.data.type === "task")
    .sort((left, right) => left.data.order - right.data.order)
    .map((node, index) => ({
      ...node,
      data: {
        ...node.data,
        order: index,
        task: node.data.task
          ? {
              ...node.data.task,
            }
          : undefined,
      },
    }));
  return trigger ? [trigger, ...tasks] : tasks;
}

function WorkflowTriggerNode({ data, selected }: NodeProps<Node<AutomationNodeData>>) {
  return (
    <div
      className={`min-w-[220px] rounded-[1.4rem] border px-4 py-3 shadow-lg ${
        selected
          ? "border-orange-400/70 bg-zinc-950 text-white"
          : "border-white/10 bg-zinc-900/90 text-white"
      }`}
    >
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange-200/70">Trigger</p>
      <p className="mt-2 text-base font-semibold">{data.title}</p>
      <p className="mt-1 text-xs text-white/60">{data.subtitle}</p>
      <p className="mt-3 text-xs leading-5 text-white/72">{data.description}</p>
    </div>
  );
}

function WorkflowTaskNode(props: NodeProps<Node<AutomationNodeData>>) {
  const { data, selected } = props;
  const task = data.task;
  const isEnabled = task?.enabled !== false;

  return (
    <div
      className={`min-w-[250px] rounded-[1.45rem] border bg-white px-4 py-3 text-zinc-950 shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${
        selected ? "border-orange-400 shadow-[0_18px_55px_rgba(251,146,60,0.24)]" : "border-zinc-200"
      }`}
    >
      <NodeToolbar
        isVisible={selected}
        offset={18}
        className="!rounded-full !border !border-zinc-200 !bg-white !px-2 !py-1 shadow-sm"
      >
        <span className="text-[11px] font-medium text-zinc-500">Use the inspector to reorder or edit</span>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!bg-orange-400" />
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{data.category}</p>
          <p className="mt-2 text-base font-semibold">{data.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{data.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
            isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {isEnabled ? "enabled" : "disabled"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">{data.description}</p>
    </div>
  );
}

const nodeTypes = {
  input: WorkflowTriggerNode,
  default: WorkflowTaskNode,
};

export function AutomationEditorWorkspace({
  sequence,
  plugins,
  automationBffPath,
  automationRootPath,
  executionsHref,
  templatesHref,
}: AutomationEditorWorkspaceProps) {
  const pluginRecords = useMemo(
    () => plugins.map((plugin) => plugin as unknown as AutomationPluginRecord),
    [plugins]
  );
  const paletteGroups = useMemo(() => groupAutomationPlugins(pluginRecords), [pluginRecords]);
  const normalizedSequence = sequence as unknown as AutomationSequenceDefinition;
  const initialGraph = useMemo(
    () =>
      sequenceToEditorGraph({
        sequence: normalizedSequence,
        plugins: pluginRecords,
      }),
    [normalizedSequence, pluginRecords]
  );

  const [title, setTitle] = useState(readText(sequence.title, "Untitled workflow"));
  const [description, setDescription] = useState(readText(sequence.description, ""));
  const [status, setStatus] = useState(readText(sequence.status, "draft"));
  const [triggerEvent, setTriggerEvent] = useState(readText(sequence.trigger_event, ""));
  const [cron, setCron] = useState(readText(sequence.cron, ""));
  const [maxRuns, setMaxRuns] = useState(readText(sequence.max_runs, ""));
  const [tags, setTags] = useState(
    Array.isArray(sequence.tags)
      ? sequence.tags.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ")
      : ""
  );
  const [nodes, setNodes] = useState<Array<Node<AutomationNodeData>>>(initialGraph.nodes);
  const [viewport, setViewport] = useState<Viewport>(initialGraph.viewport);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialGraph.nodes.find((node) => node.data.type === "task")?.id ?? null
  );
  const [moduleSearch, setModuleSearch] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runContextJson, setRunContextJson] = useState("{}");
  const [runTriggerMetaJson, setRunTriggerMetaJson] = useState("{}");
  const [advancedJson, setAdvancedJson] = useState(
    JSON.stringify(editorGraphToTaskGraph(initialGraph.nodes), null, 2)
  );

  useEffect(() => {
    setAdvancedJson(JSON.stringify(editorGraphToTaskGraph(nodes), null, 2));
  }, [nodes]);

  const edges = useMemo(() => buildEdges(nodes), [nodes]);
  const selectedTaskNode =
    nodes.find((node) => node.id === selectedNodeId && node.data.type === "task") ?? null;
  const sequenceId = readText(sequence.sequence_id, "");

  const dirty = useMemo(() => {
    const currentTaskGraph = JSON.stringify(editorGraphToTaskGraph(nodes));
    const initialTaskGraph = JSON.stringify(editorGraphToTaskGraph(initialGraph.nodes));
    const currentEditorState = JSON.stringify(
      buildEditorStateFromNodes({ nodes, viewport })
    );
    const initialEditorState = JSON.stringify(
      buildEditorStateFromNodes({ nodes: initialGraph.nodes, viewport: initialGraph.viewport })
    );
    return (
      title !== readText(sequence.title, "Untitled workflow") ||
      description !== readText(sequence.description, "") ||
      status !== readText(sequence.status, "draft") ||
      triggerEvent !== readText(sequence.trigger_event, "") ||
      cron !== readText(sequence.cron, "") ||
      maxRuns !== readText(sequence.max_runs, "") ||
      tags !==
        (Array.isArray(sequence.tags)
          ? sequence.tags.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ")
          : "") ||
      currentTaskGraph !== initialTaskGraph ||
      currentEditorState !== initialEditorState
    );
  }, [
    cron,
    description,
    initialGraph.nodes,
    initialGraph.viewport,
    maxRuns,
    nodes,
    sequence.cron,
    sequence.description,
    sequence.max_runs,
    sequence.status,
    sequence.tags,
    sequence.title,
    sequence.trigger_event,
    status,
    tags,
    title,
    triggerEvent,
    viewport,
  ]);

  const filteredPaletteGroups = useMemo(() => {
    const normalizedQuery = moduleSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return paletteGroups;
    }
    return paletteGroups
      .map((group) => ({
        ...group,
        plugins: group.plugins.filter((plugin) =>
          [plugin.module, plugin.description].join(" ").toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.plugins.length > 0);
  }, [moduleSearch, paletteGroups]);

  function updateSelectedTask(
    updater: (task: AutomationTaskDefinition) => AutomationTaskDefinition
  ) {
    if (!selectedTaskNode?.data.task) {
      return;
    }
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedTaskNode.id || !node.data.task) {
          return node;
        }
        const nextTask = updater(node.data.task as AutomationTaskDefinition);
        return {
          ...node,
          data: {
            ...node.data,
            title: nextTask.label ?? nextTask.key,
            subtitle: nextTask.module,
            description: readText(nextTask.notes, readText(node.data.plugin?.description, "Linear workflow step")),
            task: nextTask,
          },
        };
      })
    );
    setSaveState("idle");
  }

  function moveTask(nodeId: string, direction: -1 | 1) {
    setNodes((currentNodes) => {
      const taskNodes = currentNodes
        .filter((node) => node.data.type === "task")
        .sort((left, right) => left.data.order - right.data.order);
      const index = taskNodes.findIndex((node) => node.id === nodeId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= taskNodes.length) {
        return currentNodes;
      }
      const reordered = [...taskNodes];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      return reindexTaskNodes([
        ...(currentNodes.find((node) => node.id === "trigger:start")
          ? [currentNodes.find((node) => node.id === "trigger:start")!]
          : []),
        ...reordered,
      ]);
    });
    setSaveState("idle");
  }

  function removeTask(nodeId: string) {
    setNodes((currentNodes) => {
      const taskNodes = currentNodes.filter((node) => node.data.type === "task");
      if (taskNodes.length <= 1) {
        return currentNodes;
      }
      const nextNodes = currentNodes.filter((node) => node.id !== nodeId);
      return reindexTaskNodes(nextNodes);
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    setSaveState("idle");
  }

  function appendTask(plugin: AutomationPluginRecord) {
    setNodes((currentNodes) => {
      const taskNodes = currentNodes.filter((node) => node.data.type === "task");
      const existingKeys = taskNodes.map((node) => readText(node.data.task?.key, ""));
      const key = moduleToKey(String(plugin.module), existingKeys);
      const order = taskNodes.length;
      const nextTask: AutomationTaskDefinition = {
        key,
        module: String(plugin.module),
        label: String(plugin.module).split(".").at(-1) ?? key,
        notes: readMaybeText(plugin.description),
        options: {},
        enabled: true,
        retry: {
          attempts: 1,
          delay_ms: 1000,
        },
        timeout_ms: 60000,
      };
      const nextNode: Node<AutomationNodeData> = {
        id: `task:${key}`,
        type: "default",
        position: {
          x: 120 + (order + 1) * 280,
          y: 160,
        },
        data: {
          type: "task",
          order,
          title: nextTask.label ?? key,
          subtitle: nextTask.module,
          description: readText(nextTask.notes, "Linear workflow step"),
          category: readText(plugin.category, "Task"),
          task: nextTask,
          plugin,
        },
      };
      return reindexTaskNodes([...currentNodes, nextNode]);
    });
    setSelectedNodeId(null);
    setSaveState("idle");
  }

  function reorderFromConnection(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }
    setNodes((currentNodes) => {
      const trigger = currentNodes.find((node) => node.id === "trigger:start");
      const taskNodes = currentNodes
        .filter((node) => node.data.type === "task")
        .sort((left, right) => left.data.order - right.data.order);
      const sourceIndex =
        connection.source === "trigger:start"
          ? -1
          : taskNodes.findIndex((node) => node.id === connection.source);
      const targetIndex = taskNodes.findIndex((node) => node.id === connection.target);
      if (targetIndex < 0) {
        return currentNodes;
      }
      if (sourceIndex < 0) {
        const [targetNode] = taskNodes.splice(targetIndex, 1);
        taskNodes.unshift(targetNode);
      } else {
        const [sourceNode] = taskNodes.splice(sourceIndex, 1);
        const nextTargetIndex = taskNodes.findIndex((node) => node.id === connection.target);
        taskNodes.splice(nextTargetIndex, 0, sourceNode);
      }
      return reindexTaskNodes([...(trigger ? [trigger] : []), ...taskNodes]);
    });
    setSaveState("idle");
  }

  async function handleSave(): Promise<void> {
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await postJson(automationBffPath, {
        intent: "update_sequence",
        sequenceId,
        ...buildSequenceUpdateFromEditor({
          base: {
            title,
            description: description || null,
            status,
            triggerEvent: triggerEvent || null,
            cron: cron || null,
            maxRuns: maxRuns || null,
            tags,
          },
          nodes,
          viewport,
        }),
      });
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to save workflow.");
    }
  }

  async function handleArchive(): Promise<void> {
    if (!window.confirm("Archive this workflow? Existing history stays, but new runs will stop.")) {
      return;
    }
    setErrorMessage(null);
    try {
      await postJson(automationBffPath, {
        intent: "archive_sequence",
        sequenceId,
      });
      window.location.href = automationRootPath;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to archive workflow.");
    }
  }

  async function handleRunNow(): Promise<void> {
    setErrorMessage(null);
    try {
      await postJson(automationBffPath, {
        intent: "run_sequence",
        sequenceId,
        contextJson: JSON.parse(runContextJson),
        triggerMeta: JSON.parse(runTriggerMetaJson),
      });
      setRunDialogOpen(false);
      window.location.href = executionsHref;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request run.");
    }
  }

  function applyAdvancedJson(): void {
    try {
      const parsed = JSON.parse(advancedJson) as AutomationTaskDefinition[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Advanced JSON must be a non-empty task array.");
      }
      const nextSequence: AutomationSequenceDefinition = {
        ...normalizedSequence,
        task_graph: parsed,
        editor_state: {
          viewport,
        },
      };
      const nextGraph = sequenceToEditorGraph({
        sequence: nextSequence,
        plugins: pluginRecords,
      });
      setNodes(nextGraph.nodes);
      setSelectedNodeId(nextGraph.nodes.find((node) => node.data.type === "task")?.id ?? null);
      setSaveState("idle");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invalid advanced JSON.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_28%),linear-gradient(135deg,rgba(24,24,27,1),rgba(9,9,11,1))] p-5 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(status)}`}>
                {status}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/70 ring-1 ring-white/10">
                {dirty ? "Unsaved changes" : "All changes saved locally"}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-orange-200/75">
                Visual Workflow Builder
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                {title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">
                This canvas is intentionally truthful to the current sequence engine: one start
                node, one main linear path, auto-managed edges, and no hidden unsupported DAG
                semantics.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRunDialogOpen(true)}
              className="border border-white/15 bg-white/8 text-white hover:bg-white/14"
            >
              Run Now
            </Button>
            <Button
              type="button"
              variant="secondary"
              asChild
              className="border border-white/15 bg-white/8 text-white hover:bg-white/14"
            >
              <a href={executionsHref}>Executions</a>
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saveState === "saving"}
              className="bg-orange-500 text-zinc-950 hover:bg-orange-400"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleArchive()}
              className="border border-rose-400/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
            >
              Archive
            </Button>
          </div>
        </div>
      </section>

      {errorMessage && (
        <p className="rounded-[1.2rem] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      )}

      <div className="grid min-h-[74vh] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <Card className="overflow-hidden border-white/10 bg-card/90 shadow-sm">
          <CardContent className="flex h-full flex-col gap-4 p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Node Library</p>
              <h2 className="mt-2 text-lg font-semibold">Add steps fast</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search the live plugin catalog and append steps to the main lane.
              </p>
            </div>
            <Input
              value={moduleSearch}
              onChange={(event) => setModuleSearch(event.target.value)}
              placeholder="Search modules"
            />
            <ScrollArea className="h-[52vh] pr-3">
              <div className="space-y-4">
                <a
                  href={templatesHref}
                  className="flex items-center justify-between rounded-[1.1rem] border border-border bg-background/70 px-4 py-3 text-sm font-medium transition hover:bg-accent"
                >
                  Explore templates
                  <span className="text-xs text-muted-foreground">{paletteGroups.length} groups</span>
                </a>
                {filteredPaletteGroups.map((group) => (
                  <section key={group.id} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {group.label}
                    </p>
                    {group.plugins.map((plugin) => (
                      <button
                        key={String(plugin.module)}
                        type="button"
                        onClick={() => appendTask(plugin)}
                        className="w-full rounded-[1.1rem] border border-border bg-background/70 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:bg-orange-50/40"
                      >
                        <p className="text-sm font-medium text-foreground">{String(plugin.module)}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {readText(plugin.description, "No description")}
                        </p>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/10 bg-card/90 shadow-sm">
          <CardContent className="h-full p-0">
            <div className="border-b border-border/70 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-300 ring-1 ring-orange-500/20">
                  {nodes.filter((node) => node.data.type === "task").length} steps
                </span>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Drag to reposition, connect to reorder
                </span>
              </div>
            </div>
            <div className="h-[70vh] w-full bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.08),transparent_26%),linear-gradient(180deg,rgba(250,250,250,0.92),rgba(244,244,245,0.95))]">
              <ReactFlow<Node<AutomationNodeData>, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.45}
                maxZoom={1.4}
                defaultViewport={viewport}
                onSelectionChange={({ nodes: selectedNodes }) => {
                  const selectedTask = selectedNodes.find(
                    (node) => node.data?.type === "task"
                  ) as Node<AutomationNodeData> | undefined;
                  setSelectedNodeId(selectedTask?.id ?? null);
                }}
                onNodeDragStop={(_, draggedNode) => {
                  setNodes((currentNodes) =>
                    currentNodes.map((node) =>
                      node.id === draggedNode.id
                        ? {
                            ...node,
                            position: draggedNode.position,
                          }
                        : node
                    )
                  );
                  setSaveState("idle");
                }}
                onConnect={reorderFromConnection}
                onMoveEnd={(_, nextViewport) => {
                  setViewport(nextViewport);
                }}
                nodesDraggable
                nodesConnectable
                panOnDrag
                selectionOnDrag
              >
                <MiniMap
                  pannable
                  zoomable
                  className="!rounded-2xl !border !border-white/40 !bg-white/80"
                  nodeStrokeColor={(node) =>
                    node.data?.type === "trigger" ? "#f97316" : "#18181b"
                  }
                  nodeColor={(node) =>
                    node.data?.type === "trigger" ? "#fed7aa" : "#ffffff"
                  }
                />
                <Controls className="!rounded-2xl !border !border-white/40 !bg-white/85" />
                <Background gap={22} size={1.2} color="rgba(63,63,70,0.18)" />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/10 bg-card/90 shadow-sm">
          <CardContent className="h-full p-0">
            <Tabs defaultValue="settings" className="flex h-full flex-col">
              <div className="border-b border-border/70 px-4 py-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="settings">Inspector</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced JSON</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="settings" className="m-0 flex-1">
                <ScrollArea className="h-[68vh] px-4 pb-5">
                  {selectedTaskNode?.data.task ? (
                    <div className="space-y-5 pt-5">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Selected step</p>
                        <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedTaskNode.data.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Change labels, retry policy, notes, and module options without leaving the canvas.
                        </p>
                      </div>

                      <div className="space-y-4 rounded-[1.15rem] border border-border bg-background/70 p-4">
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Label</span>
                          <Input
                            value={readText(selectedTaskNode.data.task.label, "")}
                            onChange={(event) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                label: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Key</span>
                          <Input
                            value={readText(selectedTaskNode.data.task.key, "")}
                            onChange={(event) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                key: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Module</span>
                          <Select
                            value={readText(selectedTaskNode.data.task.module, "")}
                            onValueChange={(value) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                module: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose module" />
                            </SelectTrigger>
                            <SelectContent>
                              {pluginRecords.map((plugin) => (
                                <SelectItem key={String(plugin.module)} value={String(plugin.module)}>
                                  {String(plugin.module)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Notes</span>
                          <Textarea
                            rows={4}
                            value={readText(selectedTaskNode.data.task.notes, "")}
                            onChange={(event) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Options JSON</span>
                          <Textarea
                            rows={8}
                            value={JSON.stringify(selectedTaskNode.data.task.options ?? {}, null, 2)}
                            onChange={(event) => {
                              try {
                                const parsed = JSON.parse(event.target.value) as Record<string, unknown>;
                                updateSelectedTask((task) => ({
                                  ...task,
                                  options: parsed,
                                }));
                                setErrorMessage(null);
                              } catch {
                                setErrorMessage("Options JSON must stay valid while editing.");
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="space-y-4 rounded-[1.15rem] border border-border bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Enabled</p>
                            <p className="text-xs text-muted-foreground">Disable a step without deleting it.</p>
                          </div>
                          <Switch
                            checked={readBool(selectedTaskNode.data.task.enabled, true)}
                            onCheckedChange={(checked) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                enabled: checked,
                              }))
                            }
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">Retry attempts</span>
                            <Input
                              inputMode="numeric"
                              value={String(readInt(selectedTaskNode.data.task.retry?.attempts, 1))}
                              onChange={(event) =>
                                updateSelectedTask((task) => ({
                                  ...task,
                                  retry: {
                                    attempts: Number.parseInt(event.target.value || "1", 10) || 1,
                                    delay_ms: readInt(task.retry?.delay_ms, 1000),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">Retry delay ms</span>
                            <Input
                              inputMode="numeric"
                              value={String(readInt(selectedTaskNode.data.task.retry?.delay_ms, 1000))}
                              onChange={(event) =>
                                updateSelectedTask((task) => ({
                                  ...task,
                                  retry: {
                                    attempts: readInt(task.retry?.attempts, 1),
                                    delay_ms: Number.parseInt(event.target.value || "1000", 10) || 0,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>

                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Timeout ms</span>
                          <Input
                            inputMode="numeric"
                            value={String(readInt(selectedTaskNode.data.task.timeout_ms, 60000))}
                            onChange={(event) =>
                              updateSelectedTask((task) => ({
                                ...task,
                                timeout_ms: Number.parseInt(event.target.value || "60000", 10) || 60000,
                              }))
                            }
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => moveTask(selectedTaskNode.id, -1)}
                          >
                            Move Left
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => moveTask(selectedTaskNode.id, 1)}
                          >
                            Move Right
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="border-rose-400/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-100"
                            onClick={() => removeTask(selectedTaskNode.id)}
                          >
                            Remove Step
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5 pt-5">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Workflow settings</p>
                        <h2 className="mt-2 text-lg font-semibold text-foreground">Sequence metadata</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Select a step to edit node-level behavior, or stay here to configure the workflow itself.
                        </p>
                      </div>

                      <div className="space-y-4 rounded-[1.15rem] border border-border bg-background/70 p-4">
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Title</span>
                          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Description</span>
                          <Textarea
                            rows={4}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Status</span>
                          <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">draft</SelectItem>
                              <SelectItem value="active">active</SelectItem>
                              <SelectItem value="archived">archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Trigger event</span>
                          <Input
                            value={triggerEvent}
                            onChange={(event) => setTriggerEvent(event.target.value)}
                            placeholder="article.ingest.requested"
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Cron</span>
                          <Input
                            value={cron}
                            onChange={(event) => setCron(event.target.value)}
                            placeholder="*/15 * * * *"
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Max runs</span>
                          <Input
                            inputMode="numeric"
                            value={maxRuns}
                            onChange={(event) => setMaxRuns(event.target.value)}
                            placeholder="optional"
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Tags</span>
                          <Input
                            value={tags}
                            onChange={(event) => setTags(event.target.value)}
                            placeholder="ops, pipeline, default"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="advanced" className="m-0 flex-1">
                <ScrollArea className="h-[68vh] px-4 pb-5">
                  <div className="space-y-5 pt-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Fallback</p>
                      <h2 className="mt-2 text-lg font-semibold text-foreground">Advanced JSON</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Keep this as a debug path. The visual editor remains the primary authoring flow.
                      </p>
                    </div>
                    <label className="grid gap-2 text-sm">
                      <span className="font-medium">Task graph JSON</span>
                      <Textarea
                        rows={20}
                        className="font-mono text-xs"
                        value={advancedJson}
                        onChange={(event) => setAdvancedJson(event.target.value)}
                      />
                    </label>
                    <Button type="button" onClick={applyAdvancedJson} className="w-full">
                      Apply JSON To Canvas
                    </Button>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run workflow now</DialogTitle>
            <DialogDescription>
              Manual runs still go through the same maintenance API contract and sequence queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Context JSON</span>
              <Textarea value={runContextJson} onChange={(event) => setRunContextJson(event.target.value)} rows={7} className="font-mono text-xs" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Trigger meta JSON</span>
              <Textarea value={runTriggerMetaJson} onChange={(event) => setRunTriggerMetaJson(event.target.value)} rows={6} className="font-mono text-xs" />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleRunNow()}>
              Request Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
