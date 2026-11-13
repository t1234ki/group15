/**
 * Money is always integer minor units (pesewas) plus a currency, never a float.
 * Tax and discount arithmetic on floats drifts; this shape is what the API
 * contract sends and what the backend will store.
 */
export interface Money {
    amount: number;
    currency: 'GHS';
}

/** Seed data and tests read better in cedis than in pesewas. */
export const cedis = (value: number): Money => ({
    amount: Math.round(value * 100),
    currency: 'GHS',
});

export const addMoney = (...values: Money[]): Money => ({
    amount: values.reduce((sum, value) => sum + value.amount, 0),
    currency: 'GHS',
});

export const multiplyMoney = ({ amount, currency }: Money, factor: number): Money => ({
    amount: Math.round(amount * factor),
    currency,
});

export const ZERO: Money = { amount: 0, currency: 'GHS' };
