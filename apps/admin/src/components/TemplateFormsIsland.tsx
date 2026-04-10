import { useState } from "react";
import type React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, FormField, Input, Textarea } from "@newsportal/ui";

interface LlmTemplateFormProps {
  action: string;
}

const SCOPE_HELP: Record<string, { label: string; description: string; example: string }> = {
  interests: {
    label: "Interests",
    description: "Used when a user-interest match falls in the gray zone (score 0.45–0.72). The LLM reviews whether the content item truly matches the user's interest.",
    example: `You are a content relevance reviewer. The user is interested in "{interest_name}".

Given the content item below, decide if it is relevant to this interest.

Content title: {title}
Content summary: {lead}

Return JSON: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}`,
  },
  criteria: {
    label: "System Interests",
    description: "Used when a system-interest match falls in the gray zone. The LLM reviews whether the content meets the system-wide selection rule.",
    example: `You are a content classification reviewer. The system interest is: "{criterion_name}".

Given the content item below, decide if it matches this system interest.

Content title: {title}
Content summary: {lead}

Return JSON: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}`,
  },
  global: {
    label: "Global",
    description: "A fallback template applied to any gray-zone review that doesn't have a scope-specific template. Keep it generic.",
    example: `You are a content relevance reviewer.

Given the content item below, decide whether it should be sent to the user based on the context provided.

Content title: {title}
Content summary: {lead}
Context: {context}

Return JSON: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}`,
  },
};

export function LlmTemplateForm({ action }: LlmTemplateFormProps) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("interests");
  const [templateText, setTemplateText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const scopeInfo = SCOPE_HELP[scope];

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Template name is required.";
    if (!templateText.trim()) errs.templateText = "Template text cannot be empty.";
    if (templateText.trim() && !templateText.includes("{")) {
      errs.templateText = "Template should contain placeholder variables like {title}, {lead}, etc.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const inputCls = "h-8 text-xs";
  const textareaCls = "min-h-0 text-xs";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold text-sm mb-1">Create LLM Template</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        LLM templates define the prompt sent to an external AI model when a content item lands in the
        gray zone — a score range where the system can't confidently decide relevance.
      </p>

      <form method="post" action={action} onSubmit={handleSubmit} className="grid gap-3">
        <input type="hidden" name="kind" value="llm" />

        <FormField label="Template name" name="llm-template-name" required error={errors.name}>
          <Input
            id="llm-template-name"
            name="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
            placeholder="e.g. Gray zone interest review"
            className={`${inputCls} ${errors.name ? "border-red-400 focus-visible:ring-red-400" : ""}`}
          />
        </FormField>

        <FormField
          label="Scope"
          name="llm-template-scope"
          helpText="Determines when this template is used: interests = user-interest reviews, system interests = system-interest reviews, global = fallback for all reviews."
          helpWide
        >
          <select
            id="llm-template-scope"
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="interests">interests — user interest gray-zone review</option>
            <option value="criteria">system interests — gray-zone review</option>
            <option value="global">global — fallback for any gray-zone review</option>
          </select>
          <p className="text-[11px] text-muted-foreground">{scopeInfo.description}</p>
        </FormField>

        <FormField
          label="Prompt template"
          name="llm-template-text"
          required
          error={errors.templateText}
          helpText="The prompt text sent to the LLM. Use {title}, {lead}, {interest_name}, {criterion_name}, {context} as placeholders — they are filled automatically at review time."
          helpWide
        >
          <Textarea
            id="llm-template-text"
            name="templateText"
            rows={7}
            value={templateText}
            onChange={(e) => { setTemplateText(e.target.value); setErrors((p) => ({ ...p, templateText: "" })); }}
            placeholder={`Return JSON: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}`}
            className={`${textareaCls} font-mono ${errors.templateText ? "border-red-400 focus-visible:ring-red-400" : ""}`}
          />
          <p className="text-[11px] text-muted-foreground">
            Available variables: <code className="rounded bg-muted px-1 py-0.5">{"{title}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{lead}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{interest_name}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{criterion_name}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{context}"}</code>
          </p>
        </FormField>

        <Collapsible>
          <CollapsibleTrigger className="text-[11px] text-primary hover:underline">
            Example for "{scopeInfo.label}" scope
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/30 p-3">
              <pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
                {scopeInfo.example}
              </pre>
              <button
                type="button"
                onClick={() => { setTemplateText(scopeInfo.example); setErrors((p) => ({ ...p, templateText: "" })); }}
                className="mt-2 h-7 px-3 rounded-md border border-input text-xs hover:bg-accent transition-colors"
              >
                Use this example
              </button>
          </CollapsibleContent>
        </Collapsible>

        <button
          type="submit"
          className="h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Save LLM Template
        </button>
      </form>
    </div>
  );
}

interface InterestTemplateFormProps {
  action: string;
}

export function InterestTemplateForm({ action }: InterestTemplateFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [positiveTexts, setPositiveTexts] = useState("");
  const [negativeTexts, setNegativeTexts] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Template name is required.";
    if (!positiveTexts.trim()) errs.positive_texts = "At least one positive prototype is required.";
    const posLines = positiveTexts.split("\n").filter((l) => l.trim());
    if (posLines.length > 0 && posLines.length < 2) {
      errs.positive_texts = "Provide at least 2 positive prototypes for better matching accuracy.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const inputCls = "h-8 text-xs";
  const textareaCls = "min-h-0 text-xs";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold text-sm mb-1">Create System Interest</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        System interests are predefined global selection rules. Each one contains prototypes that
        teach the system what kinds of content items should or should not enter the
        system-selected collection.
      </p>

      <form method="post" action={action} onSubmit={handleSubmit} className="grid gap-3">
        <input type="hidden" name="kind" value="interest" />

        <FormField label="Template name" name="interest-template-name" required error={errors.name}>
          <Input
            id="interest-template-name"
            name="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
            placeholder="e.g. AI policy, Climate regulation, Crypto markets"
            className={`${inputCls} ${errors.name ? "border-red-400 focus-visible:ring-red-400" : ""}`}
          />
        </FormField>

        <FormField
          label="Description"
          name="interest-template-description"
          helpText="A short explanation of this system interest for operators."
          helpWide
        >
          <Textarea
            id="interest-template-description"
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. News about artificial intelligence regulation, government AI policies, and AI safety frameworks"
            className={textareaCls}
          />
        </FormField>

        <FormField
          label="Positive prototypes"
          name="interest-template-positive-texts"
          required
          error={errors.positive_texts}
          helpText="Example titles or descriptors that SHOULD match this interest. One per line. The system converts these into embeddings to find similar content items. More examples = better matching."
          helpWide
        >
          <Textarea
            id="interest-template-positive-texts"
            name="positive_texts"
            rows={4}
            value={positiveTexts}
            onChange={(e) => { setPositiveTexts(e.target.value); setErrors((p) => ({ ...p, positive_texts: "" })); }}
            placeholder={"EU passes landmark AI regulation act\nUS government proposes AI safety framework\nNew AI governance rules for healthcare\nChina announces national AI strategy update"}
            className={`${textareaCls} ${errors.positive_texts ? "border-red-400 focus-visible:ring-red-400" : ""}`}
          />
          <p className="text-[11px] text-muted-foreground">
            One headline per line. Aim for 3–5 varied examples covering different angles of the topic.
          </p>
        </FormField>

        <FormField
          label="Negative prototypes"
          name="interest-template-negative-texts"
          helpText="Example titles or descriptors that should NOT match this interest, even though they might seem related. Helps reduce false positives. For example, for AI policy you may want to exclude consumer gadget launches."
          helpWide
        >
          <Textarea
            id="interest-template-negative-texts"
            name="negative_texts"
            rows={3}
            value={negativeTexts}
            onChange={(e) => setNegativeTexts(e.target.value)}
            placeholder={"New iPhone AI assistant features released\nGoogle unveils latest AI chatbot\nAI startup raises $100M funding round"}
            className={textareaCls}
          />
          <p className="text-[11px] text-muted-foreground">
            One headline per line. Include topics that are similar but should NOT trigger this interest.
            Without negatives, false positives increase significantly.
          </p>
        </FormField>

        <button
          type="submit"
          className="h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Save System Interest
        </button>
      </form>
    </div>
  );
}
