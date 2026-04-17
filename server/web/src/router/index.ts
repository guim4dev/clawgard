import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
} from "vue-router";
import { useAuthStore } from "@/stores/auth";

export type Role = "admin" | "buddy_owner" | "hatchling";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: Role[];
  }
}

export const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
  {
    path: "/auth/callback-ui",
    name: "auth-callback",
    component: () => import("@/views/AuthCallbackView.vue"),
  },
  { path: "/forbidden", name: "forbidden", component: () => import("@/views/ForbiddenView.vue") },
  { path: "/", redirect: "/buddies" },
  {
    path: "/buddies",
    name: "buddies",
    component: () => import("@/views/BuddyDirectoryView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/buddies/new",
    name: "buddy-create",
    component: () => import("@/views/BuddyCreateView.vue"),
    meta: { requiresAuth: true, roles: ["admin"] },
  },
  {
    path: "/buddies/:id",
    name: "buddy-detail",
    component: () => import("@/views/BuddyDetailView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/threads",
    name: "threads",
    component: () => import("@/views/ThreadsAuditView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/threads/:id",
    name: "thread-detail",
    component: () => import("@/views/ThreadDetailView.vue"),
    meta: { requiresAuth: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export function installGuards(r: Router): void {
  r.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) return true;
    const auth = useAuthStore();
    await auth.ensureLoaded();
    if (!auth.me) return { name: "login", query: { redirect: to.fullPath } };
    if (to.meta.roles && !to.meta.roles.some((r) => auth.me!.roles.includes(r))) {
      return { name: "forbidden" };
    }
    return true;
  });
}

installGuards(router);
