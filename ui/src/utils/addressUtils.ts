import { Address } from '../models/bookingModels';

export const addressFieldId = (prefix: string, field: string) => `${prefix}-${field}`;

/**
 * Keep formatting characters for display, but require a plausible dialable
 * number. Ten digits covers a local Ghanaian mobile; fifteen is E.164's ceiling.
 */
export const isValidPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
};

/** Collapses an address into the non-empty lines shown on a summary. */
export const toAddressLines = ({
    recipientName,
    building,
    street,
    landmark,
    phone,
}: Address) => [recipientName, [building, street, landmark].filter(Boolean).join(', '), phone].filter(Boolean);

/** Single-line rendering of an address, for lists and summaries. */
export const formatAddress = ({ building, street, landmark }: Address) =>
    [building, street, landmark].filter(Boolean).join(', ');
