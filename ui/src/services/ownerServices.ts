import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

const LISTING_IMAGE_BUCKET = 'laundry-listing-images';
const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;

export type LaundryService = 'wash-fold' | 'wash-iron' | 'dry-cleaning' | 'premium-care';
export type OwnerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface OwnerApplicationInput {
    ownerName: string;
    contactPhone: string;
    businessName: string;
    about: string;
    line1: string;
    line2: string;
    city: string;
    pincode: string;
    services: LaundryService[];
    latitude: number | null;
    longitude: number | null;
    imagePath: string | null;
}

export interface OwnerApplication extends OwnerApplicationInput {
    id: string;
    userId: string;
    ownerEmail: string;
    status: OwnerApplicationStatus;
    rejectionReason: string | null;
    partnerId: string | null;
    createdAt: string;
    imageUrl: string | null;
}

interface OwnerApplicationRow {
    id: string;
    user_id: string;
    owner_name: string;
    owner_email?: string | null;
    contact_phone: string;
    business_name: string;
    about: string;
    line1: string;
    line2: string;
    city: string;
    pincode: string;
    services: LaundryService[];
    status: OwnerApplicationStatus;
    rejection_reason: string | null;
    partner_id: string | null;
    created_at: string;
    latitude: number | string | null;
    longitude: number | string | null;
    image_path: string | null;
}

const toApplication = (
    row: OwnerApplicationRow,
    ownerEmail = '',
    imageUrl: string | null = null
): OwnerApplication => ({
    id: row.id,
    userId: row.user_id,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email ?? ownerEmail,
    contactPhone: row.contact_phone,
    businessName: row.business_name,
    about: row.about,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    pincode: row.pincode,
    services: row.services,
    status: row.status,
    rejectionReason: row.rejection_reason,
    partnerId: row.partner_id,
    createdAt: row.created_at,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    imagePath: row.image_path,
    imageUrl,
});

const isStoredListingImage = (imagePath: string | null): imagePath is string =>
    imagePath !== null &&
    /^[-0-9a-f]{36}\/owner-listings\/[a-f0-9-]+\.(jpg|png|webp)$/.test(imagePath);

const publicImageUrl = (
    client: Awaited<ReturnType<typeof getSupabaseClient>>,
    imagePath: string | null
) =>
    imagePath && isStoredListingImage(imagePath)
        ? client.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl
        : null;

const isOwnerApplicationRow = (value: unknown): value is OwnerApplicationRow => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return (
        typeof row.id === 'string' &&
        typeof row.user_id === 'string' &&
        typeof row.owner_name === 'string' &&
        (typeof row.owner_email === 'string' || row.owner_email === null) &&
        typeof row.contact_phone === 'string' &&
        typeof row.business_name === 'string' &&
        typeof row.about === 'string' &&
        typeof row.line1 === 'string' &&
        typeof row.line2 === 'string' &&
        typeof row.city === 'string' &&
        typeof row.pincode === 'string' &&
        Array.isArray(row.services) &&
        row.services.every(
            (service): service is LaundryService =>
                service === 'wash-fold' ||
                service === 'wash-iron' ||
                service === 'dry-cleaning' ||
                service === 'premium-care'
        ) &&
        (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected') &&
        (typeof row.rejection_reason === 'string' || row.rejection_reason === null) &&
        (typeof row.partner_id === 'string' || row.partner_id === null) &&
        typeof row.created_at === 'string' &&
        (typeof row.latitude === 'number' ||
            typeof row.latitude === 'string' ||
            row.latitude === null) &&
        (typeof row.longitude === 'number' ||
            typeof row.longitude === 'string' ||
            row.longitude === null) &&
        (typeof row.image_path === 'string' || row.image_path === null)
    );
};

export const isLaundryAdmin = async () => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('is_admin').returns<boolean>();
    if (error) throwSupabaseError(error);
    return data === true;
};

export const getOwnerApplication = async (): Promise<OwnerApplication | null> => {
    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user) throw new Error('Sign in is required to view an owner application.');

    const { data, error } = await client
        .from('owner_applications')
        .select(
            'id,user_id,owner_name,contact_phone,business_name,about,line1,line2,city,pincode,services,status,rejection_reason,partner_id,created_at,latitude,longitude,image_path'
        )
        .eq('user_id', userData.user.id)
        .maybeSingle()
        .returns<OwnerApplicationRow>();
    if (error) throwSupabaseError(error);
    return data
        ? toApplication(data, userData.user.email ?? '', publicImageUrl(client, data.image_path))
        : null;
};

export const submitOwnerApplication = async (
    input: OwnerApplicationInput,
    imageFile: File | null
) => {
    if (input.latitude === null || input.longitude === null)
        throw new Error('Use your location to set the laundry location before applying.');
    if (!imageFile && !input.imagePath)
        throw new Error('Choose a laundry photo before submitting your application.');
    if (imageFile) {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(imageFile.type))
            throw new Error('Choose a JPEG, PNG, or WebP image.');
        if (imageFile.size > MAX_LISTING_IMAGE_BYTES)
            throw new Error('The laundry photo must be 5 MB or smaller.');
    }

    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user) throw new Error('Sign in is required to submit an owner application.');

    const { error: profileError } = await client.rpc('ensure_customer_profile');
    if (profileError) throwSupabaseError(profileError);

    let uploadedPath: string | null = null;
    let imagePath = input.imagePath;
    if (imageFile) {
        const extension: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
        };
        uploadedPath = `${userData.user.id}/owner-listings/${crypto.randomUUID()}.${extension[imageFile.type]}`;
        const { error: uploadError } = await client.storage
            .from(LISTING_IMAGE_BUCKET)
            .upload(uploadedPath, imageFile, {
                cacheControl: '3600',
                contentType: imageFile.type,
                upsert: false,
            });
        if (uploadError) throwSupabaseError(uploadError);
        imagePath = uploadedPath;
    }

    try {
        const { error } = await client.rpc('submit_owner_application', {
            target_owner_name: input.ownerName,
            target_contact_phone: input.contactPhone,
            target_business_name: input.businessName,
            target_about: input.about,
            target_line1: input.line1,
            target_line2: input.line2,
            target_city: input.city,
            target_pincode: input.pincode,
            target_services: input.services,
            target_latitude: input.latitude,
            target_longitude: input.longitude,
            target_image_path: imagePath,
        });
        if (error) throwSupabaseError(error);
    } catch (error) {
        if (uploadedPath) {
            const { error: cleanupError } = await client.storage
                .from(LISTING_IMAGE_BUCKET)
                .remove([uploadedPath]);
            if (cleanupError) {
                throw new Error(
                    `${error instanceof Error ? error.message : 'Application submission failed.'} The uploaded photo could not be removed; please contact support.`
                );
            }
        }
        throw error;
    }
};

export const getOwnerApplications = async (): Promise<OwnerApplication[]> => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('admin_list_owner_applications');
    if (error) throwSupabaseError(error);
    if (!data) throw new Error('The server returned no owner applications.');
    if (!Array.isArray(data)) throw new Error('The server returned invalid owner applications.');
    return data.map((row: unknown) => {
        if (!isOwnerApplicationRow(row))
            throw new Error('The server returned an invalid owner application.');
        return toApplication(row, row.owner_email ?? '', publicImageUrl(client, row.image_path));
    });
};

export const reviewOwnerApplication = async (
    applicationId: string,
    approve: boolean,
    reason?: string
) => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('admin_review_owner_application', {
        target_application_id: applicationId,
        approve,
        reason: reason ?? null,
    });
    if (error) throwSupabaseError(error);
    return data;
};
