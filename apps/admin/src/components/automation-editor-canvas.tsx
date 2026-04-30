import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type OnConnect,
  type OnMoveEnd,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
  type Viewport,
} from "@xyflow/react";
import { Card, CardContent } from "@newsportal/ui";

import type { AutomationNodeData } from "../lib/automation-workspace";
import { automationEditorNodeTypes } from "./automation-editor-flow-nodes";

interface AutomationEditorCanvasProps {
  nodes: Array<Node<AutomationNodeData>>;
  edges: Edge[];
  viewport: Viewport;
  onSelectionChange: OnSelectionChangeFunc<Node<AutomationNodeData>, Edge>;
  onNodeDragStop: OnNodeDrag<Node<AutomationNodeData>>;
  onConnect: OnConnect;
  onMoveEnd: OnMoveEnd;
}

export function AutomationEditorCanvas({
  nodes,
  edges,
  viewport,
  onSelectionChange,
  onNodeDragStop,
  onConnect,
  onMoveEnd,
}: AutomationEditorCanvasProps) {
  return (
    <Card className="overflow-hidden border-white/10 bg-card/90 shadow-sm">
      <CardContent className="h-full p-0">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-300 ring-1 ring-orange-500/20">
              {nodes.filter((node) => node.data.type === "task").length} steps
            </span>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Drag to reposition, connect to reorder
            </span>
          </div>
        </div>
        <div className="h-[70vh] w-full bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.08),transparent_26%),linear-gradient(180deg,rgba(250,250,250,0.92),rgba(244,244,245,0.95))]">
          <ReactFlow<Node<AutomationNodeData>, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={automationEditorNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.45}
            maxZoom={1.4}
            defaultViewport={viewport}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onMoveEnd={onMoveEnd}
            nodesDraggable
            nodesConnectable
            panOnDrag
            selectionOnDrag
          >
            <MiniMap
              pannable
              zoomable
              className="!rounded-2xl !border !border-white/40 !bg-white/80"
              nodeStrokeColor={(node) =>
                node.data?.type === "trigger" ? "#f97316" : "#18181b"
              }
              nodeColor={(node) =>
                node.data?.type === "trigger" ? "#fed7aa" : "#ffffff"
              }
            />
            <Controls className="!rounded-2xl !border !border-white/40 !bg-white/85" />
            <Background gap={22} size={1.2} color="rgba(63,63,70,0.18)" />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
}
