-- The agency's income from a deal is its commission (as in the manual transaction form). Deals closed through
-- close_lead_deal and the property sale form set a commission but not income, so Accounting's "Closed income"
-- would have missed them. A trigger now fills income from the commission whenever it is empty.

create or replace function public.transactions_default_income()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.income is null and new.commission_value is not null then
    new.income := new.commission_value;
  end if;
  return new;
end;
$$;

create or replace trigger transactions_default_income
  before insert or update of commission_value on public.transactions
  for each row execute function public.transactions_default_income();

revoke execute on function public.transactions_default_income() from public, anon, authenticated;

update public.transactions set income = commission_value where income is null and commission_value is not null;
