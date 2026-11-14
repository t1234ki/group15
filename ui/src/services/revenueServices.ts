import type { Money } from '../models/moneyModels';
import { ApiError } from './apiClient';
import { getSupabaseClient } from './supabaseClient';
import { throwSupabaseError } from './supabaseErrors';

export interface PartnerRevenue {
    partnerId: string;
    partnerName: string;
    demoOrderCount: number;
    gross: Money;
    platformCommission: Money;
    partnerRevenue: Money;
}

interface RevenueRow {
    partner_id: string;
    partner_name: string;
    demo_order_count: number;
    gross_amount: number;
    platform_commission: number;
    partner_revenue: number;
}

const toRevenue = (row: RevenueRow): PartnerRevenue => ({
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    demoOrderCount: row.demo_order_count,
    gross: { amount: row.gross_amount, currency: 'GHS' },
    platformCommission: { amount: row.platform_commission, currency: 'GHS' },
    partnerRevenue: { amount: row.partner_revenue, currency: 'GHS' },
});

const readRevenue = async (
    operation: 'admin_revenue_summary' | 'partner_revenue_summary',
    signal?: AbortSignal
) => {
    const client = await getSupabaseClient();
    let request = client.rpc(operation);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);
    if (
        !Array.isArray(data) ||
        !data.every(
            (row): row is RevenueRow =>
                typeof row === 'object' &&
                row !== null &&
                'partner_id' in row &&
                typeof row.partner_id === 'string' &&
                'partner_name' in row &&
                typeof row.partner_name === 'string' &&
                'demo_order_count' in row &&
                typeof row.demo_order_count === 'number' &&
                'gross_amount' in row &&
                typeof row.gross_amount === 'number' &&
                'platform_commission' in row &&
                typeof row.platform_commission === 'number' &&
                'partner_revenue' in row &&
                typeof row.partner_revenue === 'number'
        )
    ) {
        throw new ApiError('INTERNAL_ERROR', 'Supabase returned an invalid revenue summary.');
    }
    return data.map(toRevenue);
};

export const getAdminRevenueSummary = (signal?: AbortSignal) =>
    readRevenue('admin_revenue_summary', signal);

export const getPartnerRevenueSummary = (signal?: AbortSignal) =>
    readRevenue('partner_revenue_summary', signal);
