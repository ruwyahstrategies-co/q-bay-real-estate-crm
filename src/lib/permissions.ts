// Centralised permission model for Q-Bay Real Estate CRM.
//
// This is the single source of truth for what a role/permission set can do.
// UI components must call `can()` (via the `usePermissions()` hook) instead
// of checking `role === "..."` directly, so access rules stay in one place.
//
// NOTE ON SECURITY: this module only controls what the frontend renders and
// allows the user to click. It is NOT a substitute for backend authorization.
// Real enforcement must happen via Supabase RLS policies once the backend
// links auth users to team_members (see BACKEND_REQUIREMENTS.md).

export const MODULES = {
  overview: ["view"],
  leads: ["view", "create", "edit", "delete", "assign"],
  properties: ["view", "create", "edit", "delete"],
  pipeline: ["view", "move"],
  conversations: ["view", "create", "edit", "delete"],
  uploads: ["view", "upload", "delete"],
  tasks: ["view", "create", "edit", "complete"],
  ai_insights: ["view", "run"],
  property_demand: ["view"],
  marketing_intelligence: ["view"],
  analytics: ["view"],
  team: ["view", "manage"],
  settings: ["view", "manage"],
  ai_receptionist: ["view", "manage"],
} as const;

export type ModuleKey = keyof typeof MODULES;
export type ActionKey<M extends ModuleKey = ModuleKey> = (typeof MODULES)[M][number];

// A permission set maps each module to the list of actions granted for it.
export type PermissionSet = Partial<Record<ModuleKey, string[]>>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  overview: "Overview",
  leads: "Leads",
  properties: "Properties",
  pipeline: "Pipeline",
  conversations: "Conversations",
  uploads: "Uploads",
  tasks: "Tasks",
  ai_insights: "AI Insights",
  property_demand: "Property Demand",
  marketing_intelligence: "Marketing Intelligence",
  analytics: "Analytics",
  team: "Team",
  settings: "Settings",
  ai_receptionist: "AI Receptionist",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  assign: "Assign",
  move: "Move stage",
  upload: "Upload",
  complete: "Complete",
  run: "Run",
  manage: "Manage",
};

export function fullAccessPermissions(): PermissionSet {
  const out: PermissionSet = {};
  for (const key of Object.keys(MODULES) as ModuleKey[]) {
    out[key] = [...MODULES[key]];
  }
  return out;
}

function viewOnlyPermissions(modules: ModuleKey[]): PermissionSet {
  const out: PermissionSet = {};
  for (const m of modules) out[m] = ["view"];
  return out;
}

const ALL_MODULES = Object.keys(MODULES) as ModuleKey[];

export const ROLE_PRESETS = {
  administrator: {
    label: "Administrator",
    description: "Full access to every module, including team and settings.",
    permissions: (): PermissionSet => fullAccessPermissions(),
  },
  sales_manager: {
    label: "Sales Manager",
    description: "Full sales workflow control plus visibility into team performance.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "create", "edit", "delete", "assign"],
      properties: ["view", "create", "edit"],
      pipeline: ["view", "move"],
      conversations: ["view", "create", "edit", "delete"],
      uploads: ["view", "upload", "delete"],
      tasks: ["view", "create", "edit", "complete"],
      ai_insights: ["view", "run"],
      property_demand: ["view"],
      marketing_intelligence: ["view"],
      analytics: ["view"],
      team: ["view"],
      settings: ["view"],
      ai_receptionist: ["view"],
    }),
  },
  sales_agent: {
    label: "Sales Agent",
    description: "Manage own leads through the pipeline with AI assistance.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "create", "edit", "assign"],
      properties: ["view"],
      pipeline: ["view", "move"],
      conversations: ["view", "create", "edit"],
      uploads: ["view", "upload"],
      tasks: ["view", "create", "edit", "complete"],
      ai_insights: ["view", "run"],
      property_demand: ["view"],
      analytics: ["view"],
    }),
  },
  marketing: {
    label: "Marketing",
    description: "Market and demand intelligence, read access to inventory and leads.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view"],
      properties: ["view", "create", "edit"],
      conversations: ["view"],
      uploads: ["view", "upload"],
      property_demand: ["view"],
      marketing_intelligence: ["view"],
      analytics: ["view"],
    }),
  },
  accounting: {
    label: "Accounting",
    description: "Financial visibility into pipeline value and closed deals.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view"],
      properties: ["view"],
      pipeline: ["view"],
      analytics: ["view"],
    }),
  },
  coordinator: {
    label: "Coordinator",
    description: "Operational support — tasks, uploads and scheduling across leads.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "edit"],
      properties: ["view", "edit"],
      pipeline: ["view", "move"],
      conversations: ["view", "create", "edit"],
      uploads: ["view", "upload", "delete"],
      tasks: ["view", "create", "edit", "complete"],
      property_demand: ["view"],
    }),
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access across the CRM.",
    permissions: (): PermissionSet => viewOnlyPermissions(ALL_MODULES),
  },
  custom: {
    label: "Custom",
    description: "Start from a blank slate and grant only what's needed.",
    permissions: (): PermissionSet => ({ overview: ["view"] }),
  },
} as const;

export type RolePresetKey = keyof typeof ROLE_PRESETS;

export function isRolePresetKey(value: string | null | undefined): value is RolePresetKey {
  return !!value && value in ROLE_PRESETS;
}

export function defaultPermissionsForRole(role: string | null | undefined): PermissionSet {
  if (isRolePresetKey(role)) return ROLE_PRESETS[role].permissions();
  // Legacy free-text roles from before the permission engine existed.
  if (role === "owner") return fullAccessPermissions();
  if (role === "manager") return ROLE_PRESETS.sales_manager.permissions();
  if (role === "agent") return ROLE_PRESETS.sales_agent.permissions();
  return ROLE_PRESETS.viewer.permissions();
}

export function can(
  permissions: PermissionSet | null | undefined,
  module: ModuleKey,
  action: string,
): boolean {
  if (!permissions) return false;
  const actions = permissions[module];
  return !!actions && actions.includes(action);
}

export function mergePermissions(base: PermissionSet, overrides: PermissionSet): PermissionSet {
  return { ...base, ...overrides };
}
