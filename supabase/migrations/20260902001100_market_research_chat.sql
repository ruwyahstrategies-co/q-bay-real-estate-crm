-- Q-Bay Real Estate CRM — Property Market Research chat (module I).
-- Replaces the static single-query panel with a real conversation model.
-- Mirrors market_intelligence_reports' flat RLS (has_permission check, no
-- per-user scoping) since this is shared team research, not private data.

create table public.market_research_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_research_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.market_research_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index market_research_messages_conversation_id_idx on public.market_research_messages (conversation_id);
create index market_research_conversations_created_by_idx on public.market_research_conversations (created_by);

drop trigger if exists set_updated_at on public.market_research_conversations;
create trigger set_updated_at before update on public.market_research_conversations for each row execute function public.set_updated_at();

alter table public.market_research_conversations enable row level security;
create policy market_research_conversations_select on public.market_research_conversations for select to authenticated using (public.has_permission('marketing_intelligence', 'view'));
create policy market_research_conversations_insert on public.market_research_conversations for insert to authenticated with check (public.has_permission('marketing_intelligence', 'view'));
create policy market_research_conversations_update on public.market_research_conversations for update to authenticated
  using (public.has_permission('marketing_intelligence', 'view')) with check (public.has_permission('marketing_intelligence', 'view'));
create policy market_research_conversations_delete on public.market_research_conversations for delete to authenticated using (created_by = public.current_team_member_id());

alter table public.market_research_messages enable row level security;
create policy market_research_messages_select on public.market_research_messages for select to authenticated using (public.has_permission('marketing_intelligence', 'view'));
create policy market_research_messages_insert on public.market_research_messages for insert to authenticated with check (public.has_permission('marketing_intelligence', 'view'));
