import assert from "node:assert/strict";
import test from "node:test";

import type { Node } from "@xyflow/react";

import {
  AUTOMATION_TEMPLATES,
  buildEditorStateFromNodes,
  editorGraphToTaskGraph,
  instantiateAutomationTemplate,
  sequenceToEditorGraph,
  type AutomationNodeData,
} from "../../../apps/admin/src/lib/automation-workspace.ts";

test("instantiateAutomationTemplate produces a truthful linear sequence payload", () => {
  const payload = instantiateAutomationTemplate("maintenance_reindex", {
    createdBy: "admin-1",
  });

  assert.equal(payload.title, "Reindex Repair");
  assert.equal(payload.triggerEvent, "reindex.requested");
  assert.equal(Array.isArray(payload.taskGraph), true);
  assert.equal((payload.taskGraph as Array<unknown>).length, 1);
  assert.equal((payload.taskGraph as Array<{ module: string }>)[0]?.module, "maintenance.reindex");
  assert.equal((payload as { editorState: { viewport: { zoom: number } } }).editorState.viewport.zoom, 0.9);
});

test("sequenceToEditorGraph and editorGraphToTaskGraph preserve task metadata order", () => {
  const graph = sequenceToEditorGraph({
    sequence: {
      title: "Operator flow",
      task_graph: [
        {
          key: "normalize",
          module: "article.normalize",
          label: "Normalize",
          notes: "Prepare content",
          options: {},
          enabled: true,
          retry: { attempts: 2, delay_ms: 1500 },
          timeout_ms: 45000,
        },
        {
          key: "notify",
          module: "article.notify",
          label: "Notify",
          notes: "Fan out to users",
          options: { channel: "email" },
          enabled: false,
          retry: { attempts: 1, delay_ms: 500 },
          timeout_ms: 60000,
        },
      ],
      trigger_event: "article.ingest.requested",
      editor_state: {
        viewport: { x: 10, y: 20, zoom: 1 },
      },
    },
    plugins: AUTOMATION_TEMPLATES.flatMap((template) =>
      template.taskGraph.map((task) => ({
        module: task.module,
        category: template.category,
        description: template.description,
      }))
    ),
  });

  assert.equal(graph.nodes[0]?.id, "trigger:start");
  assert.equal(graph.edges.length, 2);

  const restored = editorGraphToTaskGraph(graph.nodes as Array<Node<AutomationNodeData>>);

  assert.deepEqual(restored, [
    {
      key: "normalize",
      module: "article.normalize",
      label: "Normalize",
      notes: "Prepare content",
      options: {},
      enabled: true,
      retry: { attempts: 2, delay_ms: 1500 },
      timeout_ms: 45000,
    },
    {
      key: "notify",
      module: "article.notify",
      label: "Notify",
      notes: "Fan out to users",
      options: { channel: "email" },
      enabled: false,
      retry: { attempts: 1, delay_ms: 500 },
      timeout_ms: 60000,
    },
  ]);

  const editorState = buildEditorStateFromNodes({
    nodes: graph.nodes as Array<Node<AutomationNodeData>>,
    viewport: graph.viewport,
  });

  assert.equal(editorState.viewport?.zoom, 1);
  assert.equal(Object.keys(editorState.nodePositions ?? {}).length, 2);
});
