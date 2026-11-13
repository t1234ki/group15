import type { PriceUnit } from '../models/catalogModels';
import type { Money } from '../models/moneyModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

export interface ServerCartLine {
    itemId: string;
    name: string;
    description: string | null;
    categoryName: string;
    iconKey: string;
    quantity: number;
    unit: PriceUnit;
    unitPrice: Money;
    lineTotal: Money;
}

export interface ServerCart {
    id: string | null;
    partner: { id: string; name: string } | null;
    items: ServerCartLine[];
    membership: { plan: 'plus'; price: Money; period: 'month' } | null;
    totals: {
        subtotal: Money;
        delivery: Money;
        membership: Money;
        discount: Money;
        tax: Money;
        total: Money;
    };
}

const PLUS_PRICE = 9_900;
const TAX_PERCENT = 18;

interface CartRow {
    id: string;
    partner_id: string | null;
    has_plus: boolean;
}

interface CartItemRow {
    item_id: string;
    quantity: number;
    catalog_items: {
        id: string;
        name: string;
        description: string | null;
        price: number;
        currency: string;
        unit: PriceUnit;
        icon_key: string;
        is_active: boolean;
        catalog_categories: { name: string } | null;
    } | null;
}

const currentUser = async () => {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error) throwSupabaseError(error);
    if (!data.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    return { client, userId: data.user.id };
};

const money = (amount: number): Money => ({ amount, currency: 'GHS' });

const readCart = async (
    client: Awaited<ReturnType<typeof getSupabaseClient>>,
    userId: string
): Promise<ServerCart> => {
    const { data: cart, error: cartError } = await client
        .from('carts')
        .select('id,partner_id,has_plus')
        .eq('user_id', userId)
        .returns<CartRow[]>()
        .maybeSingle();
    if (cartError) throwSupabaseError(cartError);
    if (!cart) {
        const zero = money(0);
        return {
            id: null,
            partner: null,
            items: [],
            membership: null,
            totals: {
                subtotal: zero,
                delivery: zero,
                membership: zero,
                discount: zero,
                tax: zero,
                total: zero,
            },
        };
    }

    const [
        { data: partner, error: partnerError },
        { data: cartItems, error: itemsError },
        { data: membership, error: membershipError },
    ] = await Promise.all([
        cart.partner_id
            ? client
                  .from('partners')
                  .select('id,name')
                  .eq('id', cart.partner_id)
                  .returns<{ id: string; name: string }[]>()
                  .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        client
            .from('cart_items')
            .select(
                'item_id,quantity,catalog_items!inner(id,name,description,price,currency,unit,icon_key,is_active,catalog_categories!inner(name))'
            )
            .eq('cart_id', cart.id)
            .order('item_id')
            .returns<CartItemRow[]>(),
        client
            .from('memberships')
            .select('is_active,renews_at')
            .eq('user_id', userId)
            .returns<{ is_active: boolean; renews_at: string }[]>()
            .maybeSingle(),
    ]);
    if (partnerError) throwSupabaseError(partnerError);
    if (itemsError) throwSupabaseError(itemsError);
    if (membershipError) throwSupabaseError(membershipError);
    if (!cartItems) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no cart items.');

    const activeMember =
        membership?.is_active === true && new Date(membership.renews_at).getTime() > Date.now();
    const lines = cartItems
        .filter((line) => line.catalog_items?.is_active)
        .map((line): ServerCartLine => {
            const item = line.catalog_items!;
            return {
                itemId: line.item_id,
                name: item.name,
                description: item.description,
                categoryName: item.catalog_categories?.name ?? '',
                iconKey: item.icon_key,
                quantity: line.quantity,
                unit: item.unit,
                unitPrice: money(item.price),
                lineTotal: money(item.price * line.quantity),
            };
        });
    const subtotalAmount = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
    const membershipAmount = cart.has_plus && !activeMember ? PLUS_PRICE : 0;
    const discountAmount = cart.has_plus || activeMember ? Math.floor(subtotalAmount * 0.1) : 0;
    const taxAmount = Math.round(
        ((subtotalAmount + membershipAmount - discountAmount) * TAX_PERCENT) / 100
    );
    return {
        id: cart.id,
        partner: partner ? { id: partner.id, name: partner.name } : null,
        items: lines,
        membership: cart.has_plus
            ? { plan: 'plus', price: money(membershipAmount), period: 'month' }
            : null,
        totals: {
            subtotal: money(subtotalAmount),
            delivery: money(0),
            membership: money(membershipAmount),
            discount: money(discountAmount),
            tax: money(taxAmount),
            total: money(subtotalAmount + membershipAmount - discountAmount + taxAmount),
        },
    };
};

export const getCart = async () => {
    const { client, userId } = await currentUser();
    return readCart(client, userId);
};

export const setCartItem = async (itemId: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
        throw new ApiError('VALIDATION_FAILED', 'Quantity must be between 0 and 99.');
    }
    const { client, userId } = await currentUser();
    const { data: cart, error: cartError } = await client
        .from('carts')
        .select('id,partner_id')
        .eq('user_id', userId)
        .returns<{ id: string; partner_id: string | null }[]>()
        .maybeSingle();
    if (cartError) throwSupabaseError(cartError);

    if (quantity === 0) {
        if (cart) {
            const { error } = await client
                .from('cart_items')
                .delete()
                .eq('cart_id', cart.id)
                .eq('item_id', itemId);
            if (error) throwSupabaseError(error);
            const { count, error: countError } = await client
                .from('cart_items')
                .select('item_id', { count: 'exact', head: true })
                .eq('cart_id', cart.id);
            if (countError) throwSupabaseError(countError);
            if (count === 0) {
                const { error: updateError } = await client
                    .from('carts')
                    .update({ partner_id: null })
                    .eq('id', cart.id);
                if (updateError) throwSupabaseError(updateError);
            }
        }
        return readCart(client, userId);
    }

    const { data: item, error: itemError } = await client
        .from('catalog_items')
        .select('id,catalog_categories!inner(partner_id)')
        .eq('id', itemId)
        .eq('is_active', true)
        .returns<{ id: string; catalog_categories: { partner_id: string } }[]>()
        .maybeSingle();
    if (itemError) throwSupabaseError(itemError);
    if (!item) throw new ApiError('NOT_FOUND', 'That catalogue item was not found.', 404);
    const partnerId = item.catalog_categories.partner_id;
    if (cart?.partner_id && cart.partner_id !== partnerId) {
        throw new ApiError(
            'CART_PARTNER_CONFLICT',
            'Your cart contains items from another laundry.'
        );
    }

    let cartId = cart?.id;
    if (!cartId) {
        const { data: created, error: createError } = await client
            .from('carts')
            .insert({ user_id: userId, partner_id: partnerId })
            .select('id')
            .single()
            .returns<{ id: string }>();
        if (createError) throwSupabaseError(createError);
        if (!created) throw new ApiError('INTERNAL_ERROR', 'Supabase did not create a cart.');
        cartId = created.id;
    } else if (cart && !cart.partner_id) {
        const { error: updateError } = await client
            .from('carts')
            .update({ partner_id: partnerId })
            .eq('id', cartId);
        if (updateError) throwSupabaseError(updateError);
    }
    const { error: itemWriteError } = await client
        .from('cart_items')
        .upsert({ cart_id: cartId, item_id: itemId, quantity }, { onConflict: 'cart_id,item_id' });
    if (itemWriteError) throwSupabaseError(itemWriteError);
    return readCart(client, userId);
};

export const addCartMembership = async () => {
    const { client, userId } = await currentUser();
    const { error } = await client
        .from('carts')
        .upsert({ user_id: userId, has_plus: true }, { onConflict: 'user_id' });
    if (error) throwSupabaseError(error);
    return readCart(client, userId);
};

export const removeCartMembership = async () => {
    const { client, userId } = await currentUser();
    const { error } = await client.from('carts').update({ has_plus: false }).eq('user_id', userId);
    if (error) throwSupabaseError(error);
    return readCart(client, userId);
};

export const clearCart = async (): Promise<void> => {
    const { client, userId } = await currentUser();
    const { error } = await client.from('carts').delete().eq('user_id', userId);
    if (error) throwSupabaseError(error);
};
