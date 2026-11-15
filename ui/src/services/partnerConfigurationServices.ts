import type {
    PartnerLaundryConfiguration,
    PartnerLaundryConfigurationInput,
} from '../models/partnerConfigurationModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

const LISTING_IMAGE_BUCKET = 'laundry-listing-images';
const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
const isStoredListingImage = (value: string): boolean =>
    /^[-0-9a-f]{36}\/owner-listings\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value);

interface ConfigurationRow {
    id: string;
    name: string;
    about: string | null;
    line1: string;
    line2: string;
    city: string;
    latitude: number | string | null;
    longitude: number | string | null;
    service_radius_km: number;
    turnaround_hours: number;
    is_open: boolean;
    auto_schedule: boolean;
    image_url: string | null;
}

interface HoursRow {
    weekday: number;
    opens_at: string | null;
    closes_at: string | null;
}

interface ClosureRow {
    closure_date: string;
    reason: string | null;
}

interface CapacityRow {
    capacity_date: string;
    capacity: number;
    note: string | null;
}

const readConfiguration = async (
    partner: ConfigurationRow
): Promise<PartnerLaundryConfiguration> => {
    const client = await getSupabaseClient();
    const [hoursResult, closuresResult, capacitiesResult, openResult] = await Promise.all([
        client
            .from('partner_hours')
            .select('weekday,opens_at,closes_at')
            .eq('partner_id', partner.id)
            .order('weekday')
            .returns<HoursRow[]>(),
        client
            .from('partner_holiday_closures')
            .select('closure_date,reason')
            .eq('partner_id', partner.id)
            .gte('closure_date', new Date().toISOString().slice(0, 10))
            .order('closure_date')
            .returns<ClosureRow[]>(),
        client
            .from('partner_capacity_overrides')
            .select('capacity_date,capacity,note')
            .eq('partner_id', partner.id)
            .gte('capacity_date', new Date().toISOString().slice(0, 10))
            .order('capacity_date')
            .returns<CapacityRow[]>(),
        client.rpc('is_partner_open', { target_partner_id: partner.id }).returns<boolean>(),
    ]);
    if (hoursResult.error) throwSupabaseError(hoursResult.error);
    if (closuresResult.error) throwSupabaseError(closuresResult.error);
    if (capacitiesResult.error) throwSupabaseError(capacitiesResult.error);
    if (openResult.error) throwSupabaseError(openResult.error);
    if (!hoursResult.data || !closuresResult.data || !capacitiesResult.data)
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned incomplete laundry settings.');

    return {
        id: partner.id,
        name: partner.name,
        about: partner.about ?? '',
        imageUrl:
            partner.image_url && isStoredListingImage(partner.image_url)
                ? client.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(partner.image_url).data
                      .publicUrl
                : partner.image_url,
        address: { line1: partner.line1, line2: partner.line2, city: partner.city },
        latitude: partner.latitude === null ? null : Number(partner.latitude),
        longitude: partner.longitude === null ? null : Number(partner.longitude),
        serviceRadiusKm: partner.service_radius_km,
        holidayClosures: closuresResult.data.map((closure) => ({
            date: closure.closure_date,
            reason: closure.reason ?? '',
        })),
        capacityOverrides: capacitiesResult.data.map((capacity) => ({
            date: capacity.capacity_date,
            capacity: capacity.capacity,
            note: capacity.note ?? '',
        })),
        turnaroundHours: partner.turnaround_hours,
        acceptingOrders: partner.is_open,
        useOpeningHours: partner.auto_schedule,
        currentlyOpen: openResult.data === true,
        openingHours: hoursResult.data.map((hour) => ({
            weekday: hour.weekday,
            opensAt: hour.opens_at?.slice(0, 5) ?? null,
            closesAt: hour.closes_at?.slice(0, 5) ?? null,
        })),
    };
};

const partnerColumns =
    'id,name,about,line1,line2,city,latitude,longitude,service_radius_km,turnaround_hours,is_open,auto_schedule,image_url';

export const getPartnerLaundries = async (signal?: AbortSignal) => {
    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    const { data, error } = await client
        .from('partners')
        .select(partnerColumns)
        .eq('owner_id', userData.user.id)
        .order('name')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<ConfigurationRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no laundry settings.');
    if (data.length === 0)
        throw new ApiError('FORBIDDEN', 'A laundry-owner account is required.', 403);
    return Promise.all(data.map(readConfiguration));
};

export const updatePartnerLaundry = async (
    partnerId: string,
    input: PartnerLaundryConfigurationInput
) => {
    const client = await getSupabaseClient();
    const { error } = await client.rpc('save_partner_configuration', {
        target_partner_id: partnerId,
        target_configuration: {
            name: input.name,
            about: input.about,
            line1: input.address.line1,
            line2: input.address.line2,
            city: input.address.city,
            latitude: input.latitude,
            longitude: input.longitude,
            serviceRadiusKm: input.serviceRadiusKm,
            turnaroundHours: input.turnaroundHours,
            acceptingOrders: input.acceptingOrders,
            useOpeningHours: input.useOpeningHours,
            openingHours: input.openingHours,
            holidayClosures: input.holidayClosures,
            capacityOverrides: input.capacityOverrides,
        },
    });
    if (error) {
        if (error.message === 'PARTNER_CAPACITY_BELOW_BOOKED') {
            throw new ApiError(
                'CAPACITY_BELOW_BOOKED',
                'Capacity cannot be lower than the orders already booked for that date.'
            );
        }
        throwSupabaseError(error);
    }

    const { data, error: readError } = await client
        .from('partners')
        .select(partnerColumns)
        .eq('id', partnerId)
        .maybeSingle()
        .returns<ConfigurationRow>();
    if (readError) throwSupabaseError(readError);
    if (!data) throw new ApiError('NOT_FOUND', 'That laundry was not found.', 404);
    return readConfiguration(data);
};

export const updatePartnerListingImage = async (
    partnerId: string,
    imageFile: File
): Promise<{ imageUrl: string; cleanupWarning: string | null }> => {
    const extension: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    if (!(imageFile.type in extension)) throw new Error('Choose a JPEG, PNG, or WebP image.');
    if (imageFile.size > MAX_LISTING_IMAGE_BYTES)
        throw new Error('The laundry photo must be 5 MB or smaller.');

    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);

    const imagePath = `${userData.user.id}/owner-listings/${crypto.randomUUID()}.${extension[imageFile.type]}`;
    const { error: uploadError } = await client.storage
        .from(LISTING_IMAGE_BUCKET)
        .upload(imagePath, imageFile, {
            cacheControl: '3600',
            contentType: imageFile.type,
            upsert: false,
        });
    if (uploadError) throwSupabaseError(uploadError);

    let previousPath: string | null;
    try {
        const { data, error } = await client.rpc('update_partner_listing_image', {
            target_partner_id: partnerId,
            target_image_path: imagePath,
        });
        if (error) throwSupabaseError(error);
        if (data !== null && typeof data !== 'string')
            throw new ApiError('INTERNAL_ERROR', 'Supabase returned an invalid image update.');
        previousPath = data;
    } catch (error) {
        const { error: cleanupError } = await client.storage
            .from(LISTING_IMAGE_BUCKET)
            .remove([imagePath]);
        if (cleanupError) {
            throw new Error(
                `${error instanceof Error ? error.message : 'The laundry photo could not be saved.'} The uploaded photo could not be removed; please contact support.`
            );
        }
        throw error;
    }

    let cleanupWarning: string | null = null;
    if (previousPath && isStoredListingImage(previousPath)) {
        const { error } = await client.storage.from(LISTING_IMAGE_BUCKET).remove([previousPath]);
        if (error)
            cleanupWarning =
                'The new photo was saved, but the previous photo could not be removed.';
    }

    return {
        imageUrl: client.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl,
        cleanupWarning,
    };
};
