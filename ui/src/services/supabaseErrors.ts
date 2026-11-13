import { ApiError } from './apiClient';

const ERROR_MESSAGES: Record<string, [ConstructorParameters<typeof ApiError>[0], string]> = {
    ADDRESS_LOCATION_REQUIRED: [
        'ADDRESS_NOT_SERVICEABLE',
        'Add a GPS location to this saved address before placing the order.',
    ],
    ADDRESS_NOT_SERVICEABLE: [
        'ADDRESS_NOT_SERVICEABLE',
        'That laundry does not currently serve the selected location.',
    ],
    CART_EMPTY: ['CART_EMPTY', 'Add at least one laundry item before placing the order.'],
    CART_NOT_FOUND: ['CART_NOT_FOUND', 'That cart no longer exists.'],
    CART_CHANGED: ['CART_CHANGED', 'Your cart changed because an item is no longer available.'],
    CART_PARTNER_CONFLICT: [
        'CART_PARTNER_CONFLICT',
        'Your cart contains items from another laundry.',
    ],
    PARTNER_CLOSED: ['PARTNER_CLOSED', 'That laundry is not accepting orders right now.'],
    PARTNER_NOT_FOUND: ['PARTNER_NOT_FOUND', 'That laundry was not found.'],
    ORDER_NOT_FOUND: ['NOT_FOUND', 'That order was not found.'],
    ADDRESS_NOT_FOUND: ['ADDRESS_NOT_FOUND', 'That saved address was not found.'],
    SLOT_UNAVAILABLE: ['SLOT_UNAVAILABLE', 'One of those time slots is no longer available.'],
    CANCELLATION_NOT_ALLOWED: [
        'CANCELLATION_NOT_ALLOWED',
        'This order can no longer be cancelled online. Please contact support.',
    ],
    RESCHEDULING_NOT_ALLOWED: [
        'RESCHEDULING_NOT_ALLOWED',
        'This order can no longer be rescheduled online. Please contact support.',
    ],
    RESCHEDULE_UNCHANGED: [
        'RESCHEDULING_NOT_ALLOWED',
        'Choose a different pickup or delivery schedule.',
    ],
    INVALID_ORDER_TRANSITION: [
        'INVALID_ORDER_TRANSITION',
        'That order cannot move to the requested stage.',
    ],
    PARTNER_SERVICE_EXISTS: [
        'SERVICE_ALREADY_EXISTS',
        'This laundry already has a category for that service.',
    ],
};

export const throwSupabaseError = (error: { message: string; code?: string }): never => {
    const token = error.message.trim();
    const mapped = ERROR_MESSAGES[token];
    if (mapped) throw new ApiError(mapped[0], mapped[1]);

    throw new ApiError('INTERNAL_ERROR', token || 'The Supabase request failed.');
};
