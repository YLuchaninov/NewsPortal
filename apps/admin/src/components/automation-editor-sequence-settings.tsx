import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@signalops/ui";

interface AutomationEditorSequenceSettingsProps {
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
}

export function AutomationEditorSequenceSettings({
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
}: AutomationEditorSequenceSettingsProps) {
  return (
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
          <Input value={title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Description</span>
          <Textarea
            rows={4}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Status</span>
          <Select value={status} onValueChange={onStatusChange}>
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
            onChange={(event) => onTriggerEventChange(event.target.value)}
            placeholder="article.ingest.requested"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Cron</span>
          <Input
            value={cron}
            onChange={(event) => onCronChange(event.target.value)}
            placeholder="*/15 * * * *"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Max runs</span>
          <Input
            inputMode="numeric"
            value={maxRuns}
            onChange={(event) => onMaxRunsChange(event.target.value)}
            placeholder="optional"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Tags</span>
          <Input
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="ops, pipeline, default"
          />
        </label>
      </div>
    </div>
  );
}
