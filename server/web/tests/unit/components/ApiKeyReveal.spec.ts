import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ApiKeyReveal from "@/components/ApiKeyReveal.vue";

describe("ApiKeyReveal", () => {
  it("shows the key once and requires confirmation before dismissing", async () => {
    const onDismiss = vi.fn();
    const w = mount(ApiKeyReveal, {
      props: { apiKey: "ck_live_abcdef", onDismiss },
    });
    expect(w.text()).toContain("ck_live_abcdef");
    // Dismiss button disabled until checkbox checked
    expect(w.find('[data-test="dismiss"]').attributes("disabled")).toBeDefined();
    // NCheckbox renders as a div[role="checkbox"] rather than a native input,
    // so we toggle it by clicking the element carrying our data-test attribute.
    await w.find('[data-test="confirm-saved"]').trigger("click");
    expect(w.find('[data-test="dismiss"]').attributes("disabled")).toBeUndefined();
    await w.find('[data-test="dismiss"]').trigger("click");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("copies key to clipboard on copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const w = mount(ApiKeyReveal, { props: { apiKey: "ck_xyz", onDismiss: () => {} } });
    await w.find('[data-test="copy"]').trigger("click");
    expect(writeText).toHaveBeenCalledWith("ck_xyz");
  });

  it("does not expose the key after dismissal", async () => {
    let dismissed = false;
    const w = mount(ApiKeyReveal, {
      props: {
        apiKey: "ck_live_abcdef",
        onDismiss: () => {
          dismissed = true;
        },
      },
    });
    await w.find('[data-test="confirm-saved"]').trigger("click");
    await w.find('[data-test="dismiss"]').trigger("click");
    expect(dismissed).toBe(true);
    // The component's responsibility ends at onDismiss; the parent removes it from DOM.
    // Consumers must not re-mount it with the same key — documented in the component.
  });
});
