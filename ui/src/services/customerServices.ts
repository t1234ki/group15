import type { Order } from '../data/orders';
import type { SavedAddress, User } from '../data/user';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { getSupabaseOrder, getSupabaseOrders } from './supabaseOrderQueries';
import { throwSupabaseError } from './supabaseErrors';

export type Profile = Omit<User, 'addresses'>;

interface ProfileRow {
    id: string;
    full_name: string | null;
    phone: string | null;
    sms_opt_in: boolean;
    email_opt_in: boolean;
    created_at: string;
}

interface AddressRow {
    id: string;
    label: string;
    recipient_name: string;
    phone: string;
    building: string;
    street: string;
    landmark: string | null;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
}

const toProfile = (row: ProfileRow, email: string): Profile => ({
    id: row.id,
    fullName: row.full_name || email.split('@')[0] || 'Customer',
    email,
    phone: row.phone ?? '',
    memberSince: row.created_at,
    preferences: { sms: row.sms_opt_in, email: row.email_opt_in },
});

const toAddress = (row: AddressRow): SavedAddress => ({
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    building: row.building,
    street: row.street,
    landmark: row.landmark ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    isDefault: row.is_default,
});

const addressColumns =
    'id,label,recipient_name,phone,building,street,landmark,latitude,longitude,is_default';

const ensureCustomerProfile = async (
    client: Awaited<ReturnType<typeof getSupabaseClient>>
): Promise<void> => {
    const { error } = await client.rpc('ensure_customer_profile');
    if (error) throwSupabaseError(error);
};

export const getProfile = async (signal?: AbortSignal): Promise<Profile> => {
    const client = await getSupabaseClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throwSupabaseError(authError);
    if (!authData.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    await ensureCustomerProfile(client);

    const { data, error } = await client
        .from('profiles')
        .select('id,full_name,phone,sms_opt_in,email_opt_in,created_at')
        .eq('id', authData.user.id)
        .abortSignal(signal ?? new AbortController().signal)
        .returns<ProfileRow[]>()
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('PROFILE_NOT_FOUND', 'Your profile could not be found.', 404);
    return toProfile(data, authData.user.email ?? '');
};

export const updateProfile = async (
    changes: Partial<Pick<User, 'fullName' | 'phone' | 'preferences'>>
): Promise<Profile> => {
    const client = await getSupabaseClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throwSupabaseError(authError);
    if (!authData.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    await ensureCustomerProfile(client);
    const update: {
        full_name?: string;
        phone?: string;
        sms_opt_in?: boolean;
        email_opt_in?: boolean;
    } = {};
    if (changes.fullName !== undefined) update.full_name = changes.fullName.trim();
    if (changes.phone !== undefined) update.phone = changes.phone.trim();
    if (changes.preferences?.sms !== undefined) update.sms_opt_in = changes.preferences.sms;
    if (changes.preferences?.email !== undefined) update.email_opt_in = changes.preferences.email;

    const { data, error } = await client
        .from('profiles')
        .update(update)
        .eq('id', authData.user.id)
        .select('id,full_name,phone,sms_opt_in,email_opt_in,created_at')
        .returns<ProfileRow[]>()
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('PROFILE_NOT_FOUND', 'Your profile could not be found.', 404);
    return toProfile(data, authData.user.email ?? '');
};

export const getAddresses = async (signal?: AbortSignal): Promise<SavedAddress[]> => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('addresses')
        .select(addressColumns)
        .order('is_default', { ascending: false })
        .order('created_at')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<AddressRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no saved addresses.');
    return data.map(toAddress);
};

const setExistingDefaultFalse = async (client: Awaited<ReturnType<typeof getSupabaseClient>>) => {
    const { error } = await client
        .from('addresses')
        .update({ is_default: false })
        .eq('is_default', true);
    if (error) throwSupabaseError(error);
};

export const createAddress = async (address: Omit<SavedAddress, 'id'>): Promise<SavedAddress> => {
    const client = await getSupabaseClient();
    const { count, error: countError } = await client
        .from('addresses')
        .select('id', { count: 'exact', head: true });
    if (countError) throwSupabaseError(countError);
    const isDefault = address.isDefault === true || count === 0;
    if (isDefault) await setExistingDefaultFalse(client);

    const { data, error } = await client
        .from('addresses')
        .insert({
            label: address.label,
            recipient_name: address.recipientName,
            phone: address.phone,
            building: address.building,
            street: address.street,
            landmark: address.landmark || null,
            latitude: address.latitude,
            longitude: address.longitude,
            is_default: isDefault,
        })
        .select(addressColumns)
        .returns<AddressRow[]>()
        .single();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no saved address.');
    return toAddress(data);
};

export const updateAddress = async (
    id: string,
    changes: Partial<Omit<SavedAddress, 'id'>>
): Promise<SavedAddress> => {
    const client = await getSupabaseClient();
    if (changes.isDefault === true) await setExistingDefaultFalse(client);

    const update: Record<string, string | number | boolean | null> = {};
    if (changes.label !== undefined) update['label'] = changes.label;
    if (changes.recipientName !== undefined) update['recipient_name'] = changes.recipientName;
    if (changes.phone !== undefined) update['phone'] = changes.phone;
    if (changes.building !== undefined) update['building'] = changes.building;
    if (changes.street !== undefined) update['street'] = changes.street;
    if (changes.landmark !== undefined) update['landmark'] = changes.landmark || null;
    if (changes.latitude !== undefined) update['latitude'] = changes.latitude;
    if (changes.longitude !== undefined) update['longitude'] = changes.longitude;
    if (changes.isDefault === true) update['is_default'] = true;

    const { data, error } = await client
        .from('addresses')
        .update(update)
        .eq('id', id)
        .select(addressColumns)
        .returns<AddressRow[]>()
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('ADDRESS_NOT_FOUND', 'That saved address was not found.', 404);
    return toAddress(data);
};

export const deleteAddress = async (id: string): Promise<void> => {
    const client = await getSupabaseClient();
    const { data: address, error: readError } = await client
        .from('addresses')
        .select('id,is_default')
        .eq('id', id)
        .returns<{ id: string; is_default: boolean }[]>()
        .maybeSingle();
    if (readError) throwSupabaseError(readError);
    if (!address) throw new ApiError('ADDRESS_NOT_FOUND', 'That saved address was not found.', 404);
    const { error } = await client.from('addresses').delete().eq('id', id);
    if (error) throwSupabaseError(error);

    if (address.is_default) {
        const { data: next, error: nextError } = await client
            .from('addresses')
            .select('id')
            .order('created_at')
            .limit(1)
            .returns<{ id: string }[]>()
            .maybeSingle();
        if (nextError) throwSupabaseError(nextError);
        if (next) {
            const { error: defaultError } = await client
                .from('addresses')
                .update({ is_default: true })
                .eq('id', next.id);
            if (defaultError) throwSupabaseError(defaultError);
        }
    }
};

export const getOrders = (signal?: AbortSignal) => getSupabaseOrders(signal);

export const getOrder = (id: string, signal?: AbortSignal) => getSupabaseOrder(id, signal);
