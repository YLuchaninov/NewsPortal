import type { Node } from "@xyflow/react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@newsportal/ui";

import type {
  AutomationNodeData,
  AutomationPluginRecord,
  AutomationTaskDefinition,
} from "../lib/automation-workspace";
import {
  readBool,
  readInt,
  readText,
} from "./automation-editor-workspace-model";

interface AutomationEditorTaskInspectorProps {
  selectedTaskNode: Node<AutomationNodeData>;
  pluginRecords: AutomationPluginRecord[];
  onTaskUpdate: (updater: (task: AutomationTaskDefinition) => AutomationTaskDefinition) => void;
  onOptionsJsonError: (message: string | null) => void;
  onMoveTask: (nodeId: string, direction: -1 | 1) => void;
  onRemoveTask: (nodeId: string) => void;
}

export function AutomationEditorTaskInspector({
  selectedTaskNode,
  pluginRecords,
  onTaskUpdate,
  onOptionsJsonError,
  onMoveTask,
  onRemoveTask,
}: AutomationEditorTaskInspectorProps) {
  const task = selectedTaskNode.data.task;

  if (!task) {
    return null;
  }

  return (
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
            value={readText(task.label, "")}
            onChange={(event) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
                label: event.target.value,
              }))
            }
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Key</span>
          <Input
            value={readText(task.key, "")}
            onChange={(event) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
                key: event.target.value,
              }))
            }
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Module</span>
          <Select
            value={readText(task.module, "")}
            onValueChange={(value) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
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
            value={readText(task.notes, "")}
            onChange={(event) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
                notes: event.target.value,
              }))
            }
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Options JSON</span>
          <Textarea
            rows={8}
            value={JSON.stringify(task.options ?? {}, null, 2)}
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value) as Record<string, unknown>;
                onTaskUpdate((currentTask) => ({
                  ...currentTask,
                  options: parsed,
                }));
                onOptionsJsonError(null);
              } catch {
                onOptionsJsonError("Options JSON must stay valid while editing.");
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
            checked={readBool(task.enabled, true)}
            onCheckedChange={(checked) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
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
              value={String(readInt(task.retry?.attempts, 1))}
              onChange={(event) =>
                onTaskUpdate((currentTask) => ({
                  ...currentTask,
                  retry: {
                    attempts: Number.parseInt(event.target.value || "1", 10) || 1,
                    delay_ms: readInt(currentTask.retry?.delay_ms, 1000),
                  },
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Retry delay ms</span>
            <Input
              inputMode="numeric"
              value={String(readInt(task.retry?.delay_ms, 1000))}
              onChange={(event) =>
                onTaskUpdate((currentTask) => ({
                  ...currentTask,
                  retry: {
                    attempts: readInt(currentTask.retry?.attempts, 1),
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
            value={String(readInt(task.timeout_ms, 60000))}
            onChange={(event) =>
              onTaskUpdate((currentTask) => ({
                ...currentTask,
                timeout_ms: Number.parseInt(event.target.value || "60000", 10) || 60000,
              }))
            }
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onMoveTask(selectedTaskNode.id, -1)}
          >
            Move Left
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onMoveTask(selectedTaskNode.id, 1)}
          >
            Move Right
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="border-rose-400/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-100"
            onClick={() => onRemoveTask(selectedTaskNode.id)}
          >
            Remove Step
          </Button>
        </div>
      </div>
    </div>
  );
}
