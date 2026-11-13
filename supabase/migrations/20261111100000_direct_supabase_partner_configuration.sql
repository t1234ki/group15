set search_path = laundry, public;

create or replace function laundry.save_partner_configuration(
    target_partner_id text,
    target_configuration jsonb
) returns void as $$
declare
    settings record;
begin
    if not laundry.owns_partner(target_partner_id) then
        raise exception using errcode = 'P0001', message = 'PARTNER_NOT_FOUND';
    end if;

    if jsonb_typeof(target_configuration) is distinct from 'object' then
        raise exception using errcode = 'P0001', message = 'PARTNER_CONFIGURATION_INVALID';
    end if;

    select *
    into settings
    from jsonb_to_record(target_configuration) as input(
        name text,
        about text,
        "line1" text,
        "line2" text,
        city text,
        latitude numeric,
        longitude numeric,
        "serviceRadiusKm" integer,
        "turnaroundHours" integer,
        "acceptingOrders" boolean,
        "useOpeningHours" boolean
    );

    if settings.name is null
       or settings.about is null
       or settings.line1 is null
       or settings.line2 is null
       or settings.city is null
       or settings.latitude is null
       or settings.longitude is null
       or settings."serviceRadiusKm" is null
       or settings."turnaroundHours" is null
       or settings."acceptingOrders" is null
       or settings."useOpeningHours" is null then
        raise exception using errcode = 'P0001', message = 'PARTNER_CONFIGURATION_INVALID';
    end if;

    update laundry.partners
    set name = btrim(settings.name),
        about = nullif(btrim(settings.about), ''),
        line1 = btrim(settings.line1),
        line2 = btrim(settings.line2),
        city = btrim(settings.city),
        latitude = settings.latitude,
        longitude = settings.longitude,
        service_radius_km = settings."serviceRadiusKm",
        turnaround_hours = settings."turnaroundHours",
        is_open = settings."acceptingOrders",
        auto_schedule = settings."useOpeningHours"
    where id = target_partner_id
      and owner_id = auth.uid();

    if not found then
        raise exception using errcode = 'P0001', message = 'PARTNER_NOT_FOUND';
    end if;

    perform laundry.replace_partner_hours(
        target_partner_id,
        target_configuration -> 'openingHours'
    );
    perform laundry.replace_partner_holiday_closures(
        target_partner_id,
        target_configuration -> 'holidayClosures'
    );
    perform laundry.replace_partner_capacity_overrides(
        target_partner_id,
        target_configuration -> 'capacityOverrides'
    );
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.save_partner_configuration(text, jsonb) from public, anon;
grant execute on function laundry.save_partner_configuration(text, jsonb) to authenticated;
