import type { PriceUnit } from '../models.js';

/** Money crosses the wire as integer minor units plus a currency, never a float. */
export interface Money {
    amount: number;
    currency: string;
}

export const money = (amount: number, currency = 'GHS'): Money => ({ amount, currency });

export const moneyWithUnit = (
    amount: number,
    unit: PriceUnit,
    currency = 'GHS'
): Money & { unit: PriceUnit } => ({ amount, currency, unit });
