import type { AdminRole } from "./types";

export const inviteRoles = ["admin", "editor", "analyst", "owner"] as const;
export type InviteRole = typeof inviteRoles[number];
export const roleDescriptions = {
  owner: "Manages the whole studio, including granting ownership and demoting other Owners.",
  admin: "Manages content, app users and monetization.",
  editor: "Creates and edits series and episodes.",
  analyst: "Read-only access to content and analytics.",
};
export function permissions(role: AdminRole) {
  const manageStudio = role === "owner" || role === "admin";
  return {
    manageStudio,
    manageContent: manageStudio || role === "editor",
    manageTeam: role === "owner",
  };
}

export function studioHome(role: AdminRole) {
  return permissions(role).manageStudio ? "dashboard" : "series";
}

export function canOpenView(role: AdminRole, view: string) {
  if (["account", "series", "series-detail", "series-preview", "analytics"].includes(view)) return true;
  if (["episodes", "series-new", "series-edit", "series-episode-new"].includes(view)) return permissions(role).manageContent;
  if (["team", "team-invite"].includes(view)) return permissions(role).manageTeam;
  return permissions(role).manageStudio;
}
