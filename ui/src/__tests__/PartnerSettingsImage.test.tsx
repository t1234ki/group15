import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PartnerLaundryConfiguration } from '../models/partnerConfigurationModels';
import { usePartnerSettings } from '../hooks/usePartnerSettings';
import PartnerSettingsPage from '../pages/partner-portal/PartnerSettingsPage';

vi.mock('../hooks/usePartnerSettings', () => ({
    usePartnerSettings: vi.fn(),
}));

const configuration: PartnerLaundryConfiguration = {
    id: 'partner-1',
    name: 'SparkleWash Express',
    about: '',
    imageUrl: null,
    address: { line1: '12 Main Street', line2: '', city: 'Accra' },
    latitude: 5.65,
    longitude: -0.18,
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
};

const saveListingImage = vi.fn(async () => true);

const settings = {
    loadState: { data: [configuration], isLoading: false, error: null, reload: vi.fn() },
    configurations: [configuration],
    selected: configuration,
    selectedId: configuration.id,
    draft: {
        name: configuration.name,
        about: configuration.about,
        address: configuration.address,
        latitude: configuration.latitude,
        longitude: configuration.longitude,
        serviceRadiusKm: configuration.serviceRadiusKm,
        holidayClosures: configuration.holidayClosures,
        capacityOverrides: configuration.capacityOverrides,
        turnaroundHours: configuration.turnaroundHours,
        acceptingOrders: configuration.acceptingOrders,
        useOpeningHours: configuration.useOpeningHours,
        openingHours: configuration.openingHours,
    },
    isSaving: false,
    saveError: null,
    saveSucceeded: false,
    imageSaving: false,
    imageError: null,
    imageWarning: null,
    imageSucceeded: false,
    isLocating: false,
    locationError: null,
    selectLaundry: vi.fn(),
    updateField: vi.fn(),
    updateAddress: vi.fn(),
    locate: vi.fn(),
    updateHolidayClosure: vi.fn(),
    addHolidayClosure: vi.fn(),
    removeHolidayClosure: vi.fn(),
    updateCapacityOverride: vi.fn(),
    addCapacityOverride: vi.fn(),
    removeCapacityOverride: vi.fn(),
    updateHours: vi.fn(),
    setDayClosed: vi.fn(),
    save: vi.fn(),
    saveListingImage,
} satisfies ReturnType<typeof usePartnerSettings>;

describe('laundry listing photo', () => {
    it('lets the owner choose and upload a customer-facing store photo', () => {
        vi.mocked(usePartnerSettings).mockReturnValue(settings);
        saveListingImage.mockClear();
        render(
            <MemoryRouter>
                <PartnerSettingsPage />
            </MemoryRouter>
        );

        const file = new File(['image'], 'laundry.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Choose store photo'), {
            target: { files: [file] },
        });
        expect(screen.getByText('laundry.png')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save store photo' }));

        expect(saveListingImage).toHaveBeenCalledWith(file);
    });
});
