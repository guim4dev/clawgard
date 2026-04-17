import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AclEditor from "@/components/AclEditor.vue";

// Note: NRadioGroup listens for `change` on the inner input. In a real browser
// clicking the <label> checks the input and fires `change` via built-in semantics,
// but jsdom does not propagate that. Calling setValue(true) on the inner input
// mirrors what the user sees and exercises the NRadioGroup handler correctly.
// The data-test attribute stays on the <label> for E2E / Playwright scraping.
async function clickRadio(w: ReturnType<typeof mount>, mode: string): Promise<void> {
  await w.find(`[data-test="mode-${mode}"] input`).setValue(true);
}

describe("AclEditor", () => {
  it("emits public mode when public selected", async () => {
    const w = mount(AclEditor, { props: { modelValue: { mode: "group", groupId: "g1" } } });
    await clickRadio(w, "public");
    expect(w.emitted("update:modelValue")?.at(-1)?.[0]).toEqual({ mode: "public" });
  });

  it("emits group + groupId when group selected", async () => {
    const w = mount(AclEditor, { props: { modelValue: { mode: "public" } } });
    await clickRadio(w, "group");
    // NInput wraps its actual <input>; setValue must target the real input.
    await w.find('[data-test="group-id"] input').setValue("engineering");
    const last = w.emitted("update:modelValue")?.at(-1)?.[0];
    expect(last).toEqual({ mode: "group", groupId: "engineering" });
  });

  it("emits users + array when users selected", async () => {
    const w = mount(AclEditor, { props: { modelValue: { mode: "public" } } });
    await clickRadio(w, "users");
    await w.find('[data-test="users-emails"] input').setValue("a@x.io, b@x.io");
    const last = w.emitted("update:modelValue")?.at(-1)?.[0];
    expect(last).toEqual({ mode: "users", users: ["a@x.io", "b@x.io"] });
  });

  it("shows validation error for invalid email in users mode", async () => {
    const w = mount(AclEditor, { props: { modelValue: { mode: "users", users: ["not-an-email"] } } });
    expect(w.text()).toContain("valid email");
  });
});
