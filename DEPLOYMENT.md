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

Client (must keep the `VITE_` prefix — inlined at build time):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Server (never exposed to the browser, read inside handlers):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (only if server-side privileged access is needed)
- `OPENROUTER_API_KEY`
- `TAVILY_API_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`
  (once the voice agent keys are available)

Backend edge functions and the database stay hosted on the existing backend
project — they are not redeployed by Vercel. Their secrets remain configured in
the backend, not in Vercel.

## 3. Local production check

```bash
NITRO_PRESET=vercel npm run build
npx vercel deploy --prebuilt   # optional, uploads .vercel/output as-is
```

## Notes

- Routing needs no `rewrites`: the SSR function handles every path, so deep
  links and refreshes work without extra config.
- Webhook/public endpoints stay at `/api/public/*` on the deployed domain —
  update external services (ElevenLabs, Twilio) to the Vercel URL if you switch
  the primary host.
