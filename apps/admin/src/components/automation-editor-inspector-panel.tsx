import type { Node } from "@xyflow/react";
import {
  Card,
  CardContent,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsportal/ui";

import type {
  AutomationNodeData,
  AutomationPluginRecord,
  AutomationTaskDefinition,
} from "../lib/automation-workspace";
import { ADMIN_AUTOMATION_CARD_CLASS } from "../lib/admin-ui-classes";
import { AutomationEditorAdvancedJson } from "./automation-editor-advanced-json";
import { AutomationEditorSequenceSettings } from "./automation-editor-sequence-settings";
import { AutomationEditorTaskInspector } from "./automation-editor-task-inspector";

interface AutomationEditorInspectorPanelProps {
  selectedTaskNode: Node<AutomationNodeData> | null | undefined;
  pluginRecords: AutomationPluginRecord[];
  onTaskUpdate: (updater: (task: AutomationTaskDefinition) => AutomationTaskDefinition) => void;
  onOptionsJsonError: (message: string | null) => void;
  onMoveTask: (nodeId: string, direction: -1 | 1) => void;
  onRemoveTask: (nodeId: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  triggerEvent: string;
  onTriggerEventChange: (value: string) => void;
  cron: string;
  onCronChange: (value: string) => void;
  maxRuns: string;
  onMaxRunsChange: (value: string) => void;
  tags: string;
  onTagsChange: (value: string) => void;
  advancedJson: string;
  onAdvancedJsonChange: (value: string) => void;
  onApplyAdvancedJson: () => void;
}

export function AutomationEditorInspectorPanel({
  selectedTaskNode,
  pluginRecords,
  onTaskUpdate,
  onOptionsJsonError,
  onMoveTask,
  onRemoveTask,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  triggerEvent,
  onTriggerEventChange,
  cron,
  onCronChange,
  maxRuns,
  onMaxRunsChange,
  tags,
  onTagsChange,
  advancedJson,
  onAdvancedJsonChange,
  onApplyAdvancedJson,
}: AutomationEditorInspectorPanelProps) {
  return (
    <Card className={`overflow-hidden ${ADMIN_AUTOMATION_CARD_CLASS}`}>
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
                  onTaskUpdate={onTaskUpdate}
                  onOptionsJsonError={onOptionsJsonError}
                  onMoveTask={onMoveTask}
                  onRemoveTask={onRemoveTask}
                />
              ) : (
                <AutomationEditorSequenceSettings
                  title={title}
                  onTitleChange={onTitleChange}
                  description={description}
                  onDescriptionChange={onDescriptionChange}
                  status={status}
                  onStatusChange={onStatusChange}
                  triggerEvent={triggerEvent}
                  onTriggerEventChange={onTriggerEventChange}
                  cron={cron}
                  onCronChange={onCronChange}
                  maxRuns={maxRuns}
                  onMaxRunsChange={onMaxRunsChange}
                  tags={tags}
                  onTagsChange={onTagsChange}
                />
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="advanced" className="m-0 flex-1">
            <AutomationEditorAdvancedJson
              advancedJson={advancedJson}
              onAdvancedJsonChange={onAdvancedJsonChange}
              onApply={onApplyAdvancedJson}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
