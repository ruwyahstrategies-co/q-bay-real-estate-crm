-- Intent scoring integrated with the lead's intended transaction timeline.
-- intent_score stays the existing behavioural/AI-driven base score (untouched
-- by this migration, still fed by interactions/analyses as before).
-- effective_intent_score is exposed only via the function below, computed on
-- read from base intent_score + a time-proximity component, so it is always
-- correct as "today" advances without a background job or one-time trigger.
alter table public.leads
  add column if not exists intended_transaction_date date,
  add column if not exists transaction_timeframe text;

alter table public.leads drop constraint if exists leads_transaction_timeframe_check;
alter table public.leads add constraint leads_transaction_timeframe_check
  check (transaction_timeframe is null or transaction_timeframe = any (array['immediate','1_month','3_months','6_months','12_months','unspecified']::text[]));

comment on column public.leads.intended_transaction_date is 'Exact intended purchase/rent date, when known. Drives the time-proximity component of effective intent (see public.lead_effective_intent_score).';
comment on column public.leads.transaction_timeframe is 'Coarse transaction horizon used for the time-proximity component when an exact date is not known.';

-- Time-proximity multiplier: 1.0 at/after the target date, decaying smoothly
-- the further out the target is, floored at 0.4 so a distant-but-real
-- intention is never treated as cold. Approximates the client's example
-- (buyer 3 months out starts lower, rises toward Hot as the date nears).
create or replace function public.lead_time_proximity_factor(_lead public.leads)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when _lead.intended_transaction_date is not null then
      case
        when _lead.intended_transaction_date <= current_date then 1.0
        else greatest(0.4, 1.0 - (least(_lead.intended_transaction_date - current_date, 180)::numeric / 180.0) * 0.6)
      end
    when _lead.transaction_timeframe = 'immediate' then 1.0
    when _lead.transaction_timeframe = '1_month' then 0.9
    when _lead.transaction_timeframe = '3_months' then 0.75
    when _lead.transaction_timeframe = '6_months' then 0.6
    when _lead.transaction_timeframe = '12_months' then 0.45
    else 0.7 -- unspecified/null: neutral, do not penalise leads with no timeline data yet
  end;
$$;

-- Effective intent score: base behavioural score blended with time-proximity.
-- Deterministic, no manual weekly bump required, and always reflects "today".
create or replace function public.lead_effective_intent_score(_lead public.leads)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select round(least(100, coalesce(_lead.intent_score, 0) * (0.7 + 0.3 * public.lead_time_proximity_factor(_lead))), 1);
$$;

grant execute on function public.lead_time_proximity_factor(public.leads) to authenticated;
grant execute on function public.lead_effective_intent_score(public.leads) to authenticated;
