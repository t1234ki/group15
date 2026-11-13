import React from 'react';
import appIcon from '../../assets/laundrylo-appicon-v2.svg';
import { BRAND } from '../../config/brandConfig';
import styles from './logo.module.scss';

export type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
    /** `wordmark` for navigation and footers, `icon` where space is tight. */
    variant?: 'wordmark' | 'icon';
    size?: LogoSize;
    className?: string;
}

const Logo: React.FC<LogoProps> = ({ variant = 'wordmark', size = 'md', className }) => {
    const sizeClass = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg }[size];
    const classes = [styles.logo, variant === 'icon' && styles.icon, sizeClass, className]
        .filter(Boolean)
        .join(' ');

    if (variant === 'icon') {
        return (
            <img
                className={classes}
                src={appIcon}
                alt={BRAND.name}
            />
        );
    }

    return (
        <span
            className={classes}
            role="img"
            aria-label={BRAND.name}
        >
            SI MA ME
        </span>
    );
};

export default Logo;
