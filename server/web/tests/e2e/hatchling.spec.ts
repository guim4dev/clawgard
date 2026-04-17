import { test, expect, loginAs } from "./fixtures";

test("hatchling cannot see 'New buddy' CTA or admin-only routes", async ({ page }) => {
  await loginAs(page, "hatchling@clawgard.test");
  await page.goto("/buddies");
  await expect(page.getByTestId("search")).toBeVisible();
  await expect(page.getByTestId("cta-new")).toHaveCount(0);

  // Direct URL access to /buddies/new routes to /forbidden.
  await page.goto("/buddies/new");
  await expect(page.getByText(/Forbidden/i)).toBeVisible();
});

// The server-side thread scoping for non-admins is tracked in Plan 1 —
// the listing endpoint currently returns all threads to any admin-group member.
// Once Plan 1 adds per-role scoping + a seed endpoint gated on CLAWGARD_ENV=dev,
// this test can assert that a hatchling only sees their own threads. Until then
// we smoke-check that the thread audit page loads without admin CTAs.
test("hatchling sees threads page without admin-only controls", async ({ page }) => {
  await loginAs(page, "hatchling@clawgard.test");
  await page.goto("/threads");
  await expect(page.getByTestId("apply-filters")).toBeVisible();
  await expect(page.getByTestId("cta-new")).toHaveCount(0);
});
