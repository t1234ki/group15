import type { Page } from '../models/apiModels';
import type { CatalogCategory, PriceUnit } from '../models/catalogModels';
import type { Money } from '../models/moneyModels';
import type { OpeningHours, Partner, PartnerDetail } from '../models/partnerModels';
import type { SlotDay } from '../models/slotModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

/**
 * The only place partner data is fetched. Components and hooks call these;
 * nothing else calls `fetch`.
 */
export type PartnerSort = 'rating' | 'price' | 'distance' | 'turnaround';

export interface PartnerQuery {
    latitude?: number | undefined;
    longitude?: number | undefined;
    /** Conjunctive: a partner must offer every service asked for. */
    services?: string[] | undefined;
    tags?: string[] | undefined;
    sort?: PartnerSort | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}

interface PartnerRow {
    id: string;
    name: string;
    about: string | null;
    rating: number | string | null;
    review_count: number;
    line1: string;
    line2: string;
    city: string;
    latitude: number | string | null;
    longitude: number | string | null;
    service_radius_km: number;
    turnaround_hours: number;
    image_url: string | null;
    image_alt: string | null;
    tags: string[];
    services: string[];
    starting_price: number | null;
    starting_unit: string | null;
    is_open: boolean;
}

const isListingImagePath = (value: string) =>
    /^[-0-9a-f]{36}\/owner-listings\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value);

const resolvePartnerImage = (
    client: Awaited<ReturnType<typeof getSupabaseClient>>,
    imageUrl: string | null
) =>
    imageUrl && isListingImagePath(imageUrl)
        ? client.storage.from('laundry-listing-images').getPublicUrl(imageUrl).data.publicUrl
        : imageUrl;

interface PartnerHoursRow {
    weekday: number;
    opens_at: string | null;
    closes_at: string | null;
}

interface CatalogItemRow {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    unit: PriceUnit;
    icon_key: string;
    is_active: boolean;
    position: number;
}

interface CatalogCategoryRow {
    id: string;
    service: string;
    name: string;
    position: number;
    catalog_items: CatalogItemRow[];
}

interface SlotRow {
    id: string;
    starts_at: string;
    ends_at: string;
    state: 'open' | 'full' | 'blocked';
    booked: number;
    capacity: number;
}

const asNumber = (value: number | string | null): number | null =>
    value === null ? null : Number(value);

const haversineMeters = (
    latitude: number,
    longitude: number,
    partnerLatitude: number,
    partnerLongitude: number
) => {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(partnerLatitude - latitude);
    const longitudeDelta = radians(partnerLongitude - longitude);
    const value =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(latitude)) *
            Math.cos(radians(partnerLatitude)) *
            Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(value)));
};

const toPartner = (
    row: PartnerRow,
    distanceMeters: number | null,
    isOpen: boolean,
    client: Awaited<ReturnType<typeof getSupabaseClient>>
): Partner => {
    const startingPrice: (Money & { unit: PriceUnit }) | null =
        row.starting_price === null
            ? null
            : {
                  amount: row.starting_price,
                  currency: 'GHS',
                  unit: (row.starting_unit ?? 'piece') as PriceUnit,
              };
    return {
        id: row.id,
        name: row.name,
        rating: asNumber(row.rating),
        reviewCount: row.review_count,
        address: { line1: row.line1, line2: row.line2, city: row.city },
        latitude: asNumber(row.latitude),
        longitude: asNumber(row.longitude),
        distanceMeters,
        tags: row.tags ?? [],
        services: row.services ?? [],
        turnaroundHours: row.turnaround_hours,
        startingPrice,
        isOpen,
        image: row.image_url
            ? {
                  url: resolvePartnerImage(client, row.image_url) ?? row.image_url,
                  alt: row.image_alt ?? '',
              }
            : null,
    };
};

const readPartner = async (id: string, signal?: AbortSignal) => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('partner_details')
        .select('*')
        .eq('id', id)
        .abortSignal(signal ?? new AbortController().signal)
        .returns<PartnerRow[]>()
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('PARTNER_NOT_FOUND', 'That laundry was not found.', 404);
    return data;
};

const getOpeningHours = async (
    partnerId: string,
    signal?: AbortSignal
): Promise<OpeningHours[]> => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('partner_hours')
        .select('weekday,opens_at,closes_at')
        .eq('partner_id', partnerId)
        .order('weekday')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<PartnerHoursRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no partner hours.');
    return data.map((hour) => ({
        weekday: hour.weekday,
        opensAt: hour.opens_at?.slice(0, 5) ?? null,
        closesAt: hour.closes_at?.slice(0, 5) ?? null,
    }));
};

const isPartnerOpen = async (partnerId: string) => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .rpc('is_partner_open', { target_partner_id: partnerId })
        .returns<boolean>();
    if (error) throwSupabaseError(error);
    return data === true;
};

const cursorScope = (query: PartnerQuery) =>
    JSON.stringify({
        latitude: query.latitude ?? null,
        longitude: query.longitude ?? null,
        services: [...(query.services ?? [])].sort(),
        tags: [...(query.tags ?? [])].sort(),
        sort: query.sort ?? 'rating',
    });

interface ListingCursor {
    key: number;
    id: string;
    scope: string;
}

const decodeCursor = (cursor: string | undefined, scope: string): ListingCursor | null => {
    if (!cursor) return null;
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(escape(atob(cursor))));
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'key' in parsed &&
            typeof parsed.key === 'number' &&
            'id' in parsed &&
            typeof parsed.id === 'string' &&
            'scope' in parsed &&
            parsed.scope === scope
        ) {
            return parsed as ListingCursor;
        }
    } catch {
        // A cursor from another query or an older app version is invalid.
    }
    throw new ApiError('VALIDATION_FAILED', 'That page link is no longer valid.');
};

const encodeCursor = (cursor: ListingCursor) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(cursor))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

export const listPartners = async (
    query: PartnerQuery,
    signal?: AbortSignal
): Promise<Page<Partner>> => {
    const client = await getSupabaseClient();
    let request = client.from('partner_details').select('*');
    if (query.services?.length) request = request.contains('services', query.services);
    if (query.tags?.length) request = request.contains('tags', query.tags);
    const { data, error } = await request
        .order('id')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<PartnerRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no partner listings.');

    const originProvided = query.latitude !== undefined && query.longitude !== undefined;
    const rows = data
        .map((row) => {
            const latitude = asNumber(row.latitude);
            const longitude = asNumber(row.longitude);
            const distance =
                originProvided && latitude !== null && longitude !== null
                    ? haversineMeters(query.latitude!, query.longitude!, latitude, longitude)
                    : null;
            return { row, distance };
        })
        .filter(
            ({ row, distance }) =>
                !originProvided || (distance !== null && distance <= row.service_radius_km * 1000)
        );

    const sort = query.sort ?? 'rating';
    const keyOf = ({ row, distance }: (typeof rows)[number]) =>
        sort === 'distance'
            ? (distance ?? Number.MAX_SAFE_INTEGER)
            : sort === 'price'
              ? (row.starting_price ?? Number.MAX_SAFE_INTEGER)
              : sort === 'turnaround'
                ? row.turnaround_hours
                : -(asNumber(row.rating) ?? 0);
    rows.sort((a, b) => keyOf(a) - keyOf(b) || a.row.id.localeCompare(b.row.id));

    const scope = cursorScope(query);
    const cursor = decodeCursor(query.cursor, scope);
    const afterCursor = cursor
        ? rows.filter(
              (entry) =>
                  keyOf(entry) > cursor.key ||
                  (keyOf(entry) === cursor.key && entry.row.id > cursor.id)
          )
        : rows;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const pageRows = afterCursor.slice(0, limit + 1);
    const hasMore = pageRows.length > limit;
    const visible = hasMore ? pageRows.slice(0, limit) : pageRows;
    const dataPage = await Promise.all(
        visible.map(async ({ row, distance }) =>
            toPartner(row, distance, await isPartnerOpen(row.id), client)
        )
    );
    const last = visible[visible.length - 1];
    return {
        data: dataPage,
        nextCursor:
            hasMore && last ? encodeCursor({ key: keyOf(last), id: last.row.id, scope }) : null,
    };
};

export const getPartner = async (id: string, signal?: AbortSignal): Promise<PartnerDetail> => {
    const [row, openingHours, isOpen, client] = await Promise.all([
        readPartner(id, signal),
        getOpeningHours(id, signal),
        isPartnerOpen(id),
        getSupabaseClient(),
    ]);
    return {
        ...toPartner(row, null, isOpen, client),
        about: row.about,
        openingHours,
    };
};

export const getPartnerCatalog = async (
    id: string,
    signal?: AbortSignal
): Promise<CatalogCategory[]> => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('catalog_categories')
        .select(
            'id,service,name,position,catalog_items(id,name,description,price,currency,unit,icon_key,is_active,position)'
        )
        .eq('partner_id', id)
        .order('position')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<CatalogCategoryRow[]>();
    if (error) throwSupabaseError(error);
    const { data: partner, error: partnerError } = await client
        .from('partners')
        .select('id')
        .eq('id', id)
        .abortSignal(signal ?? new AbortController().signal)
        .maybeSingle();
    if (partnerError) throwSupabaseError(partnerError);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no catalogue data.');
    if (!partner) throw new ApiError('PARTNER_NOT_FOUND', 'That laundry was not found.', 404);

    return data
        .sort((a, b) => a.position - b.position)
        .map((category) => ({
            id: category.id,
            service: category.service as CatalogCategory['service'],
            name: category.name,
            items: (category.catalog_items ?? [])
                .filter((item) => item.is_active)
                .sort((a, b) => a.position - b.position)
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    price: { amount: item.price, currency: 'GHS' },
                    unit: item.unit,
                    iconKey: item.icon_key,
                })),
        }));
};

const dateInAccra = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(date);

export const getPartnerSlots = async (
    id: string,
    days: number,
    signal?: AbortSignal
): Promise<SlotDay[]> => {
    const client = await getSupabaseClient();
    const firstDay = dateInAccra(new Date());
    const from = new Date(`${firstDay}T00:00:00.000Z`);
    const until = new Date(from.getTime() + Math.min(Math.max(days, 1), 14) * 86_400_000);
    const { data, error } = await client
        .from('slots')
        .select('id,starts_at,ends_at,state,booked,capacity')
        .eq('partner_id', id)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', until.toISOString())
        .order('starts_at')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<SlotRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no slot data.');

    const daysByDate = new Map<string, SlotDay>();
    for (const slot of data) {
        const date = dateInAccra(new Date(slot.starts_at));
        const day = daysByDate.get(date) ?? { date, slots: [] };
        day.slots.push({
            id: slot.id,
            startsAt: slot.starts_at,
            endsAt: slot.ends_at,
            available:
                slot.state === 'open' &&
                slot.booked < slot.capacity &&
                new Date(slot.starts_at).getTime() > Date.now(),
        });
        daysByDate.set(date, day);
    }
    return [...daysByDate.values()];
};
