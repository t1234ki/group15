export const BRAND = {
    name: 'SI MA ME',
    blurb:
        'SI MA ME brings campus laundry businesses together. Compare service ' +
        'prices, choose pickup and delivery slots, and track each order in one place.',
    blurbSecondary:
        'Save addresses, keep a synced cart and review the complete price before you book.',
    supportPhone: '',
    copyrightFrom: 2026,
} as const;

export const ICON_SIZE = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 26,
    hero: 30,
} as const;

/** Matches $icon-stroke-width in the design tokens. */
export const ICON_STROKE_WIDTH = 1.8;

export const CURRENCY = {
    symbol: 'GH₵',
    locale: 'en-GH',
} as const;
