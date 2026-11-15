import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
    CapacityOverride,
    HolidayClosure,
    PartnerLaundryConfiguration,
    PartnerLaundryConfigurationInput,
} from '../models/partnerConfigurationModels';
import type { OpeningHours } from '../models/partnerModels';
import { ApiError } from '../services/apiClient';
import {
    getPartnerLaundries,
    updatePartnerListingImage,
    updatePartnerLaundry,
} from '../services/partnerConfigurationServices';
import { PARTNER_SETTINGS_COPY } from '../config/partnerSettingsConfig';
import { getCurrentLocation } from '../utils/locationUtils';
import { useAsync } from './useAsync';

const toDraft = ({
    name,
    about,
    address,
    latitude,
    longitude,
    serviceRadiusKm,
    holidayClosures,
    capacityOverrides,
    turnaroundHours,
    acceptingOrders,
    useOpeningHours,
    openingHours,
}: PartnerLaundryConfiguration): PartnerLaundryConfigurationInput => ({
    name,
    about,
    address: { ...address },
    latitude,
    longitude,
    serviceRadiusKm,
    holidayClosures: holidayClosures.map((closure) => ({ ...closure })),
    capacityOverrides: capacityOverrides.map((override) => ({ ...override })),
    turnaroundHours,
    acceptingOrders,
    useOpeningHours,
    openingHours: openingHours.map((hour) => ({ ...hour })),
});

const asApiError = (error: unknown) =>
    error instanceof ApiError
        ? error
        : new ApiError('INTERNAL_ERROR', PARTNER_SETTINGS_COPY.saveFallback);

export const usePartnerSettings = () => {
    const loadState = useAsync(getPartnerLaundries, []);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [savedById, setSavedById] = useState<Record<string, PartnerLaundryConfiguration>>({});
    const [draft, setDraft] = useState<PartnerLaundryConfigurationInput | null>(null);
    const [draftPartnerId, setDraftPartnerId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [saveSucceeded, setSaveSucceeded] = useState(false);
    const [imageSaving, setImageSaving] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageWarning, setImageWarning] = useState<string | null>(null);
    const [imageSucceeded, setImageSucceeded] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);

    const configurations = useMemo(
        () => loadState.data?.map((item) => savedById[item.id] ?? item) ?? [],
        [loadState.data, savedById]
    );
    const effectiveId =
        selectedId && configurations.some(({ id }) => id === selectedId)
            ? selectedId
            : (configurations[0]?.id ?? null);
    const selected = configurations.find(({ id }) => id === effectiveId) ?? null;

    useEffect(() => {
        const nextId = selected?.id ?? null;
        if (nextId === draftPartnerId) return;
        setDraft(selected ? toDraft(selected) : null);
        setDraftPartnerId(nextId);
        setImageError(null);
        setImageWarning(null);
        setImageSucceeded(false);
        setSaveError(null);
        setSaveSucceeded(false);
        setLocationError(null);
    }, [draftPartnerId, selected]);

    const selectLaundry = (partnerId: string) => {
        setSelectedId(partnerId);
        setSaveError(null);
        setSaveSucceeded(false);
    };

    const updateField = <K extends keyof PartnerLaundryConfigurationInput>(
        key: K,
        value: PartnerLaundryConfigurationInput[K]
    ) => setDraft((current) => (current ? { ...current, [key]: value } : current));

    const updateAddress = (key: keyof PartnerLaundryConfigurationInput['address'], value: string) =>
        setDraft((current) =>
            current ? { ...current, address: { ...current.address, [key]: value } } : current
        );

    const locate = async () => {
        setIsLocating(true);
        setLocationError(null);
        try {
            const coordinates = await getCurrentLocation();
            setDraft((current) => (current ? { ...current, ...coordinates } : current));
        } catch (error) {
            setLocationError(
                error instanceof Error ? error.message : PARTNER_SETTINGS_COPY.locationUnavailable
            );
        } finally {
            setIsLocating(false);
        }
    };

    const updateHolidayClosure = (index: number, value: Partial<HolidayClosure>) =>
        setDraft((current) =>
            current
                ? {
                      ...current,
                      holidayClosures: current.holidayClosures.map((closure, position) =>
                          position === index ? { ...closure, ...value } : closure
                      ),
                  }
                : current
        );

    const addHolidayClosure = () =>
        setDraft((current) =>
            current && current.holidayClosures.length < 60
                ? {
                      ...current,
                      holidayClosures: [...current.holidayClosures, { date: '', reason: '' }],
                  }
                : current
        );

    const removeHolidayClosure = (index: number) =>
        setDraft((current) =>
            current
                ? {
                      ...current,
                      holidayClosures: current.holidayClosures.filter(
                          (_, position) => position !== index
                      ),
                  }
                : current
        );

    const updateCapacityOverride = (index: number, value: Partial<CapacityOverride>) =>
        setDraft((current) =>
            current
                ? {
                      ...current,
                      capacityOverrides: current.capacityOverrides.map((override, position) =>
                          position === index ? { ...override, ...value } : override
                      ),
                  }
                : current
        );

    const addCapacityOverride = () =>
        setDraft((current) =>
            current && current.capacityOverrides.length < 60
                ? {
                      ...current,
                      capacityOverrides: [
                          ...current.capacityOverrides,
                          { date: '', capacity: 8, note: '' },
                      ],
                  }
                : current
        );

    const removeCapacityOverride = (index: number) =>
        setDraft((current) =>
            current
                ? {
                      ...current,
                      capacityOverrides: current.capacityOverrides.filter(
                          (_, position) => position !== index
                      ),
                  }
                : current
        );

    const updateHours = (weekday: number, value: Partial<OpeningHours>) =>
        setDraft((current) =>
            current
                ? {
                      ...current,
                      openingHours: current.openingHours.map((hour) =>
                          hour.weekday === weekday ? { ...hour, ...value } : hour
                      ),
                  }
                : current
        );

    const setDayClosed = (weekday: number, closed: boolean) =>
        updateHours(
            weekday,
            closed ? { opensAt: null, closesAt: null } : { opensAt: '08:00', closesAt: '20:00' }
        );

    const save = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!effectiveId || !draft || isSaving) return;
        if (draft.latitude === null || draft.longitude === null) {
            setLocationError(PARTNER_SETTINGS_COPY.locationMissing);
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSucceeded(false);
        try {
            const saved = await updatePartnerLaundry(effectiveId, draft);
            setSavedById((current) => ({ ...current, [saved.id]: saved }));
            setDraft(toDraft(saved));
            setSaveSucceeded(true);
        } catch (error) {
            setSaveError(asApiError(error));
        } finally {
            setIsSaving(false);
        }
    };

    const saveListingImage = async (imageFile: File) => {
        if (!effectiveId || !selected || imageSaving) return false;
        setImageSaving(true);
        setImageError(null);
        setImageWarning(null);
        setImageSucceeded(false);
        try {
            const result = await updatePartnerListingImage(effectiveId, imageFile);
            setSavedById((current) => ({
                ...current,
                [effectiveId]: { ...selected, imageUrl: result.imageUrl },
            }));
            setImageWarning(result.cleanupWarning);
            setImageSucceeded(true);
            return true;
        } catch (error) {
            setImageError(
                error instanceof Error ? error.message : PARTNER_SETTINGS_COPY.saveFallback
            );
            return false;
        } finally {
            setImageSaving(false);
        }
    };

    return {
        loadState,
        configurations,
        selected,
        selectedId: effectiveId,
        draft,
        isSaving,
        saveError,
        saveSucceeded,
        imageSaving,
        imageError,
        imageWarning,
        imageSucceeded,
        isLocating,
        locationError,
        selectLaundry,
        updateField,
        updateAddress,
        locate,
        updateHolidayClosure,
        addHolidayClosure,
        removeHolidayClosure,
        updateCapacityOverride,
        addCapacityOverride,
        removeCapacityOverride,
        updateHours,
        setDayClosed,
        save,
        saveListingImage,
    };
};
