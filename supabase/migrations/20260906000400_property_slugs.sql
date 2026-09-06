-- Every published property needs a readable, stable URL. Nothing was filling
-- properties.slug, so the website was routing on raw UUIDs and the sitemap had
-- no human-readable entries. Slugs are derived from the title plus the
-- reference code, which is already unique per property.

create or replace function public.slugify(_input text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(lower(coalesce(_input, '')), '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g'
      )
    ),
    ''
  );
$$;

create or replace function public.properties_assign_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base text;
  suffix text;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  base := public.slugify(new.title);
  suffix := public.slugify(new.reference_code);

  new.slug := coalesce(
    nullif(concat_ws('-', base, suffix), ''),
    'property-' || replace(new.id::text, '-', '')
  );

  -- Reference codes are unique, so a collision here means two rows share both
  -- title and reference; fall back to the row id rather than failing the write.
  if exists (select 1 from public.properties p where p.slug = new.slug and p.id <> new.id) then
    new.slug := new.slug || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  return new;
end;
$$;

drop trigger if exists properties_assign_slug on public.properties;
create trigger properties_assign_slug
  before insert or update of title, reference_code, slug on public.properties
  for each row execute function public.properties_assign_slug();

-- Backfill anything already in the table.
update public.properties
  set slug = coalesce(
    nullif(concat_ws('-', public.slugify(title), public.slugify(reference_code)), ''),
    'property-' || replace(id::text, '-', '')
  )
  where slug is null or slug = '';

create unique index if not exists properties_slug_uniq on public.properties(slug) where slug is not null;

-- Developments route on their slug too, so hold them to the same rule.
create or replace function public.developments_assign_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  new.slug := coalesce(public.slugify(new.name), 'development-' || replace(new.id::text, '-', ''));
  if exists (select 1 from public.developments d where d.slug = new.slug and d.id <> new.id) then
    new.slug := new.slug || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;
  return new;
end;
$$;

drop trigger if exists developments_assign_slug on public.developments;
create trigger developments_assign_slug
  before insert or update of name, slug on public.developments
  for each row execute function public.developments_assign_slug();

update public.developments
  set slug = coalesce(public.slugify(name), 'development-' || replace(id::text, '-', ''))
  where slug is null or slug = '';
