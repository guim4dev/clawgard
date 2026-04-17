import { test, expect, loginAs } from "./fixtures";

test("admin creates buddy, sees threads, filters", async ({ page }) => {
  await loginAs(page, "admin@clawgard.test");

  // Directory visible with CTA
  await expect(page.getByText("New buddy")).toBeVisible();
  await page.getByText("New buddy").click();

  // Create buddy
  await page.getByTestId("name").locator("input").fill("Huginn");
  await page.getByTestId("description").locator("textarea").fill("Thought raven for the E2E test");
  await page.getByTestId("submit").click();

  // API key shown exactly once
  await expect(page.getByText(/^ck_/)).toBeVisible();
  await page.getByTestId("confirm-saved").click();
  await page.getByTestId("dismiss").click();

  // Redirected to buddy detail
  await expect(page.getByText("Huginn")).toBeVisible();
  await expect(page.getByText(/^ck_/)).toHaveCount(0);

  // Navigate to threads
  await page.getByText("Thread audit").click();
  await page.getByTestId("apply-filters").click();
  await expect(page).toHaveURL(/\/threads/);
});

test("admin rotates key and sees it once", async ({ page }) => {
  await loginAs(page, "admin@clawgard.test");
  // Create a buddy via the API first to have something to rotate.
  const res = await page.request.post("/v1/admin/buddies", {
    data: { name: "Muninn", description: "Memory", acl: { mode: "public" } },
  });
  expect(res.ok()).toBe(true);
  const { buddy } = await res.json();
  await page.goto(`/buddies/${buddy.id}`);
  await page.getByTestId("rotate").click();
  await expect(page.getByText(/^ck_/)).toBeVisible();
  await page.getByTestId("confirm-saved").click();
  await page.getByTestId("dismiss").click();
  await expect(page.getByText(/^ck_/)).toHaveCount(0);
});
