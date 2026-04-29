import { useEffect, useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
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
import { AutomationEditorHeader } from "./automation-editor-header";
import { AutomationEditorPalette } from "./automation-editor-palette";
import { automationEditorNodeTypes } from "./automation-editor-flow-nodes";
import {
  buildEdges,
  moduleToKey,
  postJson,
  readBool,
  readInt,
  readMaybeText,
  readText,
  reindexTaskNodes,
  statusClass,
} from "./automation-editor-workspace-model";

type JsonRecord = Record<string, unknown>;

interface AutomationEditorWorkspaceProps {
  sequence: JsonRecord;
  plugins: JsonRecord[];
  automationBffPath: string;
  automationRootPath: string;
  executionsHref: string;
  templatesHref: string;
}

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
      <AutomationEditorHeader
        status={status}
        statusClassName={statusClass(status)}
        dirty={dirty}
        title={title}
        executionsHref={executionsHref}
        saveState={saveState}
        onRunNow={() => setRunDialogOpen(true)}
        onSave={() => void handleSave()}
        onArchive={() => void handleArchive()}
      />

      {errorMessage && (
        <p className="rounded-[1.2rem] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      )}

      <div className="grid min-h-[74vh] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <AutomationEditorPalette
          moduleSearch={moduleSearch}
          onModuleSearchChange={setModuleSearch}
          templatesHref={templatesHref}
          paletteGroups={paletteGroups}
          filteredPaletteGroups={filteredPaletteGroups}
          onAppendTask={appendTask}
        />

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
            nodeTypes={automationEditorNodeTypes}
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
