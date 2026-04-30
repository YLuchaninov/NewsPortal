import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@newsportal/ui";

interface AutomationEditorRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runContextJson: string;
  onRunContextJsonChange: (value: string) => void;
  runTriggerMetaJson: string;
  onRunTriggerMetaJsonChange: (value: string) => void;
  onSubmit: () => void;
}

export function AutomationEditorRunDialog({
  open,
  onOpenChange,
  runContextJson,
  onRunContextJsonChange,
  runTriggerMetaJson,
  onRunTriggerMetaJsonChange,
  onSubmit,
}: AutomationEditorRunDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Textarea
              value={runContextJson}
              onChange={(event) => onRunContextJsonChange(event.target.value)}
              rows={7}
              className="font-mono text-xs"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Trigger meta JSON</span>
            <Textarea
              value={runTriggerMetaJson}
              onChange={(event) => onRunTriggerMetaJsonChange(event.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit}>
            Request Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
