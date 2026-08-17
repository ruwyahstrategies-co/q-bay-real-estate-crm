# Backend Requirements — Q-Bay Real Estate CRM

**Status: the backend is LIVE.** Lovable Cloud has applied the schema,
enabled RLS, deployed the staff-administration edge functions, and linked a
real administrator account. This document now describes the current
contract plus the one new migration from this pass that Lovable still needs
to apply.

## 0. Current live state (as of this pass)

- All schema migrations from the first frontend pass are applied:
  `team_members.user_id`, `team_members.permissions`, `pipeline_stages`
  (seeded), RLS via `public.has_permission()` across business tables,
  private/permission-gated storage buckets, `public.check_rate_limit()`
  locked to service-role-only, `property_demand_scores` set to
  `security_invoker`.
- `admin-create-staff-user` and `admin-manage-staff` are deployed with
  `SUPABASE_SERVICE_ROLE_KEY` configured.
- Administrator `omar@ruwyahstrategies.com` exists, is confirmed, linked to
  `team_members`, active, with full permissions — **first-login bootstrap is
  no longer needed and has been removed** (see §1).
- Demo data exists: 3 staff, 5 properties, 8 leads, property interests,
  pipeline history, 8 interactions, 5 tasks.

## 1. Bootstrap-admin removal (this pass)

The original `public.current_team_permissions()` treated any authenticated
user with **no** linked `team_members` row as a full-access administrator —
that was only ever needed to create the first admin login. Now that a real
linked administrator exists, this fallback is a standing privilege-escalation
risk (any new Supabase Auth user, linked or not, would otherwise get full
access) and has been removed on both sides:

- **Database**: new migration
  `supabase/migrations/20260817130000_remove_bootstrap_admin_permissions.sql`
  replaces `current_team_permissions()` (via `CREATE OR REPLACE`, not by
  editing the original applied migration) so that:
  - no `auth.uid()` → `{}`
  - no linked `team_members` row → `{}` (was: full access)
  - `is_active = false` → `{}`
  - linked + active → `coalesce(tm.permissions, '{}')`, unchanged.
  **Lovable must apply this migration.**
- **Frontend** (`src/hooks/use-auth.tsx`): an authenticated user now resolves
  to one of `unauthenticated | resolving | unprovisioned | inactive |
  authorized`. Only `authorized` grants any permissions; `unprovisioned`
  (no linked row) and `inactive` render a dedicated access screen with a
  sign-out button instead of the app shell. No email-based fallback lookup
  either — resolution is strictly `team_members.user_id = auth.uid()`.
- **Edge functions** (`supabase/functions/_shared/admin-auth.ts` and the new
  `_shared/user-auth.ts`): the same strict resolution — unlinked or inactive
  callers get `403`, never elevated access. See §3.

## 2. Schema (unchanged from the live state, documented for reference)

`team_members.user_id uuid references auth.users(id)`,
`team_members.permissions jsonb` (fully-resolved `PermissionSet`, module →
allowed actions — see `src/lib/permissions.ts`), and `pipeline_stages`
(`stage_key`, `name`, `position`, `is_active`, `is_won`, `is_lost`) are all
live and reflected in the generated `src/integrations/supabase/types.ts`.
The frontend now uses those generated types directly (`src/lib/db.ts`
exports `PipelineStageRow/Insert/Update` derived from them); the transitional
hand-written duplicates and the `UntypedSupabase` escape hatch have been
removed from `src/lib/db-extensions.ts`, which now only contains a thin
`StaffTeamMember` type (narrowing `permissions` from generic `Json` to the
real `PermissionSet` shape) and a `isMissingSchemaError()` helper kept solely
as a resilience fallback in `usePipelineStages()`.

## 3. Edge Functions

### Staff administration (unchanged contract, hardened authorization)

- `admin-create-staff-user`, `admin-manage-staff` — both still gated by
  `authorizeAdminCaller()`, which now requires a **linked, active** caller
  with `role in (administrator, owner)` or `permissions.team` including
  `manage`. The bootstrap "no team member = admin" rule is gone. The
  transitional missing-column fallback in `admin-create-staff-user` was
  removed (the columns are guaranteed to exist now); it always writes
  `user_id` + `permissions` directly.

### CRM-user functions (newly hardened this pass)

All of the following now require a valid bearer token resolving to an
**active, linked** `team_members` row with the listed permission, via the
new `supabase/functions/_shared/user-auth.ts` (`authorizeCaller`). Previously
these were fully anonymous-callable while using the service role — that is
what got hardened:

| Function | Required permission | Why |
|---|---|---|
| `analyze-lead` | `ai_insights.run` **and** `leads.view` | Reads full lead detail + calls paid OpenRouter AI |
| `market-intelligence` | `marketing_intelligence.view` | Aggregates CRM-wide data + paid AI |
| `brand-search` | `marketing_intelligence.view` | Paid Tavily search, writes `external_market_sources` |
| `web-search` | `property_demand.view` | Paid Tavily/Serper search, writes `external_market_sources` |
| `transcribe-call` | `conversations.create` | Paid STT + AI, writes `interactions` |
| `scan-property-mentions` | `property_demand.view` | Bulk-reads/writes CRM data |
| `receptionist-status` | `ai_receptionist.view` | Reads receptionist config presence (masked, but still gated for consistency) |

`analyze-lead` also now sets `ai_analyses.generated_by` to the caller's email
(previously hard-coded `"anonymous"`).

`supabase/functions/_shared/auth.ts` is the shared primitive both
`admin-auth.ts` and `user-auth.ts` build on (`resolveActiveCaller`,
`hasPermission`, `isAdminTeamMember`) — bearer token → `auth.getUser()` →
`team_members` lookup by `user_id` → active check. No function trusts
role/permission data from the request body; it's always read fresh from the
database per request.

### Intentionally left externally callable (do not "fix" these)

- **`receptionist-webhook`** — real external webhook from ElevenLabs. Already
  verifies an HMAC signature (`ELEVENLABS-Signature` header) against
  `ELEVENLABS_WEBHOOK_SECRET` when that secret is configured, with a
  timing-safe comparison and a 30-minute replay window. This is the correct
  security mechanism for a webhook and should not be changed to require a
  Supabase user session (ElevenLabs is not a logged-in CRM user).
- **`receptionist-tools`** — called server-to-server by the ElevenLabs agent
  during a live call (tool-calling), not by a browser. It has rate limiting
  but **no signature/secret verification today** — this is a known gap, not
  something this pass fixed, because ElevenLabs' tool-calling webhook
  mechanism needs to be confirmed to support a shared-secret header before
  changing this safely (getting it wrong would silently break live call
  handling). If ElevenLabs supports a custom header or bearer token on tool
  calls, configure one and verify it here in a follow-up pass.

## 4. Frontend/backend permission consistency

`team_members.permissions` is the **single source of truth**, read
identically by:
- the database (`public.current_team_permissions()` / `has_permission()`,
  enforced by RLS),
- edge functions (`_shared/auth.ts`), and
- the frontend (`src/hooks/use-auth.tsx` — `permissions =
  status === "authorized" ? (teamMember.permissions ?? {}) : {}`, with **no**
  role-preset merge/fallback at read time).

Role presets (`src/lib/permissions.ts` `ROLE_PRESETS`) are only ever used to
**populate** the permissions object in the Team → staff drawer when an admin
picks a preset or overrides an individual module/action — the drawer always
saves the fully-resolved object, never a sparse diff, so what's stored is
exactly what's enforced everywhere else.

## 5. Deployment steps remaining for Lovable

1. Apply `supabase/migrations/20260817130000_remove_bootstrap_admin_permissions.sql`.
2. Redeploy edge functions: `analyze-lead`, `market-intelligence`,
   `brand-search`, `web-search`, `transcribe-call`,
   `scan-property-mentions`, `receptionist-status`, `admin-auth` (shared,
   redeployed automatically with any function that imports it),
   `admin-create-staff-user`, `admin-manage-staff`.
3. No new secrets or storage/bucket changes are required for this pass.

## 6. Security notes

- Frontend permission checks (`src/lib/permissions.ts`,
  `src/components/permission-gate.tsx`) control what the UI renders — RLS
  and the edge-function authorization above are the actual enforcement
  layer, and are now consistent with each other.
- `.env` in this repo contains only the Supabase **publishable** key and
  project URL — safe to commit. The service-role key lives only in edge
  function server-side secrets, never in `src/` or any `VITE_`-prefixed
  variable.
