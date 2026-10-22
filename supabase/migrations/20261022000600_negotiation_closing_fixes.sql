-- Follow-ups to the negotiation and closing migration.
--
--   * Recording an already-closed deal again (from any screen, Accounting included) is refused with a plain
--     message instead of a raw unique-index error.
--   * When a Super Administrator takes a lead back out of Won, its interest goes back from "won" to
--     "interested", alongside the deal being cancelled and the property made available again.

create or replace function public.transactions_friendly_duplicate_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' then
    if new.lead_id is not null and new.property_id is not null and exists (
      select 1 from public.transactions t
       where t.id <> new.id and t.status = 'closed'
         and t.lead_id = new.lead_id and t.property_id = new.property_id
         and t.transaction_type = new.transaction_type
    ) then
      raise exception 'This deal is already closed for this client and property. Open the existing transaction to edit it instead of recording it again.'
        using errcode = '23505';
    end if;
    if new.transaction_type = 'sale' and new.property_id is not null and exists (
      select 1 from public.transactions t
       where t.id <> new.id and t.status = 'closed'
         and t.transaction_type = 'sale' and t.property_id = new.property_id
    ) then
      raise exception 'This property already has a closed sale. Cancel that sale first if it was a mistake.'
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger transactions_friendly_duplicate_check
  before insert or update of status, property_id, lead_id, transaction_type on public.transactions
  for each row execute function public.transactions_friendly_duplicate_check();

revoke execute on function public.transactions_friendly_duplicate_check() from public, anon, authenticated;

create or replace function public.leads_after_leave_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_new record;
  r record;
begin
  if new.pipeline_stage is not distinct from old.pipeline_stage then
    return null;
  end if;
  select * into v_old from public.pipeline_stage_info(old.pipeline_stage);
  select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
  if not coalesce(v_old.is_won, false) or coalesce(v_new.is_won, false) then
    return null;
  end if;

  for r in
    update public.transactions
       set status = 'cancelled',
           notes = left(coalesce(notes || E'\n', '') || 'Cancelled: the lead was moved out of Won by a Super Administrator.', 2000)
     where lead_id = new.id and status = 'closed'
    returning property_id
  loop
    update public.properties p
       set availability = 'available'
     where p.id = r.property_id
       and p.availability in ('sold', 'rented')
       and not exists (
         select 1 from public.transactions t
          where t.property_id = p.id and t.status = 'closed'
       );
  end loop;

  update public.lead_property_interests
     set status = 'interested', updated_at = now()
   where lead_id = new.id and status = 'won';
  return null;
end;
$$;
