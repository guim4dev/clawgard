import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ThreadMessageList from "@/components/ThreadMessageList.vue";

const messages = [
  { id: "m1", threadId: "t1", role: "hatchling" as const, type: "question" as const, content: "Q?", createdAt: "2026-04-01T00:00:00Z" },
  { id: "m2", threadId: "t1", role: "buddy" as const, type: "clarification_request" as const, content: "Clarify?", createdAt: "2026-04-01T00:00:05Z" },
  { id: "m3", threadId: "t1", role: "hatchling" as const, type: "clarification" as const, content: "Sure.", createdAt: "2026-04-01T00:00:10Z" },
  { id: "m4", threadId: "t1", role: "buddy" as const, type: "answer" as const, content: "Here.", createdAt: "2026-04-01T00:00:15Z" },
];

describe("ThreadMessageList", () => {
  it("renders one bubble per message with type class", () => {
    const w = mount(ThreadMessageList, { props: { messages } });
    const bubbles = w.findAll('[data-test="message"]');
    expect(bubbles).toHaveLength(4);
    expect(bubbles[1].classes()).toContain("msg-clarification_request");
    expect(bubbles[3].classes()).toContain("msg-answer");
  });

  it("puts hatchling messages on the right and buddy on the left", () => {
    const w = mount(ThreadMessageList, { props: { messages } });
    const bubbles = w.findAll('[data-test="message"]');
    expect(bubbles[0].classes()).toContain("role-hatchling");
    expect(bubbles[1].classes()).toContain("role-buddy");
  });
});
