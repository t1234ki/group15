import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CatalogCategory } from '../models/catalogModels';
import { cedis } from '../models/moneyModels';
import type { PartnerDetail } from '../models/partnerModels';
import { PARTNER_COPY } from '../config/partnerConfig';
import { usePartnerMenu } from '../hooks/usePartnerMenu';
import PartnerPage from '../pages/partner/PartnerPage';

vi.mock('../hooks/usePartnerMenu', () => ({
    usePartnerMenu: vi.fn(),
}));

const mockPartner: PartnerDetail = {
    id: 'partner-1',
    name: 'SparkleWash Express',
    rating: null,
    reviewCount: 0,
    address: { line1: '12 Main Street', line2: '', city: 'Accra' },
    latitude: null,
    longitude: null,
    distanceMeters: null,
    tags: [],
    services: [],
    turnaroundHours: 24,
    startingPrice: null,
    isOpen: true,
    image: null,
    about: null,
    openingHours: [],
};

const item = {
    id: 'shirt-1',
    name: 'Shirt / T-shirt',
    description: null,
    price: cedis(20),
    unit: 'piece' as const,
    iconKey: 'shirt',
};

const categories: CatalogCategory[] = [
    { id: 'wash-fold', service: 'wash-fold', name: 'Wash & Fold', items: [item] },
    { id: 'wash-iron', service: 'wash-iron', name: 'Wash & Iron', items: [] },
];

const changeQuantity = vi.fn();

const renderPartnerPage = (menuCategories: CatalogCategory[]) => {
    vi.mocked(usePartnerMenu).mockReturnValue({
        state: {
            data: { partner: mockPartner, categories: menuCategories },
            isLoading: false,
            error: null,
            reload: vi.fn(),
        },
        partner: mockPartner,
        categories: menuCategories,
        itemCount: 0,
        subtotal: cedis(0),
        hasItems: false,
        cartPartner: null,
        pendingPartnerSwitch: null,
        quantityFor: () => 0,
        changeQuantity,
        cancelPartnerSwitch: vi.fn(),
        confirmPartnerSwitch: vi.fn(),
        viewCart: vi.fn(),
    });

    return render(
        <MemoryRouter initialEntries={['/laundries/partner-1']}>
            <Routes>
                <Route
                    path="/laundries/:partnerId"
                    element={<PartnerPage />}
                />
            </Routes>
        </MemoryRouter>
    );
};

describe('partner service selection', () => {
    beforeEach(() => {
        changeQuantity.mockClear();
    });

    it('explains when the menu has no active priced items', () => {
        renderPartnerPage([{ ...categories[0]!, items: [] }]);

        expect(
            screen.getByRole('heading', { name: PARTNER_COPY.emptyCatalogueTitle })
        ).toBeInTheDocument();
        expect(screen.getByText(PARTNER_COPY.emptyCatalogue)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: PARTNER_COPY.emptyCatalogueAction })
        ).toHaveAttribute('href', '/laundries');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
    });

    it('shows selectable service cards and adds an item only when requested', () => {
        renderPartnerPage(categories);

        const service = screen.getByRole('checkbox', { name: /Wash & Fold/ });
        expect(service).toBeChecked();
        expect(service.closest('label')).toHaveAttribute('data-selected', 'true');
        expect(screen.queryByRole('checkbox', { name: 'Wash & Iron' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add Shirt / T-shirt, Wash & Fold' }));

        expect(changeQuantity).toHaveBeenCalledWith(item, 'Wash & Fold', 1);
    });
});
