import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import type { AutomationNodeData } from "../lib/automation-workspace";

function WorkflowTriggerNode({ data, selected }: NodeProps<Node<AutomationNodeData>>) {
  return (
    <div
      className={`min-w-[220px] rounded-[1.4rem] border px-4 py-3 shadow-lg ${
        selected
          ? "border-orange-400/70 bg-zinc-950 text-white"
          : "border-white/10 bg-zinc-900/90 text-white"
      }`}
    >
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange-200/70">Trigger</p>
      <p className="mt-2 text-base font-semibold">{data.title}</p>
      <p className="mt-1 text-xs text-white/60">{data.subtitle}</p>
      <p className="mt-3 text-xs leading-5 text-white/72">{data.description}</p>
    </div>
  );
}

function WorkflowTaskNode(props: NodeProps<Node<AutomationNodeData>>) {
  const { data, selected } = props;
  const task = data.task;
  const isEnabled = task?.enabled !== false;

  return (
    <div
      className={`min-w-[250px] rounded-[1.45rem] border bg-white px-4 py-3 text-zinc-950 shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${
        selected ? "border-orange-400 shadow-[0_18px_55px_rgba(251,146,60,0.24)]" : "border-zinc-200"
      }`}
    >
      <NodeToolbar
        isVisible={selected}
        offset={18}
        className="!rounded-full !border !border-zinc-200 !bg-white !px-2 !py-1 shadow-sm"
      >
        <span className="text-[11px] font-medium text-zinc-500">Use the inspector to reorder or edit</span>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!bg-orange-400" />
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{data.category}</p>
          <p className="mt-2 text-base font-semibold">{data.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{data.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
            isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {isEnabled ? "enabled" : "disabled"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">{data.description}</p>
    </div>
  );
}

export const automationEditorNodeTypes = {
  input: WorkflowTriggerNode,
  default: WorkflowTaskNode,
};
