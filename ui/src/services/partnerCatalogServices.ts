import type {
    PartnerManagedCatalogCategory,
    PartnerManagedCatalogCategoryInput,
    PartnerManagedCatalogItem,
    PartnerManagedCatalogItemInput,
} from '../models/partnerCatalogModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

interface CategoryRow {
    id: string;
    service: PartnerManagedCatalogCategory['service'];
    name: string;
    position: number;
    catalog_items: {
        id: string;
        name: string;
        description: string | null;
        price: number;
        unit: PartnerManagedCatalogItem['unit'];
        icon_key: string;
        is_active: boolean;
        position: number;
    }[];
}

const getCatalog = async (partnerId: string, signal?: AbortSignal) => {
    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    const { data: partner, error: partnerError } = await client
        .from('partners')
        .select('id')
        .eq('id', partnerId)
        .eq('owner_id', userData.user.id)
        .abortSignal(signal ?? new AbortController().signal)
        .maybeSingle();
    if (partnerError) throwSupabaseError(partnerError);
    if (!partner) throw new ApiError('NOT_FOUND', 'That laundry was not found.', 404);

    const { data, error } = await client
        .from('catalog_categories')
        .select(
            'id,service,name,position,catalog_items(id,name,description,price,unit,icon_key,is_active,position)'
        )
        .eq('partner_id', partnerId)
        .order('position')
        .abortSignal(signal ?? new AbortController().signal)
        .returns<CategoryRow[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no catalogue data.');

    return data
        .sort((a, b) => a.position - b.position)
        .map((category): PartnerManagedCatalogCategory => ({
            id: category.id,
            service: category.service,
            name: category.name,
            items: (category.catalog_items ?? [])
                .sort((a, b) => a.position - b.position)
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    price: { amount: item.price, currency: 'GHS' },
                    unit: item.unit,
                    iconKey: item.icon_key,
                    isActive: item.is_active,
                })),
        }));
};

export const getManagedPartnerCatalog = getCatalog;

const refetchCategory = async (partnerId: string, categoryId: string) => {
    const categories = await getCatalog(partnerId);
    const category = categories.find(({ id }) => id === categoryId);
    if (!category) throw new ApiError('NOT_FOUND', 'That catalogue category was not found.', 404);
    return category;
};

const refetchItem = async (partnerId: string, itemId: string) => {
    const categories = await getCatalog(partnerId);
    const item = categories.flatMap(({ items }) => items).find(({ id }) => id === itemId);
    if (!item) throw new ApiError('NOT_FOUND', 'That catalogue item was not found.', 404);
    return item;
};

export const updateManagedCatalogCategory = async (
    partnerId: string,
    categoryId: string,
    name: string
) => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('catalog_categories')
        .update({ name })
        .eq('partner_id', partnerId)
        .eq('id', categoryId)
        .select('id')
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('NOT_FOUND', 'That catalogue category was not found.', 404);
    return refetchCategory(partnerId, categoryId);
};

export const createManagedCatalogCategory = async (
    partnerId: string,
    input: PartnerManagedCatalogCategoryInput
) => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('create_partner_catalog_category', {
        target_partner_id: partnerId,
        target_service: input.service,
        category_name: input.name,
    });
    if (error) throwSupabaseError(error);
    if (typeof data !== 'string')
        throw new ApiError('INTERNAL_ERROR', 'Supabase did not create the catalogue category.');
    return refetchCategory(partnerId, data);
};

export const updateManagedCatalogItem = async (
    partnerId: string,
    itemId: string,
    input: PartnerManagedCatalogItemInput
) => {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('catalog_items')
        .update({
            name: input.name,
            description: input.description,
            price: input.price.amount,
            is_active: input.isActive,
        })
        .eq('id', itemId)
        .select('id')
        .maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('NOT_FOUND', 'That catalogue item was not found.', 404);
    return refetchItem(partnerId, itemId);
};

export const createManagedCatalogItem = async (
    partnerId: string,
    categoryId: string,
    input: PartnerManagedCatalogItemInput
) => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('create_partner_catalog_item', {
        target_partner_id: partnerId,
        target_category_id: categoryId,
        item_name: input.name,
        item_description: input.description,
        item_price: input.price.amount,
        item_is_active: input.isActive,
    });
    if (error) throwSupabaseError(error);
    if (typeof data !== 'string')
        throw new ApiError('INTERNAL_ERROR', 'Supabase did not create the catalogue item.');
    return refetchItem(partnerId, data);
};
