const webBaseUrl = process.env.E2E_WEB_BASE_URL ?? "http://127.0.0.1:4321";

export default {
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : "list",
  webServer: [
    {
      command: "pnpm --filter @newsportal/web dev",
      url: new URL("/api/health", webBaseUrl).toString(),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @newsportal/admin dev",
      url: new URL("/api/health", process.env.E2E_ADMIN_BASE_URL ?? "http://127.0.0.1:4322").toString(),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  use: {
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
};
