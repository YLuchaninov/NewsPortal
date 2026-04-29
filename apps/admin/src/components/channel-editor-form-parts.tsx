import type { ReactNode } from "react";

interface ChannelEditorOverviewItem {
  title: string;
  body: string;
}

interface ChannelEditorOverviewProps {
  items: ChannelEditorOverviewItem[];
}

export function ChannelEditorOverview({ items }: ChannelEditorOverviewProps) {
  return (
    <section className="rounded-2xl border border-border bg-background px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.title}
            className="min-w-[180px] flex-1 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface ChannelEditorSectionProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

export function ChannelEditorSection({
  title,
  description,
  children,
}: ChannelEditorSectionProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

interface ChannelEditorActionsProps {
  cancelHref: string;
  submitLabel: string;
}

export function ChannelEditorActions({
  cancelHref,
  submitLabel,
}: ChannelEditorActionsProps) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      <a
        href={cancelHref}
        className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Back to channels
      </a>
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {submitLabel}
      </button>
    </div>
  );
}
