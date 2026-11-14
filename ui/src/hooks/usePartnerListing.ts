import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Partner, PartnerTag } from '../models/partnerModels';
import { SERVICE_TYPES } from '../data/services';
import { analytics } from '../services/analyticsServices';
import { PartnerQuery, listPartners } from '../services/partnerServices';
import { ANALYTICS_EVENTS } from '../config/analyticsConfig';
import { DEFAULT_SORT, LISTING_COPY, PARTNER_PAGE_SIZE, SortKey } from '../config/listingConfig';
import { useAsync } from './useAsync';

interface Coordinates {
    latitude: number;
    longitude: number;
}

interface PartnerListingOptions {
    allBusinesses?: boolean;
    enabled?: boolean;
}

const coordinatesFromState = (state: unknown): Coordinates | null => {
    if (typeof state !== 'object' || state === null || !('nearbyCoordinates' in state)) {
        return null;
    }

    const coordinates = state.nearbyCoordinates;
    if (
        typeof coordinates !== 'object' ||
        coordinates === null ||
        !('latitude' in coordinates) ||
        !('longitude' in coordinates) ||
        typeof coordinates.latitude !== 'number' ||
        typeof coordinates.longitude !== 'number' ||
        !Number.isFinite(coordinates.latitude) ||
        !Number.isFinite(coordinates.longitude) ||
        Math.abs(coordinates.latitude) > 90 ||
        Math.abs(coordinates.longitude) > 180
    ) {
        return null;
    }

    return { latitude: coordinates.latitude, longitude: coordinates.longitude };
};

/**
 * Coordinates and service come from the query string, tags and sort from the
 * controls, and all four go to the server: filtering and ordering happen where
 * the whole catalogue is, not over whichever page happened to arrive.
 */
export const usePartnerListing = ({
    allBusinesses = false,
    enabled = true,
}: PartnerListingOptions = {}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const routerLocation = useLocation();
    const [coordinates, setCoordinates] = useState(() =>
        coordinatesFromState(routerLocation.state)
    );
    const hasLocation = !allBusinesses && coordinates !== null;
    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;

    useEffect(() => {
        const nextCoordinates = coordinatesFromState(routerLocation.state);
        if (nextCoordinates) setCoordinates(nextCoordinates);
    }, [routerLocation.state]);

    // The homepage service cards arrive here, so an unknown slug in a shared or
    // hand-edited URL has to mean "no filter" rather than "no results".
    const requestedService = searchParams.get('service');
    const matched = SERVICE_TYPES.find(({ id }) => id === requestedService);
    const service = allBusinesses ? null : (matched?.id ?? null);

    const [activeTags, setActiveTags] = useState<PartnerTag[]>([]);
    const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
    const previousHasLocation = useRef(hasLocation);
    const effectiveSortKey = !hasLocation && sortKey === 'distance' ? DEFAULT_SORT : sortKey;

    useEffect(() => {
        if (previousHasLocation.current !== hasLocation) {
            previousHasLocation.current = hasLocation;
            setSortKey(hasLocation ? 'distance' : DEFAULT_SORT);
            return;
        }
        if (effectiveSortKey !== sortKey) {
            setSortKey(effectiveSortKey);
        }
    }, [effectiveSortKey, hasLocation, sortKey]);

    // Arrays are rebuilt every render, so the dependency is their content.
    const effectiveTags = useMemo(
        () => (allBusinesses ? [] : activeTags),
        [activeTags, allBusinesses]
    );
    const tagKey = effectiveTags.slice().sort().join(',');
    const queryKey = [
        latitude ?? '',
        longitude ?? '',
        service ?? '',
        tagKey,
        effectiveSortKey,
    ].join('|');

    const buildQuery = useCallback(
        (): PartnerQuery => ({
            latitude: allBusinesses ? undefined : latitude,
            longitude: allBusinesses ? undefined : longitude,
            services: !allBusinesses && service ? [service] : undefined,
            tags: effectiveTags.length > 0 ? effectiveTags : undefined,
            sort: allBusinesses ? DEFAULT_SORT : effectiveSortKey,
            limit: PARTNER_PAGE_SIZE,
        }),
        [allBusinesses, latitude, longitude, service, effectiveTags, effectiveSortKey]
    );

    const firstPage = useAsync(
        (signal) =>
            enabled
                ? listPartners(buildQuery(), signal)
                : Promise.resolve({ data: [], nextCursor: null }),
        [enabled, allBusinesses, latitude, longitude, service, tagKey, effectiveSortKey]
    );
    const reportedQuery = useRef<string | null>(null);

    useEffect(() => {
        if (allBusinesses || !enabled || !firstPage.data || reportedQuery.current === queryKey)
            return;
        reportedQuery.current = queryKey;
        analytics.trackEvent(ANALYTICS_EVENTS.partnerResults, {
            result_count: firstPage.data.data.length,
            has_more: firstPage.data.nextCursor !== null,
            has_location: hasLocation,
            service_filter: service ?? 'none',
            tag_count: activeTags.length,
            sort: effectiveSortKey,
        });
    }, [
        activeTags.length,
        allBusinesses,
        enabled,
        effectiveSortKey,
        firstPage.data,
        hasLocation,
        queryKey,
        service,
    ]);

    // Pages beyond the first are appended rather than replacing what is shown.
    const [appended, setAppended] = useState<Partner[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState<string | null>(null);
    const loadMoreRequest = useRef<AbortController | null>(null);

    // A new first page - a filter changed, or a retry - discards what was
    // appended to the old one.
    useEffect(() => {
        loadMoreRequest.current?.abort();
        loadMoreRequest.current = null;
        setAppended([]);
        setCursor(firstPage.data?.nextCursor ?? null);
        setIsLoadingMore(false);
        setMoreError(null);

        return () => loadMoreRequest.current?.abort();
    }, [firstPage.data, queryKey]);

    const partners = firstPage.data ? [...firstPage.data.data, ...appended] : [];

    const loadMore = async () => {
        if (!cursor || isLoadingMore) return;

        const controller = new AbortController();
        loadMoreRequest.current?.abort();
        loadMoreRequest.current = controller;
        setIsLoadingMore(true);
        setMoreError(null);
        try {
            const next = await listPartners({ ...buildQuery(), cursor }, controller.signal);
            if (controller.signal.aborted) return;

            setAppended((current) => [...current, ...next.data]);
            setCursor(next.nextCursor);
        } catch {
            if (controller.signal.aborted) return;

            // The partners already on screen are still good; only the button
            // failed, so it says so and stays available.
            setMoreError(LISTING_COPY.showMoreFailed);
        } finally {
            if (loadMoreRequest.current === controller) {
                loadMoreRequest.current = null;
                setIsLoadingMore(false);
            }
        }
    };

    const clearService = useCallback(() => {
        setSearchParams(
            (params) => {
                params.delete('service');
                return params;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    return {
        hasLocation,
        location: allBusinesses ? null : coordinates,
        service,
        serviceName: matched?.name ?? '',
        clearService,
        state: firstPage,
        partners,
        hasMore: cursor !== null,
        isLoadingMore,
        moreError,
        loadMore,
        sortKey: effectiveSortKey,
        setSortKey,
        activeCount: activeTags.length,
        isTagActive: (tag: PartnerTag) => activeTags.includes(tag),
        clearTags: () => setActiveTags([]),
        toggleTag: (tag: PartnerTag) =>
            setActiveTags((tags) =>
                tags.includes(tag) ? tags.filter((current) => current !== tag) : [...tags, tag]
            ),
    };
};
