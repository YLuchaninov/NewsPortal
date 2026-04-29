import { Button } from "@newsportal/ui";

interface AutomationEditorHeaderProps {
  status: string;
  statusClassName: string;
  dirty: boolean;
  title: string;
  executionsHref: string;
  saveState: "idle" | "saving" | "saved" | "error";
  onRunNow: () => void;
  onSave: () => void;
  onArchive: () => void;
}

export function AutomationEditorHeader({
  status,
  statusClassName,
  dirty,
  title,
  executionsHref,
  saveState,
  onRunNow,
  onSave,
  onArchive,
}: AutomationEditorHeaderProps) {
  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_28%),linear-gradient(135deg,rgba(24,24,27,1),rgba(9,9,11,1))] p-5 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClassName}`}>
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
            onClick={onRunNow}
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
            onClick={onSave}
            disabled={!dirty || saveState === "saving"}
            className="bg-orange-500 text-zinc-950 hover:bg-orange-400"
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onArchive}
            className="border border-rose-400/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
          >
            Archive
          </Button>
        </div>
      </div>
    </section>
  );
}
