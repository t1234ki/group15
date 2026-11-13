set search_path = laundry, public;

-- Separate a laundry's physical address from the pincodes where it accepts
-- orders. Existing listings keep their current pincode as their first service
-- area, while owners can atomically replace the complete coverage set.

create table laundry.partner_service_areas (
    partner_id text not null references laundry.partners(id) on delete cascade,
    pincode text not null check (pincode ~ '^[0-9]{6}$'),
    primary key (partner_id, pincode)
);

create index partner_service_areas_pincode_idx
    on laundry.partner_service_areas (pincode, partner_id);

-- Marketplace lookup has moved to the coverage table. These address indexes
-- no longer serve a query and would add write cost to every profile edit.
drop index if exists laundry.partners_pincode_open_idx;
drop index if exists laundry.partners_pincode_idx;

insert into laundry.partner_service_areas (partner_id, pincode)
select id, pincode from laundry.partners
on conflict do nothing;

grant select on laundry.partner_service_areas to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
    on laundry.partner_service_areas from anon, authenticated;

alter table laundry.partner_service_areas enable row level security;

create policy partner_service_areas_read on laundry.partner_service_areas
    for select to anon, authenticated using (true);

create or replace function laundry.replace_partner_service_areas(
    target_partner_id text,
    coverage_pincodes text[]
) returns void as $$
declare
    unique_pincode_count integer;
begin
    -- Lock the listing so ownership and the replacement are one decision.
    perform 1
    from laundry.partners partner
    where partner.id = target_partner_id
      and partner.owner_id = auth.uid()
    for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'PARTNER_NOT_FOUND';
    end if;

    if coverage_pincodes is null
       or cardinality(coverage_pincodes) < 1
       or cardinality(coverage_pincodes) > 50 then
        raise exception using errcode = 'P0001', message = 'PARTNER_SERVICE_AREAS_INVALID';
    end if;

    if exists (
        select 1
        from unnest(coverage_pincodes) as area(candidate_pincode)
        where area.candidate_pincode is null
           or area.candidate_pincode !~ '^[0-9]{6}$'
    ) then
        raise exception using errcode = 'P0001', message = 'PARTNER_SERVICE_AREAS_INVALID';
    end if;

    select count(distinct area.candidate_pincode)
    into unique_pincode_count
    from unnest(coverage_pincodes) as area(candidate_pincode);

    if unique_pincode_count <> cardinality(coverage_pincodes) then
        raise exception using errcode = 'P0001', message = 'PARTNER_SERVICE_AREAS_INVALID';
    end if;

    delete from laundry.partner_service_areas
    where partner_id = target_partner_id;

    insert into laundry.partner_service_areas (partner_id, pincode)
    select target_partner_id, area.candidate_pincode
    from unnest(coverage_pincodes) as area(candidate_pincode);
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.replace_partner_service_areas(text, text[]) from public;
grant execute on function laundry.replace_partner_service_areas(text, text[]) to authenticated;

-- Checkout now accepts any owner-managed coverage pincode, using the same
-- table that powers marketplace discovery.
create or replace function laundry.enforce_order_address_serviceability()
returns trigger as $$
declare
    order_partner_id text;
begin
    select partner_id into order_partner_id
    from laundry.orders
    where id = new.order_id;

    if order_partner_id is null then
        raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
    end if;

    if not exists (
        select 1
        from laundry.partner_service_areas area
        where area.partner_id = order_partner_id
          and area.pincode = new.pincode
    ) then
        raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_SERVICEABLE';
    end if;

    return new;
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.enforce_order_address_serviceability() from public;
