import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Address, emptyAddress } from '../models/bookingModels';
import { User } from '../data/user';
import { VALIDATION_COPY } from '../config/bookingConfig';
import { ROUTES } from '../config/navigationConfig';
import { LABEL_FIELD_ID, PROFILE_COPY, SAVED_ADDRESS_ID_PREFIX } from '../config/profileConfig';
import { useAuth } from '../context/AuthContext';
import { addressFieldId, isValidPhone } from '../utils/addressUtils';
import { focusField } from '../utils/formUtils';
import { getCurrentLocation } from '../utils/locationUtils';

/** `label` is this form's own; the rest are the shared address fields. */
export type AddressFormField =
    | 'label'
    | 'recipientName'
    | 'phone'
    | 'building'
    | 'street'
    | 'location';

/**
 * Collects a new saved address and appends it to the account.
 *
 * Ordered so the first problem found is the one nearest the top, and reported
 * rather than expressed as a disabled button: the same rule checkout follows.
 */
const findProblems = (label: string, address: Address): AddressFormField[] => {
    const problems: AddressFormField[] = [];

    if (!label.trim()) problems.push('label');
    if (!address.recipientName.trim()) problems.push('recipientName');
    if (!isValidPhone(address.phone)) problems.push('phone');
    if (!address.building.trim()) problems.push('building');
    if (!address.street.trim()) problems.push('street');
    if (address.latitude === null || address.longitude === null) problems.push('location');

    return problems;
};

const messageFor = (field: AddressFormField) =>
    field === 'label' ? PROFILE_COPY.labelRequired : VALIDATION_COPY[field];

export const useAddressForm = () => {
    const { user, addAddress, editAddress } = useAuth();
    const navigate = useNavigate();
    const { addressId } = useParams();
    const account = user as User;
    const existing = addressId
        ? account.addresses.find((savedAddress) => savedAddress.id === addressId)
        : undefined;
    const isEditing = Boolean(addressId);

    const [label, setLabel] = useState(existing?.label ?? '');
    const [address, setAddress] = useState<Address>(() => ({
        ...(existing ?? emptyAddress()),
        // The account holder is the usual recipient, so prefill their details.
        recipientName: existing?.recipientName ?? account.fullName,
        phone: existing?.phone ?? account.phone,
    }));
    const [errors, setErrors] = useState<Partial<Record<AddressFormField, string>>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const clearError = (field: AddressFormField) =>
        setErrors((current) => {
            if (!current[field]) {
                return current;
            }

            const next = { ...current };
            delete next[field];
            return next;
        });

    return {
        label,
        address,
        errors,
        isSaving,
        isLocating,
        saveError,
        isEditing,
        isMissing: isEditing && !existing,
        setLabel: (value: string) => {
            setLabel(value);
            clearError('label');
        },
        updateAddress: (
            field: 'recipientName' | 'phone' | 'building' | 'street' | 'landmark',
            value: string
        ) => {
            setAddress((current) => ({ ...current, [field]: value }));
            if (field !== 'landmark') clearError(field);
        },
        locate: async () => {
            setIsLocating(true);
            setSaveError(null);
            try {
                const coordinates = await getCurrentLocation();
                setAddress((current) => ({ ...current, ...coordinates }));
                clearError('location');
            } catch (error) {
                setSaveError(error instanceof Error ? error.message : PROFILE_COPY.saveAddressError);
            } finally {
                setIsLocating(false);
            }
        },
        save: async (event: React.FormEvent) => {
            event.preventDefault();
            setSaveError(null);
            const problems = findProblems(label, address);

            if (problems.length > 0) {
                setErrors(Object.fromEntries(problems.map((field) => [field, messageFor(field)])));
                // The label input is this page's own and is not one of the
                // shared address fields, so it carries its own id.
                focusField(
                    problems[0] === 'label'
                        ? LABEL_FIELD_ID
                        : addressFieldId(SAVED_ADDRESS_ID_PREFIX, problems[0]!)
                );
                return;
            }

            setIsSaving(true);
            try {
                const changes = { ...address, label: label.trim() };
                if (existing) {
                    await editAddress(existing.id, changes);
                } else {
                    await addAddress({ ...changes, isDefault: false });
                }
                navigate(ROUTES.profile);
            } catch {
                setSaveError(PROFILE_COPY.saveAddressError);
            } finally {
                setIsSaving(false);
            }
        },
        cancel: () => navigate(ROUTES.profile),
    };
};
