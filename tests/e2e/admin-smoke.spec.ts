import { expect, test } from "playwright/test";

const adminBaseUrl = process.env.E2E_ADMIN_BASE_URL ?? "http://127.0.0.1:4322";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";

test("admin guarded page redirects to sign-in", async ({ page }) => {
  await page.goto(new URL("/", adminBaseUrl).toString());
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("admin sign-in can submit configured credentials", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to exercise admin sign-in.");

  await page.goto(new URL("/", adminBaseUrl).toString());

  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: /dashboard|overview/i })).toBeVisible();
});
