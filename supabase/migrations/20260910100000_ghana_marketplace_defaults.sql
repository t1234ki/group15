set search_path = laundry, public;

-- Ghana campus-marketplace defaults. Keep the existing field names and accept
-- old numeric fixture codes so saved rows can be upgraded without data loss.

alter table laundry.addresses
    drop constraint if exists addresses_pincode_check,
    add constraint addresses_pincode_check
        check (pincode ~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$' or pincode ~ '^[0-9]{6}$');

alter table laundry.partners
    drop constraint if exists partners_pincode_check,
    add constraint partners_pincode_check
        check (pincode ~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$' or pincode ~ '^[0-9]{6}$');

alter table laundry.pincode_centroids
    drop constraint if exists pincode_centroids_pincode_check,
    add constraint pincode_centroids_pincode_check
        check (pincode ~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$' or pincode ~ '^[0-9]{6}$');

alter table laundry.partner_service_areas
    drop constraint if exists partner_service_areas_pincode_check,
    add constraint partner_service_areas_pincode_check
        check (pincode ~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$' or pincode ~ '^[0-9]{6}$');

create or replace function laundry.replace_partner_service_areas(
    target_partner_id text,
    coverage_pincodes text[]
) returns void as $$
declare
    unique_pincode_count integer;
begin
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
           or area.candidate_pincode !~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$'
              and area.candidate_pincode !~ '^[0-9]{6}$'
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
    select target_partner_id, upper(area.candidate_pincode)
    from unnest(coverage_pincodes) as area(candidate_pincode);
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.replace_partner_service_areas(text, text[]) from public;
grant execute on function laundry.replace_partner_service_areas(text, text[]) to authenticated;

update laundry.catalog_items set currency = 'GHS' where currency <> 'GHS';
update laundry.orders set currency = 'GHS' where currency <> 'GHS';

alter table laundry.catalog_items alter column currency set default 'GHS';
alter table laundry.orders alter column currency set default 'GHS';

-- Older order/catalogue RPC migrations wrote INR literals. Normalize those
-- writes at the database boundary while all marketplace prices are migrated.
create or replace function laundry.use_ghana_cedis()
returns trigger as $$
begin
    new.currency := 'GHS';
    return new;
end;
$$ language plpgsql;

create trigger catalog_items_currency_ghana
    before insert or update of currency on laundry.catalog_items
    for each row execute function laundry.use_ghana_cedis();

create trigger orders_currency_ghana
    before insert or update of currency on laundry.orders
    for each row execute function laundry.use_ghana_cedis();
