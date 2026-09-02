// Centralised permission model for Q-Bay Real Estate CRM.
//
// This is the single source of truth for what a role/permission set can do.
// UI components must call `can()` (via the `usePermissions()` hook) instead
// of checking `role === "..."` directly, so access rules stay in one place.
//
// NOTE ON SECURITY: this module only controls what the frontend renders and
// allows the user to click. It is NOT a substitute for backend authorization.
// Real enforcement happens via Supabase RLS (public.has_permission()) and the
// edge functions, which read the same team_members.permissions JSON.
//
// Team isolation: leads/tasks/viewings/conversations/staff_activity support
// three tiers of visibility instead of a single "view": `view` (own
// assigned work only), `view_team` (everything for the caller's team,
// resolved server-side via team_members.team_id), and `view_all`
// (organisation-wide). RLS enforces the same tiers — see
// supabase/migrations/20260827000400_rls.sql.

export const MODULES = {
  overview: ["view"],
  leads: ["view", "view_team", "view_all", "create", "edit", "delete", "assign"],
  properties: ["view", "create", "edit", "delete", "publish"],
  developments: ["view", "create", "edit", "delete", "publish"],
  owners: ["view", "create", "edit", "delete"],
  locations: ["view", "manage"],
  viewings: ["view", "view_team", "view_all", "create", "edit", "complete"],
  offers: ["view", "view_team", "view_all", "create", "edit", "delete"],
  pipeline: ["view", "move"],
  conversations: ["view", "view_team", "view_all", "create", "edit", "delete"],
  uploads: ["view", "upload", "delete"],
  tasks: ["view", "view_team", "view_all", "create", "edit", "complete"],
  ai_insights: ["view", "run"],
  property_demand: ["view"],
  marketing_intelligence: ["view"],
  marketing: ["view", "assign", "upload", "complete"],
  analytics: ["view"],
  journal: ["view", "create", "edit", "delete", "publish"],
  website_enquiries: ["view", "assign"],
  submissions: ["view", "review"],
  accounting: ["view", "manage"],
  contracts: ["view", "create", "edit", "delete", "generate", "manage_templates"],
  staff_activity: ["view", "view_team", "view_all"],
  team: ["view", "manage"],
  settings: ["view", "manage"],
} as const;

export type ModuleKey = keyof typeof MODULES;
export type ActionKey<M extends ModuleKey = ModuleKey> = (typeof MODULES)[M][number];

// A permission set maps each module to the list of actions granted for it.
export type PermissionSet = Partial<Record<ModuleKey, string[]>>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  overview: "Overview",
  leads: "Leads",
  properties: "Properties",
  developments: "Developments",
  owners: "Owners",
  locations: "Countries & Areas",
  viewings: "Viewings",
  offers: "Offers",
  pipeline: "Pipeline",
  conversations: "Conversations",
  uploads: "Uploads",
  tasks: "Tasks",
  ai_insights: "AI Insights",
  property_demand: "Property Demand",
  marketing_intelligence: "Marketing Intelligence",
  marketing: "Marketing",
  analytics: "Analytics",
  journal: "Journal",
  website_enquiries: "Website Enquiries",
  submissions: "Listing Submissions",
  accounting: "Accounting",
  contracts: "Owner Contracts",
  staff_activity: "Staff Activity",
  team: "Team",
  settings: "Settings",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "View (own)",
  view_team: "View team",
  view_all: "View all",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  assign: "Assign",
  move: "Move stage",
  upload: "Upload",
  complete: "Complete",
  run: "Run",
  manage: "Manage",
  publish: "Publish",
  review: "Review",
  generate: "Generate",
  manage_templates: "Manage templates",
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
    description: "Full, organisation-wide access to every module.",
    permissions: (): PermissionSet => fullAccessPermissions(),
  },
  team_leader: {
    label: "Team Leader",
    description: "Full visibility and control over their own team's leads, tasks and viewings.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "view_team", "create", "edit", "delete", "assign"],
      properties: ["view", "create", "edit"],
      developments: ["view"],
      owners: ["view"],
      locations: ["view"],
      viewings: ["view", "view_team", "create", "edit", "complete"],
      offers: ["view", "view_team", "create", "edit"],
      pipeline: ["view", "move"],
      conversations: ["view", "view_team", "create", "edit"],
      uploads: ["view", "upload", "delete"],
      tasks: ["view", "view_team", "create", "edit", "complete"],
      ai_insights: ["view", "run"],
      property_demand: ["view"],
      marketing_intelligence: ["view"],
      analytics: ["view"],
      contracts: ["view", "create"],
      team: ["view"],
      staff_activity: ["view_team"],
    }),
  },
  sales_manager: {
    label: "Sales Manager",
    description: "Full sales workflow control plus organisation-wide visibility into team performance.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "view_all", "create", "edit", "delete", "assign"],
      properties: ["view", "create", "edit", "publish"],
      developments: ["view", "create", "edit"],
      owners: ["view", "create", "edit"],
      locations: ["view"],
      viewings: ["view", "view_all", "create", "edit", "complete"],
      offers: ["view", "view_all", "create", "edit", "delete"],
      pipeline: ["view", "move"],
      conversations: ["view", "view_all", "create", "edit", "delete"],
      uploads: ["view", "upload", "delete"],
      tasks: ["view", "view_all", "create", "edit", "complete"],
      ai_insights: ["view", "run"],
      property_demand: ["view"],
      marketing_intelligence: ["view"],
      marketing: ["view", "assign", "complete"],
      analytics: ["view"],
      website_enquiries: ["view", "assign"],
      submissions: ["view", "review"],
      accounting: ["view"],
      contracts: ["view", "create", "edit", "generate", "manage_templates"],
      team: ["view"],
      staff_activity: ["view_all"],
      settings: ["view"],
    }),
  },
  sales_agent: {
    label: "Sales Agent",
    description: "Manage own leads through the pipeline with AI assistance.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "create", "edit", "assign"],
      properties: ["view"],
      developments: ["view"],
      owners: ["view"],
      locations: ["view"],
      viewings: ["view", "create", "edit", "complete"],
      offers: ["view", "create", "edit"],
      pipeline: ["view", "move"],
      conversations: ["view", "create", "edit"],
      uploads: ["view", "upload"],
      tasks: ["view", "create", "edit", "complete"],
      ai_insights: ["view", "run"],
      property_demand: ["view"],
      analytics: ["view"],
    }),
  },
  telesales: {
    label: "Telesales",
    description: "Works cold/telesales leads, records call outcomes and qualifies prospects for transfer.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "create", "edit"],
      properties: ["view"],
      locations: ["view"],
      pipeline: ["view", "move"],
      conversations: ["view", "create", "edit"],
      tasks: ["view", "create", "edit", "complete"],
      property_demand: ["view"],
    }),
  },
  marketing: {
    label: "Marketing",
    description: "Market and demand intelligence, journal/blog, read access to inventory and leads.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view"],
      properties: ["view", "create", "edit"],
      developments: ["view", "create", "edit"],
      conversations: ["view"],
      uploads: ["view", "upload"],
      property_demand: ["view"],
      marketing_intelligence: ["view"],
      marketing: ["view", "assign", "upload", "complete"],
      analytics: ["view"],
      journal: ["view", "create", "edit", "publish"],
      website_enquiries: ["view"],
    }),
  },
  accounting: {
    label: "Accounting",
    description: "Financial visibility into pipeline value, transactions and closed deals.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view"],
      properties: ["view"],
      pipeline: ["view"],
      offers: ["view_all"],
      analytics: ["view"],
      accounting: ["view", "manage"],
    }),
  },
  coordinator: {
    label: "Coordinator",
    description: "Operational support - tasks, uploads and scheduling across leads.",
    permissions: (): PermissionSet => ({
      overview: ["view"],
      leads: ["view", "edit"],
      properties: ["view", "edit"],
      viewings: ["view", "create", "edit", "complete"],
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

/** True if the caller can see leads/tasks/viewings/conversations beyond their own (view_team or view_all). */
export function canSeeBeyondOwn(permissions: PermissionSet | null | undefined, module: ModuleKey): boolean {
  return can(permissions, module, "view_team") || can(permissions, module, "view_all");
}

export function mergePermissions(base: PermissionSet, overrides: PermissionSet): PermissionSet {
  return { ...base, ...overrides };
}
