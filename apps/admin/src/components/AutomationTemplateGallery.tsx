import { useMemo, useState } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@newsportal/ui";

import {
  AUTOMATION_TEMPLATES,
  createBlankLinearAutomation,
  instantiateAutomationTemplate,
  type AutomationPaletteGroup,
} from "../lib/automation-workspace";

type JsonRecord = Record<string, unknown>;

interface AutomationTemplateGalleryProps {
  automationBffPath: string;
  automationRootPath: string;
  currentUserId: string;
  paletteGroups: AutomationPaletteGroup[];
}

function readText(value: unknown, fallback = "—"): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(readText(json.error ?? json.detail, `Request failed with ${response.status}`));
  }
  return json;
}

export function AutomationTemplateGallery({
  automationBffPath,
  automationRootPath,
  currentUserId,
  paletteGroups,
}: AutomationTemplateGalleryProps) {
  const [query, setQuery] = useState("");
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return AUTOMATION_TEMPLATES;
    }
    return AUTOMATION_TEMPLATES.filter((template) =>
      [template.title, template.description, template.category, template.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query]);

  async function handleCreateFromTemplate(templateId: string): Promise<void> {
    setPendingTemplateId(templateId);
    setErrorMessage(null);
    try {
      const response = await postJson(
        automationBffPath,
        {
          intent: "create_sequence",
          ...instantiateAutomationTemplate(templateId, {
            createdBy: currentUserId,
          }),
        }
      );
      const sequenceId = readText(response.sequence_id, "");
      if (!sequenceId) {
        throw new Error("Sequence creation did not return an id.");
      }
      window.location.href = `${automationRootPath}/${encodeURIComponent(sequenceId)}`;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create template.");
    } finally {
      setPendingTemplateId(null);
    }
  }

  async function handleCreateBlank(): Promise<void> {
    setPendingTemplateId("blank");
    setErrorMessage(null);
    try {
      const response = await postJson(automationBffPath, {
        intent: "create_sequence",
        ...createBlankLinearAutomation({ createdBy: currentUserId }),
      });
      const sequenceId = readText(response.sequence_id, "");
      if (!sequenceId) {
        throw new Error("Sequence creation did not return an id.");
      }
      window.location.href = `${automationRootPath}/${encodeURIComponent(sequenceId)}`;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create workflow.");
    } finally {
      setPendingTemplateId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_28%),linear-gradient(135deg,rgba(23,23,23,1),rgba(9,9,11,1))] p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
              Starter Gallery
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Start from a proven lane, not an empty JSON box
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/72">
                Templates map directly onto the shipped sequence engine. Every card is a truthful
                sequential workflow that you can open in the canvas and adapt for your own runbooks.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void handleCreateBlank()}
                disabled={pendingTemplateId === "blank"}
                className="bg-sky-400 text-zinc-950 hover:bg-sky-300"
              >
                {pendingTemplateId === "blank" ? "Creating…" : "Blank Linear Workflow"}
              </Button>
              <div className="w-full max-w-sm">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search templates"
                  className="border-white/10 bg-white/6 text-white placeholder:text-white/45"
                />
              </div>
            </div>
            {errorMessage && (
              <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {paletteGroups.slice(0, 4).map((group) => (
              <div key={group.id} className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">{group.label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{group.plugins.length}</p>
                <p className="mt-1 text-sm text-white/64">available modules for this category</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="overflow-hidden border-white/10 bg-card/90 shadow-sm"
            >
              <div className={`h-2 w-full bg-gradient-to-r ${template.accent}`} />
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {template.category}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-300 ring-1 ring-orange-500/20">
                    {template.taskGraph.length} steps
                  </span>
                </div>
                <div>
                  <CardTitle>{template.title}</CardTitle>
                  <CardDescription className="mt-2">{template.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <span
                      key={`${template.id}:${tag}`}
                      className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {template.taskGraph.slice(0, 5).map((task, index) => (
                    <li key={`${template.id}:${task.key}`} className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                        {index + 1}
                      </span>
                      <span>{task.label ?? task.module}</span>
                    </li>
                  ))}
                </ol>
                <Button
                  type="button"
                  onClick={() => void handleCreateFromTemplate(template.id)}
                  disabled={pendingTemplateId === template.id}
                  className="w-full bg-orange-500 text-zinc-950 hover:bg-orange-400"
                >
                  {pendingTemplateId === template.id ? "Creating…" : "Use Template"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-white/10 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Available Node Library</CardTitle>
            <CardDescription>
              The editor palette is generated from the live sequence plugin registry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paletteGroups.map((group) => (
              <section key={group.id} className="rounded-[1.2rem] border border-border bg-background/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-medium text-foreground">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">{group.plugins.length} nodes</span>
                </div>
                <div className="space-y-2">
                  {group.plugins.slice(0, 6).map((plugin) => (
                    <div
                      key={String(plugin.module)}
                      className="rounded-xl border border-border/70 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {String(plugin.module)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {readText(plugin.description, "No description.")}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
