set search_path = laundry, public;

-- Replace postal-code service areas with customer and laundry GPS coordinates.
-- Existing addresses and orders retain their text; missing coordinates remain
-- null until the owner/customer captures a real location.

alter table laundry.addresses
    add column latitude numeric(9, 6),
    add column longitude numeric(9, 6),
    alter column pincode drop not null;

alter table laundry.addresses
    drop constraint if exists addresses_pincode_check;

alter table laundry.order_addresses
    add column latitude numeric(9, 6),
    add column longitude numeric(9, 6),
    alter column pincode drop not null;

alter table laundry.order_addresses
    drop constraint if exists order_addresses_pincode_check;

alter table laundry.partners
    add column service_radius_km integer not null default 10
        check (service_radius_km between 1 and 25);

alter table laundry.partners
    add constraint partners_coordinates_pair_check
        check ((latitude is null) = (longitude is null));

alter table laundry.addresses
    add constraint addresses_coordinates_pair_check
        check ((latitude is null) = (longitude is null));

alter table laundry.order_addresses
    add constraint order_addresses_coordinates_pair_check
        check ((latitude is null) = (longitude is null));

drop trigger if exists order_addresses_enforce_serviceability on laundry.order_addresses;
drop function if exists laundry.enforce_order_address_serviceability();

-- Keep the existing atomic order implementation, but make its old public entry
-- point private. The wrapper validates coverage and snapshots GPS coordinates
-- in the same transaction, before the order becomes visible.
alter function laundry.place_order(text, text, text, text, text, text)
    rename to place_order_legacy;

revoke execute on function laundry.place_order_legacy(text, text, text, text, text, text)
    from public, anon, authenticated;

create function laundry.place_order(
    target_cart_id text,
    target_address_id text,
    target_pickup_slot_id text,
    target_delivery_slot_id text,
    target_payment_method text,
    target_idempotency_key text
) returns table (order_id text, replayed boolean) as $$
declare
    caller_id uuid := auth.uid();
    existing_order_id text;
    cart_partner_id text;
    customer_latitude numeric;
    customer_longitude numeric;
    laundry_latitude numeric;
    laundry_longitude numeric;
    service_radius integer;
    placement record;
begin
    if caller_id is null then
        raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(caller_id::text || ':' || target_idempotency_key, 0)
    );

    select o.id into existing_order_id
    from laundry.orders o
    where o.user_id = caller_id and o.idempotency_key = target_idempotency_key;

    if found then
        return query select existing_order_id, true;
        return;
    end if;

    select c.partner_id into cart_partner_id
    from laundry.carts c
    where c.id = target_cart_id and c.user_id = caller_id
    for update;
    if not found then
        raise exception using errcode = 'P0001', message = 'CART_NOT_FOUND';
    end if;
    if cart_partner_id is null then
        raise exception using errcode = 'P0001', message = 'CART_EMPTY';
    end if;

    select a.latitude, a.longitude
    into customer_latitude, customer_longitude
    from laundry.addresses a
    where a.id = target_address_id and a.user_id = caller_id
    for share;
    if not found then
        raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_FOUND';
    end if;
    if customer_latitude is null or customer_longitude is null then
        raise exception using errcode = 'P0001', message = 'ADDRESS_LOCATION_REQUIRED';
    end if;

    select p.latitude, p.longitude, p.service_radius_km
    into laundry_latitude, laundry_longitude, service_radius
    from laundry.partners p
    where p.id = cart_partner_id
    for share;

    if laundry_latitude is null or laundry_longitude is null
       or laundry.haversine_meters(
           customer_latitude, customer_longitude, laundry_latitude, laundry_longitude
       ) > service_radius * 1000 then
        raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_SERVICEABLE';
    end if;

    select * into placement
    from laundry.place_order_legacy(
        target_cart_id,
        target_address_id,
        target_pickup_slot_id,
        target_delivery_slot_id,
        target_payment_method,
        target_idempotency_key
    );

    if not placement.replayed then
        update laundry.order_addresses
        set latitude = customer_latitude, longitude = customer_longitude
        where laundry.order_addresses.order_id = placement.order_id;
    end if;

    return query select placement.order_id, placement.replayed;
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke execute on function laundry.place_order(text, text, text, text, text, text)
    from public, anon;
grant execute on function laundry.place_order(text, text, text, text, text, text)
    to authenticated;
