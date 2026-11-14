export type PaymentMethod = 'cash_on_pickup' | 'demo_card' | 'demo_mobile_money';

export const isPaymentMethod = (value: unknown): value is PaymentMethod =>
    value === 'cash_on_pickup' || value === 'demo_card' || value === 'demo_mobile_money';

export const isDemoPayment = (value: PaymentMethod) => value !== 'cash_on_pickup';
