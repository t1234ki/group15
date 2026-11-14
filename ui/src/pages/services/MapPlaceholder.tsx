import * as L from 'leaflet';
import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { LISTING_COPY } from '../../config/listingConfig';
import { ROUTES } from '../../config/navigationConfig';
import type { Partner } from '../../models/partnerModels';
import styles from './mapPlaceholder.module.scss';

interface MapPlaceholderProps {
    partners: Partner[];
    location: { latitude: number; longitude: number } | null;
    selectedPartnerId: string | null;
    onSelectPartner: (partnerId: string) => void;
}

const DEFAULT_CENTER: L.LatLngExpression = [5.6037, -0.187];
type LocatedPartner = Partner & { latitude: number; longitude: number };

const partnerHasCoordinates = (partner: Partner): partner is LocatedPartner =>
    typeof partner.latitude === 'number' &&
    Number.isFinite(partner.latitude) &&
    typeof partner.longitude === 'number' &&
    Number.isFinite(partner.longitude);

const MapPlaceholder: React.FC<MapPlaceholderProps> = ({
    partners,
    location,
    selectedPartnerId,
    onSelectPartner,
}) => {
    const mapElement = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const element = mapElement.current;
        if (!element || element.clientWidth === 0 || element.clientHeight === 0) return;

        const map = L.map(element, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map);

        const locatedPartners = partners.filter(partnerHasCoordinates);
        const markerById = new Map<string, L.CircleMarker>();

        for (const partner of locatedPartners) {
            const marker = L.circleMarker([partner.latitude, partner.longitude], {
                radius: partner.id === selectedPartnerId ? 10 : 7,
                color: 'var(--accent, #0b7264)',
                fillColor: 'var(--accent, #0b7264)',
                fillOpacity: 0.9,
                weight: partner.id === selectedPartnerId ? 4 : 2,
            }).addTo(map);
            marker.on('click', () => onSelectPartner(partner.id));

            const popup = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = partner.name;
            const address = document.createElement('p');
            address.textContent = [
                partner.address.line1,
                partner.address.line2,
                partner.address.city,
            ]
                .filter(Boolean)
                .join(', ');
            const link = document.createElement('a');
            link.href = ROUTES.laundry(partner.id);
            link.textContent = 'View laundry';
            popup.append(name, address, link);
            marker.bindPopup(popup);

            const label = document.createElement('span');
            label.textContent = partner.name;
            marker.bindTooltip(label);
            markerById.set(partner.id, marker);
        }

        const selected = locatedPartners.find(({ id }) => id === selectedPartnerId);
        if (selected) {
            map.setView([selected.latitude, selected.longitude], 14);
            markerById.get(selected.id)?.openPopup();
        } else if (locatedPartners.length > 0) {
            map.fitBounds(
                L.latLngBounds(
                    locatedPartners.map(
                        ({ latitude, longitude }) => [latitude, longitude] as L.LatLngTuple
                    )
                ),
                { padding: [24, 24], maxZoom: 13 }
            );
        } else {
            map.setView(location ? [location.latitude, location.longitude] : DEFAULT_CENTER, 12);
        }

        return () => {
            map.remove();
        };
    }, [location, onSelectPartner, partners, selectedPartnerId]);

    const hasLocatedPartners = partners.some(partnerHasCoordinates);

    return (
        <aside
            className={styles.mapView}
            aria-label={LISTING_COPY.mapTitle}
        >
            <div
                className={styles.mapCanvas}
                ref={mapElement}
                aria-label={LISTING_COPY.mapSubtitle}
            />
            {!hasLocatedPartners && (
                <p className={styles.mapEmpty}>{LISTING_COPY.mapNoCoordinates}</p>
            )}
        </aside>
    );
};

export default MapPlaceholder;
