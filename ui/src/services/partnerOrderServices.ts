import type { Page } from '../models/apiModels';
import type {
    PartnerOperationsSummary,
    PartnerOrderDetail,
    PartnerOrderEventResult,
    PartnerOrderEventType,
    PartnerOrderSummary,
} from '../models/partnerOrderModels';
import type { OrderEventType, OrderStatus } from '../data/orders';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';
import { getSupabaseOrder } from './supabaseOrderQueries';

export interface PartnerOrderQuery {
    status?: OrderStatus;
    cursor?: string;
    limit?: number;
}

interface OrderRow {
    id: string;
    reference: string;
    status: OrderStatus;
    placed_at: string;
    partner_id: string;
    total: number;
    currency: string;
    pickup_slot_id: string;
    delivery_slot_id: string;
}

interface PartnerRow {
    id: string;
    name: string;
}

interface AddressRow {
    order_id: string;
    recipient_name: string;
    latitude: number | string | null;
    longitude: number | string | null;
}

interface SlotRow {
    id: string;
    starts_at: string;
    ends_at: string;
}

interface EventRow {
    order_id: string;
    type: OrderEventType;
    occurred_at: string;
    id: number;
}

interface OperationsSummaryRow {
    active_orders: number;
    awaiting_confirmation: number;
    pickups_today: number;
    deliveries_today: number;
    completed_today: number;
    generated_at: string;
}

interface LifecycleRow {
    order_id: string;
    status: OrderStatus;
    event_type: OrderEventType;
    occurred_at: string;
}

interface OrderCursor {
    placedAt: string;
    id: string;
    status?: OrderStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isOrderStatus = (value: unknown): value is OrderStatus =>
    value === 'processing' ||
    value === 'out_for_delivery' ||
    value === 'delivered' ||
    value === 'cancelled';

const isOrderEventType = (value: unknown): value is OrderEventType =>
    value === 'placed' ||
    value === 'confirmed' ||
    value === 'picked_up' ||
    value === 'in_progress' ||
    value === 'out_for_delivery' ||
    value === 'delivered' ||
    value === 'cancelled';

const isOperationsSummaryRow = (value: unknown): value is OperationsSummaryRow =>
    isRecord(value) &&
    typeof value.active_orders === 'number' &&
    typeof value.awaiting_confirmation === 'number' &&
    typeof value.pickups_today === 'number' &&
    typeof value.deliveries_today === 'number' &&
    typeof value.completed_today === 'number' &&
    typeof value.generated_at === 'string';

const isLifecycleRow = (value: unknown): value is LifecycleRow =>
    isRecord(value) &&
    typeof value.order_id === 'string' &&
    isOrderStatus(value.status) &&
    isOrderEventType(value.event_type) &&
    typeof value.occurred_at === 'string';

const encodeCursor = (cursor: OrderCursor) =>
    btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeCursor = (value: string | undefined, status?: OrderStatus): OrderCursor | null => {
    if (!value) return null;

    try {
        const parsed: unknown = JSON.parse(
            atob(value.replace(/-/g, '+').replace(/_/g, '/'))
        );
        if (isRecord(parsed)) {
            const candidate = parsed;
            if (
                typeof candidate.placedAt === 'string' &&
                /^[0-9T:.+Z-]+$/.test(candidate.placedAt) &&
                Number.isFinite(Date.parse(candidate.placedAt)) &&
                typeof candidate.id === 'string' &&
                /^[A-Za-z0-9_-]+$/.test(candidate.id) &&
                candidate.status === status
            ) {
                return {
                    placedAt: candidate.placedAt,
                    id: candidate.id,
                    ...(status ? { status } : {}),
                };
            }
        }
    } catch {
        // A malformed or filter-mismatched cursor is reported below.
    }

    throw new ApiError('VALIDATION_FAILED', 'That page link is no longer valid.', 400);
};

const requirePartnerOwner = async (signal?: AbortSignal) => {
    const client = await getSupabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throwSupabaseError(userError);
    if (!userData.user)
        throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);

    let ownerRequest = client
        .from('partners')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userData.user.id);
    if (signal) ownerRequest = ownerRequest.abortSignal(signal);
    const { count, error } = await ownerRequest;
    if (error) throwSupabaseError(error);
    if (!count) throw new ApiError('FORBIDDEN', 'A laundry-owner account is required.', 403);
    return client;
};

export const getPartnerOrders = async (
    query: PartnerOrderQuery,
    signal?: AbortSignal
): Promise<Page<PartnerOrderSummary>> => {
    const client = await requirePartnerOwner(signal);
    const cursor = decodeCursor(query.cursor, query.status);
    const limit = query.limit ?? 20;

    let orderRequest = client
        .from('orders')
        .select('id,reference,status,placed_at,partner_id,total,currency,pickup_slot_id,delivery_slot_id')
        .order('placed_at', { ascending: false })
        .order('id', { ascending: false });
    if (query.status) orderRequest = orderRequest.eq('status', query.status);
    if (cursor) {
        orderRequest = orderRequest.or(
            `placed_at.lt.${cursor.placedAt},and(placed_at.eq.${cursor.placedAt},id.lt.${cursor.id})`
        );
    }
    if (signal) orderRequest = orderRequest.abortSignal(signal);

    const { data: rows, error } = await orderRequest
        .limit(limit + 1)
        .returns<OrderRow[]>();
    if (error) throwSupabaseError(error);
    if (!rows) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no laundry orders.');

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    if (visible.length === 0) return { data: [], nextCursor: null };

    const orderIds = visible.map((order) => order.id);
    const partnerIds = [...new Set(visible.map((order) => order.partner_id))];
    const slotIds = [...new Set(visible.flatMap((order) => [order.pickup_slot_id, order.delivery_slot_id]))];
    let partnersRequest = client
        .from('partners')
        .select('id,name')
        .in('id', partnerIds)
        .returns<PartnerRow[]>();
    let addressesRequest = client
        .from('order_addresses')
        .select('order_id,recipient_name,latitude,longitude')
        .in('order_id', orderIds)
        .returns<AddressRow[]>();
    let slotsRequest = client
        .from('slots')
        .select('id,starts_at,ends_at')
        .in('id', slotIds)
        .returns<SlotRow[]>();
    let eventsRequest = client
        .from('order_events')
        .select('order_id,type,occurred_at,id')
        .in('order_id', orderIds)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .returns<EventRow[]>();
    if (signal) {
        partnersRequest = partnersRequest.abortSignal(signal);
        addressesRequest = addressesRequest.abortSignal(signal);
        slotsRequest = slotsRequest.abortSignal(signal);
        eventsRequest = eventsRequest.abortSignal(signal);
    }

    const [partnersResult, addressesResult, slotsResult, eventsResult] = await Promise.all([
        partnersRequest,
        addressesRequest,
        slotsRequest,
        eventsRequest,
    ]);
    const itemCountsRequest = client
        .from('order_items')
        .select('order_id,quantity')
        .in('order_id', orderIds)
        .returns<{ order_id: string; quantity: number }[]>();
    const itemCountsResult = signal
        ? await itemCountsRequest.abortSignal(signal)
        : await itemCountsRequest;
    if (partnersResult.error) throwSupabaseError(partnersResult.error);
    if (addressesResult.error) throwSupabaseError(addressesResult.error);
    if (slotsResult.error) throwSupabaseError(slotsResult.error);
    if (eventsResult.error) throwSupabaseError(eventsResult.error);
    if (itemCountsResult.error) throwSupabaseError(itemCountsResult.error);
    if (!partnersResult.data || !addressesResult.data || !slotsResult.data || !eventsResult.data) {
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned incomplete laundry orders.');
    }
    if (!itemCountsResult.data)
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned no laundry order items.');

    const partners = new Map(partnersResult.data.map((partner) => [partner.id, partner]));
    const addresses = new Map(addressesResult.data.map((address) => [address.order_id, address]));
    const slots = new Map(slotsResult.data.map((slot) => [slot.id, slot]));
    const latestEvents = new Map<string, EventRow>();
    for (const event of eventsResult.data) {
        if (!latestEvents.has(event.order_id)) latestEvents.set(event.order_id, event);
    }
    const itemCounts = new Map<string, number>();
    for (const item of itemCountsResult.data) {
        itemCounts.set(item.order_id, (itemCounts.get(item.order_id) ?? 0) + item.quantity);
    }

    const data = visible.map((order): PartnerOrderSummary => {
        const partner = partners.get(order.partner_id);
        const address = addresses.get(order.id);
        const pickup = slots.get(order.pickup_slot_id);
        const delivery = slots.get(order.delivery_slot_id);
        const latestEvent = latestEvents.get(order.id);
        if (!partner || !address || !pickup || !delivery || !latestEvent) {
            throw new ApiError('INTERNAL_ERROR', 'Supabase returned incomplete laundry order details.');
        }
        if (order.currency !== 'GHS') {
            throw new ApiError('INTERNAL_ERROR', 'An order uses an unsupported currency.');
        }
        return {
            id: order.id,
            reference: order.reference,
            status: order.status,
            placedAt: order.placed_at,
            partner,
            recipient: {
                name: address.recipient_name,
                latitude: address.latitude === null ? null : Number(address.latitude),
                longitude: address.longitude === null ? null : Number(address.longitude),
            },
            itemCount: itemCounts.get(order.id) ?? 0,
            total: { amount: order.total, currency: 'GHS' },
            pickup: { startsAt: pickup.starts_at, endsAt: pickup.ends_at },
            delivery: { startsAt: delivery.starts_at, endsAt: delivery.ends_at },
            latestEvent: { type: latestEvent.type, occurredAt: latestEvent.occurred_at },
        };
    });

    const last = visible[visible.length - 1];
    return {
        data,
        nextCursor: hasMore && last ? encodeCursor({ placedAt: last.placed_at, id: last.id, status: query.status }) : null,
    };
};

export const getPartnerOperationsSummary = async (
    signal?: AbortSignal
): Promise<PartnerOperationsSummary> => {
    const client = await requirePartnerOwner(signal);
    let request = client.rpc('partner_operations_summary');
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);
    const rows: unknown = data;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!isOperationsSummaryRow(row))
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned no laundry operations summary.');
    return {
        activeOrders: row.active_orders,
        awaitingConfirmation: row.awaiting_confirmation,
        pickupsToday: row.pickups_today,
        deliveriesToday: row.deliveries_today,
        completedToday: row.completed_today,
        generatedAt: row.generated_at,
    };
};

export const getPartnerOrder = async (
    id: string,
    signal?: AbortSignal
): Promise<PartnerOrderDetail> => {
    const client = await requirePartnerOwner(signal);
    const order = await getSupabaseOrder(id, signal);
    const { data: address, error } = await client
        .from('order_addresses')
        .select('recipient_name,phone,landmark')
        .eq('order_id', id)
        .maybeSingle()
        .returns<{ recipient_name: string; phone: string; landmark: string | null }>();
    if (error) throwSupabaseError(error);
    if (!address)
        throw new ApiError('INTERNAL_ERROR', 'The saved delivery address for this order is missing.');

    return {
        ...order,
        deliveryAddress: {
            ...order.deliveryAddress,
            recipientName: address.recipient_name,
            phone: address.phone,
            landmark: address.landmark ?? '',
        },
        pickup: {
            ...order.pickup,
            date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(
                new Date(order.pickup.startsAt)
            ),
        },
        delivery: {
            ...order.delivery,
            date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(
                new Date(order.delivery.startsAt)
            ),
        },
    };
};

export const advancePartnerOrder = async (
    id: string,
    type: PartnerOrderEventType
): Promise<PartnerOrderEventResult> => {
    const client = await requirePartnerOwner();
    const { data, error } = await client.rpc('advance_order', {
        target_order_id: id,
        next_event: type,
    });
    if (error) throwSupabaseError(error);
    const rows: unknown = data;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!isLifecycleRow(row))
        throw new ApiError('INTERNAL_ERROR', 'Supabase did not confirm the order update.');
    return {
        orderId: row.order_id,
        status: row.status,
        event: { type: row.event_type, occurredAt: row.occurred_at },
    };
};
