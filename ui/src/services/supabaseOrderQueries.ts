import type { Order, OrderEventType, OrderStatus } from '../data/orders';
import type { PriceUnit } from '../models/catalogModels';
import type { Money } from '../models/moneyModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

interface OrderRow {
    id: string;
    reference: string;
    status: OrderStatus;
    placed_at: string;
    partner_id: string;
    subtotal: number;
    delivery_fee: number;
    membership_fee: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
    pickup_slot_id: string;
    delivery_slot_id: string;
    payment_method: string;
}

interface SlotRow {
    id: string;
    starts_at: string;
    ends_at: string;
}

interface OrderItemRow {
    item_id: string;
    name: string;
    unit: PriceUnit;
    quantity: number;
    line_total: number;
}

interface OrderAddressRow {
    label: string;
    recipient_name: string;
    phone: string;
    building: string;
    street: string;
    landmark: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
}

interface OrderEventRow {
    type: OrderEventType;
    occurred_at: string;
}

interface RescheduleRow {
    created_at: string;
    previous_pickup_id: string;
    previous_delivery_id: string;
    new_pickup_id: string;
    new_delivery_id: string;
}

const money = (amount: number): Money => ({ amount, currency: 'GHS' });
const dateInAccra = (date: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(date));
const numeric = (value: number | string | null) => (value === null ? null : Number(value));

const readSlot = async (id: string, signal?: AbortSignal): Promise<SlotRow> => {
    const client = await getSupabaseClient();
    let request = client.from('slots').select('id,starts_at,ends_at').eq('id', id);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request.returns<SlotRow[]>().maybeSingle();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'A scheduled order slot could not be found.');
    return data;
};

const readOrder = async (id: string, signal?: AbortSignal): Promise<Order | null> => {
    const client = await getSupabaseClient();
    let orderRequest = client
        .from('orders')
        .select(
            'id,reference,status,placed_at,partner_id,subtotal,delivery_fee,membership_fee,discount,tax,total,currency,pickup_slot_id,delivery_slot_id,payment_method'
        )
        .eq('id', id);
    if (signal) orderRequest = orderRequest.abortSignal(signal);
    const { data: row, error: orderError } = await orderRequest.returns<OrderRow[]>().maybeSingle();
    if (orderError) throwSupabaseError(orderError);
    if (!row) return null;

    const [
        { data: partner, error: partnerError },
        { data: items, error: itemsError },
        { data: address, error: addressError },
        { data: events, error: eventsError },
        { data: reschedules, error: reschedulesError },
        pickup,
        delivery,
    ] = await Promise.all([
        client
            .from('partners')
            .select('id,name')
            .eq('id', row.partner_id)
            .returns<{ id: string; name: string }[]>()
            .maybeSingle(),
        client
            .from('order_items')
            .select('item_id,name,unit,quantity,line_total')
            .eq('order_id', id)
            .order('name')
            .returns<OrderItemRow[]>(),
        client
            .from('order_addresses')
            .select('label,recipient_name,phone,building,street,landmark,latitude,longitude')
            .eq('order_id', id)
            .returns<OrderAddressRow[]>()
            .maybeSingle(),
        client
            .from('order_events')
            .select('type,occurred_at')
            .eq('order_id', id)
            .order('occurred_at')
            .order('id')
            .returns<OrderEventRow[]>(),
        client
            .from('order_reschedules')
            .select(
                'created_at,previous_pickup_id,previous_delivery_id,new_pickup_id,new_delivery_id'
            )
            .eq('order_id', id)
            .order('created_at')
            .order('id')
            .returns<RescheduleRow[]>(),
        readSlot(row.pickup_slot_id, signal),
        readSlot(row.delivery_slot_id, signal),
    ]);
    if (partnerError) throwSupabaseError(partnerError);
    if (itemsError) throwSupabaseError(itemsError);
    if (addressError) throwSupabaseError(addressError);
    if (eventsError) throwSupabaseError(eventsError);
    if (reschedulesError) throwSupabaseError(reschedulesError);
    if (!partner || !items || !events || !reschedules)
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned incomplete order details.');
    if (!address)
        throw new ApiError(
            'INTERNAL_ERROR',
            'The saved delivery address for this order is missing.'
        );

    const history = await Promise.all(
        reschedules.map(async (reschedule) => {
            const [previousPickup, previousDelivery, newPickup, newDelivery] = await Promise.all([
                readSlot(reschedule.previous_pickup_id, signal),
                readSlot(reschedule.previous_delivery_id, signal),
                readSlot(reschedule.new_pickup_id, signal),
                readSlot(reschedule.new_delivery_id, signal),
            ]);
            return {
                occurredAt: reschedule.created_at,
                previous: {
                    pickup: { startsAt: previousPickup.starts_at, endsAt: previousPickup.ends_at },
                    delivery: {
                        startsAt: previousDelivery.starts_at,
                        endsAt: previousDelivery.ends_at,
                    },
                },
                updated: {
                    pickup: { startsAt: newPickup.starts_at, endsAt: newPickup.ends_at },
                    delivery: { startsAt: newDelivery.starts_at, endsAt: newDelivery.ends_at },
                },
            };
        })
    );
    const latestEvent = events[events.length - 1]?.type;
    const pickupNotStarted = new Date(pickup.starts_at).getTime() > Date.now();
    const canCancel =
        row.status === 'processing' &&
        (latestEvent === 'placed' || latestEvent === 'confirmed') &&
        pickupNotStarted &&
        row.payment_method === 'cash_on_pickup' &&
        row.membership_fee === 0;
    const canReschedule =
        row.status === 'processing' &&
        (latestEvent === 'placed' || latestEvent === 'confirmed') &&
        pickupNotStarted;

    return {
        id: row.id,
        reference: row.reference,
        status: row.status,
        canCancel,
        canReschedule,
        placedAt: row.placed_at,
        partner: { id: partner.id, name: partner.name },
        lines: items.map((item) => ({
            itemId: item.item_id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            amount: money(item.line_total),
        })),
        totals: {
            subtotal: money(row.subtotal),
            delivery: money(row.delivery_fee),
            tax: money(row.tax),
            total: money(row.total),
        },
        deliveryAddress: {
            label: address.label,
            building: address.building,
            street: address.street,
            latitude: numeric(address.latitude),
            longitude: numeric(address.longitude),
        },
        pickup: {
            date: dateInAccra(pickup.starts_at),
            startsAt: pickup.starts_at,
            endsAt: pickup.ends_at,
        },
        delivery: {
            date: dateInAccra(delivery.starts_at),
            startsAt: delivery.starts_at,
            endsAt: delivery.ends_at,
        },
        events: events.map((event) => ({ type: event.type, occurredAt: event.occurred_at })),
        reschedules: history,
    };
};

export const getSupabaseOrder = async (id: string, signal?: AbortSignal): Promise<Order> => {
    const order = await readOrder(id, signal);
    if (!order) throw new ApiError('NOT_FOUND', 'That order was not found.', 404);
    return order;
};

export const getSupabaseOrders = async (signal?: AbortSignal): Promise<Order[]> => {
    const client = await getSupabaseClient();
    let request = client.from('orders').select('id').order('placed_at', { ascending: false });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request.returns<{ id: string }[]>();
    if (error) throwSupabaseError(error);
    if (!data) throw new ApiError('INTERNAL_ERROR', 'Supabase returned no order list.');
    return Promise.all(data.map(({ id }) => getSupabaseOrder(id, signal)));
};

export const currentAuthUserId = async () => {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error) throwSupabaseError(error);
    if (!data.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    return data.user.id;
};
