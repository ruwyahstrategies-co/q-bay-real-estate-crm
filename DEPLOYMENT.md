# Deploying to Vercel

The app is a TanStack Start (SSR) project built by Vite + Nitro. On Vercel,
Nitro emits the Vercel Build Output API bundle in `.vercel/output`, so no
adapter or serverless handler needs to be written by hand.

## 1. Import the repo

Vercel → Add New Project → import this repository.

Settings (already declared in `vercel.json`, override only if needed):

- Framework preset: **Other**
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `.vercel/output`

`vite.config.ts` pins `nitro.preset = "vercel"` whenever `VERCEL` is set (Vercel
sets it automatically) or when `NITRO_PRESET=vercel` is passed locally.

## 2. Environment variables

Add these in Vercel → Project → Settings → Environment Variables for
Production, Preview and Development. Values are in the project's `.env`.

Client (must keep the `VITE_` prefix: inlined at build time):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_MAPBOX_TOKEN`: the map picker on the property and development forms
  degrades gracefully without it (a "set the token" placeholder shows instead
  of the map), but it must be set for the picker to actually render. Value is
  Q-Bay's public Mapbox token (`pk.…`, safe for client-side use). GitHub's
  push protection blocks any Mapbox token pattern from being committed even
  though this one is the public/client-safe kind, so it is NOT in the tracked
  `.env` (that stays `""`). For local dev, put the real value in `.env.local`
  (gitignored, Vite loads it automatically and it overrides `.env`) - ask an
  admin for the token. In Vercel, go to Project → Settings → Environment
  Variables, add `VITE_MAPBOX_TOKEN` with that value for Production, Preview
  and Development, then redeploy (env var changes only take effect on the
  next build, not existing deployments).

Server (never exposed to the browser, read inside handlers):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (only if server-side privileged access is needed)

Edge function secrets (configured in Supabase, not Vercel):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (auto-provisioned by Supabase)
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (optional), `OPENROUTER_SITE_URL` (optional)
- `TAVILY_API_KEY` (the only web-search provider, no Serper fallback)

There is no AI Receptionist, Twilio, ElevenLabs, or Lovable dependency in this
build. Per-agent WhatsApp Business API credentials are NOT global secrets:
each staff member connects their own number from Settings → My WhatsApp
Business Connection; the access token is stored in Supabase Vault, never in
an environment variable.

Backend edge functions and the database stay hosted on the existing backend
project. They are not redeployed by Vercel. Their secrets remain configured in
the backend, not in Vercel.

## 3. Local production check

```bash
NITRO_PRESET=vercel npm run build
npx vercel deploy --prebuilt   # optional, uploads .vercel/output as-is
```

## Notes

- Routing needs no `rewrites`: the SSR function handles every path, so deep
  links and refreshes work without extra config.
- Webhook/public endpoints stay at `/api/public/*` on the deployed domain.
  Update external services (ElevenLabs, Twilio) to the Vercel URL if you switch
  the primary host.
- **Public website address.** Copy Website Link and property share messages build links from
  the website address an administrator enters in Settings, Public website. If nothing is set
  there, `VITE_PUBLIC_WEBSITE_URL` is used as a fallback. No domain is ever guessed: until one of
  the two is set, no website links are created.
- **Migration order for tenants.** `20260922000400_tenant_phone_and_private_fields.sql` is safe
  to apply at any time. `20260922000500_tenant_id_number_lockdown.sql` removes direct reads of
  `tenants.id_number` and must be applied only after this CRM build is deployed, because the
  previous build reads tenants with `select("*")`, which the lockdown rejects.
- **Tests.** `npm run typecheck` and `npm test` (uses Bun's test runner, no extra packages).
