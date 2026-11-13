import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { analytics } from '../services/analyticsServices';
import { ANALYTICS_EVENTS } from '../config/analyticsConfig';
import { ROUTES } from '../config/navigationConfig';

/**
 * Requests the visitor's location only after an explicit click, then opens a
 * distance-aware marketplace listing.
 *
 * The button stays enabled and explains itself, rather than sitting disabled: a
 * disabled control gives no reason, and it leaves the tab order, so a keyboard
 * visitor finds the app's headline action has silently vanished instead of
 * objecting. Same rule as checkout's Confirm.
 */
export const useLocationSearch = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [error, setError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const requestId = useRef(0);

    return {
        error,
        isLocating,
        locate: () => {
            const geolocation = window.navigator.geolocation;
            if (!geolocation) {
                setError('Location is not available in this browser. You can still browse all laundries.');
                return;
            }

            const currentRequest = ++requestId.current;
            setIsLocating(true);
            setError(null);
            geolocation.getCurrentPosition(
                ({ coords }) => {
                    if (currentRequest !== requestId.current) return;
                    analytics.trackEvent(ANALYTICS_EVENTS.partnerSearch, {
                        surface: pathname === ROUTES.journey ? 'journey' : 'homepage',
                    });
                    navigate(ROUTES.laundries, {
                        state: {
                            nearbyCoordinates: {
                                latitude: coords.latitude,
                                longitude: coords.longitude,
                            },
                        },
                    });
                    setIsLocating(false);
                },
                (positionError) => {
                    if (currentRequest !== requestId.current) return;
                    setError(
                        positionError.code === positionError.PERMISSION_DENIED
                            ? 'Location permission was denied. Allow location access in your browser and try again.'
                            : positionError.code === positionError.TIMEOUT
                              ? 'Finding your location took too long. Please try again.'
                              : 'Your location could not be determined. Please try again.'
                    );
                    setIsLocating(false);
                },
                { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
            );
        },
        cancel: () => {
            requestId.current += 1;
            setIsLocating(false);
        },
    };
};
