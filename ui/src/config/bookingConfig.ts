import { Address, AddressTextField } from '../models/bookingModels';
import type { PaymentMethod } from '../models/paymentModels';

export interface AddressFieldConfig {
    name: AddressTextField;
    label: string;
    placeholder: string;
    half?: boolean;
    inputMode?: 'numeric' | 'tel';
    maxLength?: number;
    optional?: boolean;
}

export const CHECKOUT_ADDRESS_ID_PREFIX = 'checkout-address';
export const SCHEDULE_DAYS = 7;

export const ADDRESS_FIELDS: AddressFieldConfig[] = [
    { name: 'recipientName', label: 'Full Name', placeholder: 'John Doe', half: true },
    {
        name: 'phone',
        label: 'Phone Number',
        placeholder: '+233 20 000 0000',
        half: true,
        inputMode: 'tel',
    },
    {
        name: 'building',
        label: 'Flat / House No. / Building',
        placeholder: 'e.g. Flat 402, Tower B',
    },
    { name: 'street', label: 'Street / Area', placeholder: 'e.g. University Avenue' },
    {
        name: 'landmark',
        label: 'Landmark (Optional)',
        placeholder: 'e.g. Near City Mall',
        half: true,
        optional: true,
    },
];

export const ADDRESS_PICKER_COPY = {
    legend: 'Choose a pickup address',
    savedHeading: 'Saved addresses',
    addNew: 'Add a new address',
    addNewHint: 'Use a different address for this order',
    newAddressHeading: 'New address',
} as const;

export const CHECKOUT_COPY = {
    back: 'Back to cart',
    title: 'Checkout',
    subtitle: 'A few details and your pickup is booked',
    addressHeading: 'Pickup Address',
    addressSubtitle: 'Where should we pick up your clothes?',
    scheduleHeading: 'Schedule Pickup & Delivery',
    scheduleSubtitle: 'Select your preferred date and time',
    summaryHeading: 'Order Summary',
    paymentHeading: 'Payment method',
    paymentSubtitle: 'Choose how to complete this demo booking.',
    cashPayment: 'Cash on pickup',
    demoCardPayment: 'Demo card payment',
    demoMobileMoneyPayment: 'Demo mobile money',
    demoPaymentNote: 'Demo only: no money will be charged and no payment details are collected.',
    demoPaymentSuccess: 'Demo payment simulated successfully. No real money was charged.',
    orderingFrom: 'Ordering from',
    checkingPartner: 'Checking whether this laundry is accepting orders',
    partnerCheckFailed: "We couldn't verify that this laundry is accepting orders.",
    sameAddressNote: 'Delivery will be at the same address',
    paymentNote: 'Payment will be collected at pickup',
    pickupLabel: 'Pickup',
    deliveryLabel: 'Delivery',
    loadingSlots: 'Loading available slots',
    noSlots: 'This laundry has no pickup slots open in the next week.',
    selectDate: 'Select Date',
    selectSlot: 'Select Time Slot',
    confirm: 'Confirm Booking',
    confirmDemoPayment: 'Simulate Payment & Confirm Booking',
    confirming: 'Placing order...',
} as const;

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string; detail: string }[] = [
    {
        value: 'cash_on_pickup',
        label: CHECKOUT_COPY.cashPayment,
        detail: CHECKOUT_COPY.paymentNote,
    },
    {
        value: 'demo_card',
        label: CHECKOUT_COPY.demoCardPayment,
        detail: 'Simulates a successful card payment without asking for card details.',
    },
    {
        value: 'demo_mobile_money',
        label: CHECKOUT_COPY.demoMobileMoneyPayment,
        detail: 'Simulates a successful mobile-money payment without sending a prompt.',
    },
];

/** Shown beneath a field once the customer has tried to submit without it. */
export const VALIDATION_COPY = {
    recipientName: 'Enter the name we should ask for at pickup.',
    phone: 'Enter a phone number our driver can reach.',
    building: 'Enter your flat, house number or building.',
    street: 'Enter your street or area.',
    location: 'Use your current location so we can confirm this laundry serves your address.',
    pickup: 'Choose a pickup date and time.',
    delivery: 'Choose a delivery date and time.',
    deliveryBeforePickup: 'Delivery must be after pickup.',
    partnerClosed:
        'This laundry has stopped taking orders since you added to your cart. ' +
        'Your cart is safe; pick another laundry to book this one in.',
} as const;

export const CONFIRMATION_COPY = {
    title: 'Booking Confirmed!',
    body: 'Your order is confirmed. Track every step from pickup through delivery.',
    orderPrefix: 'Order #',
    primary: 'Back to Home',
    secondary: 'Book Another Service',
} as const;
