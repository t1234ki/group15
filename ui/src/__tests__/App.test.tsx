import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SERVICE_TYPES } from '../data/services';
import { DRY } from '../config/cycleConfig';
import { HERO, HOW_IT_WORKS_SECTION } from '../config/homeConfig';
import { MEMBERSHIP_SECTION } from '../config/membershipConfig';
import { PRIMARY_NAV, ROUTES } from '../config/navigationConfig';
import { renderApp } from '../__mocks__/renderWithProviders';

describe('App', () => {
    it('renders the hero heading', () => {
        renderApp();
        expect(
            screen.getByRole('heading', { name: /fresh laundry, delivered to your door/i })
        ).toBeInTheDocument();
    });

    it('offers a keyboard shortcut to the main content', () => {
        renderApp();
        expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
            'href',
            '#main-content'
        );
        expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it('uses the browser current location for nearby laundry search', async () => {
        const getCurrentPosition = vi.fn((success: PositionCallback) =>
            success({
                coords: { latitude: 5.65, longitude: -0.18 } as GeolocationCoordinates,
            } as GeolocationPosition)
        );
        const geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition },
        });
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        renderApp();

        try {
            await userEvent.click(screen.getByRole('button', { name: /find services near me/i }));

            expect(getCurrentPosition).toHaveBeenCalledOnce();
            expect(
                await screen.findByRole('heading', { name: /laundry businesses near you/i })
            ).toBeInTheDocument();
            const request = fetchSpy.mock.calls
                .map(([input]) => new URL(String(input), 'http://localhost'))
                .find((url) => url.pathname.endsWith('/partners'));
            expect(request?.searchParams.get('latitude')).toBe('5.65');
            expect(request?.searchParams.get('longitude')).toBe('-0.18');
        } finally {
            if (geolocationDescriptor) {
                Object.defineProperty(navigator, 'geolocation', geolocationDescriptor);
            } else {
                Reflect.deleteProperty(navigator, 'geolocation');
            }
        }
    });

    it('renders every homepage section', () => {
        renderApp();
        const sections = [
            'Our Services',
            'How It Works',
            'Upgrade to SI MA ME Plus',
            'Ready to ditch laundry day?',
        ];

        sections.forEach((name) => {
            expect(screen.getByRole('heading', { name })).toBeInTheDocument();
        });
        expect(screen.queryByText(/example scenario|example use case/i)).toBeNull();
        expect(screen.queryByText(/GH₵/)).toBeNull();
    });

    it('does not advertise the retired per-kg price model', () => {
        renderApp();
        expect(screen.queryByText(/per-kg/i)).toBeNull();
        expect(screen.getByText(/per-item pricing is clear up front/i)).toBeInTheDocument();
    });

    it('does not advertise the journey', () => {
        renderApp();

        // Reachable by typing the URL and by nothing else. The route still
        // resolves; the header simply does not send anybody there, because a
        // visitor who came to price a wash should not be offered the scenic
        // route as one of four things in the nav.
        expect(screen.queryByRole('link', { name: 'Journey' })).toBeNull();
        PRIMARY_NAV.forEach(({ href }) => expect(href).not.toBe(ROUTES.journey));
    });

    it('carries the app chrome, which the journey does not', () => {
        renderApp();

        // The shared header and footer. The journey suppresses both, because it
        // brings its own; every other route, this one included, keeps them.
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'How It Works' })).toHaveAttribute(
            'href',
            '/#how-it-works'
        );
    });
});

describe('the homepage product contract', () => {
    it('presents implemented capabilities instead of the journey demo figures', () => {
        renderApp();

        HERO.stats.forEach((stat) => {
            expect(screen.getByText(stat.value)).toBeInTheDocument();
        });
    });

    it('names the same four steps, in the same order', () => {
        renderApp();

        const titles = HOW_IT_WORKS_SECTION.steps.map((step) => step.title.toLowerCase());
        expect(titles).toEqual(DRY.steps.map((step) => step.label));

        titles.forEach((title) => {
            expect(
                screen.getByRole('heading', { name: new RegExp(title, 'i') })
            ).toBeInTheDocument();
        });
    });

    it('lists every service, not a hand-picked few', () => {
        renderApp();

        SERVICE_TYPES.forEach((service) => {
            expect(screen.getByRole('heading', { name: service.name })).toBeInTheDocument();
        });
    });

    it('promises the perks the cart actually applies', () => {
        renderApp();

        MEMBERSHIP_SECTION.benefits.forEach((benefit) => {
            expect(screen.getByText(benefit.title)).toBeInTheDocument();
        });
    });
});
