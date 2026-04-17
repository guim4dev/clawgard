import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BuddyCard from "@/components/BuddyCard.vue";

const buddy = {
  id: "b1",
  name: "Huginn",
  description: "Thought raven",
  acl: { mode: "public" as const },
  ownerEmail: "odin@x.io",
  createdAt: "2026-04-01T00:00:00Z",
  online: true,
};

describe("BuddyCard", () => {
  it("renders name, description, owner, online dot", () => {
    const w = mount(BuddyCard, { props: { buddy, canManage: false } });
    expect(w.text()).toContain("Huginn");
    expect(w.text()).toContain("Thought raven");
    expect(w.text()).toContain("odin@x.io");
    expect(w.find('[data-test="online-indicator"]').classes()).toContain("is-online");
  });

  it("shows manage actions only when canManage is true", () => {
    const manageable = mount(BuddyCard, { props: { buddy, canManage: true } });
    expect(manageable.find('[data-test="edit-buddy"]').exists()).toBe(true);
    const readonly = mount(BuddyCard, { props: { buddy, canManage: false } });
    expect(readonly.find('[data-test="edit-buddy"]').exists()).toBe(false);
  });

  it("renders ACL mode tag", () => {
    const w = mount(BuddyCard, {
      props: {
        buddy: { ...buddy, acl: { mode: "group" as const, groupId: "eng" } },
        canManage: false,
      },
    });
    expect(w.text()).toContain("group: eng");
  });
});
