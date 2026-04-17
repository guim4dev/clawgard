export type { components, paths } from "@clawgard/spec";
import type { components } from "@clawgard/spec";

export type Buddy = components["schemas"]["Buddy"];
export type Thread = components["schemas"]["Thread"];
export type Message = components["schemas"]["Message"];
export type Acl = components["schemas"]["Acl"];
export type CreateBuddyRequest = components["schemas"]["CreateBuddyRequest"];
export type CreateBuddyResponse = components["schemas"]["CreateBuddyResponse"];
export type UpdateBuddyRequest = components["schemas"]["UpdateBuddyRequest"];

export interface MeResponse {
  email: string;
  roles: Array<"admin" | "buddy_owner" | "hatchling">;
}
