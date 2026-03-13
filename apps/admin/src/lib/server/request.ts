export async function readRequestPayload(request: Request): Promise<Record<string, FormDataEntryValue>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, String(value ?? "")])
    );
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}
