import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { AutomationNodeData } from "../lib/automation-workspace";

type JsonRecord = Record<string, unknown>;

export function readText(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

export function readMaybeText(value: unknown): string | null {
  const normalized = readText(value, "");
  return normalized || null;
}

export function readBool(value: unknown, fallback = true): boolean {
  return value == null ? fallback : value !== false;
}

export function readInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function statusClass(status: string): string {
  if (status === "active") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  }
  if (status === "archived") {
    return "bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/20";
  }
  return "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20";
}

export async function postJson(path: string, payload: Record<string, unknown>) {
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

export function moduleToKey(module: string, existingKeys: string[]): string {
  const base = module.split(".").at(-1)?.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "task";
  let candidate = base;
  let index = 2;
  while (existingKeys.includes(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

export function buildEdges(nodes: Node<AutomationNodeData>[]): Edge[] {
  const orderedTaskNodes = nodes
    .filter((node) => node.data.type === "task")
    .sort((left, right) => left.data.order - right.data.order);

  return orderedTaskNodes.map((node, index) => ({
    id: `${index === 0 ? "trigger:start" : orderedTaskNodes[index - 1]?.id}->${node.id}`,
    source: index === 0 ? "trigger:start" : String(orderedTaskNodes[index - 1]?.id),
    target: node.id,
    type: "smoothstep",
    animated: index === 0,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "rgba(251, 146, 60, 0.72)",
    },
    style: {
      stroke: "rgba(251, 146, 60, 0.52)",
      strokeWidth: 2,
    },
  }));
}

export function reindexTaskNodes(nodes: Node<AutomationNodeData>[]): Node<AutomationNodeData>[] {
  const trigger = nodes.find((node) => node.id === "trigger:start");
  const tasks = nodes
    .filter((node) => node.data.type === "task")
    .sort((left, right) => left.data.order - right.data.order)
    .map((node, index) => ({
      ...node,
      data: {
        ...node.data,
        order: index,
        task: node.data.task
          ? {
              ...node.data.task,
            }
          : undefined,
      },
    }));
  return trigger ? [trigger, ...tasks] : tasks;
}
