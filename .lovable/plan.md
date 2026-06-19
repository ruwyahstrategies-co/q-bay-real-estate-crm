## Phase Goal
Transform the existing Buyer Intelligence panel into a focused Sales Intelligence experience, wire cross-module references everywhere, and add objective-driven Marketing Intelligence with a real "Search Your Brand Online" flow. No redesign — reuse existing layouts, sidebar, cards and typography.

## 1. Lead Sales Intelligence (replace current panel)

**Edge function `analyze-lead` (rewrite output schema):**
Return a single JSON object with these top-level keys only:
- `buyer_summary` — buyer_type, budget, locations[], property_type, timeline, financing, pipeline_stage, main_motivation
- `wants` — explicit_requirements[], must_haves[], preferences[], mentioned_properties[{property_id,label,status}], rejected[], missing_info[]
- `sales_playbook` — next_action, call_strategy, questions[≤3], whatsapp_draft, email_draft, objection_response
- `pain_points[]` — {concern, evidence[], how_to_address, what_to_avoid}
- `property_matches[]` (≤3) — {property_id, match_percent, reasons[], conflicts[], price, availability}
- `deep_analysis` — motivations[], risks[], urgency, confidence (collapsed by default)

Prompt updated to enforce sales-coaching tone and forbid manipulative tactics. Keep one-repair retry.

**`buyer-intelligence-panel.tsx` rewrite:**
Five compact sections in this exact order, each in an existing `Card`:
1. Who is this buyer (key/value grid)
2. What do they want (chips + mentioned properties as Links)
3. What should the salesperson say (action + 3 questions + 3 copyable drafts via `navigator.clipboard`)
4. Pain points (list of mini-cards)
5. Top 3 properties (match %, Send to buyer, Open property)

`<Collapsible>` "Deep Analysis" section at the bottom for motivations/risks/evidence.

Rename component file kept; `ai_analyses.output_json` shape changes — old rows simply re-rendered as "Re-run analysis required".

## 2. Cross-Module References

Add a small reusable `<RefList title items />` component that renders clickable labels (no raw IDs). Powered by a single helper `useReferences(entity, id)` that pulls from existing tables:

- **Lead detail** → Related Properties (from `lead_property_interests` + `mentioned_properties` in latest analysis), Supporting Conversations (interactions), Calls (interactions where channel=call), Tasks.
- **Property detail** → Interested Leads (lead_property_interests + property_events), Supporting Conversations (interactions joined via property_events mention), Demand Signal (link to /property-demand?focus=propertyId).
- **Conversation/Interaction drawer** → Related Lead, Related Properties (regex match against active titles/codes — reuse `scan-property-mentions` results stored in property_events), Resulting Task.
- **Demand insight row** → expand to show contributing leads + interactions.
- **Marketing recommendation card** → supporting calls/leads/properties + external source links.

Labels formatted as: `"Call with {lead_name} — {date}"`, `"{code} — {title}"`, etc. Always `<Link>` to canonical route. No new tables required; one optional `references` view is unnecessary.

## 3. Marketing Intelligence rebuild

**Focus selector (top of `/marketing-intelligence`):**
- Period: This week / This month / Last 90 days / Custom (date range picker)
- Objective: 9 presets + Custom (dropdown)
- Optional focus: free-text + entity picker (location / property type / buyer segment / property / campaign / topic)
- Button: **Generate Focused Strategy**

State stored in URL search params (`validateSearch` with zod) so the view is shareable and resilient.

**`market-intelligence` edge function (rewrite):**
Inputs: `{period, objective, focus}`. Steps:
1. Pull anonymised buyer language from interactions, uploads (transcripts), lead notes, objections, lost-deal reasons within period.
2. Pull property events, demand signals.
3. Pull cached external sources for the brand.
4. Single OpenRouter call (`anthropic/claude-sonnet-4.6`) with an objective-specific system prompt selecting the appropriate playbook (reach / luxury / qualified-leads / investor / etc.).
5. Return structured short output: `period_focus`, `buyer_language[≤5]`, `brand_gaps[≤3]`, `recommended_direction`, `campaign_ideas[≤5]`, `actions_this_week[≤5]`. Each item carries `evidence[]` with typed tags: `internal_buyer | property_demand | online_brand | external_market`.

Persist to `market_intelligence_reports` with the focus payload so history is filterable.

**Page layout (preserve existing cards):**
- Top: focus selector card
- Result sections render the 6 keys above as compact cards
- Each finding row shows evidence badges + clickable refs

## 4. Search Your Brand Online

**New edge function `brand-search`** (anonymous, verify_jwt=false):
- Inputs: `{brand_name, website, social_handles[], location, services[], competitors[]}`
- Runs ~6 targeted Tavily queries via existing `web-search` function (company name, site:domain, "reviews", site:instagram.com handle, "<brand> dubai property", each competitor for compare)
- Dedupes, normalises `{title, domain, url, published_at, summary}` and upserts into `external_market_sources` with `source_type='brand'` and `query` tag

**Brand settings UI** (in `/marketing-intelligence` under a collapsible "Brand Profile" — saved into `app_settings` key `brand_profile`):
- Brand name, website, social handles, location, services, competitors
- Button **Search Your Brand Online** triggers `brand-search`; results listed below with external link + date

**Brand Gap Analysis card** (separate button → calls `market-intelligence` with `mode='brand_gap'`):
- Compares brand profile + cached brand sources vs buyer language vs current objective
- Outputs: Current Online Positioning · Buyer Perception · Positioning Gap · Recommended Positioning · Messaging Changes (headline / campaign angle / social direction / sales talking point / trust signal / missing info) · Distribution Recommendation with rationale tied to objective

## 5. Small wiring tasks
- Sidebar unchanged
- Overview cards keep showing real counts; add tiny "Top buyer concern this week" line sourced from latest marketing report (no new fetch loop)
- Toast feedback on every async action; copy-to-clipboard on drafts
- Empty states explain "Run an analysis" / "Configure brand profile first"

## Technical Details
- New file: `src/components/ref-list.tsx`, `src/hooks/use-references.ts`, `src/components/focus-selector.tsx`, `src/components/brand-profile-form.tsx`, `src/components/brand-gap-card.tsx`
- Rewrite: `src/components/buyer-intelligence-panel.tsx`, `src/routes/marketing-intelligence.tsx`, `supabase/functions/analyze-lead/index.ts`, `supabase/functions/market-intelligence/index.ts`
- New: `supabase/functions/brand-search/index.ts` (registered in `supabase/config.toml` with `verify_jwt=false`)
- Migration: add `objective`, `period_start`, `period_end`, `focus` columns to `market_intelligence_reports`; add `source_type` + `query` to `external_market_sources` if missing; new `app_settings` row holds brand profile
- Anonymous CRUD preserved (RLS off / permissive). No auth. No fake data — empty states when nothing exists.

## Out of scope (kept untouched)
- AI Receptionist
- Sidebar, header, routing, typography
- Pipeline, leads/properties CRUD, uploads, importer
- Auth, RLS hardening, automatic posting/pricing

## Verification
- Build passes, no TS errors
- Manually trigger Analyse Lead on a seeded lead and confirm new 5-section panel
- Trigger Generate Focused Strategy for two different objectives and confirm output differs
- Trigger Search Your Brand Online with Tavily key (already configured) and confirm cached sources appear with links
- Click a property reference from a lead and land on the property page; click an interested lead from a property and land on the lead
