import React from 'react';
import { BRAND } from '../../config/brandConfig';
import { ROUTES } from '../../config/navigationConfig';
import Logo from '../logo/Logo';
import styles from './footer.module.scss';

const Footer: React.FC = () => (
    <footer className={styles.footer}>
        <div className="container">
            <div className={styles.footerTop}>
                <a
                    className={styles.footerLogoLink}
                    href={ROUTES.home}
                    aria-label={`${BRAND.name} home`}
                >
                    <Logo />
                </a>
                <p className={styles.footerBlurb}>{BRAND.blurb}</p>
                <p className={styles.footerBlurbSecondary}>{BRAND.blurbSecondary}</p>
            </div>

            <div className={styles.footerBottom}>
                <p>
                    © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
                </p>
            </div>
        </div>
    </footer>
);

export default Footer;
