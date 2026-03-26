import { useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Interest {
  interest_id: string;
  description?: string;
  compile_status?: string;
  enabled?: boolean;
  priority?: number;
  positive_texts?: string[];
  negative_texts?: string[];
  places?: string[];
  languages_allowed?: string[];
  must_have_terms?: string[];
  must_not_have_terms?: string[];
  short_tokens_required?: string[];
  short_tokens_forbidden?: string[];
}

interface InterestSheetProps {
  interests: Interest[];
  interestsPath: string;
  interestPath: (id: string) => string;
  hasAnyInterests?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

function asCsv(val: unknown): string {
  return Array.isArray(val) ? (val as string[]).join(", ") : "";
}

function asLines(val: unknown): string {
  return Array.isArray(val) ? (val as string[]).join("\n") : "";
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    compiled: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

export function InterestManager({
  interests,
  interestsPath,
  interestPath,
  hasAnyInterests = interests.length > 0,
  emptyStateTitle,
  emptyStateDescription,
}: InterestSheetProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    const body = new URLSearchParams();
    for (const [k, v] of data.entries()) body.append(k, String(v));

    try {
      const res = await fetch(interestsPath, { method: "POST", body });
      if (res.ok || res.redirected) {
        toast.success("Interest created. Compilation and background match sync started.");
        setShowCreate(false);
        form.reset();
        // Reload to get fresh data
        window.location.reload();
      } else {
        toast.error("Failed to create interest");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(
    e: React.FormEvent<HTMLFormElement>,
    id: string,
    action: "update" | "clone" | "delete"
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const body = new URLSearchParams();
    for (const [k, v] of data.entries()) body.append(k, String(v));
    body.set("_action", action);

    const res = await fetch(interestPath(id), { method: "POST", body });
    if (res.ok || res.redirected) {
      const msg =
        action === "delete"
          ? "Interest deleted"
          : action === "clone"
            ? "Interest cloned. Compilation and background match sync started."
            : "Interest updated. Compilation and background match sync started.";
      toast.success(msg);
      window.location.reload();
    } else {
      toast.error("Action failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">My Interests</h2>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Interest
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">New Interest</h3>
            <button type="button" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Description *</label>
              <textarea name="description" required rows={2} placeholder="AI policy updates in the EU"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Positive examples (one per line)</label>
                <textarea name="positive_texts" rows={3} placeholder="EU AI Act&#10;Brussels regulation"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Negative examples (one per line)</label>
                <textarea name="negative_texts" rows={3} placeholder="sports&#10;celebrity gossip"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Places</label>
                <input name="places" placeholder="Brussels, Warsaw" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Languages</label>
                <input name="languages_allowed" defaultValue="en" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Priority (0.1–1)</label>
                <input name="priority" type="number" defaultValue="1" min="0.1" max="1" step="0.1" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Must-have terms</label>
                <input name="must_have_terms" placeholder="policy, regulation" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Must-not-have terms</label>
                <input name="must_not_have_terms" placeholder="sports, celebrity" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
            <button type="submit" disabled={submitting}
              className="mt-1 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 w-fit">
              {submitting ? "Creating..." : "Create Interest"}
            </button>
          </form>
        </div>
      )}

      {/* Interests grid */}
      {interests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">
            {emptyStateTitle ?? (hasAnyInterests ? "No interests on this page" : "No interests yet")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {emptyStateDescription ?? (
              hasAnyInterests
                ? "Use the pager below to return to another page of interests"
                : "Add your first interest to start receiving personalized news"
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {interests.map((interest) => {
            const isExpanded = expandedId === interest.interest_id;
            const status = String(interest.compile_status ?? "pending");
            return (
              <div key={interest.interest_id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}>
                      {status}
                    </span>
                    {!interest.enabled && (
                      <span className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm leading-snug">
                    {String(interest.description ?? "Untitled interest")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Priority: {String(interest.priority ?? 1)}
                    {interest.languages_allowed && Array.isArray(interest.languages_allowed) && interest.languages_allowed.length > 0
                      ? ` · ${(interest.languages_allowed as string[]).join(", ")}` : ""}
                  </p>
                </div>
                <div className="border-t border-border px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : interest.interest_id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    {isExpanded ? "Less" : "Edit / Clone / Delete"}
                  </button>
                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {/* Update form */}
                      <form onSubmit={(e) => handleAction(e, interest.interest_id, "update")} className="grid gap-2">
                        <input type="hidden" name="_action" value="update" />
                        <div className="grid gap-1">
                          <label className="text-xs font-medium">Description</label>
                          <textarea name="description" rows={2} defaultValue={String(interest.description ?? "")}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <label className="text-xs font-medium">Positive examples</label>
                            <textarea name="positive_texts" rows={3} defaultValue={asLines(interest.positive_texts)}
                              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs font-medium">Negative examples</label>
                            <textarea name="negative_texts" rows={3} defaultValue={asLines(interest.negative_texts)}
                              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <label className="text-xs font-medium">Places</label>
                            <input name="places" defaultValue={asCsv(interest.places)}
                              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs font-medium">Languages</label>
                            <input name="languages_allowed" defaultValue={asCsv(interest.languages_allowed)}
                              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <label className="text-xs font-medium">Enabled</label>
                          <select name="enabled" defaultValue={String(interest.enabled !== false)}
                            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button type="submit" className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                            Save
                          </button>
                        </div>
                      </form>
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <form onSubmit={(e) => handleAction(e, interest.interest_id, "clone")}>
                          <input type="hidden" name="_action" value="clone" />
                          <input type="hidden" name="description" value={`Copy of ${String(interest.description ?? "interest")}`} />
                          <button type="submit" className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-accent transition-colors">
                            Clone
                          </button>
                        </form>
                        <form onSubmit={(e) => handleAction(e, interest.interest_id, "delete")}>
                          <input type="hidden" name="_action" value="delete" />
                          <button type="submit" className="h-8 px-3 rounded-md border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
