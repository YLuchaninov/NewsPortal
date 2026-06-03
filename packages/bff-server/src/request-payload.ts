export type JsonPayloadMode = "raw" | "stringify-values";

export async function readRequestPayload(
  request: Request,
  options: { jsonPayloadMode?: JsonPayloadMode } = {}
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    if (options.jsonPayloadMode !== "stringify-values") {
      return payload;
    }
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, String(value ?? "")])
    );
  }

  const formData = await request.formData();
  const payload: Record<string, FormDataEntryValue> = {};
  formData.forEach((value, key) => {
    payload[key] = value;
  });
  return payload;
}
