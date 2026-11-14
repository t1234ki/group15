import React from 'react';
import { Navigate } from 'react-router-dom';
import AsyncBoundary from '../../common-ui/async-boundary/AsyncBoundary';
import BackLink from '../../common-ui/back-link/BackLink';
import Icon from '../../common-ui/icons/Icon';
import Money from '../../common-ui/money/Money';
import OrderTotals from '../../common-ui/order-totals/OrderTotals';
import { API_COPY } from '../../config/apiConfig';
import { CHECKOUT_COPY, PAYMENT_METHOD_OPTIONS } from '../../config/bookingConfig';
import { ICON_SIZE } from '../../config/brandConfig';
import { ROUTES } from '../../config/navigationConfig';
import { SCHEDULE_ANCHOR_ID, useCheckoutForm } from '../../hooks/useCheckoutForm';
import { multiplyMoney } from '../../models/moneyModels';
import AddressPicker from './AddressPicker';
import SlotPicker from './SlotPicker';
import styles from './checkout.module.scss';

const CheckoutPage: React.FC = () => {
    const {
        partner,
        live,
        slots,
        days,
        lines,
        subtotal,
        taxes,
        total,
        savedAddresses,
        selectedAddressId,
        draftAddress,
        pickup,
        delivery,
        paymentMethod,
        errors,
        isSubmitting,
        isLocating,
        submitError,
        isEmpty,
        isPartnerClosed,
        selectAddress,
        updateDraftAddress,
        locate,
        setPickup,
        setDelivery,
        setPaymentMethod,
        confirm,
    } = useCheckoutForm();

    const scheduleError = errors.pickup ?? errors.delivery ?? errors.deliveryBeforePickup;
    const selectedSavedAddress = savedAddresses.find((item) => item.id === selectedAddressId);

    if (isEmpty || !partner) {
        return (
            <Navigate
                to={ROUTES.cart}
                replace
            />
        );
    }

    return (
        <div className={styles.checkout}>
            <div className={styles.checkoutInner}>
                <BackLink
                    label={CHECKOUT_COPY.back}
                    to={ROUTES.cart}
                />

                <p className={styles.checkoutEyebrow}>{CHECKOUT_COPY.orderingFrom}</p>
                <h1 className={styles.checkoutTitle}>{partner.name}</h1>
                <p className={styles.checkoutSubtitle}>{CHECKOUT_COPY.subtitle}</p>

                {live.isLoading && (
                    <p
                        className={styles.checkoutStatus}
                        id="partner-availability"
                        role="status"
                    >
                        {CHECKOUT_COPY.checkingPartner}
                    </p>
                )}

                {live.error && (
                    <div
                        className={styles.checkoutBlocked}
                        id="partner-availability"
                        role="alert"
                    >
                        <p>{CHECKOUT_COPY.partnerCheckFailed}</p>
                        <button
                            className="button button--secondary"
                            type="button"
                            onClick={live.reload}
                        >
                            {API_COPY.retry}
                        </button>
                    </div>
                )}

                {/*
                 * `id` matches the field name so the shared focusField helper
                 * can bring it into view like any other problem. Rendered from
                 * `errors` rather than from `isPartnerClosed` directly, so it
                 * appears when the customer tries to confirm rather than
                 * interrupting them as the request lands.
                 */}
                {errors.partnerClosed && (
                    <p
                        className={styles.checkoutBlocked}
                        id="partnerClosed"
                        role="alert"
                    >
                        {errors.partnerClosed}
                    </p>
                )}

                <section className={styles.checkoutSection}>
                    <h2 className={styles.checkoutHeading}>{CHECKOUT_COPY.addressHeading}</h2>
                    <p className={styles.checkoutHint}>{CHECKOUT_COPY.addressSubtitle}</p>
                    <AddressPicker
                        savedAddresses={savedAddresses}
                        selectedId={selectedAddressId}
                        draft={draftAddress}
                        needsLocation={Boolean(
                            selectedSavedAddress &&
                            (selectedSavedAddress.latitude === null ||
                                selectedSavedAddress.longitude === null)
                        )}
                        errors={errors}
                        onSelect={selectAddress}
                        onDraftChange={updateDraftAddress}
                        isLocating={isLocating}
                        onLocate={locate}
                    />
                </section>

                <section
                    className={styles.checkoutSection}
                    id={SCHEDULE_ANCHOR_ID}
                >
                    <h2 className={styles.checkoutHeading}>{CHECKOUT_COPY.scheduleHeading}</h2>
                    <p className={styles.checkoutHint}>{CHECKOUT_COPY.scheduleSubtitle}</p>
                    {scheduleError && (
                        <p
                            className={styles.checkoutError}
                            role="alert"
                        >
                            {scheduleError}
                        </p>
                    )}
                    <AsyncBoundary
                        state={slots}
                        label={CHECKOUT_COPY.loadingSlots}
                        isEmpty={() => days.length === 0}
                        empty={<p className={styles.checkoutHint}>{CHECKOUT_COPY.noSlots}</p>}
                    >
                        {() => (
                            <div className={styles.schedule}>
                                <SlotPicker
                                    index={1}
                                    title={CHECKOUT_COPY.pickupLabel}
                                    days={days}
                                    value={pickup}
                                    onChange={setPickup}
                                />
                                <SlotPicker
                                    index={2}
                                    title={CHECKOUT_COPY.deliveryLabel}
                                    days={days}
                                    value={delivery}
                                    min={pickup}
                                    onChange={setDelivery}
                                />
                            </div>
                        )}
                    </AsyncBoundary>
                </section>

                <section className={styles.checkoutSection}>
                    <h2 className={styles.checkoutHeading}>{CHECKOUT_COPY.summaryHeading}</h2>
                    <div className={`card ${styles.checkoutSummary}`}>
                        <ul className={styles.checkoutLines}>
                            {lines.map(({ item, quantity }) => (
                                <li key={item.id}>
                                    <span>
                                        {item.name} ×{quantity}
                                    </span>
                                    <strong>
                                        <Money value={multiplyMoney(item.price, quantity)} />
                                    </strong>
                                </li>
                            ))}
                        </ul>
                        <OrderTotals
                            subtotal={subtotal}
                            taxes={taxes}
                            total={total}
                        />
                    </div>
                </section>

                <section className={styles.checkoutSection}>
                    <h2 className={styles.checkoutHeading}>{CHECKOUT_COPY.paymentHeading}</h2>
                    <p className={styles.checkoutHint}>{CHECKOUT_COPY.paymentSubtitle}</p>
                    <fieldset className={styles.paymentOptions}>
                        <legend className="visually-hidden">{CHECKOUT_COPY.paymentHeading}</legend>
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <label
                                className={styles.paymentOption}
                                key={option.value}
                            >
                                <input
                                    type="radio"
                                    name="payment-method"
                                    value={option.value}
                                    checked={paymentMethod === option.value}
                                    onChange={() => setPaymentMethod(option.value)}
                                />
                                <span>
                                    <strong>{option.label}</strong>
                                    <small>{option.detail}</small>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                </section>

                <p className={styles.checkoutNote}>
                    <Icon
                        name="check-circle"
                        size={ICON_SIZE.sm}
                    />
                    {paymentMethod === 'cash_on_pickup'
                        ? CHECKOUT_COPY.paymentNote
                        : CHECKOUT_COPY.demoPaymentNote}
                </p>

                <button
                    className={`button button--primary ${styles.checkoutConfirm}`}
                    type="button"
                    aria-describedby={
                        live.isLoading || live.error
                            ? 'partner-availability'
                            : isPartnerClosed
                              ? 'partnerClosed'
                              : undefined
                    }
                    disabled={live.isLoading || Boolean(live.error) || isSubmitting}
                    onClick={() => void confirm()}
                >
                    {isSubmitting ? CHECKOUT_COPY.confirming : CHECKOUT_COPY.confirm}
                    <Icon
                        name="arrow-right"
                        size={ICON_SIZE.md}
                    />
                </button>
                {submitError && <p role="alert">{submitError}</p>}
            </div>
        </div>
    );
};

export default CheckoutPage;
