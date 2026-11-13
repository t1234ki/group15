set search_path = laundry, public;

-- Customers may cancel their own service-only cash-on-pickup order before the
-- scheduled pickup and before a laundry records pickup. Status, tracking and
-- both slot reservations change atomically. Plus-activation orders remain a
-- support case until membership reversal and refund policy is defined.

create or replace function laundry.cancel_order(
    target_order_id text
) returns table (
    order_id text,
    status laundry.order_status,
    event_type laundry.order_event,
    occurred_at timestamptz
) as $$
declare
    caller_id uuid := auth.uid();
    order_user_id uuid;
    current_status laundry.order_status;
    current_payment_method text;
    current_membership_fee integer;
    pickup_slot text;
    delivery_slot text;
    pickup_starts_at timestamptz;
    latest_event laundry.order_event;
    recorded_at timestamptz;
begin
    if caller_id is null then
        raise exception using message = 'UNAUTHENTICATED', errcode = 'P0001';
    end if;

    -- The row lock serializes cancellation with fulfilment and repeated taps.
    select o.user_id, o.status, o.payment_method, o.membership_fee,
           o.pickup_slot_id, o.delivery_slot_id, pickup.starts_at
      into order_user_id, current_status, current_payment_method,
           current_membership_fee, pickup_slot, delivery_slot, pickup_starts_at
      from laundry.orders o
      join laundry.slots pickup on pickup.id = o.pickup_slot_id
     where o.id = target_order_id
       for update of o;

    if not found or order_user_id is distinct from caller_id then
        raise exception using message = 'ORDER_NOT_FOUND', errcode = 'P0001';
    end if;

    select e.type
      into latest_event
      from laundry.order_events e
     where e.order_id = target_order_id
     order by e.occurred_at desc, e.id desc
     limit 1;

    if current_status <> 'processing'
       or latest_event is null
       or latest_event not in ('placed', 'confirmed')
       or pickup_starts_at <= now()
       or current_payment_method <> 'cash_on_pickup'
       or current_membership_fee <> 0 then
        raise exception using message = 'CANCELLATION_NOT_ALLOWED', errcode = 'P0001';
    end if;

    insert into laundry.order_events as recorded (order_id, type)
    values (target_order_id, 'cancelled')
    returning recorded.occurred_at into recorded_at;

    update laundry.orders
       set status = 'cancelled'
     where id = target_order_id;

    update laundry.slots
       set booked = greatest(booked - 1, 0),
           state = case
               when state = 'full' and booked - 1 < capacity then 'open'::laundry.slot_state
               else state
           end
     where id in (pickup_slot, delivery_slot);

    return query
    select target_order_id, 'cancelled'::laundry.order_status,
           'cancelled'::laundry.order_event, recorded_at;
end;
$$ language plpgsql security definer set search_path = laundry, pg_temp;

revoke all on function laundry.cancel_order(text) from public, anon;
grant execute on function laundry.cancel_order(text) to authenticated;
