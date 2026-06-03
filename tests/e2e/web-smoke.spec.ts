import { expect, test } from "playwright/test";

test("web local target exposes its health boundary", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);

  const payload = (await response.json()) as { service?: string; status?: string };
  expect(payload.service).toBe("web");
  expect(payload.status).toBe("ok");
});
