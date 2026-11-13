import React, { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/navigationConfig';
import {
    getOwnerApplication,
    submitOwnerApplication,
    type LaundryService,
    type OwnerApplication,
    type OwnerApplicationInput,
} from '../../services/ownerServices';
import { getCurrentLocation } from '../../utils/locationUtils';
import styles from './onboarding.module.scss';

const EMPTY_APPLICATION: OwnerApplicationInput = {
    ownerName: '',
    contactPhone: '',
    businessName: '',
    about: '',
    line1: '',
    line2: '',
    city: '',
    pincode: '',
    services: [],
    latitude: null,
    longitude: null,
    imagePath: null,
};

const SERVICE_OPTIONS: { id: LaundryService; label: string }[] = [
    { id: 'wash-fold', label: 'Wash and fold' },
    { id: 'wash-iron', label: 'Wash and iron' },
    { id: 'dry-cleaning', label: 'Dry cleaning' },
    { id: 'premium-care', label: 'Premium garment care' },
];

const OwnerDashboard: React.FC = () => {
    const [application, setApplication] = useState<OwnerApplication | null>(null);
    const [draft, setDraft] = useState<OwnerApplicationInput>(EMPTY_APPLICATION);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        let active = true;
        void getOwnerApplication()
            .then((result) => {
                if (!active) return;
                setApplication(result);
                if (result) {
                    setDraft({
                        ownerName: result.ownerName,
                        contactPhone: result.contactPhone,
                        businessName: result.businessName,
                        about: result.about,
                        line1: result.line1,
                        line2: result.line2,
                        city: result.city,
                        pincode: result.pincode,
                        services: result.services,
                        latitude: result.latitude,
                        longitude: result.longitude,
                        imagePath: result.imagePath,
                    });
                }
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : 'Could not load your owner application.'
                    );
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!imageFile) {
            setSelectedImageUrl(null);
            return;
        }
        const imageUrl = URL.createObjectURL(imageFile);
        setSelectedImageUrl(imageUrl);
        return () => URL.revokeObjectURL(imageUrl);
    }, [imageFile]);

    const update = <K extends keyof OwnerApplicationInput>(
        key: K,
        value: OwnerApplicationInput[K]
    ) => setDraft((current) => ({ ...current, [key]: value }));

    const toggleService = (service: LaundryService) =>
        update(
            'services',
            draft.services.includes(service)
                ? draft.services.filter((item) => item !== service)
                : [...draft.services, service]
        );

    const locateBusiness = async () => {
        setIsLocating(true);
        setError(null);
        try {
            const coordinates = await getCurrentLocation();
            setDraft((current) => ({ ...current, ...coordinates }));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not get your location.');
        } finally {
            setIsLocating(false);
        }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSaving) return;
        if (draft.services.length === 0) {
            setError('Select at least one service you offer.');
            return;
        }
        if (draft.latitude === null || draft.longitude === null) {
            setError('Set the laundry location before submitting your application.');
            return;
        }
        if (!imageFile && !draft.imagePath) {
            setError('Choose a laundry photo before submitting your application.');
            return;
        }
        setIsSaving(true);
        setError(null);
        setSaved(false);
        try {
            await submitOwnerApplication(draft, imageFile);
            const result = await getOwnerApplication();
            setApplication(result);
            if (result) {
                setDraft((current) => ({ ...current, imagePath: result.imagePath }));
            }
            setImageFile(null);
            setSaved(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not submit your application.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading)
        return (
            <main className={styles.page}>
                <p role="status">Loading your application...</p>
            </main>
        );
    if (error && !application && !draft.businessName)
        return (
            <main className={styles.page}>
                <p role="alert">{error}</p>
            </main>
        );

    return (
        <main className={styles.page}>
            <div className={styles.inner}>
                <header className={styles.pageHead}>
                    <p className={styles.eyebrow}>Laundry owner portal</p>
                    <h1>Grow your laundry business</h1>
                    <p>Apply to join SI MA ME. Our team will review your business details.</p>
                </header>

                {application?.status === 'approved' ? (
                    <section
                        className={`card ${styles.statusCard}`}
                        aria-labelledby="approved-heading"
                    >
                        <p className={styles.status}>Application approved</p>
                        <h2 id="approved-heading">{application.businessName} is ready to set up</h2>
                        <p>
                            Configure your location, hours, availability and services before
                            accepting orders.
                        </p>
                        <div className={styles.actions}>
                            <Link
                                className="button button--primary"
                                to={ROUTES.partnerSettings}
                            >
                                Set up your laundry
                            </Link>
                            <Link
                                className="button button--secondary"
                                to={ROUTES.partnerOrders}
                            >
                                Open owner dashboard
                            </Link>
                        </div>
                    </section>
                ) : (
                    <>
                        {application?.status === 'pending' && (
                            <section
                                className={`card ${styles.statusCard}`}
                                aria-live="polite"
                            >
                                <p className={styles.status}>Application under review</p>
                                <h2>{application.businessName}</h2>
                                <p>
                                    We have received your application. You can sign in again later
                                    to check its status.
                                </p>
                            </section>
                        )}
                        {application?.status === 'rejected' && (
                            <section
                                className={`card ${styles.statusCard}`}
                                aria-live="polite"
                            >
                                <p className={styles.status}>Changes requested</p>
                                <h2>{application.businessName}</h2>
                                <p>
                                    {application.rejectionReason ||
                                        'Please review your details and submit an updated application.'}
                                </p>
                            </section>
                        )}
                        {application?.status !== 'pending' && (
                            <form
                                className={`card ${styles.form}`}
                                onSubmit={(event) => void submit(event)}
                            >
                                <h2>
                                    {application?.status === 'rejected'
                                        ? 'Update your application'
                                        : 'Business application'}
                                </h2>
                                <div className={styles.fieldGrid}>
                                    <label>
                                        Owner full name
                                        <input
                                            required
                                            maxLength={120}
                                            value={draft.ownerName}
                                            onChange={(event) =>
                                                update('ownerName', event.target.value)
                                            }
                                        />
                                    </label>
                                    <label>
                                        Contact phone
                                        <input
                                            required
                                            type="tel"
                                            minLength={7}
                                            maxLength={32}
                                            value={draft.contactPhone}
                                            onChange={(event) =>
                                                update('contactPhone', event.target.value)
                                            }
                                        />
                                    </label>
                                    <label>
                                        Business name
                                        <input
                                            required
                                            maxLength={120}
                                            value={draft.businessName}
                                            onChange={(event) =>
                                                update('businessName', event.target.value)
                                            }
                                        />
                                    </label>
                                    <label>
                                        City
                                        <input
                                            required
                                            maxLength={80}
                                            value={draft.city}
                                            onChange={(event) => update('city', event.target.value)}
                                        />
                                    </label>
                                    <label className={styles.fullWidth}>
                                        Street address
                                        <input
                                            required
                                            maxLength={160}
                                            value={draft.line1}
                                            onChange={(event) =>
                                                update('line1', event.target.value)
                                            }
                                        />
                                    </label>
                                    <label className={styles.fullWidth}>
                                        Address details (optional)
                                        <input
                                            maxLength={160}
                                            value={draft.line2}
                                            onChange={(event) =>
                                                update('line2', event.target.value)
                                            }
                                        />
                                    </label>
                                    <label>
                                        Postal code
                                        <input
                                            required
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            value={draft.pincode}
                                            onChange={(event) =>
                                                update('pincode', event.target.value)
                                            }
                                        />
                                    </label>
                                </div>
                                <section
                                    className={styles.locationField}
                                    aria-labelledby="business-location-heading"
                                >
                                    <h3 id="business-location-heading">Laundry location</h3>
                                    <p>
                                        Be at the laundry and allow your browser to use its
                                        location. We only request it when you tap the button.
                                    </p>
                                    <button
                                        className="button button--secondary"
                                        type="button"
                                        onClick={() => void locateBusiness()}
                                        disabled={isLocating || isSaving}
                                    >
                                        {isLocating
                                            ? 'Finding location...'
                                            : 'Use current location'}
                                    </button>
                                    {draft.latitude !== null && draft.longitude !== null && (
                                        <p
                                            className={styles.locationValue}
                                            role="status"
                                        >
                                            Location set: {draft.latitude.toFixed(5)},{' '}
                                            {draft.longitude.toFixed(5)}
                                            {' · '}
                                            <a
                                                href={`https://www.google.com/maps?q=${draft.latitude},${draft.longitude}`}
                                                target="_blank"
                                                rel="noreferrer noopener"
                                            >
                                                View on Google Maps
                                            </a>
                                        </p>
                                    )}
                                </section>
                                <div className={styles.imageField}>
                                    <label>
                                        Laundry photo
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            required={!imageFile && !draft.imagePath}
                                            onChange={(event) =>
                                                setImageFile(event.target.files?.[0] ?? null)
                                            }
                                        />
                                    </label>
                                    <p>
                                        Upload a clear photo of the laundry (JPEG, PNG or WebP, up
                                        to 5 MB).
                                    </p>
                                    {(selectedImageUrl || application?.imageUrl) && (
                                        <img
                                            className={styles.imagePreview}
                                            src={selectedImageUrl ?? application?.imageUrl ?? ''}
                                            alt={`Preview of ${draft.businessName || 'laundry'} listing photo`}
                                        />
                                    )}
                                </div>
                                <label className={styles.description}>
                                    About your business
                                    <textarea
                                        maxLength={1000}
                                        rows={4}
                                        value={draft.about}
                                        onChange={(event) => update('about', event.target.value)}
                                    />
                                </label>
                                <fieldset className={styles.services}>
                                    <legend>Services you offer</legend>
                                    {SERVICE_OPTIONS.map(({ id, label }) => (
                                        <label key={id}>
                                            <input
                                                type="checkbox"
                                                checked={draft.services.includes(id)}
                                                onChange={() => toggleService(id)}
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </fieldset>
                                {error && (
                                    <p
                                        className={styles.error}
                                        role="alert"
                                    >
                                        {error}
                                    </p>
                                )}
                                {saved && (
                                    <p
                                        className={styles.success}
                                        role="status"
                                    >
                                        Your application was submitted for review.
                                    </p>
                                )}
                                <button
                                    className="button button--primary"
                                    type="submit"
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? 'Submitting...'
                                        : application?.status === 'rejected'
                                          ? 'Resubmit application'
                                          : 'Submit application'}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </main>
    );
};

export default OwnerDashboard;
