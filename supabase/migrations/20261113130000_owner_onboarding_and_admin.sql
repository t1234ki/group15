set search_path = laundry, public;

create table laundry.admin_users (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table laundry.admin_users enable row level security;

create table laundry.owner_applications (
    id text primary key default laundry.prefixed_id('app'),
    user_id uuid not null unique references laundry.profiles (id) on delete cascade,
    owner_name text not null check (length(btrim(owner_name)) between 1 and 120),
    contact_phone text not null check (length(btrim(contact_phone)) between 7 and 32),
    business_name text not null check (length(btrim(business_name)) between 1 and 120),
    about text not null default '' check (length(about) <= 1000),
    line1 text not null check (length(btrim(line1)) between 1 and 160),
    line2 text not null default '' check (length(line2) <= 160),
    city text not null check (length(btrim(city)) between 1 and 80),
    pincode text not null check (pincode ~ '^[0-9]{6}$'),
    services text[] not null check (
        cardinality(services) > 0
        and services <@ array['wash-fold', 'wash-iron', 'dry-cleaning', 'premium-care']::text[]
    ),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    rejection_reason text,
    partner_id text references laundry.partners (id) on delete set null,
    reviewed_by uuid references auth.users (id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger owner_applications_touch before update on laundry.owner_applications
    for each row execute function laundry.touch_updated_at();

alter table laundry.owner_applications enable row level security;
grant select on laundry.owner_applications to authenticated;

create policy owner_applications_read_own on laundry.owner_applications
    for select to authenticated using (user_id = auth.uid());

create or replace function laundry.is_admin() returns boolean as $$
    select exists (
        select 1
        from laundry.admin_users
        where user_id = auth.uid()
    );
$$ language sql stable security definer set search_path = laundry, pg_temp;

revoke all on function laundry.is_admin() from public, anon;
grant execute on function laundry.is_admin() to authenticated;

create or replace function laundry.submit_owner_application(
    target_owner_name text,
    target_contact_phone text,
    target_business_name text,
    target_about text,
    target_line1 text,
    target_line2 text,
    target_city text,
    target_pincode text,
    target_services text[]
) returns text as $$
declare
    caller_id uuid := auth.uid();
    existing_status text;
    application_id text;
begin
    if caller_id is null then
        raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
    end if;

    if target_owner_name is null or length(btrim(target_owner_name)) not between 1 and 120
       or target_contact_phone is null or length(btrim(target_contact_phone)) not between 7 and 32
       or target_business_name is null or length(btrim(target_business_name)) not between 1 and 120
       or target_about is null or length(target_about) > 1000
       or target_line1 is null or length(btrim(target_line1)) not between 1 and 160
       or target_line2 is null or length(target_line2) > 160
       or target_city is null or length(btrim(target_city)) not between 1 and 80
       or target_pincode is null or target_pincode !~ '^[0-9]{6}$'
       or target_services is null
       or cardinality(target_services) = 0
       or not (target_services <@ array[
           'wash-fold', 'wash-iron', 'dry-cleaning', 'premium-care'
       ]::text[]) then
        raise exception using errcode = 'P0001', message = 'OWNER_APPLICATION_INVALID';
    end if;

    select status
    into existing_status
    from laundry.owner_applications
    where user_id = caller_id
    for update;

    if existing_status in ('pending', 'approved') then
        raise exception using errcode = 'P0001', message = 'OWNER_APPLICATION_EXISTS';
    end if;

    insert into laundry.owner_applications (
        user_id, owner_name, contact_phone, business_name, about,
        line1, line2, city, pincode, services, status,
        rejection_reason, partner_id, reviewed_by, reviewed_at
    ) values (
        caller_id, btrim(target_owner_name), btrim(target_contact_phone),
        btrim(target_business_name), btrim(target_about),
        btrim(target_line1), btrim(target_line2), btrim(target_city),
        target_pincode, target_services, 'pending',
        null, null, null, null
    )
    on conflict (user_id) do update
    set owner_name = excluded.owner_name,
        contact_phone = excluded.contact_phone,
        business_name = excluded.business_name,
        about = excluded.about,
        line1 = excluded.line1,
        line2 = excluded.line2,
        city = excluded.city,
        pincode = excluded.pincode,
        services = excluded.services,
        status = 'pending',
        rejection_reason = null,
        partner_id = null,
        reviewed_by = null,
        reviewed_at = null
    returning id into application_id;

    return application_id;
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.submit_owner_application(
    text, text, text, text, text, text, text, text, text[]
) from public, anon;
grant execute on function laundry.submit_owner_application(
    text, text, text, text, text, text, text, text, text[]
) to authenticated;

create or replace function laundry.admin_list_owner_applications()
returns table (
    id text,
    user_id uuid,
    owner_name text,
    owner_email text,
    contact_phone text,
    business_name text,
    about text,
    line1 text,
    line2 text,
    city text,
    pincode text,
    services text[],
    status text,
    rejection_reason text,
    partner_id text,
    created_at timestamptz
) as $$
begin
    if not laundry.is_admin() then
        raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_REQUIRED';
    end if;

    return query
    select
        application.id,
        application.user_id,
        application.owner_name,
        users.email::text,
        application.contact_phone,
        application.business_name,
        application.about,
        application.line1,
        application.line2,
        application.city,
        application.pincode,
        application.services,
        application.status,
        application.rejection_reason,
        application.partner_id,
        application.created_at
    from laundry.owner_applications application
    join auth.users users on users.id = application.user_id
    order by
        case application.status when 'pending' then 0 when 'rejected' then 1 else 2 end,
        application.created_at;
end;
$$ language plpgsql stable security definer set search_path = laundry, auth, pg_temp;

revoke all on function laundry.admin_list_owner_applications() from public, anon;
grant execute on function laundry.admin_list_owner_applications() to authenticated;

create or replace function laundry.admin_review_owner_application(
    target_application_id text,
    approve boolean,
    reason text default null
) returns text as $$
declare
    application laundry.owner_applications%rowtype;
    new_partner_id text;
begin
    if not laundry.is_admin() then
        raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_REQUIRED';
    end if;

    select *
    into application
    from laundry.owner_applications
    where id = target_application_id
    for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'OWNER_APPLICATION_NOT_FOUND';
    end if;
    if application.status <> 'pending' then
        raise exception using errcode = 'P0001', message = 'OWNER_APPLICATION_NOT_PENDING';
    end if;

    if approve then
        insert into laundry.partners (
            owner_id, name, about, line1, line2, city, pincode,
            latitude, longitude, turnaround_hours, is_open
        ) values (
            application.user_id, application.business_name,
            nullif(application.about, ''), application.line1,
            application.line2, application.city, application.pincode,
            null, null, 24, false
        )
        returning id into new_partner_id;

        insert into laundry.partner_hours (partner_id, weekday, opens_at, closes_at)
        select new_partner_id, weekday::smallint, null, null
        from generate_series(0, 6) as weekday;

        insert into laundry.catalog_categories (partner_id, service, name, position)
        select
            new_partner_id,
            selected.service,
            selected.name,
            selected.position
        from unnest(application.services) with ordinality
            as selected(service, position)
        join (values
            ('wash-fold', 'Wash & Fold'),
            ('wash-iron', 'Wash & Iron'),
            ('dry-cleaning', 'Dry Cleaning'),
            ('premium-care', 'Premium Care')
        ) as service_names(service, name)
            on service_names.service = selected.service;

        update laundry.owner_applications
        set status = 'approved',
            rejection_reason = null,
            partner_id = new_partner_id,
            reviewed_by = auth.uid(),
            reviewed_at = now()
        where id = application.id;
        return new_partner_id;
    end if;

    if reason is null or length(btrim(reason)) not between 1 and 500 then
        raise exception using errcode = 'P0001', message = 'OWNER_REJECTION_REASON_REQUIRED';
    end if;

    update laundry.owner_applications
    set status = 'rejected',
        rejection_reason = btrim(reason),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = application.id;

    return null;
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.admin_review_owner_application(text, boolean, text)
    from public, anon;
grant execute on function laundry.admin_review_owner_application(text, boolean, text)
    to authenticated;
