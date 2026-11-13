import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Page } from '../models/apiModels';
import type { Partner } from '../models/partnerModels';
import { API_COPY } from '../config/apiConfig';
import { LISTING_COPY } from '../config/listingConfig';
import { PARTNER_COPY } from '../config/partnerConfig';
import { fixtureFetch, installOfflineFixture } from '../__mocks__/apiFixtures';
import { renderApp } from '../__mocks__/renderWithProviders';

/**
 * Partners, catalogues and slots come from the API. These cover what that
 * changed: the filters are real, the catalogue belongs to the partner, and
 * every screen now has a failure it has to survive.
 */
describe('the listing filters on the server', () => {
    it('hides distance sorting when no GPS location is available', async () => {
        renderApp('/laundries');
        await screen.findByText('SparkleWash Express');
        expect(screen.queryByRole('option', { name: /Distance/ })).toBeNull();
    });

    it('narrows to partners offering the requested service', async () => {
        renderApp('/laundries?service=dry-cleaning');

        expect(await screen.findByText('AquaClean Services')).toBeInTheDocument();
        // Offers wash-fold and wash-iron only.
        expect(screen.queryByText('CleanFold Laundry')).toBeNull();
    });

    it('combines a tag filter with the service filter', async () => {
        const user = userEvent.setup();
        renderApp('/laundries?service=wash-fold');
        await screen.findByText('SparkleWash Express');

        await user.click(screen.getByRole('button', { name: 'Budget Friendly' }));

        expect(await screen.findByText('CleanFold Laundry')).toBeInTheDocument();
        expect(screen.queryByText('SparkleWash Express')).toBeNull();
    });

    it('reorders by asking the server, not by sorting the page', async () => {
        const user = userEvent.setup();
        renderApp('/laundries');
        await screen.findByText('SparkleWash Express');

        await user.selectOptions(screen.getByRole('combobox'), 'price');

        const names = (await screen.findAllByRole('heading', { level: 2 })).map(
            (heading) => heading.textContent
        );
        // The server returns the lowest-priced matching catalogue first.
        expect(names[0]).toBe('CleanFold Laundry');
    });

    it('does not append a page requested under stale filters', async () => {
        const user = userEvent.setup();
        const rating = (await fixtureFetch('/api/v1/partners?sort=rating').json()) as Page<Partner>;
        const price = (await fixtureFetch('/api/v1/partners?sort=price').json()) as Page<Partner>;
        const stalePartner = rating.data[1]!;
        let releaseStale: (() => void) | undefined;

        const response = (body: Page<Partner>) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });

        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(String(input), 'http://localhost');
                const cursor = url.searchParams.get('cursor');

                if (cursor === 'stale-page') {
                    return new Promise<Response>((resolve) => {
                        releaseStale = () =>
                            resolve(response({ data: [stalePartner], nextCursor: null }));
                    });
                }

                if (url.searchParams.get('sort') === 'price') {
                    return Promise.resolve(response(price));
                }

                return Promise.resolve(
                    response({ data: [rating.data[0]!], nextCursor: 'stale-page' })
                );
            })
        );

        renderApp('/laundries');
        await screen.findByText(rating.data[0]!.name);
        await user.click(await screen.findByRole('button', { name: 'Show more' }));
        await user.selectOptions(screen.getByRole('combobox'), 'price');
        await screen.findByText(price.data[0]!.name);

        releaseStale?.();
        await waitFor(() => expect(screen.getAllByText(stalePartner.name)).toHaveLength(1));
    });
});

describe('a failed request', () => {
    it('explains itself and offers the way out of it', async () => {
        const user = userEvent.setup();
        installOfflineFixture();
        renderApp('/laundries');

        expect(await screen.findByRole('alert')).toHaveTextContent(API_COPY.networkError);

        // Recovering means the same request again, not a reload of the page.
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => Promise.resolve(fixtureFetch(input)))
        );
        await user.click(screen.getByRole('button', { name: API_COPY.retry }));

        expect(await screen.findByText('SparkleWash Express')).toBeInTheDocument();
    });

    it('does not count partners it has not loaded', async () => {
        installOfflineFixture();
        renderApp('/laundries');

        await screen.findByRole('alert');
        expect(screen.queryByText(new RegExp(LISTING_COPY.countSuffix))).toBeNull();
    });
});

describe('the catalogue belongs to the partner', () => {
    it('shows the partner their own category names', async () => {
        renderApp('/laundries/1003');

        // The platform's slug is dry-cleaning; this is what Royal calls it.
        expect(
            await screen.findByRole('heading', { name: 'Express Dry Clean' })
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Luxury & Couture' })).toBeInTheDocument();
    });

    it('prices the same garment differently at different laundries', async () => {
        const { unmount } = renderApp('/laundries/1001');
        const sparkle = await screen.findByRole('heading', { name: 'Wash & Fold' });
        expect(within(sparkle.closest('section')!).getByText(/GH₵20/)).toBeInTheDocument();
        unmount();

        renderApp('/laundries/1002');
        const cleanfold = await screen.findByRole('heading', { name: 'Wash & Fold' });
        expect(within(cleanfold.closest('section')!).getByText(/GH₵15/)).toBeInTheDocument();
    });

    it('shows a not-found state instead of redirecting silently', async () => {
        renderApp('/laundries/9999');

        expect(
            await screen.findByRole('heading', { name: PARTNER_COPY.notFoundTitle })
        ).toBeInTheDocument();
        // A 404 is not something Try again can fix, so it is not offered.
        expect(screen.queryByRole('button', { name: API_COPY.retry })).toBeNull();
    });
});
