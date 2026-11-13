import { Money } from '../models/moneyModels';
import { CURRENCY } from '../config/brandConfig';

/**
 * Pesewas to a display string: whole cedis drop decimals ("1,999"); fractional
 * cedis keep both places ("3.60").
 */
export const formatAmount = ({ amount }: Money) => {
    const hasPesewas = amount % 100 !== 0;

    return (amount / 100).toLocaleString(CURRENCY.locale, {
        minimumFractionDigits: hasPesewas ? 2 : 0,
        maximumFractionDigits: hasPesewas ? 2 : 0,
    });
};
