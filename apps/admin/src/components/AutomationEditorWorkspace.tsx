import { useEffect, useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";

import {
  type Connection,
  type Node,
  type Viewport,
} from "@xyflow/react";
import {
  Card,
  CardContent,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
import { AutomationEditorAdvancedJson } from "./automation-editor-advanced-json";
import { AutomationEditorCanvas } from "./automation-editor-canvas";
import { AutomationEditorHeader } from "./automation-editor-header";
import { AutomationEditorPalette } from "./automation-editor-palette";
import { AutomationEditorRunDialog } from "./automation-editor-run-dialog";
import { AutomationEditorSequenceSettings } from "./automation-editor-sequence-settings";
import { AutomationEditorTaskInspector } from "./automation-editor-task-inspector";
import {
  buildEdges,
  moduleToKey,
  postJson,
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

        <AutomationEditorCanvas
          nodes={nodes}
          edges={edges}
          viewport={viewport}
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
        />

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
                    <AutomationEditorTaskInspector
                      selectedTaskNode={selectedTaskNode}
                      pluginRecords={pluginRecords}
                      onTaskUpdate={updateSelectedTask}
                      onOptionsJsonError={setErrorMessage}
                      onMoveTask={moveTask}
                      onRemoveTask={removeTask}
                    />
                  ) : (
                    <AutomationEditorSequenceSettings
                      title={title}
                      onTitleChange={setTitle}
                      description={description}
                      onDescriptionChange={setDescription}
                      status={status}
                      onStatusChange={setStatus}
                      triggerEvent={triggerEvent}
                      onTriggerEventChange={setTriggerEvent}
                      cron={cron}
                      onCronChange={setCron}
                      maxRuns={maxRuns}
                      onMaxRunsChange={setMaxRuns}
                      tags={tags}
                      onTagsChange={setTags}
                    />
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="advanced" className="m-0 flex-1">
                <AutomationEditorAdvancedJson
                  advancedJson={advancedJson}
                  onAdvancedJsonChange={setAdvancedJson}
                  onApply={applyAdvancedJson}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AutomationEditorRunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        runContextJson={runContextJson}
        onRunContextJsonChange={setRunContextJson}
        runTriggerMetaJson={runTriggerMetaJson}
        onRunTriggerMetaJsonChange={setRunTriggerMetaJson}
        onSubmit={() => void handleRunNow()}
      />
    </div>
  );
}
