import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@signalops/ui";

import { formatUtcTimestamp, postJson, readText } from "./admin-client-helpers";
import { ADMIN_HERO_CARD_CLASS } from "../lib/admin-ui-classes";

export interface McpTokenRecord {
  tokenId: string;
  label: string;
  tokenPrefix: string;
  scopes: string[];
  funnelScope?: {
    allowedFunnelIds?: string[];
  };
  status: "active" | "revoked";
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp?: string | null;
  lastUsedUserAgent?: string | null;
  recentRequestCount: number;
}

interface McpTokenWorkspaceProps {
  mcpBffPath: string;
  adminActionToken: string;
  initialTokens: McpTokenRecord[];
  scopeOptions: readonly string[];
}

export function McpTokenWorkspace({
  mcpBffPath,
  adminActionToken,
  initialTokens,
  scopeOptions,
}: McpTokenWorkspaceProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["read"]);
  const [allowedFunnelIds, setAllowedFunnelIds] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleScope(scope: string): void {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope]
    );
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API is unavailable.");
    }
    await navigator.clipboard.writeText(text);
  }

  async function handleCopyCreatedToken(): Promise<void> {
    if (!createdToken) {
      return;
    }
    try {
      await writeClipboardText(createdToken);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  async function handleIssueToken(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    setCreatedToken(null);
    setCopyStatus("idle");
    try {
      const response = await postJson(mcpBffPath, {
        intent: "issue",
        adminActionToken,
        label,
        expiresAt,
        scopes: selectedScopes.join(","),
        allowedFunnelIds,
      });
      const tokenRecord = response.tokenRecord as McpTokenRecord | undefined;
      const tokenValue = readText(response.token, "");
      if (!tokenRecord || !tokenValue) {
        throw new Error("MCP token issuance did not return the expected payload.");
      }
      setTokens((current) => [tokenRecord, ...current]);
      setCreatedToken(tokenValue);
      setLabel("");
      setExpiresAt("");
      setAllowedFunnelIds("");
      setSelectedScopes(["read"]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to issue MCP token.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeToken(tokenId: string): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await postJson(mcpBffPath, {
        intent: "revoke",
        adminActionToken,
        tokenId,
      });
      const tokenRecord = response.tokenRecord as McpTokenRecord | undefined;
      if (!tokenRecord) {
        throw new Error("MCP token revoke did not return the updated token state.");
      }
      setTokens((current) =>
        current.map((token) => (token.tokenId === tokenId ? tokenRecord : token))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to revoke MCP token.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteToken(tokenId: string): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await postJson(mcpBffPath, {
        intent: "delete",
        adminActionToken,
        tokenId,
      });
      setTokens((current) => current.filter((token) => token.tokenId !== tokenId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete MCP token.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`overflow-hidden ${ADMIN_HERO_CARD_CLASS}`}>
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
              Remote MCP Access
            </p>
            <div className="space-y-2.5">
              <h1 className="max-w-3xl text-2xl font-semibold tracking-tight md:text-[2rem]">
                Issue bounded operator tokens for remote MCP clients
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Tokens are shown only once, carry explicit scopes, and can be revoked from this
                workspace without touching admin browser sessions.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.3rem] border border-border bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Active tokens
                </p>
                <p className="mt-3 text-2xl font-semibold">
                  {tokens.filter((token) => token.status === "active").length}
                </p>
              </div>
              <div className="rounded-[1.3rem] border border-border bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Recent MCP requests
                </p>
                <p className="mt-3 text-2xl font-semibold">
                  {tokens.reduce((sum, token) => sum + token.recentRequestCount, 0)}
                </p>
              </div>
            </div>
          </div>

          <Card className="border-border bg-background/70">
            <CardHeader>
              <CardTitle>Issue Token</CardTitle>
              <CardDescription>
                Choose the minimum scopes needed for the client. Destructive writes still require
                explicit confirmation in the MCP tool call.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Label</label>
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Codex desktop on laptop"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Optional expiry</label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Scopes</p>
                <div className="flex flex-wrap gap-2">
                  {scopeOptions.map((scope) => {
                    const selected = selectedScopes.includes(scope);
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {scope}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Allowed funnel IDs</label>
                <Input
                  value={allowedFunnelIds}
                  onChange={(event) => setAllowedFunnelIds(event.target.value)}
                  placeholder="UUIDs separated by commas or spaces"
                />
              </div>
              <Button
                type="button"
                disabled={submitting || !label.trim() || selectedScopes.length === 0}
                onClick={() => void handleIssueToken()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? "Issuing…" : "Issue MCP Token"}
              </Button>
              {createdToken && (
                <div className="rounded-[1.2rem] border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-200">Copy this token now</p>
                      <p className="mt-2 text-xs leading-6 text-emerald-100/90">
                        It will not be shown again after this browser state is lost.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleCopyCreatedToken()}
                      className="border border-emerald-500/30 bg-background text-foreground hover:bg-muted"
                    >
                      {copyStatus === "copied" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  {copyStatus === "failed" && (
                    <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Clipboard copy was blocked by the browser.
                    </p>
                  )}
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-background/90 p-3 text-xs text-foreground">
                    {createdToken}
                  </pre>
                </div>
              )}
              {errorMessage && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle>Issued Tokens</CardTitle>
          <CardDescription>
            Review status, recent activity, and revoke access without affecting admin sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tokens.length === 0 ? (
            <div className="rounded-[1.2rem] border border-dashed border-border bg-background/60 p-6 text-sm text-muted-foreground">
              No MCP tokens have been issued yet.
            </div>
          ) : (
            tokens.map((token) => (
              <section
                key={token.tokenId}
                className="rounded-[1.2rem] border border-border bg-background/70 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-foreground">{token.label}</h3>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          token.status === "active"
                            ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
                            : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20"
                        }`}
                      >
                        {token.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prefix <span className="font-mono text-foreground">{token.tokenPrefix}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {token.scopes.map((scope) => (
                        <span
                          key={`${token.tokenId}:${scope}`}
                          className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {scope}
                        </span>
                      ))}
                      {(token.funnelScope?.allowedFunnelIds ?? []).map((funnelId) => (
                        <span
                          key={`${token.tokenId}:${funnelId}`}
                          className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
                        >
                          funnel {funnelId.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Last used {formatUtcTimestamp(token.lastUsedAt)}</p>
                      <p>{token.recentRequestCount} requests in the last 24h</p>
                      <p>Expires {formatUtcTimestamp(token.expiresAt)}</p>
                    </div>
                    {token.status === "active" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => void handleRevokeToken(token.tokenId)}
                        className="border border-border bg-background hover:bg-muted"
                      >
                        Revoke
                      </Button>
                    )}
                    {token.status === "revoked" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={submitting}
                            className="border border-rose-500/30 bg-background text-rose-200 hover:bg-rose-500/10"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete revoked MCP token?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the revoked token record from this list. Existing audit
                              and request-log history remains available without restoring access.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-600 text-white hover:bg-rose-700"
                              onClick={() => void handleDeleteToken(token.tokenId)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
