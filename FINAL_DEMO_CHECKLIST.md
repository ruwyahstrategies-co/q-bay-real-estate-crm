# Q-Bay Client Demo — Click-Through Checklist

Short and operational. Follow top to bottom. All data (5 properties, 8
leads) is real, live demo data already in the database — nothing here is
fabricated on screen.

## Before you start

- Have the admin password for `omar@ruwyahstrategies.com` ready.
- Decide the new sales agent's name/email in advance (e.g. a name the client
  will recognise, like their own sales lead).

## 1. Admin: sign in

1. Go to `/login`, sign in as `omar@ruwyahstrategies.com`.
2. Confirm the sidebar shows **every** module (Overview, Leads, Properties,
   Conversations, Uploads, AI Insights, Pipeline, Property Demand, Marketing
   Intelligence, Team, AI Receptionist, Settings).

## 2. Admin: create a Sales Agent login

1. Go to **Team → Add member**.
2. Fill in full name, email, phone.
3. Role preset: **Sales Agent**.
4. Scroll to Permissions — explicitly **uncheck all Team and Settings
   actions** (should already be off for this preset — point this out).
5. Pick **one extra permission** the agent shouldn't normally have (e.g.
   `Marketing Intelligence → View`) to demonstrate overrides work per-person,
   not just per-role.
6. Leave "Create login now" checked, set/generate a temporary password.
7. Save. Confirm the new row shows **Has login** in the Team table.
8. Sign out (sidebar → Sign out).

## 3. Sales Agent: sign in and confirm restrictions

1. Sign in as the new agent with the temporary password.
2. Confirm **Team and Settings do not appear** in the sidebar.
3. Try navigating directly to `/team` or `/settings` in the address bar —
   confirm an **Access denied** state, not a crash or leaked data.
4. Open **Properties** — browse the 5 live listings.
5. Open **Leads** — browse the 8 live leads.

## 4. Sales Agent: work a lead end-to-end

1. Open any lead (or create a new one via **Add Lead**).
2. If creating: set budget, source, pipeline stage, assign to yourself, and
   select an **interested property**.
3. On the lead page, go to **Conversations → Add interaction** — log a
   WhatsApp or phone call with a short note.
4. Go to **Tasks → Add task** — create a follow-up due tomorrow.
5. Go to **Pipeline**, drag the lead to the next stage.
6. Back on the lead page, click **Analyse Lead** (or **Reanalyse**) — wait
   for the AI result, open the **Buyer Intelligence** tab to show it.
7. Sign out.

## 5. Admin: verify everything the agent did

1. Sign in again as `omar@ruwyahstrategies.com`.
2. Open the same lead — confirm:
   - the new interaction is listed under Conversations,
   - the follow-up task is listed under Tasks (and on Overview's
     "Upcoming follow-ups"),
   - the pipeline stage matches where the agent moved it, and the Activity
     tab shows the stage change,
   - the interested property is linked,
   - the AI analysis is present under Buyer Intelligence.

## Optional extras if there's time

- **Settings → Pipeline Stages**: rename a stage, reorder by drag, confirm
  the Pipeline board and lead-form dropdown update immediately.
- **Properties → open a listing → upload an image** (JPG/PNG/WEBP), confirm
  it appears immediately and persists after a refresh.
- **Team → deactivate** the demo agent, confirm they're signed out /
  blocked on next login attempt, then reactivate.

## If something looks wrong

- Blank sidebar / "Account not provisioned" for a login that should work →
  their `team_members.user_id` isn't linked. Recreate their login from Team.
- "Account disabled" → their `is_active` flag is off; reactivate from Team.
- AI analysis fails immediately → check `OPENROUTER_API_KEY` is set in
  Lovable Cloud function secrets.
