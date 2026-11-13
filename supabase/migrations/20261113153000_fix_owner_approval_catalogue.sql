set search_path = laundry, public;

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
            service_names.name,
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
