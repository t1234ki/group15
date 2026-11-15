import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PartnerLaundryConfiguration } from '../models/partnerConfigurationModels';
import { authenticateTestUser, renderApp } from '../__mocks__/renderWithProviders';

const configuration = (): PartnerLaundryConfiguration => ({
    id: '1001',
    name: 'SparkleWash Express',
    about: 'Fast laundry and careful garment cleaning.',
    imageUrl: null,
    address: {
        line1: '12 Lake Road',
        line2: 'HSR Layout',
        city: 'Bengaluru',
    },
    latitude: 12.9081,
    longitude: 77.6476,
    serviceRadiusKm: 10,
    holidayClosures: [],
    capacityOverrides: [],
    turnaroundHours: 24,
    acceptingOrders: true,
    useOpeningHours: true,
    currentlyOpen: true,
    openingHours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        opensAt: '08:00',
        closesAt: '20:00',
    })),
});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const apiError = (code: string, message: string, status: number) =>
    json({ error: { code, message, requestId: 'partner-settings-test' } }, status);

const installSettingsApi = ({ denied = false, saveFails = false } = {}) => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '');
        const method = init?.method ?? 'GET';

        if (path === '/partner/laundries' && method === 'GET') {
            return denied
                ? apiError('FORBIDDEN', 'A laundry-owner account is required.', 403)
                : json({ data: [configuration()] });
        }

        if (path === '/partner/laundries/1001' && method === 'PUT') {
            if (saveFails) {
                return apiError('INTERNAL_ERROR', 'The settings could not be saved.', 500);
            }
            const body = JSON.parse(String(init?.body));
            return json({ ...body, id: '1001', currentlyOpen: false });
        }

        return apiError('NOT_FOUND', 'No such endpoint.', 404);
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
};

describe('laundry-partner settings', () => {
    it('returns an owner to the protected settings page after sign-in', async () => {
        const user = userEvent.setup();
        installSettingsApi();
        renderApp('/partner/settings');

        await user.type(await screen.findByLabelText('Email'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'password');
        await user.click(screen.getByRole('button', { name: /^sign in$/i }));

        expect(
            await screen.findByRole('heading', { name: 'Laundry settings', level: 1 })
        ).toBeInTheDocument();
        expect(await screen.findByDisplayValue('SparkleWash Express')).toBeInTheDocument();
    });

    it('updates the listing, GPS service radius, controls and weekly schedule together', async () => {
        const user = userEvent.setup();
        authenticateTestUser();
        const fetch = installSettingsApi();
        renderApp('/partner/settings');

        const name = await screen.findByLabelText('Laundry name');
        await user.clear(name);
        await user.type(name, 'SparkleWash Central');

        const radius = screen.getByLabelText('Pickup and delivery radius (km)');
        await user.clear(radius);
        await user.type(radius, '15');

        await user.click(screen.getByRole('button', { name: 'Add holiday closure' }));
        await user.type(screen.getByLabelText('Closure date 1'), '2099-12-24');
        await user.type(screen.getByLabelText('Closure reason 1 (optional)'), 'Public holiday');

        await user.click(screen.getByRole('button', { name: 'Add capacity override' }));
        await user.type(screen.getByLabelText('Capacity date 1'), '2099-12-26');
        const capacity = screen.getByLabelText('Orders per pickup window 1');
        await user.clear(capacity);
        await user.type(capacity, '12');
        await user.type(screen.getByLabelText('Capacity note 1 (optional)'), 'Festival demand');

        const turnaround = screen.getByLabelText('Typical turnaround (hours)');
        await user.clear(turnaround);
        await user.type(turnaround, '36');

        await user.click(screen.getByLabelText('Accept new orders'));
        await user.click(screen.getByLabelText('Sunday closed'));
        expect(screen.getByLabelText('Sunday opening time')).toBeDisabled();
        expect(screen.getByLabelText('Sunday closing time')).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Save laundry settings' }));

        expect(await screen.findByText('Laundry settings saved.')).toBeInTheDocument();
        const update = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
        expect(update?.[0]).toBe('/api/v1/partner/laundries/1001');
        const body = JSON.parse(String(update?.[1]?.body));
        expect(body).toMatchObject({
            name: 'SparkleWash Central',
            latitude: 12.9081,
            longitude: 77.6476,
            serviceRadiusKm: 15,
            holidayClosures: [{ date: '2099-12-24', reason: 'Public holiday' }],
            capacityOverrides: [{ date: '2099-12-26', capacity: 12, note: 'Festival demand' }],
            turnaroundHours: 36,
            acceptingOrders: false,
            useOpeningHours: true,
        });
        expect(body.openingHours).toHaveLength(7);
        expect(body.openingHours.slice(0, 2)).toEqual([
            { weekday: 0, opensAt: null, closesAt: null },
            { weekday: 1, opensAt: '08:00', closesAt: '20:00' },
        ]);
        expect(screen.getByText('Closed for bookings now')).toBeInTheDocument();
    });

    it('lets an owner remove a planned closure before saving', async () => {
        const user = userEvent.setup();
        authenticateTestUser();
        installSettingsApi();
        renderApp('/partner/settings');

        await screen.findByDisplayValue('SparkleWash Express');
        await user.click(screen.getByRole('button', { name: 'Add holiday closure' }));
        await user.type(screen.getByLabelText('Closure date 1'), '2099-12-24');
        await user.click(screen.getByRole('button', { name: 'Remove holiday closure 1' }));

        expect(screen.queryByLabelText('Closure date 1')).toBeNull();
    });

    it('lets an owner remove a date-specific capacity before saving', async () => {
        const user = userEvent.setup();
        authenticateTestUser();
        installSettingsApi();
        renderApp('/partner/settings');

        await screen.findByDisplayValue('SparkleWash Express');
        await user.click(screen.getByRole('button', { name: 'Add capacity override' }));
        await user.type(screen.getByLabelText('Capacity date 1'), '2099-12-26');
        await user.click(screen.getByRole('button', { name: 'Remove capacity override 1' }));

        expect(screen.queryByLabelText('Capacity date 1')).toBeNull();
    });

    it('can update laundry coverage using the device location', async () => {
        const user = userEvent.setup();
        authenticateTestUser();
        const fetch = installSettingsApi();
        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: (success: PositionCallback) =>
                    success({
                        coords: {
                            latitude: 5.6502,
                            longitude: -0.187,
                        } as GeolocationCoordinates,
                    } as GeolocationPosition),
            },
        });
        renderApp('/partner/settings');

        await screen.findByDisplayValue('SparkleWash Express');
        await user.click(screen.getByRole('button', { name: 'Use my current location' }));
        await user.click(screen.getByRole('button', { name: 'Save laundry settings' }));
        expect(await screen.findByText('Laundry settings saved.')).toBeInTheDocument();
        const update = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
        const body = JSON.parse(String(update?.[1]?.body));
        expect(body).toMatchObject({ latitude: 5.6502, longitude: -0.187 });
        if (descriptor) Object.defineProperty(navigator, 'geolocation', descriptor);
        else Reflect.deleteProperty(navigator, 'geolocation');
    });

    it('shows an owner-access state instead of a retry loop', async () => {
        authenticateTestUser();
        installSettingsApi({ denied: true });
        renderApp('/partner/settings');

        expect(
            await screen.findByRole('heading', { name: 'Laundry-owner access required' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('keeps the form values and surfaces a save failure', async () => {
        const user = userEvent.setup();
        authenticateTestUser();
        installSettingsApi({ saveFails: true });
        renderApp('/partner/settings');

        const name = await screen.findByLabelText('Laundry name');
        await user.clear(name);
        await user.type(name, 'Unsaved Laundry Name');
        await user.click(screen.getByRole('button', { name: 'Save laundry settings' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The settings could not be saved.'
        );
        await waitFor(() => expect(screen.getByLabelText('Laundry name')).not.toBeDisabled());
        expect(screen.getByLabelText('Laundry name')).toHaveValue('Unsaved Laundry Name');
    });

    it('links to the live order queue and catalogue manager', async () => {
        authenticateTestUser();
        installSettingsApi();
        renderApp('/partner/settings');

        expect(await screen.findByRole('link', { name: 'View order queue' })).toHaveAttribute(
            'href',
            '/partner/orders'
        );
        expect(screen.getByRole('link', { name: 'Manage catalogue' })).toHaveAttribute(
            'href',
            '/partner/catalogue'
        );
    });
});
