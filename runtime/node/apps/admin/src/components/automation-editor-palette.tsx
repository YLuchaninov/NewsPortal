import { Card, CardContent, Input, ScrollArea } from "@signalops/ui";

import type {
  AutomationPaletteGroup,
  AutomationPluginRecord,
} from "../lib/automation-workspace";
import { ADMIN_AUTOMATION_CARD_CLASS } from "../lib/admin-ui-classes";
import { readText } from "./automation-editor-workspace-model";

interface AutomationEditorPaletteProps {
  moduleSearch: string;
  onModuleSearchChange: (value: string) => void;
  templatesHref: string;
  paletteGroups: AutomationPaletteGroup[];
  filteredPaletteGroups: AutomationPaletteGroup[];
  onAppendTask: (plugin: AutomationPluginRecord) => void;
}

export function AutomationEditorPalette({
  moduleSearch,
  onModuleSearchChange,
  templatesHref,
  paletteGroups,
  filteredPaletteGroups,
  onAppendTask,
}: AutomationEditorPaletteProps) {
  return (
    <Card className={`overflow-hidden ${ADMIN_AUTOMATION_CARD_CLASS}`}>
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
          onChange={(event) => onModuleSearchChange(event.target.value)}
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
                    onClick={() => onAppendTask(plugin)}
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
  );
}
