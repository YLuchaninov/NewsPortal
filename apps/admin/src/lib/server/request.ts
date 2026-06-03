import { readRequestPayload as readSharedRequestPayload } from "@newsportal/bff-server";

export async function readRequestPayload(request: Request): Promise<Record<string, unknown>> {
  return readSharedRequestPayload(request);
}
