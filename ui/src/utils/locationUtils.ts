export interface Coordinates {
    latitude: number;
    longitude: number;
}

export const getCurrentLocation = (): Promise<Coordinates> =>
    new Promise((resolve, reject) => {
        const geolocation = window.navigator.geolocation;
        if (!geolocation) {
            reject(new Error('Location is not available in this browser.'));
            return;
        }

        geolocation.getCurrentPosition(
            ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
            (error) =>
                reject(
                    new Error(
                        error.code === error.PERMISSION_DENIED
                            ? 'Location permission was denied. Allow location access in your browser and try again.'
                            : error.code === error.TIMEOUT
                              ? 'Finding your location took too long. Please try again.'
                              : 'Your location could not be determined. Please try again.'
                    )
                ),
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
        );
    });
