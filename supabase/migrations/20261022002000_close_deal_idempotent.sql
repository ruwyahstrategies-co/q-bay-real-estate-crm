-- Closing a deal twice must not duplicate anything.
--
-- close_lead_deal already refuses a second client on a property that is closed, and a unique rule stops a
-- second closed row for the same lead and property. What still repeated was the history: every save of an
-- already-closed deal (editing its details, or a double click) wrote another "Deal closed" note on the lead,
-- another demand event on the property and another notification. Now a closed deal for the same lead, property
-- and type is found and updated in place, and the history entries are written once, when the deal first closes.
-- Everything else about the function is unchanged.

create or replace function public.close_lead_deal(
  _lead_id uuid,
  _property_id uuid,
  _transaction_type text,
  _closing_date date,
  _price numeric,
  _currency text,
  _client_name text,
  _client_phone text,
  _client_email text,
  _payment_method text,
  _payment_status text,
  _payment_details text,
  _commission_rate numeric default null,
  _commission_amount numeric default null,
  _notes text default null,
  _transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := public.current_team_member_id();
  v_lead public.leads;
  v_prop public.properties;
  v_stage record;
  v_won_stage text;
  v_txn uuid;
  v_was_closed boolean := false;
  v_agent uuid;
  v_today date := (now() at time zone 'Asia/Qatar')::date;
  v_phone text := nullif(regexp_replace(btrim(coalesce(_client_phone, '')), '\s+', ' ', 'g'), '');
  v_summary text;
  r record;
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to close a deal.' using errcode = '42501';
  end if;
  if not public.can_finalize_won() then
    raise exception 'Only a Super Administrator, an authorised Administrator or Accounts can close a deal.' using errcode = '42501';
  end if;

  if _transaction_type not in ('sale', 'rental') then
    raise exception 'Choose whether this was a sale or a rental.' using errcode = '22023';
  end if;
  if _closing_date is null then
    raise exception 'The actual transaction date is required.' using errcode = '23514';
  end if;
  if _closing_date > v_today then
    raise exception 'The transaction date cannot be in the future.' using errcode = '23514';
  end if;
  if _price is null or _price <= 0 then
    raise exception 'The agreed price is required.' using errcode = '23514';
  end if;
  if btrim(coalesce(_client_name, '')) = '' then
    raise exception 'The client name is required.' using errcode = '23514';
  end if;
  if v_phone is null then
    raise exception 'The client phone number is required.' using errcode = '23514';
  end if;
  if _payment_method is null or _payment_method not in ('cash', 'bank_transfer', 'cheque', 'card', 'other') then
    raise exception 'Choose how the client paid.' using errcode = '23514';
  end if;
  if _payment_status is null or _payment_status not in ('pending', 'partial', 'paid') then
    raise exception 'Choose the payment status.' using errcode = '23514';
  end if;
  if _commission_rate is not null and (_commission_rate < 0 or _commission_rate > 100) then
    raise exception 'The commission rate must be between 0 and 100.' using errcode = '23514';
  end if;

  select * into v_lead from public.leads where id = _lead_id for update;
  if not found then
    raise exception 'That lead could not be found.' using errcode = '22023';
  end if;
  select * into v_prop from public.properties where id = _property_id for update;
  if not found then
    raise exception 'Choose the property that was sold or rented.' using errcode = '22023';
  end if;

  select * into v_stage from public.pipeline_stage_info(v_lead.pipeline_stage);
  if found and v_stage.is_lost and not public.is_super_administrator() then
    raise exception 'This lead is Lost. Only a Super Administrator can reopen it.' using errcode = '23514';
  end if;

  if _transaction_type = 'sale' and v_prop.purpose = 'rent' then
    raise exception 'This property is listed for rent, so it cannot be recorded as a sale.' using errcode = '23514';
  end if;
  if _transaction_type = 'rental' and v_prop.purpose in ('sale', 'off_plan', 'off_plan_resale') then
    raise exception 'This property is listed for sale, so it cannot be recorded as a rental.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.transactions t
     where t.property_id = _property_id and t.status = 'closed'
       and t.lead_id is distinct from _lead_id
       and t.id is distinct from _transaction_id
       and (_transaction_type = 'sale' or t.transaction_type = 'sale' or v_prop.availability = 'rented')
  ) then
    raise exception 'This property already has a closed deal with another client. Cancel that deal first if it was a mistake.' using errcode = '23505';
  end if;

  v_agent := coalesce(v_lead.assigned_agent_id, v_prop.assigned_agent_id, v_me);

  if _transaction_id is not null then
    v_txn := _transaction_id;
    select (t.status = 'closed') into v_was_closed from public.transactions t where t.id = _transaction_id and t.lead_id = _lead_id;
    v_was_closed := coalesce(v_was_closed, false);
    update public.transactions set
        lead_id = _lead_id,
        property_id = _property_id,
        agent_id = coalesce(agent_id, v_agent),
        transaction_type = _transaction_type,
        transaction_value = _price,
        commission_value = _commission_amount,
        currency = coalesce(nullif(btrim(_currency), ''), 'QAR'),
        status = 'closed',
        closed_at = _closing_date,
        notes = nullif(btrim(coalesce(_notes, '')), ''),
        buyer_name = btrim(_client_name),
        buyer_phone = v_phone,
        buyer_email = nullif(btrim(coalesce(_client_email, '')), ''),
        seller_owner_id = v_prop.owner_id,
        commission_rate = _commission_rate,
        payment_status = _payment_status,
        payment_method = _payment_method,
        payment_details = nullif(btrim(coalesce(_payment_details, '')), '')
      where id = _transaction_id and lead_id = _lead_id;
    if not found then
      raise exception 'That transaction does not belong to this lead.' using errcode = '22023';
    end if;
  else
    -- A pending or cancelled record is completed; an already closed one for the same lead, property and
    -- type is updated in place rather than refused or repeated.
    select t.id, (t.status = 'closed') into v_txn, v_was_closed from public.transactions t
     where t.lead_id = _lead_id and t.property_id = _property_id and t.transaction_type = _transaction_type
       and t.status in ('pending', 'cancelled', 'closed')
     order by (t.status = 'pending') desc, (t.status = 'closed') desc, t.created_at desc
     limit 1
       for update;
    v_was_closed := coalesce(v_was_closed, false);
    if v_txn is not null then
      update public.transactions set
          agent_id = coalesce(agent_id, v_agent),
          transaction_value = _price,
          commission_value = _commission_amount,
          currency = coalesce(nullif(btrim(_currency), ''), 'QAR'),
          status = 'closed',
          closed_at = _closing_date,
          notes = nullif(btrim(coalesce(_notes, '')), ''),
          buyer_name = btrim(_client_name),
          buyer_phone = v_phone,
          buyer_email = nullif(btrim(coalesce(_client_email, '')), ''),
          seller_owner_id = v_prop.owner_id,
          commission_rate = _commission_rate,
          payment_status = _payment_status,
          payment_method = _payment_method,
          payment_details = nullif(btrim(coalesce(_payment_details, '')), '')
        where id = v_txn;
    else
      insert into public.transactions (
        property_id, lead_id, agent_id, transaction_type, transaction_value, commission_value, currency,
        status, closed_at, notes, buyer_name, buyer_phone, buyer_email, seller_owner_id, commission_rate,
        payment_status, payment_method, payment_details, recorded_by
      ) values (
        _property_id, _lead_id, v_agent, _transaction_type, _price, _commission_amount,
        coalesce(nullif(btrim(_currency), ''), 'QAR'), 'closed', _closing_date,
        nullif(btrim(coalesce(_notes, '')), ''), btrim(_client_name), v_phone,
        nullif(btrim(coalesce(_client_email, '')), ''), v_prop.owner_id, _commission_rate,
        _payment_status, _payment_method, nullif(btrim(coalesce(_payment_details, '')), ''), v_me
      ) returning id into v_txn;
    end if;
  end if;

  select s.stage_key into v_won_stage
    from public.pipeline_stages s where s.is_won and s.is_active order by s.position limit 1;
  v_summary := case _transaction_type when 'sale' then 'Sold' else 'Rented' end || ': ' || v_prop.title
    || ' for ' || coalesce(nullif(btrim(_currency), ''), 'QAR') || ' ' || trim(to_char(_price, 'FM999,999,999,990.##'))
    || ' on ' || to_char(_closing_date, 'DD Mon YYYY');
  if v_won_stage is not null and v_lead.pipeline_stage is distinct from v_won_stage then
    perform set_config('app.stage_change_kind', 'closing', true);
    perform set_config('app.stage_change_reason', left(v_summary, 500), true);
    update public.leads set pipeline_stage = v_won_stage where id = _lead_id;
    perform set_config('app.stage_change_kind', '', true);
    perform set_config('app.stage_change_reason', '', true);
  end if;

  insert into public.lead_property_interests (lead_id, property_id, status, holds_property)
  values (_lead_id, _property_id, 'won', false)
  on conflict (lead_id, property_id)
  do update set status = 'won', holds_property = false, updated_at = now();

  for r in
    update public.lead_property_interests i
       set status = 'lost', holds_property = false, updated_at = now()
     where i.property_id = _property_id and i.lead_id <> _lead_id and i.status = 'reserved'
    returning i.lead_id
  loop
    perform public.enqueue_staff_notification(
      (select assigned_agent_id from public.leads where id = r.lead_id),
      'Property no longer available',
      v_prop.title || ' was ' || case _transaction_type when 'sale' then 'sold' else 'rented' end || ' to another client.',
      '/leads/' || r.lead_id::text, 'property_unavailable', 'properties', _property_id, 'closed:' || r.lead_id::text
    );
  end loop;

  -- History is written once, when the deal first closes. Saving the same deal again only updates it.
  if not v_was_closed then
    insert into public.property_events (property_id, lead_id, event_type, source, source_ref, weight, metadata)
    values (_property_id, _lead_id, 'deal_closed', 'closing', v_txn::text, 0,
            jsonb_build_object('transaction_type', _transaction_type, 'price', _price, 'closed_at', _closing_date));

    insert into public.interactions (lead_id, property_id, interaction_type, direction, subject, content, interaction_date, metadata)
    values (_lead_id, _property_id, 'manual_note', 'internal', 'Deal closed', v_summary || '. Payment: ' || _payment_method || ' (' || _payment_status || ').',
            now(), jsonb_build_object('transaction_id', v_txn, 'kind', 'deal_closed'));

    if v_lead.assigned_agent_id is not null and v_lead.assigned_agent_id is distinct from v_me then
      perform public.enqueue_staff_notification(
        v_lead.assigned_agent_id, 'Deal closed', v_lead.full_name || ': ' || v_summary, '/leads/' || _lead_id::text,
        'deal_closed', 'transactions', v_txn, 'closed'
      );
    end if;
  end if;

  return jsonb_build_object('transaction_id', v_txn, 'stage', coalesce(v_won_stage, v_lead.pipeline_stage), 'summary', v_summary,
                            'already_closed', v_was_closed);
end;
$function$;
