import {
  Button,
  ScrollArea,
  Textarea,
} from "@newsportal/ui";

interface AutomationEditorAdvancedJsonProps {
  advancedJson: string;
  onAdvancedJsonChange: (value: string) => void;
  onApply: () => void;
}

export function AutomationEditorAdvancedJson({
  advancedJson,
  onAdvancedJsonChange,
  onApply,
}: AutomationEditorAdvancedJsonProps) {
  return (
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
            onChange={(event) => onAdvancedJsonChange(event.target.value)}
          />
        </label>
        <Button type="button" onClick={onApply} className="w-full">
          Apply JSON To Canvas
        </Button>
      </div>
    </ScrollArea>
  );
}
