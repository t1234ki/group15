import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
    getOwnerApplication,
    getOwnerApplications,
    isLaundryAdmin,
    reviewOwnerApplication,
    submitOwnerApplication,
    type OwnerApplication,
} from '../services/ownerServices';
import { getCurrentLocation } from '../utils/locationUtils';
import AdminDashboard from '../pages/partner-portal/AdminDashboard';
import OwnerDashboard from '../pages/partner-portal/OwnerDashboard';

vi.mock('../services/ownerServices', () => ({
    getOwnerApplication: vi.fn(),
    getOwnerApplications: vi.fn(),
    isLaundryAdmin: vi.fn(),
    reviewOwnerApplication: vi.fn(),
    submitOwnerApplication: vi.fn(),
}));

vi.mock('../utils/locationUtils', () => ({
    getCurrentLocation: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: { email: 'admin@gmail.com' }, signOut: vi.fn() }),
}));

const application: OwnerApplication = {
    id: 'app_1',
    userId: 'user_1',
    ownerName: 'Ama Mensah',
    ownerEmail: 'ama@example.com',
    contactPhone: '+233201234567',
    businessName: 'Fresh Fold',
    about: 'Careful laundry service',
    line1: '12 Market Street',
    line2: '',
    city: 'Accra',
    pincode: '002331',
    services: ['wash-fold'],
    status: 'pending',
    rejectionReason: null,
    partnerId: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    latitude: 5.6037,
    longitude: -0.187,
    imagePath:
        '9c954376-3c33-4a14-9d8c-f31ce998a1a1/owner-listings/ab12cd34-5678-90ab-cdef-1234567890ab.jpg',
    imageUrl: 'https://example.com/photo.jpg',
};

const renderInRouter = (page: ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('owner onboarding and admin review', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('submits a laundry owner application and shows the review status', async () => {
        vi.mocked(getOwnerApplication)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(application);
        vi.mocked(submitOwnerApplication).mockResolvedValue(undefined);
        vi.mocked(getCurrentLocation).mockResolvedValue({
            latitude: 5.6037,
            longitude: -0.187,
        });
        renderInRouter(<OwnerDashboard />);

        fireEvent.change(await screen.findByLabelText('Owner full name'), {
            target: { value: 'Ama Mensah' },
        });
        fireEvent.change(screen.getByLabelText('Contact phone'), {
            target: { value: '+233201234567' },
        });
        fireEvent.change(screen.getByLabelText('Business name'), {
            target: { value: 'Fresh Fold' },
        });
        fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Accra' } });
        fireEvent.change(screen.getByLabelText('Street address'), {
            target: { value: '12 Market Street' },
        });
        fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '002331' } });
        fireEvent.click(screen.getByLabelText('Wash and fold'));
        fireEvent.click(screen.getByRole('button', { name: 'Use current location' }));
        await screen.findByText(/Location set:/);
        fireEvent.change(screen.getByLabelText('Laundry photo'), {
            target: { files: [new File(['photo'], 'laundry.png', { type: 'image/png' })] },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

        await waitFor(() => expect(submitOwnerApplication).toHaveBeenCalledTimes(1));
        expect(submitOwnerApplication).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerName: 'Ama Mensah',
                businessName: 'Fresh Fold',
                services: ['wash-fold'],
                latitude: 5.6037,
                longitude: -0.187,
            }),
            expect.any(File)
        );
        expect(await screen.findByText('Application under review')).toBeInTheDocument();
    });

    it('requires a rejection reason and refreshes the admin queue after rejecting', async () => {
        vi.mocked(isLaundryAdmin).mockResolvedValue(true);
        vi.mocked(getOwnerApplications)
            .mockResolvedValueOnce([application])
            .mockResolvedValueOnce([]);
        vi.mocked(reviewOwnerApplication).mockResolvedValue(null);
        renderInRouter(<AdminDashboard />);

        fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Enter a reason before rejecting an application.'
        );
        fireEvent.change(screen.getByLabelText('Rejection reason (required to reject)'), {
            target: { value: 'Please confirm your business address.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

        await waitFor(() =>
            expect(reviewOwnerApplication).toHaveBeenCalledWith(
                'app_1',
                false,
                'Please confirm your business address.'
            )
        );
        expect(await screen.findByText('No owner applications yet.')).toBeInTheDocument();
    });
});
