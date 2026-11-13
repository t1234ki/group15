import React from 'react';
import Icon from '../../common-ui/icons/Icon';
import { ADDRESS_FIELDS, CHECKOUT_COPY } from '../../config/bookingConfig';
import { ICON_SIZE } from '../../config/brandConfig';
import { Address } from '../../models/bookingModels';
import styles from './checkout.module.scss';

interface AddressFieldsProps {
    address: Address;
    idPrefix: string;
    /** Field-level messages, populated once the customer tries to submit. */
    errors?: Partial<Record<string, string>>;
    isLocating: boolean;
    readOnlyAddress?: boolean;
    onChange: (
        field: 'recipientName' | 'phone' | 'building' | 'street' | 'landmark',
        value: string
    ) => void;
    onLocate: () => void;
}

const AddressFields: React.FC<AddressFieldsProps> = ({
    address,
    idPrefix,
    errors,
    isLocating,
    readOnlyAddress = false,
    onChange,
    onLocate,
}) => (
    <fieldset className={styles.checkoutFieldset}>
        <legend className="visually-hidden">Pickup address</legend>
        <div className={styles.addressForm}>
            {ADDRESS_FIELDS.map(({ name, label, placeholder, half, inputMode, maxLength }) => {
                const error = errors?.[name];
                const inputId = `${idPrefix}-${name}`;
                const errorId = `${inputId}-error`;

                return (
                    <p
                        key={name}
                        className={styles.addressFormField}
                        data-half={Boolean(half)}
                    >
                        <label htmlFor={inputId}>{label}</label>
                        <input
                            id={inputId}
                            name={name}
                            value={address[name]}
                            placeholder={placeholder}
                            inputMode={inputMode}
                            type={name === 'phone' ? 'tel' : 'text'}
                            maxLength={maxLength}
                            readOnly={readOnlyAddress}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                            onChange={(event) => onChange(name, event.target.value)}
                        />
                        {error && (
                            <span
                                className={styles.addressFormError}
                                id={errorId}
                            >
                                {error}
                            </span>
                        )}
                    </p>
                );
            })}
        </div>

        <div className={styles.addressForm}>
            <p className={styles.addressFormField}>
                <span>{address.latitude === null || address.longitude === null
                    ? 'Pickup location is required'
                    : `Pickup location saved (${address.latitude.toFixed(5)}, ${address.longitude.toFixed(5)})`}</span>
                <button
                    id={`${idPrefix}-location`}
                    className="button"
                    type="button"
                    aria-invalid={Boolean(errors?.location)}
                    aria-describedby={errors?.location ? `${idPrefix}-location-error` : undefined}
                    disabled={isLocating}
                    onClick={onLocate}
                >
                    {isLocating ? 'Finding location...' : 'Use my current location'}
                </button>
                {errors?.location && (
                    <span
                        className={styles.addressFormError}
                        id={`${idPrefix}-location-error`}
                    >
                        {errors.location}
                    </span>
                )}
            </p>
        </div>

        <p className={styles.checkoutNote}>
            <Icon
                name="pin"
                size={ICON_SIZE.sm}
            />
            {CHECKOUT_COPY.sameAddressNote}
        </p>
    </fieldset>
);

export default AddressFields;
