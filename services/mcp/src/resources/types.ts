import type { McpAnnotations } from "../context";
import type { McpToolContext } from "../tools";

export interface McpResourceDefinition {
  uri: string;
  name: string;
  title?: string;
  description: string;
  mimeType: string;
  annotations?: McpAnnotations;
  read: (context: McpToolContext) => Promise<unknown>;
}
