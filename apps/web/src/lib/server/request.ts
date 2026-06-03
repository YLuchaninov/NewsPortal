import { readRequestPayload as readSharedRequestPayload } from "@newsportal/bff-server";

export async function readRequestPayload(request: Request): Promise<Record<string, FormDataEntryValue>> {
  return readSharedRequestPayload(request, {
    jsonPayloadMode: "stringify-values",
  }) as Promise<Record<string, FormDataEntryValue>>;
}
