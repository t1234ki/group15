import type { Client } from '../db/pool.js';
import type {
    CapacityOverride,
    HolidayClosure,
    OpeningHours,
    PartnerConfiguration,
} from '../models.js';

interface PartnerConfigurationRow {
    id: string;
    name: string;
    about: string | null;
    line1: string;
    line2: string;
    city: string;
    latitude: number | string | null;
    longitude: number | string | null;
    service_radius_km: number;
    holiday_closures: HolidayClosure[];
    capacity_overrides: CapacityOverride[];
    turnaround_hours: number;
    is_open: boolean;
    auto_schedule: boolean;
    currently_open: boolean;
    opening_hours: Array<{
        weekday: number;
        opensAt: string | null;
        closesAt: string | null;
    }>;
}

export interface PartnerConfigurationInput {
    name: string;
    about: string;
    address: {
        line1: string;
        line2: string;
        city: string;
    };
    latitude: number;
    longitude: number;
    serviceRadiusKm: number;
    holidayClosures: HolidayClosure[];
    capacityOverrides: CapacityOverride[];
    turnaroundHours: number;
    acceptingOrders: boolean;
    useOpeningHours: boolean;
    openingHours: OpeningHours[];
}

const baseQuery = `
    select p.id, p.name, p.about, p.line1, p.line2, p.city,
           p.latitude, p.longitude, p.service_radius_km,
           p.turnaround_hours, p.is_open, p.auto_schedule,
           public.is_partner_open(p.id) as currently_open,
           coalesce(
               (
                   select jsonb_agg(
                       jsonb_build_object(
                           'date', to_char(closure.closure_date, 'YYYY-MM-DD'),
                           'reason', coalesce(closure.reason, '')
                       ) order by closure.closure_date
                   )
                   from public.partner_holiday_closures closure
                   where closure.partner_id = p.id
                     and closure.closure_date >= timezone('Africa/Accra', now())::date
               ),
               '[]'::jsonb
           ) as holiday_closures,
           coalesce(
               (
                   select jsonb_agg(
                       jsonb_build_object(
                           'date', to_char(override.capacity_date, 'YYYY-MM-DD'),
                           'capacity', override.capacity,
                           'note', coalesce(override.note, '')
                       ) order by override.capacity_date
                   )
                   from public.partner_capacity_overrides override
                   where override.partner_id = p.id
                     and override.capacity_date >= timezone('Africa/Accra', now())::date
               ),
               '[]'::jsonb
           ) as capacity_overrides,
           coalesce(
               jsonb_agg(
                   jsonb_build_object(
                       'weekday', h.weekday,
                       'opensAt', case when h.opens_at is null then null else to_char(h.opens_at, 'HH24:MI') end,
                       'closesAt', case when h.closes_at is null then null else to_char(h.closes_at, 'HH24:MI') end
                   ) order by h.weekday
               ) filter (where h.weekday is not null),
               '[]'::jsonb
           ) as opening_hours
    from public.partners p
    left join public.partner_hours h on h.partner_id = p.id`;

const groupBy = `
    group by p.id, p.name, p.about, p.line1, p.line2, p.city,
             p.latitude, p.longitude, p.service_radius_km,
             p.turnaround_hours, p.is_open, p.auto_schedule`;

const toConfiguration = (row: PartnerConfigurationRow): PartnerConfiguration => ({
    id: row.id,
    name: row.name,
    about: row.about ?? '',
    address: {
        line1: row.line1,
        line2: row.line2,
        city: row.city,
    },
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    serviceRadiusKm: row.service_radius_km,
    holidayClosures: row.holiday_closures,
    capacityOverrides: row.capacity_overrides,
    turnaroundHours: row.turnaround_hours,
    acceptingOrders: row.is_open,
    useOpeningHours: row.auto_schedule,
    currentlyOpen: row.currently_open,
    openingHours: row.opening_hours,
});

export const listOwnedPartnerConfigurations = async (
    client: Client
): Promise<PartnerConfiguration[]> => {
    const { rows } = await client.query<PartnerConfigurationRow>(
        `${baseQuery}
         where p.owner_id = auth.uid()
         ${groupBy}
         order by p.name, p.id`
    );
    return rows.map(toConfiguration);
};

export const getOwnedPartnerConfiguration = async (
    client: Client,
    partnerId: string
): Promise<PartnerConfiguration | null> => {
    const { rows } = await client.query<PartnerConfigurationRow>(
        `${baseQuery}
         where p.id = $1 and p.owner_id = auth.uid()
         ${groupBy}`,
        [partnerId]
    );
    return rows[0] ? toConfiguration(rows[0]) : null;
};

export const updateOwnedPartnerConfiguration = async (
    client: Client,
    partnerId: string,
    input: PartnerConfigurationInput
): Promise<PartnerConfiguration | null> => {
    const result = await client.query(
        `update public.partners
         set name = $2,
             about = nullif($3, ''),
             line1 = $4,
             line2 = $5,
             city = $6,
             latitude = $7,
             longitude = $8,
             service_radius_km = $9,
             turnaround_hours = $10,
             is_open = $11,
             auto_schedule = $12
         where id = $1 and owner_id = auth.uid()`,
        [
            partnerId,
            input.name,
            input.about,
            input.address.line1,
            input.address.line2,
            input.address.city,
            input.latitude,
            input.longitude,
            input.serviceRadiusKm,
            input.turnaroundHours,
            input.acceptingOrders,
            input.useOpeningHours,
        ]
    );
    if (result.rowCount === 0) return null;

    await client.query('select public.replace_partner_hours($1, $2::jsonb)', [
        partnerId,
        JSON.stringify(input.openingHours),
    ]);
    await client.query('select public.replace_partner_holiday_closures($1, $2::jsonb)', [
        partnerId,
        JSON.stringify(input.holidayClosures),
    ]);
    await client.query('select public.replace_partner_capacity_overrides($1, $2::jsonb)', [
        partnerId,
        JSON.stringify(input.capacityOverrides),
    ]);
    return getOwnedPartnerConfiguration(client, partnerId);
};
