import { FormField, Input, Textarea } from "@newsportal/ui";

export interface LlmTemplateEditorValue {
  promptTemplateId?: string;
  name: string;
  scope: "criteria" | "interests" | "global";
  language: string;
  templateText: string;
  isActive: boolean;
}

interface LlmTemplateEditorFormProps {
  action: string;
  mode: "create" | "edit";
  redirectTo: string;
  cancelHref: string;
  value: LlmTemplateEditorValue;
}

function boolToString(value: boolean): string {
  return value ? "true" : "false";
}

const inputClassName = "h-10 text-sm";

export function LlmTemplateEditorForm({
  action,
  mode,
  redirectTo,
  cancelHref,
  value,
}: LlmTemplateEditorFormProps) {
  return (
    <form method="post" action={action} className="space-y-6">
      <input type="hidden" name="kind" value="llm" />
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {value.promptTemplateId && (
        <input type="hidden" name="promptTemplateId" value={value.promptTemplateId} />
      )}

      <section className="rounded-2xl border border-dashed border-border bg-background/70 p-4 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Editor map
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Basics</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Template name and language hint for operator-facing identification.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Scope & lifecycle</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose whether the prompt serves system interests, user interests, or the global fallback.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Prompt body</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Keep the placeholder contract explicit so runtime review stays predictable.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "LLM prompt definition" : "Edit LLM template"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prompts are used when scoring falls into the gray zone and a content item needs a model-assisted review.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label="Template name"
            name="llm-template-name"
            required
            helpText="Human-readable name for operators choosing and reviewing prompt variants."
          >
            <Input
              id="llm-template-name"
              name="name"
              defaultValue={value.name}
              placeholder="Gray zone interest review"
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Language"
            name="llm-template-language"
            helpText="Optional language hint for prompt maintenance and future routing."
          >
            <Input
              id="llm-template-language"
              name="language"
              defaultValue={value.language}
              placeholder="en"
              className={inputClassName}
            />
          </FormField>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField
            label="Scope"
            name="llm-template-scope"
            required
            helpText="Choose whether this prompt is used for user-interest review, system-interest review, or as a global fallback."
            helpWide
          >
            <select
              id="llm-template-scope"
              name="scope"
              defaultValue={value.scope}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="interests">Interests</option>
              <option value="criteria">System interests</option>
              <option value="global">Global fallback</option>
            </select>
          </FormField>

          <FormField
            label="Lifecycle state"
            name="llm-template-active"
            helpText="Archived templates remain visible for operators but are not selected for active review."
            helpWide
          >
            <select
              id="llm-template-active"
              name="isActive"
              defaultValue={boolToString(value.isActive)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="true">Active</option>
              <option value="false">Archived</option>
            </select>
          </FormField>
        </div>

        <div className="mt-4">
          <FormField
            label="Prompt template"
            name="llm-template-text"
            required
            helpText="Use placeholders like {title}, {lead}, {interest_name}, {criterion_name}, and {context}. The review worker fills them automatically; {criterion_name} remains the runtime placeholder for system-interest scope."
            helpWide
          >
            <Textarea
              id="llm-template-text"
              name="templateText"
              rows={14}
              defaultValue={value.templateText}
              className="min-h-[18rem] text-sm font-mono"
              placeholder={`You are a content relevance reviewer.\n\nContent title: {title}\nContent summary: {lead}\nContext: {context}\n\nReturn JSON: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}`}
            />
          </FormField>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <a
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to templates
        </a>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {mode === "create" ? "Create template" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
