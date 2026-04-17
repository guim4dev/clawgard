import { test as base, expect, type Page } from "@playwright/test";

/**
 * Log in via the mock IdP shortcut (CLAWGARD_IDP_MODE=mock). The server sets
 * the signed session cookie and redirects to `redirect`. Tests should use
 * distinct emails across roles to avoid cross-contamination of state.
 */
export async function loginAs(page: Page, email: string, redirect = "/buddies") {
  await page.goto(
    `/auth/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`,
  );
  await expect(page).toHaveURL(new RegExp(redirect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

export const test = base;
export { expect };
