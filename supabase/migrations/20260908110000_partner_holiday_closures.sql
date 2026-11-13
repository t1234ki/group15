set search_path = laundry, public;

-- Owner-managed exceptional closure dates. Weekly hours remain the default;
-- these rows override individual local calendar days in Africa/Accra.

create table laundry.partner_holiday_closures (
    partner_id text not null references laundry.partners(id) on delete cascade,
    closure_date date not null,
    reason text,
    primary key (partner_id, closure_date),
    constraint partner_holiday_closures_reason_length
        check (reason is null or length(reason) <= 120)
);

create index partner_holiday_closures_date_idx
    on laundry.partner_holiday_closures (closure_date, partner_id);

grant select on laundry.partner_holiday_closures to authenticated;
revoke insert, update, delete, truncate, references, trigger
    on laundry.partner_holiday_closures from anon, authenticated;

alter table laundry.partner_holiday_closures enable row level security;

create policy partner_holiday_closures_read_own on laundry.partner_holiday_closures
    for select to authenticated using (laundry.owns_partner(partner_id));

-- Slot generation now skips explicit closures. Keeping the function signature
-- unchanged means scheduled rollover and weekly-hours regeneration inherit the
-- rule without another caller-side decision.
create or replace function laundry.generate_slots(
    target_partner_id text,
    from_date date,
    days integer default 7,
    slot_hours integer default 2,
    slot_capacity integer default 8
) returns integer as $$
declare
    zone constant text := 'Africa/Accra';
    day_offset integer;
    day_date date;
    opens time;
    closes time;
    cursor_ts timestamptz;
    day_end timestamptz;
    inserted integer;
    created integer := 0;
begin
    if days < 1 or days > 31 then
        raise exception using errcode = '22023', message = 'days must be between 1 and 31';
    end if;
    if slot_hours < 1 or slot_hours > 24 then
        raise exception using errcode = '22023', message = 'slot_hours must be between 1 and 24';
    end if;
    if slot_capacity < 1 then
        raise exception using errcode = '22023', message = 'slot_capacity must be positive';
    end if;

    for day_offset in 0..(days - 1) loop
        day_date := from_date + day_offset;

        continue when exists (
            select 1
            from laundry.partner_holiday_closures closure
            where closure.partner_id = target_partner_id
              and closure.closure_date = day_date
        );

        select h.opens_at, h.closes_at into opens, closes
        from laundry.partner_hours h
        where h.partner_id = target_partner_id
          and h.weekday = extract(dow from day_date)::smallint;

        continue when not found or opens is null;

        cursor_ts := timezone(zone, (day_date + opens)::timestamp);
        day_end := timezone(zone, (day_date + closes)::timestamp);

        while cursor_ts + make_interval(hours => slot_hours) <= day_end loop
            insert into laundry.slots (partner_id, starts_at, ends_at, capacity)
            values (
                target_partner_id,
                cursor_ts,
                cursor_ts + make_interval(hours => slot_hours),
                slot_capacity
            )
            on conflict (partner_id, starts_at) do nothing;

            get diagnostics inserted = row_count;
            created := created + inserted;
            cursor_ts := cursor_ts + make_interval(hours => slot_hours);
        end loop;
    end loop;

    return created;
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke execute on function laundry.generate_slots(text, date, integer, integer, integer)
    from public, anon, authenticated;
grant execute on function laundry.generate_slots(text, date, integer, integer, integer)
    to service_role;

-- A holiday closes the public listing for that local day even when the owner
-- normally uses the manual master switch instead of weekly auto-scheduling.
create or replace function laundry.is_partner_open(target_partner_id text) returns boolean as $$
declare
    zone constant text := 'Africa/Accra';
    local_now timestamp;
    partner record;
    hours record;
begin
    select is_open, auto_schedule into partner
    from laundry.partners
    where id = target_partner_id;

    if not found or not partner.is_open then
        return false;
    end if;

    local_now := timezone(zone, now());
    if exists (
        select 1
        from laundry.partner_holiday_closures closure
        where closure.partner_id = target_partner_id
          and closure.closure_date = local_now::date
    ) then
        return false;
    end if;

    if not partner.auto_schedule then
        return true;
    end if;

    select opens_at, closes_at into hours
    from laundry.partner_hours
    where partner_id = target_partner_id
      and weekday = extract(dow from local_now)::smallint;

    if not found or hours.opens_at is null then
        return false;
    end if;

    return local_now::time >= hours.opens_at
       and local_now::time < hours.closes_at;
end;
$$ language plpgsql stable security definer set search_path = laundry, pg_temp;

revoke all on function laundry.is_partner_open(text) from public;
grant execute on function laundry.is_partner_open(text) to anon, authenticated;

create or replace function laundry.replace_partner_holiday_closures(
    target_partner_id text,
    closures jsonb
) returns void as $$
declare
    zone constant text := 'Africa/Accra';
    local_today date := timezone(zone, now())::date;
    closures_valid boolean;
begin
    perform 1
    from laundry.partners partner
    where partner.id = target_partner_id
      and partner.owner_id = auth.uid()
    for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'PARTNER_NOT_FOUND';
    end if;

    if jsonb_typeof(closures) is distinct from 'array' then
        raise exception using errcode = 'P0001', message = 'PARTNER_CLOSURES_INVALID';
    end if;

    select
        count(*) <= 60
        and count(*) = count(distinct entry.closure_date)
        and coalesce(bool_and(entry.closure_date >= local_today), true)
        and coalesce(bool_and(length(entry.reason) <= 120), true)
    into closures_valid
    from (
        select
            value."date"::date as closure_date,
            btrim(coalesce(value.reason, '')) as reason
        from jsonb_to_recordset(closures) as value("date" text, reason text)
    ) entry;

    if closures_valid is not true then
        raise exception using errcode = 'P0001', message = 'PARTNER_CLOSURES_INVALID';
    end if;

    -- Historical rows remain available for operational records. Saving the
    -- settings replaces only today and future closure dates.
    delete from laundry.partner_holiday_closures
    where partner_id = target_partner_id
      and closure_date >= local_today;

    insert into laundry.partner_holiday_closures (partner_id, closure_date, reason)
    select
        target_partner_id,
        entry."date"::date,
        nullif(btrim(entry.reason), '')
    from jsonb_to_recordset(closures) as entry("date" text, reason text);

    -- Existing reservations retain their slot references but cannot accept
    -- more bookings. Unreserved availability disappears immediately.
    delete from laundry.slots slot
    using laundry.partner_holiday_closures closure
    where closure.partner_id = target_partner_id
      and slot.partner_id = closure.partner_id
      and timezone(zone, slot.starts_at)::date = closure.closure_date
      and slot.starts_at > now()
      and slot.booked = 0;

    update laundry.slots slot
    set state = 'blocked'
    from laundry.partner_holiday_closures closure
    where closure.partner_id = target_partner_id
      and slot.partner_id = closure.partner_id
      and timezone(zone, slot.starts_at)::date = closure.closure_date
      and slot.starts_at > now()
      and slot.booked > 0;

    -- Reopening a date refills any safe missing windows. `generate_slots`
    -- continues to skip every closure that remains in the replacement set.
    perform laundry.generate_slots(target_partner_id, local_today, 14);
end;
$$ language plpgsql volatile security definer set search_path = laundry, pg_temp;

revoke all on function laundry.replace_partner_holiday_closures(text, jsonb) from public;
grant execute on function laundry.replace_partner_holiday_closures(text, jsonb) to authenticated;
