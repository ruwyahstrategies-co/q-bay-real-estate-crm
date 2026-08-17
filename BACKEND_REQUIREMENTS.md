# Backend Requirements — Q-Bay Real Estate CRM

This document is the exact contract the frontend now expects from Lovable Cloud
(Supabase). It was written during a frontend/application pass that turned the
prototype into an interactive, permission-aware CRM. The live database has
**not** been changed by this pass — everything below is a specification plus
ready-to-review migration files for Lovable to apply.

**Read this first if you're setting up a demo:** until step 1 (below) is done,
nobody can log in. That is the single blocking step.

---

## 0. Current state (what's already true today)

- The app runs on an **anonymous/public-CRUD model**: the browser talks to
  Supabase directly with the publishable (anon) key, and business tables have
  no meaningful RLS. This was fine for a prototype; it is not fine once real
  staff logins exist.
- `supabase/functions/analyze-lead` and friends run with `verify_jwt = false`
  and use `SUPABASE_SERVICE_ROLE_KEY` — unaffected by anything below.
- No table currently links a `team_members` row to a Supabase Auth user.

## 1. Required first step: enable Supabase Auth logins (BLOCKING)

The frontend now requires a real Supabase Auth session to reach any page
(`/login` → session → `AppShell`, see `src/hooks/use-auth.tsx`). Nothing else
in this document matters until this works:

1. In the Supabase project, confirm **Email/Password** auth is enabled
   (Authentication → Providers). It is Supabase's default, so this is likely
   already on.
2. Deploy the two new edge functions below (section 4) with
   `SUPABASE_SERVICE_ROLE_KEY` configured as a function secret.
3. Apply the migration in section 2.
4. Create the **first administrator login** — either:
   - Manually in Supabase Studio (Authentication → Users → Add user), with
     any email/password, **or**
   - Call `admin-create-staff-user` once directly (e.g. via `curl` with a
     `service_role`-signed request, or temporarily relax its authorization
     check) to create the first account.

   The frontend treats **any authenticated user with no linked
   `team_members` row as a full-access bootstrap administrator**
   (see `isBootstrapAdmin` in `src/hooks/use-auth.tsx` and
   `authorizeAdminCaller` in `supabase/functions/_shared/admin-auth.ts`). So
   the very first login — before any `team_members.user_id` link exists —
   already has full access. Once logged in, that person should immediately
   use the Team page to create proper staff accounts (which *are* linked),
   at which point the bootstrap fallback stops applying to them specifically.

   This is intentionally a demo-friendly bootstrap, not a production auth
   model — see the Security Notes at the end of this document.

## 2. Required schema changes

File: `supabase/migrations/20260817120000_staff_auth_permissions_pipeline_stages.sql`
(already written, ready to apply as-is or adapt).

### 2.1 `team_members` — two new columns

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid references auth.users(id) on delete set null` | Links a staff row to a real login. Nullable — a team member can be a contact-only record with no login. Unique when not null. |
| `permissions` | `jsonb` | The **fully-resolved** permission set for that member (not a sparse diff) — see shape below. The frontend always writes the complete resolved object, so RLS policies can read it directly without needing to know role-preset defaults. |

### 2.2 New table: `pipeline_stages`

```
id               uuid primary key default gen_random_uuid()
organisation_id  uuid references organisations(id) on delete cascade   -- nullable, unused today (single-tenant)
stage_key        text not null unique      -- stable identifier; never changes on rename
name             text not null             -- display label; editable
position         integer not null default 0
is_active        boolean not null default true
is_won            boolean not null default false
is_lost           boolean not null default false
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```

Seed exactly once (only if the table is empty) with the current hard-coded
stages, in order: New Lead, Contacted, Qualified, Property Matching, Viewing
Scheduled, Negotiation, Documentation, Won (`is_won=true`), Lost
(`is_lost=true`). The migration file does this automatically.

The frontend (`src/hooks/use-pipeline-stages.ts`) already queries this table
and **falls back to the hard-coded list** if the table doesn't exist yet
(detected via Postgres error codes `42P01`/`PGRST205`), so applying this
migration is safe to do at any time without a frontend deploy coordination
window.

### 2.3 Permission-set JSON shape

Written by the frontend (`src/lib/permissions.ts`) as:

```json
{
  "overview": ["view"],
  "leads": ["view", "create", "edit", "delete", "assign"],
  "properties": ["view", "create", "edit", "delete"],
  "pipeline": ["view", "move"],
  "conversations": ["view", "create", "edit", "delete"],
  "uploads": ["view", "upload", "delete"],
  "tasks": ["view", "create", "edit", "complete"],
  "ai_insights": ["view", "run"],
  "property_demand": ["view"],
  "marketing_intelligence": ["view"],
  "team": ["view", "manage"],
  "settings": ["view", "manage"],
  "ai_receptionist": ["view", "manage"]
}
```

A module key absent from the object (or an action absent from its array)
means "not granted". Role presets (`administrator`, `sales_manager`,
`sales_agent`, `marketing`, `accounting`, `coordinator`, `viewer`, `custom`)
are frontend-only defaults used to populate this JSON when an admin picks a
preset in the Team UI — the database only ever sees the resolved result.

## 3. Row-level security

File: `supabase/migrations/20260817120000_staff_auth_permissions_pipeline_stages.sql`
also creates:

- `public.current_team_permissions()` — resolves the caller's permission set
  from `auth.uid()`, with the bootstrap-admin fallback described in section 1.
- `public.has_permission(_module text, _action text)` — the policy predicate
  used everywhere below.
- RLS policies on: `leads`, `properties`, `interactions`, `uploads`, `tasks`,
  `lead_property_interests`, `property_media`, `pipeline_history`,
  `ai_analyses` (read-only; writes are service-role via the edge function),
  `market_intelligence_reports`, `property_events`,
  `external_market_sources`, `app_settings`, `organisations`, `team_members`,
  `pipeline_stages`, and the `receptionist_*` tables.
- All policies require the `authenticated` role — **the anon/publishable key
  can no longer read or write these tables directly.** Every browser request
  must carry a Supabase Auth session (the frontend already does this via
  `supabase-js`'s built-in session handling).
- `edge_rate_limits` intentionally gets **no** authenticated policy — it's
  only ever touched by edge functions via the service role.

Storage: `supabase/migrations/20260817120100_storage_policies.sql` applies
the equivalent authenticated + `has_permission('uploads', ...)` policies to
the six existing buckets (`lead-imports`, `conversation-files`,
`property-documents`, `property-media`, `call-recordings`,
`general-documents`).

**Apply order matters**: the staff/permissions/pipeline-stages migration
must run before the storage-policies migration (the latter calls
`public.has_permission`).

## 4. Required Edge Functions

Both are already written and checked into `supabase/functions/` — they need
deployment plus the `SUPABASE_SERVICE_ROLE_KEY` secret (standard for this
project; already required by `analyze-lead` etc.).

### 4.1 `admin-create-staff-user`

- **Called by:** `useCreateStaffUser()` in `src/hooks/use-team.ts`, from the
  Team → Add Member drawer.
- **Auth:** requires a valid bearer token; caller must be an admin (bootstrap
  admin, `role: administrator`/`owner`, or `permissions.team` includes
  `manage`) — see `supabase/functions/_shared/admin-auth.ts`.
- **Body:** `{ full_name, email, phone?, role, permissions, temporary_password, is_active }`
- **Behavior:** creates (or reuses, if already registered) a Supabase Auth
  user via `auth.admin.createUser`, then upserts the matching `team_members`
  row (matched by email) with `user_id` and `permissions` set. If the
  `user_id`/`permissions` columns don't exist yet, it degrades gracefully —
  saves the profile fields anyway and returns a `warning` string.
- **Response:** `{ team_member, auth_user_id, warning: string | null }`

### 4.2 `admin-manage-staff`

- **Called by:** `useResetStaffPassword()` and `useSetStaffActive()` in
  `src/hooks/use-team.ts`.
- **Auth:** same admin check as above.
- **Body:** `{ action: "reset_password", team_member_id, new_password }` or
  `{ action: "set_active", team_member_id, is_active }`.
- **Behavior:** `reset_password` calls `auth.admin.updateUserById` with a new
  password. `set_active` bans/unbans the Supabase Auth user
  (`ban_duration`) **and** updates `team_members.is_active`, so deactivating
  someone actually revokes their session, not just a cosmetic flag.
- Requires the target `team_members` row to already have `user_id` set (i.e.
  a login must exist first — created via 4.1).

## 5. Frontend expectations summary (exact names)

| What | Name | Where |
|---|---|---|
| Edge function | `admin-create-staff-user` | `supabase/functions/admin-create-staff-user/index.ts` |
| Edge function | `admin-manage-staff` | `supabase/functions/admin-manage-staff/index.ts` |
| Table column | `team_members.user_id` | uuid, references `auth.users(id)` |
| Table column | `team_members.permissions` | jsonb |
| Table | `pipeline_stages` | see 2.2 |
| SQL function | `public.has_permission(text, text)` | used by RLS |
| SQL function | `public.current_team_permissions()` | used by RLS and available for future use |

Existing tables/functions the frontend continues to use **unchanged** — do
not rename or restructure: `leads`, `properties`, `interactions`, `uploads`,
`tasks`, `team_members` (existing columns), `lead_property_interests`,
`property_media`, `pipeline_history`, `ai_analyses`, `organisations`,
`app_settings`, `property_events`, `property_demand_scores` (view),
`market_intelligence_reports`, `external_market_sources`,
`receptionist_settings`/`receptionist_calls`/`receptionist_tool_events`,
`edge_rate_limits`, and edge functions `analyze-lead`, `market-intelligence`,
`brand-search`, `receptionist-status`, `receptionist-tools`,
`receptionist-webhook`, `scan-property-mentions`, `transcribe-call`,
`web-search`.

## 6. Seed data (optional)

File: `supabase/migrations/20260817120200_demo_seed_data.sql` — 3 staff
(contact-only, no login), 5 properties, 8 leads, matching pipeline history,
lead↔property interests, interactions, and follow-up tasks. All fictional
Qatar data, fixed UUIDs, idempotent (`on conflict (id) do nothing`). **Not**
auto-applied — run it deliberately when you want a populated demo. It does
not create any Supabase Auth logins; create those via the Team page after
seeding, for whichever seeded staff member should be able to log in during
the demo.

## 7. Type generation

Once the migration is applied, regenerate
`src/integrations/supabase/types.ts` from the live schema (this file is
marked auto-generated and was intentionally left untouched by this pass).
Until then, the frontend uses `src/lib/db-extensions.ts` as an isolated,
clearly-labeled set of transitional types (`StaffTeamMember`,
`PipelineStageRow`, etc.) so the rest of the codebase stays fully typed
without a blanket `any`. After regeneration, fold those fields into the
generated types and trim `db-extensions.ts` down.

## 8. Security notes / what's still frontend-only

- Permission checks in `src/lib/permissions.ts` /
  `src/components/permission-gate.tsx` control what the UI **shows** —
  navigation, buttons, page access. They are not a substitute for the RLS in
  section 3, which is the actual enforcement layer once applied.
- The **bootstrap-admin fallback** (any authenticated-but-unlinked user gets
  full access) is intentional for a smooth first login, but means: don't
  leave stray unlinked Supabase Auth users around in a real deployment.
  Everyone should end up with a `team_members.user_id` link and an
  intentional role/permission set.
- Deactivating a staff member now also revokes their Supabase Auth session
  (via `admin-manage-staff`'s `set_active` action, not just an `is_active`
  flag), so historical records they created remain intact but they can no
  longer sign in.
- `.env` in this repo contains only the Supabase **publishable** key and
  project URL — safe to commit, matches Lovable convention. Never add the
  service-role key to any file under `src/` or any `VITE_`-prefixed env var.
