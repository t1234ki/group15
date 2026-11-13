-- Capture the owner-submitted store location and listing photo.
set search_path = laundry, public;

alter table laundry.owner_applications
    add column latitude numeric(9, 6),
    add column longitude numeric(9, 6),
    add column image_path text,
    add constraint owner_applications_coordinate_pair
        check ((latitude is null) = (longitude is null)),
    add constraint owner_applications_coordinate_range
        check (
            latitude is null
            or (latitude between -90 and 90 and longitude between -180 and 180)
        );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'laundry-listing-images',
    'laundry-listing-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy laundry_listing_images_upload_own
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'laundry-listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'owner-listings'
    );

create policy laundry_listing_images_delete_own
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'laundry-listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'owner-listings'
    );

drop function laundry.submit_owner_application(
    text, text, text, text, text, text, text, text, text[]
);

create function laundry.submit_owner_application(
    target_owner_name text,
    target_contact_phone text,
    target_business_name text,
    target_about text,
    target_line1 text,
    target_line2 text,
    target_city text,
    target_pincode text,
    target_services text[],
    target_latitude numeric,
    target_longitude numeric,
    target_image_path text
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
       ]::text[])
       or target_latitude is null
       or target_longitude is null
       or target_latitude not between -90 and 90
       or target_longitude not between -180 and 180
       or target_image_path is null
       or target_image_path !~ (
           '^' || caller_id::text || '/owner-listings/[a-f0-9-]+\.(jpg|png|webp)$'
       )
       or not exists (
           select 1
           from storage.objects
           where bucket_id = 'laundry-listing-images'
             and name = target_image_path
       ) then
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
        line1, line2, city, pincode, services, latitude, longitude,
        image_path, status, rejection_reason, partner_id, reviewed_by, reviewed_at
    ) values (
        caller_id, btrim(target_owner_name), btrim(target_contact_phone),
        btrim(target_business_name), btrim(target_about),
        btrim(target_line1), btrim(target_line2), btrim(target_city),
        target_pincode, target_services, target_latitude, target_longitude,
        target_image_path, 'pending', null, null, null, null
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
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        image_path = excluded.image_path,
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
    text, text, text, text, text, text, text, text, text[], numeric, numeric, text
) from public, anon;
grant execute on function laundry.submit_owner_application(
    text, text, text, text, text, text, text, text, text[], numeric, numeric, text
) to authenticated;

drop function laundry.admin_list_owner_applications();

create function laundry.admin_list_owner_applications()
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
    created_at timestamptz,
    latitude numeric,
    longitude numeric,
    image_path text
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
        application.created_at,
        application.latitude,
        application.longitude,
        application.image_path
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
            latitude, longitude, turnaround_hours, is_open, image_url, image_alt
        ) values (
            application.user_id, application.business_name,
            nullif(application.about, ''), application.line1,
            application.line2, application.city, application.pincode,
            application.latitude, application.longitude, 24, false,
            application.image_path, application.business_name
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
