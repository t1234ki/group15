set search_path = laundry, public;

create function laundry.update_partner_listing_image(
    target_partner_id text,
    target_image_path text
) returns text as $$
declare
    caller_id uuid := auth.uid();
    previous_image_path text;
begin
    if caller_id is null then
        raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
    end if;

    if target_image_path is null
       or target_image_path !~ (
           '^' || caller_id::text || '/owner-listings/[a-f0-9-]+\.(jpg|png|webp)$'
       )
       or not exists (
           select 1
           from storage.objects
           where bucket_id = 'laundry-listing-images'
             and name = target_image_path
       ) then
        raise exception using errcode = 'P0001', message = 'PARTNER_IMAGE_INVALID';
    end if;

    select partner.image_url
    into previous_image_path
    from laundry.partners partner
    where partner.id = target_partner_id
      and partner.owner_id = caller_id
    for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'PARTNER_NOT_FOUND';
    end if;

    update laundry.partners
    set image_url = target_image_path,
        image_alt = name
    where id = target_partner_id
      and owner_id = caller_id;

    return previous_image_path;
end;
$$ language plpgsql volatile security definer set search_path = laundry, storage, pg_temp;

revoke all on function laundry.update_partner_listing_image(text, text) from public, anon;
grant execute on function laundry.update_partner_listing_image(text, text) to authenticated;
