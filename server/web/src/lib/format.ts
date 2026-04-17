import { formatDistanceToNow, parseISO } from "date-fns";
import type { Acl } from "@/types";

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function aclLabel(acl: Acl): string {
  switch (acl.mode) {
    case "public":
      return "public";
    case "group":
      return `group: ${acl.groupId ?? "?"}`;
    case "users":
      return `users: ${(acl.users ?? []).length}`;
  }
}
