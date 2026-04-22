import { FormField, Input, Textarea } from "@newsportal/ui";

export interface InterestTemplateEditorValue {
  interestTemplateId?: string;
  name: string;
  description: string;
  positiveTexts: string;
  negativeTexts: string;
  mustHaveTerms: string;
  mustNotHaveTerms: string;
  places: string;
  languagesAllowed: string;
  timeWindowHours: string;
  allowedContentKinds: string;
  shortTokensRequired: string;
  shortTokensForbidden: string;
  candidatePositiveSignals: string;
  candidateNegativeSignals: string;
  priority: string;
  isActive: boolean;
  selectionProfileId?: string;
  selectionProfileStatus?: string;
  selectionProfileVersion?: string;
  selectionProfileFamily?: string;
  selectionProfileStrictness?: string;
  selectionProfileUnresolvedDecision?: string;
  selectionProfileLlmReviewMode?: string;
  candidateSignalSource?: string;
  candidatePositiveSignalGroupCount?: string;
  candidateNegativeSignalGroupCount?: string;
}

interface InterestTemplateEditorFormProps {
  action: string;
  mode: "create" | "edit";
  redirectTo: string;
  cancelHref: string;
  value: InterestTemplateEditorValue;
}

function boolToString(value: boolean): string {
  return value ? "true" : "false";
}

const inputClassName = "h-10 text-sm";

function displayValue(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function InterestTemplateEditorForm({
  action,
  mode,
  redirectTo,
  cancelHref,
  value,
}: InterestTemplateEditorFormProps) {
  return (
    <form method="post" action={action} className="space-y-6">
      <input type="hidden" name="kind" value="interest" />
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {value.interestTemplateId && (
        <input type="hidden" name="interestTemplateId" value={value.interestTemplateId} />
      )}

      <section className="rounded-2xl border border-dashed border-border bg-background/70 p-4 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Editor map
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Basics</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Name, lifecycle state, description, and positive or negative prototypes.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Runtime policy</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review-mode, unresolved-outcome, and candidate-cue settings from the synced selection profile.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold">Advanced matching</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Lexical gates, content kinds, time window, and optional uplift cues for borderline content.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "System interest basics" : "Edit system interest"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            System interests define the global themes the platform uses to build the system-selected collection before any per-user personalization kicks in.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label="System interest name"
            name="interest-template-name"
            required
            helpText="Short label shown to operators and reused when discovery or user-interest tooling references this system interest."
          >
            <Input
              id="interest-template-name"
              name="name"
              defaultValue={value.name}
              placeholder="AI policy"
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Lifecycle state"
            name="interest-template-active"
            helpText="Archived system interests stay visible in admin and can be reactivated later."
          >
            <select
              id="interest-template-active"
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
            label="Description"
            name="interest-template-description"
            helpText="Explain what kind of content this system interest should allow into the global collection."
            helpWide
          >
            <Textarea
              id="interest-template-description"
              name="description"
              rows={3}
              defaultValue={value.description}
              placeholder="News about AI regulation, governance, and public-sector oversight."
              className="text-sm"
            />
          </FormField>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FormField
            label="Positive prototypes"
            name="interest-template-positive-texts"
            required
            helpText="One example item per line that should match this system interest."
            helpWide
          >
            <Textarea
              id="interest-template-positive-texts"
              name="positive_texts"
              rows={8}
              defaultValue={value.positiveTexts}
              className="min-h-[14rem] text-sm"
            />
          </FormField>

          <FormField
            label="Negative prototypes"
            name="interest-template-negative-texts"
            helpText="Near-neighbor examples that should not match this system interest, to reduce false positives."
            helpWide
          >
            <Textarea
              id="interest-template-negative-texts"
              name="negative_texts"
              rows={8}
              defaultValue={value.negativeTexts}
              className="min-h-[14rem] text-sm"
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">Current runtime profile policy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the human-readable compatibility policy currently synced into the additive <code>selection_profiles</code> layer. It explains how unresolved matches behave at runtime without requiring operators to read worker code.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Strictness</p>
            <p className="mt-2 text-sm font-semibold">
              {displayValue(value.selectionProfileStrictness, "balanced")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Keeps the runtime conservative enough for mass-scale filtering without exposing raw thresholds.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Unresolved outcome</p>
            <p className="mt-2 text-sm font-semibold">
              {displayValue(value.selectionProfileUnresolvedDecision, "hold")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uncertain cases stay out of the selected collection unless the runtime review path resolves them more confidently.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">LLM review mode</p>
            <p className="mt-2 text-sm font-semibold">
              {displayValue(value.selectionProfileLlmReviewMode, "always")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gray-zone system-interest cases default to asynchronous LLM review instead of silently collapsing into a cheap hold path.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Profile sync</p>
            <p className="mt-2 text-sm font-semibold">
              {displayValue(value.selectionProfileStatus, value.isActive ? "active" : "archived")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {`family ${displayValue(value.selectionProfileFamily, "compatibility_interest_template")} · version ${displayValue(value.selectionProfileVersion, "1")}`}
            </p>
            {value.selectionProfileId ? (
              <p className="mt-1 break-all text-[11px] text-muted-foreground">{value.selectionProfileId}</p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                A compatibility profile will be created automatically on save.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Candidate cues</p>
            <p className="mt-2 text-sm font-semibold">
              {displayValue(value.candidateSignalSource, "generic_fallback")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {`${displayValue(value.candidatePositiveSignalGroupCount, "0")} positive groups · ${displayValue(value.candidateNegativeSignalGroupCount, "0")} negative groups`}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <FormField
            label="Strictness"
            name="interest-template-policy-strictness"
            helpText="Keeps the hidden default unless you explicitly choose a narrower or broader runtime stance."
            helpWide
          >
            <select
              id="interest-template-policy-strictness"
              name="selection_profile_strictness"
              defaultValue={displayValue(value.selectionProfileStrictness, "balanced")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="strict">strict</option>
              <option value="balanced">balanced</option>
              <option value="broad">broad</option>
            </select>
          </FormField>

          <FormField
            label="Unresolved outcome"
            name="interest-template-policy-unresolved"
            helpText="Controls whether unresolved cases stay on hold or collapse to reject when no stronger evidence appears."
            helpWide
          >
            <select
              id="interest-template-policy-unresolved"
              name="selection_profile_unresolved_decision"
              defaultValue={displayValue(value.selectionProfileUnresolvedDecision, "hold")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="hold">hold</option>
              <option value="reject">reject</option>
            </select>
          </FormField>

          <FormField
            label="LLM review mode"
            name="interest-template-policy-llm-review"
            helpText="Leave the default in place or choose a cheaper policy when this system interest should avoid automatic gray-zone review."
            helpWide
          >
            <select
              id="interest-template-policy-llm-review"
              name="selection_profile_llm_review_mode"
              defaultValue={displayValue(value.selectionProfileLlmReviewMode, "always")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="disabled">disabled</option>
              <option value="optional_high_value_only">optional_high_value_only</option>
              <option value="always">always</option>
            </select>
          </FormField>
        </div>
      </section>

      <details className="group rounded-2xl border border-border bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-base font-semibold text-foreground">Advanced matching hints</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional lexical constraints, geographic hints, time-window gating, and content-kind gates for more precise global selection.
            </p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition group-open:rotate-180">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <FormField
            label="Must-have terms"
            name="interest-template-must-have"
            helpText="One term per line. Articles must contain at least one of these terms."
            helpWide
          >
            <Textarea
              id="interest-template-must-have"
              name="must_have_terms"
              rows={4}
              defaultValue={value.mustHaveTerms}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Must-not-have terms"
            name="interest-template-must-not-have"
            helpText="One term per line. Articles containing these terms will be filtered out."
            helpWide
          >
            <Textarea
              id="interest-template-must-not-have"
              name="must_not_have_terms"
              rows={4}
              defaultValue={value.mustNotHaveTerms}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Places"
            name="interest-template-places"
            helpText="Optional place hints, one per line, for geographically-scoped topics."
            helpWide
          >
            <Textarea
              id="interest-template-places"
              name="places"
              rows={4}
              defaultValue={value.places}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Allowed languages"
            name="interest-template-languages"
            helpText="Optional ISO language codes, one per line."
          >
            <Textarea
              id="interest-template-languages"
              name="languages_allowed"
              rows={4}
              defaultValue={value.languagesAllowed}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Allowed content kinds"
            name="interest-template-allowed-kinds"
            helpText="One content kind per line. Leave blank only if you want the default full universal set."
            helpWide
          >
            <Textarea
              id="interest-template-allowed-kinds"
              name="allowed_content_kinds"
              rows={4}
              defaultValue={value.allowedContentKinds}
              placeholder={"editorial\nlisting\nentity\ndocument\ndata_file\napi_payload"}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Required short tokens"
            name="interest-template-short-required"
            helpText="Short keywords, acronyms, or stock tickers that must be present."
            helpWide
          >
            <Textarea
              id="interest-template-short-required"
              name="short_tokens_required"
              rows={4}
              defaultValue={value.shortTokensRequired}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Forbidden short tokens"
            name="interest-template-short-forbidden"
            helpText="Short keywords or acronyms that should suppress false-positive matches."
            helpWide
          >
            <Textarea
              id="interest-template-short-forbidden"
              name="short_tokens_forbidden"
              rows={4}
              defaultValue={value.shortTokensForbidden}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Candidate uplift positive cues"
            name="interest-template-candidate-positive-signals"
            helpText="One group per line. Format: group_name: cue one | cue two | cue three. These cues help near-threshold items stay alive for gray-zone review."
            helpWide
          >
            <Textarea
              id="interest-template-candidate-positive-signals"
              name="candidate_positive_signals"
              rows={6}
              defaultValue={value.candidatePositiveSignals}
              className="text-sm"
            />
          </FormField>

          <FormField
            label="Candidate uplift negative cues"
            name="interest-template-candidate-negative-signals"
            helpText="One group per line. Format: group_name: cue one | cue two | cue three. Use these to block marketplace, hiring, or community noise from the candidate-recovery path."
            helpWide
          >
            <Textarea
              id="interest-template-candidate-negative-signals"
              name="candidate_negative_signals"
              rows={6}
              defaultValue={value.candidateNegativeSignals}
              className="text-sm"
            />
          </FormField>
        </div>

        <div className="mt-4 grid gap-4 md:max-w-2xl md:grid-cols-2">
          <FormField
            label="Time window (hours)"
            name="interest-template-time-window"
            helpText="Articles older than this window fail the hard filter before scoring. Leave blank to accept content from any time period."
            helpWide
          >
            <Input
              id="interest-template-time-window"
              name="time_window_hours"
              type="number"
              min={1}
              step={1}
              placeholder="168"
              defaultValue={value.timeWindowHours}
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Priority"
            name="interest-template-priority"
            helpText="Relative weighting applied when multiple system interests compete for the same content cluster. Supports fine-grained decimals such as 0.95 or 0,95."
            helpWide
          >
            <Input
              id="interest-template-priority"
              name="priority"
              type="number"
              min={0.1}
              step={0.001}
              defaultValue={value.priority}
              className={inputClassName}
            />
          </FormField>
        </div>
      </details>

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
