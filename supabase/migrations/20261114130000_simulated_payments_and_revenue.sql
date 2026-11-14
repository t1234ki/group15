set search_path = laundry, public;

alter table laundry.orders
    add column payment_status text not null default 'cash_due'
        check (payment_status in ('cash_due', 'demo_paid')),
    add column platform_commission integer not null default 0
        check (platform_commission >= 0),
    add column partner_revenue integer not null default 0
        check (partner_revenue >= 0),
    add constraint orders_payment_method_check
        check (payment_method in ('cash_on_pickup', 'demo_card', 'demo_mobile_money')),
    add constraint orders_payment_split_check check (
        (
            payment_method = 'cash_on_pickup'
            and payment_status = 'cash_due'
            and platform_commission = 0
            and partner_revenue = 0
        )
        or (
            payment_method in ('demo_card', 'demo_mobile_money')
            and payment_status = 'demo_paid'
            and platform_commission + partner_revenue = total
        )
    );

create or replace function laundry.record_demo_payment_split()
returns trigger as $$
begin
    if new.payment_method = 'cash_on_pickup' then
        new.payment_status := 'cash_due';
        new.platform_commission := 0;
        new.partner_revenue := 0;
    elsif new.payment_method in ('demo_card', 'demo_mobile_money') then
        new.payment_status := 'demo_paid';
        new.platform_commission := round(new.total::numeric * 0.05)::integer;
        new.partner_revenue := new.total - new.platform_commission;
    else
        raise exception using errcode = 'P0001', message = 'PAYMENT_METHOD_UNSUPPORTED';
    end if;

    return new;
end;
$$ language plpgsql set search_path = laundry, pg_temp;

create trigger orders_record_demo_payment_split
    before insert on laundry.orders
    for each row execute function laundry.record_demo_payment_split();

create index orders_demo_revenue_partner_idx
    on laundry.orders (partner_id, placed_at desc)
    where payment_status = 'demo_paid';

create or replace function laundry.admin_revenue_summary()
returns table (
    partner_id text,
    partner_name text,
    demo_order_count bigint,
    gross_amount bigint,
    platform_commission bigint,
    partner_revenue bigint
) as $$
begin
    if not laundry.is_admin() then
        raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_REQUIRED';
    end if;

    return query
    select
        partner.id,
        partner.name,
        count(order_row.id),
        coalesce(sum(order_row.total), 0)::bigint,
        coalesce(sum(order_row.platform_commission), 0)::bigint,
        coalesce(sum(order_row.partner_revenue), 0)::bigint
    from laundry.partners partner
    left join laundry.orders order_row
        on order_row.partner_id = partner.id
        and order_row.payment_status = 'demo_paid'
        and order_row.status <> 'cancelled'
    group by partner.id, partner.name
    order by partner.name, partner.id;
end;
$$ language plpgsql stable security definer set search_path = laundry, pg_temp;

create or replace function laundry.partner_revenue_summary()
returns table (
    partner_id text,
    partner_name text,
    demo_order_count bigint,
    gross_amount bigint,
    platform_commission bigint,
    partner_revenue bigint
) as $$
declare
    caller_id uuid := auth.uid();
begin
    if caller_id is null then
        raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
    end if;

    return query
    select
        partner.id,
        partner.name,
        count(order_row.id),
        coalesce(sum(order_row.total), 0)::bigint,
        coalesce(sum(order_row.platform_commission), 0)::bigint,
        coalesce(sum(order_row.partner_revenue), 0)::bigint
    from laundry.partners partner
    left join laundry.orders order_row
        on order_row.partner_id = partner.id
        and order_row.payment_status = 'demo_paid'
        and order_row.status <> 'cancelled'
    where partner.owner_id = caller_id
    group by partner.id, partner.name
    order by partner.name, partner.id;
end;
$$ language plpgsql stable security definer set search_path = laundry, pg_temp;

revoke all on function laundry.record_demo_payment_split() from public, anon, authenticated;
revoke all on function laundry.admin_revenue_summary() from public, anon;
revoke all on function laundry.partner_revenue_summary() from public, anon;
grant execute on function laundry.admin_revenue_summary() to authenticated;
grant execute on function laundry.partner_revenue_summary() to authenticated;
