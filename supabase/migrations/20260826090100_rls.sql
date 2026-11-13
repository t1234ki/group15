set search_path = laundry, public;

-- Row Level Security for every table.
--
-- Supabase Data API requests run as `anon` or `authenticated`, so these
-- policies protect direct browser queries as well as privileged SQL routines.

-- Supabase grants table privileges to these roles by default; stating them
-- explicitly keeps the migration self-contained.
grant usage on schema laundry to anon, authenticated;
grant execute on function laundry.ensure_customer_profile() to authenticated;
grant select on laundry.partners, laundry.partner_hours, laundry.partner_tags,
                laundry.catalog_categories, laundry.catalog_items, laundry.slots
    to anon, authenticated;
grant select, insert, update, delete on laundry.profiles, laundry.addresses,
                laundry.carts, laundry.cart_items, laundry.orders, laundry.order_items,
                laundry.order_addresses, laundry.order_events, laundry.memberships,
                laundry.reviews
    to authenticated;
grant execute on function laundry.gen_ulid(), laundry.prefixed_id(text) to anon, authenticated;
revoke all on function laundry.handle_new_user() from public, anon, authenticated;
revoke all on function laundry.ensure_customer_profile() from public, anon;

alter table laundry.profiles           enable row level security;
alter table laundry.addresses          enable row level security;
alter table laundry.partners           enable row level security;
alter table laundry.partner_hours      enable row level security;
alter table laundry.partner_tags       enable row level security;
alter table laundry.catalog_categories enable row level security;
alter table laundry.catalog_items      enable row level security;
alter table laundry.slots              enable row level security;
alter table laundry.carts              enable row level security;
alter table laundry.cart_items         enable row level security;
alter table laundry.orders             enable row level security;
alter table laundry.order_items        enable row level security;
alter table laundry.order_addresses    enable row level security;
alter table laundry.order_events       enable row level security;
alter table laundry.memberships        enable row level security;
alter table laundry.reviews            enable row level security;

-- Does the caller administer this partner?
create or replace function laundry.owns_partner(target_partner_id text) returns boolean as $$
    select exists (
        select 1 from laundry.partners
        where id = target_partner_id and owner_id = auth.uid()
    );
$$ language sql stable security definer set search_path = laundry, pg_temp;

-- ---------------------------------------------------------------------------
-- Customer-owned rows
-- ---------------------------------------------------------------------------

create policy profiles_select_own on laundry.profiles
    for select to authenticated using (id = auth.uid());
create policy profiles_update_own on laundry.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy addresses_own on laundry.addresses
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy carts_own on laundry.carts
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cart_items_own on laundry.cart_items
    for all to authenticated
    using (exists (select 1 from laundry.carts c where c.id = cart_id and c.user_id = auth.uid()))
    with check (exists (select 1 from laundry.carts c where c.id = cart_id and c.user_id = auth.uid()));

create policy memberships_own on laundry.memberships
    for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Partner-owned rows: world readable, writable only by the partner
-- ---------------------------------------------------------------------------

create policy partners_read on laundry.partners
    for select to anon, authenticated using (true);
create policy partners_write_own on laundry.partners
    for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy partner_hours_read on laundry.partner_hours
    for select to anon, authenticated using (true);
create policy partner_hours_write_own on laundry.partner_hours
    for all to authenticated using (laundry.owns_partner(partner_id))
    with check (laundry.owns_partner(partner_id));

create policy partner_tags_read on laundry.partner_tags
    for select to anon, authenticated using (true);
create policy partner_tags_write_own on laundry.partner_tags
    for all to authenticated using (laundry.owns_partner(partner_id))
    with check (laundry.owns_partner(partner_id));

create policy catalog_categories_read on laundry.catalog_categories
    for select to anon, authenticated using (true);
create policy catalog_categories_write_own on laundry.catalog_categories
    for all to authenticated using (laundry.owns_partner(partner_id))
    with check (laundry.owns_partner(partner_id));

create policy catalog_items_read on laundry.catalog_items
    for select to anon, authenticated using (true);
create policy catalog_items_write_own on laundry.catalog_items
    for all to authenticated
    using (exists (
        select 1 from laundry.catalog_categories c
        where c.id = category_id and laundry.owns_partner(c.partner_id)
    ))
    with check (exists (
        select 1 from laundry.catalog_categories c
        where c.id = category_id and laundry.owns_partner(c.partner_id)
    ));

create policy slots_read on laundry.slots
    for select to anon, authenticated using (true);
create policy slots_write_own on laundry.slots
    for all to authenticated using (laundry.owns_partner(partner_id))
    with check (laundry.owns_partner(partner_id));

-- ---------------------------------------------------------------------------
-- Orders: the customer and the partner fulfilling them
-- ---------------------------------------------------------------------------

create policy orders_read on laundry.orders
    for select to authenticated
    using (user_id = auth.uid() or laundry.owns_partner(partner_id));
-- There is deliberately no direct insert policy. Order placement goes through
-- the narrow place_order security-definer function added by the customer-write
-- migration, which reprices the cart and reserves both slots atomically.
create policy orders_update_partner on laundry.orders
    for update to authenticated using (laundry.owns_partner(partner_id))
    with check (laundry.owns_partner(partner_id));

create policy order_items_read on laundry.order_items
    for select to authenticated
    using (exists (
        select 1 from laundry.orders o
        where o.id = order_id and (o.user_id = auth.uid() or laundry.owns_partner(o.partner_id))
    ));

create policy order_addresses_read on laundry.order_addresses
    for select to authenticated
    using (exists (
        select 1 from laundry.orders o
        where o.id = order_id and (o.user_id = auth.uid() or laundry.owns_partner(o.partner_id))
    ));

create policy order_events_read on laundry.order_events
    for select to authenticated
    using (exists (
        select 1 from laundry.orders o
        where o.id = order_id and (o.user_id = auth.uid() or laundry.owns_partner(o.partner_id))
    ));
create policy order_events_write_partner on laundry.order_events
    for insert to authenticated
    with check (exists (
        select 1 from laundry.orders o
        where o.id = order_id and laundry.owns_partner(o.partner_id)
    ));

-- ---------------------------------------------------------------------------
-- Reviews: publicly readable, written once by the customer who ordered
-- ---------------------------------------------------------------------------

create policy reviews_read on laundry.reviews
    for select to anon, authenticated using (true);
create policy reviews_write_own on laundry.reviews
    for all to authenticated
    using (user_id = auth.uid())
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from laundry.orders o
            where o.id = order_id and o.user_id = auth.uid() and o.status = 'delivered'
        )
    );
