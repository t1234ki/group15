import type { PaymentMethod } from '../models/paymentModels';
import type { Order, OrderEvent, OrderStatus } from '../data/orders';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';
import { getSupabaseOrder } from './supabaseOrderQueries';

export interface CreateOrderInput {
    cartId: string;
    addressId: string;
    pickupSlotId: string;
    deliverySlotId: string;
    paymentMethod: PaymentMethod;
}

interface PlacementResult {
    order_id: string;
    replayed: boolean;
}

export const createOrder = async (
    input: CreateOrderInput,
    idempotencyKey: string
): Promise<Order> => {
    if (!idempotencyKey) {
        throw new ApiError(
            'IDEMPOTENCY_KEY_REQUIRED',
            'An idempotency key is required to place an order safely.'
        );
    }
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('place_order', {
        target_cart_id: input.cartId,
        target_address_id: input.addressId,
        target_pickup_slot_id: input.pickupSlotId,
        target_delivery_slot_id: input.deliverySlotId,
        target_payment_method: input.paymentMethod,
        target_idempotency_key: idempotencyKey,
    });
    if (error) throwSupabaseError(error);
    const placement = data as PlacementResult[] | null;
    const orderId = placement?.[0]?.order_id;
    if (!orderId)
        throw new ApiError('INTERNAL_ERROR', 'Supabase did not confirm the order placement.');
    return getSupabaseOrder(orderId);
};

export interface CustomerOrderCancellationResult {
    orderId: string;
    status: OrderStatus;
    event: OrderEvent;
}

export const cancelCustomerOrder = async (id: string): Promise<CustomerOrderCancellationResult> => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('cancel_order', { target_order_id: id });
    if (error) throwSupabaseError(error);
    const result = data as
        | {
              order_id: string;
              status: OrderStatus;
              event_type: OrderEvent['type'];
              occurred_at: string;
          }[]
        | null;
    const row = result?.[0];
    if (!row) throw new ApiError('INTERNAL_ERROR', 'Supabase did not confirm order cancellation.');
    return {
        orderId: row.order_id,
        status: row.status,
        event: { type: row.event_type, occurredAt: row.occurred_at },
    };
};

export interface CustomerOrderReschedulingResult {
    orderId: string;
    rescheduledAt: string;
}

export const rescheduleCustomerOrder = async (
    id: string,
    input: { pickupSlotId: string; deliverySlotId: string }
): Promise<CustomerOrderReschedulingResult> => {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc('reschedule_order', {
        target_order_id: id,
        target_pickup_slot_id: input.pickupSlotId,
        target_delivery_slot_id: input.deliverySlotId,
    });
    if (error) throwSupabaseError(error);
    const result = data as { order_id: string; rescheduled_at: string }[] | null;
    const row = result?.[0];
    if (!row) throw new ApiError('INTERNAL_ERROR', 'Supabase did not confirm the schedule change.');
    return { orderId: row.order_id, rescheduledAt: row.rescheduled_at };
};
