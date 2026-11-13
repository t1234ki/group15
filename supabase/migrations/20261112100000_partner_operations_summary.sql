set search_path = laundry, public;

create or replace function laundry.partner_operations_summary()
returns table (
    active_orders integer,
    awaiting_confirmation integer,
    pickups_today integer,
    deliveries_today integer,
    completed_today integer,
    generated_at timestamptz
) as $$
declare
    caller_id uuid := auth.uid();
begin
    if caller_id is null then
        raise exception using message = 'UNAUTHENTICATED', errcode = 'P0001';
    end if;

    return query
    select
        count(*) filter (
            where o.status in ('processing', 'out_for_delivery')
        )::integer,
        count(*) filter (
            where o.status = 'processing' and latest.type = 'placed'
        )::integer,
        count(*) filter (
            where o.status in ('processing', 'out_for_delivery')
              and (pickup.starts_at at time zone 'Africa/Accra')::date =
                  (now() at time zone 'Africa/Accra')::date
        )::integer,
        count(*) filter (
            where o.status in ('processing', 'out_for_delivery')
              and (delivery.starts_at at time zone 'Africa/Accra')::date =
                  (now() at time zone 'Africa/Accra')::date
        )::integer,
        count(*) filter (
            where o.status = 'delivered'
              and (delivered.occurred_at at time zone 'Africa/Accra')::date =
                  (now() at time zone 'Africa/Accra')::date
        )::integer,
        now()
    from laundry.orders o
    join laundry.partners p on p.id = o.partner_id
    join laundry.slots pickup on pickup.id = o.pickup_slot_id
    join laundry.slots delivery on delivery.id = o.delivery_slot_id
    join lateral (
        select e.type
        from laundry.order_events e
        where e.order_id = o.id
        order by e.occurred_at desc, e.id desc
        limit 1
    ) latest on true
    left join lateral (
        select e.occurred_at
        from laundry.order_events e
        where e.order_id = o.id and e.type = 'delivered'
        order by e.occurred_at desc, e.id desc
        limit 1
    ) delivered on true
    where p.owner_id = caller_id;
end;
$$ language plpgsql stable security definer set search_path = laundry, pg_temp;

revoke all on function laundry.partner_operations_summary() from public, anon;
grant execute on function laundry.partner_operations_summary() to authenticated;
