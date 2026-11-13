import { describe, expect, it } from 'vitest';
import { addMoney, multiplyMoney, cedis } from '../models/moneyModels';
import { OrderEvent } from '../data/orders';
import { ORDER_STEPS } from '../config/ordersConfig';
import { formatAmount } from '../utils/moneyUtils';
import { buildTimeline } from '../utils/ordersUtils';

const at = (type: OrderEvent['type']): OrderEvent => ({
    type,
    occurredAt: '2026-08-20T05:00:00Z',
});

describe('buildTimeline', () => {
    it('renders every step even when only the first has happened', () => {
        const timeline = buildTimeline([at('placed')]);

        expect(timeline).toHaveLength(ORDER_STEPS.length);
        expect(timeline[0].state).toBe('current');
        expect(timeline.slice(1).every((entry) => entry.state === 'pending')).toBe(true);
    });

    it('marks earlier events done and the latest current', () => {
        const timeline = buildTimeline([at('placed'), at('confirmed'), at('picked_up')]);

        expect(timeline.map((entry) => entry.state).slice(0, 4)).toEqual([
            'done',
            'done',
            'current',
            'pending',
        ]);
    });

    it('marks the step after the latest event as in progress', () => {
        const timeline = buildTimeline([at('placed'), at('confirmed')]);

        expect(timeline[2].detail).toBe('In progress');
        expect(timeline[3].detail).toBe('Pending');
    });

    it('has no current step once delivered', () => {
        const delivered = buildTimeline(ORDER_STEPS.map((step) => at(step.type)));

        expect(delivered.filter((entry) => entry.state === 'pending')).toHaveLength(0);
        expect(delivered[delivered.length - 1].state).toBe('current');
    });

    it('ends a cancelled order at an explicit cancellation event', () => {
        const cancelled = buildTimeline([at('placed'), at('confirmed'), at('cancelled')]);

        expect(cancelled.map((entry) => entry.label)).toEqual([
            'Order Placed',
            'Confirmed by Vendor',
            'Order Cancelled',
        ]);
        expect(cancelled[cancelled.length - 1]?.state).toBe('current');
    });
});

describe('money', () => {
    it('keeps arithmetic in integer paise', () => {
        // 0.1 + 0.2 in cedis would drift; in pesewas it cannot.
        expect(addMoney(cedis(0.1), cedis(0.2))).toEqual({ amount: 30, currency: 'GHS' });
    });

    it('rounds tax to a whole paise', () => {
        expect(multiplyMoney(cedis(49), 0.18)).toEqual({ amount: 882, currency: 'GHS' });
    });

    it('sums an empty cart to a zero with a currency', () => {
        expect(addMoney()).toEqual({ amount: 0, currency: 'GHS' });
    });
});

describe('formatAmount', () => {
    it('drops decimals for whole cedis and keeps both places otherwise', () => {
        expect(formatAmount(cedis(1999))).toBe('1,999');
        expect(formatAmount({ amount: 360, currency: 'GHS' })).toBe('3.60');
        expect(formatAmount({ amount: 99828, currency: 'GHS' })).toBe('998.28');
    });
});
