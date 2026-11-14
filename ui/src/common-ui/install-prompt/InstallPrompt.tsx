import React, { useCallback, useEffect, useState } from 'react';
import { INSTALL_COPY } from '../../config/commonConfig';
import Icon from '../icons/Icon';
import styles from './installPrompt.module.scss';

const DISMISSED_KEY = 'laundrylo.installPromptDismissedAt';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isStandalone = () => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return displayMode || iosStandalone;
};

const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const wasRecentlyDismissed = () => {
    try {
        const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY));
        return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION_MS;
    } catch {
        return false;
    }
};

const rememberDismissal = () => {
    try {
        window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
        // The prompt remains dismissible for this visit when storage is unavailable.
    }
};

const InstallPrompt: React.FC = () => {
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [installError, setInstallError] = useState(false);
    const iosDevice = isIos();

    useEffect(() => {
        if (isStandalone() || wasRecentlyDismissed()) return;

        const showPrompt = () => setIsVisible(true);
        const handleBeforeInstallPrompt = (event: Event) => {
            const installPromptEvent = event as BeforeInstallPromptEvent;
            if (typeof installPromptEvent.prompt !== 'function') return;

            event.preventDefault();
            if (wasRecentlyDismissed()) return;
            setInstallEvent(installPromptEvent);
            showPrompt();
        };
        const handleInstalled = () => setIsVisible(false);

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleInstalled);
        const timer = window.setTimeout(showPrompt, 2500);

        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleInstalled);
        };
    }, []);

    const dismiss = useCallback(() => {
        rememberDismissal();
        setIsVisible(false);
    }, []);

    const install = async () => {
        if (!installEvent) return;

        setInstallError(false);
        try {
            await installEvent.prompt();
            const choice = await installEvent.userChoice;
            if (choice.outcome === 'dismissed') rememberDismissal();
            setIsVisible(false);
        } catch {
            setInstallError(true);
        } finally {
            setInstallEvent(null);
        }
    };

    if (!isVisible || isStandalone()) return null;

    return (
        <aside
            className={styles.installPrompt}
            role="region"
            aria-live="polite"
            aria-label={INSTALL_COPY.title}
        >
            <span
                className={styles.installPromptIcon}
                aria-hidden="true"
            >
                <Icon name="home" />
            </span>
            <div className={styles.installPromptContent}>
                <h2>{INSTALL_COPY.title}</h2>
                <p>{INSTALL_COPY.message}</p>
                {!installEvent && (
                    <p className={styles.installPromptInstructions}>
                        {iosDevice
                            ? INSTALL_COPY.iosInstructions
                            : INSTALL_COPY.browserInstructions}
                    </p>
                )}
                {installError && <p role="alert">{INSTALL_COPY.installError}</p>}
            </div>
            {installEvent && (
                <button
                    className={styles.installPromptAction}
                    type="button"
                    onClick={() => void install()}
                >
                    {INSTALL_COPY.install}
                </button>
            )}
            <button
                className={styles.installPromptDismiss}
                type="button"
                onClick={dismiss}
            >
                {INSTALL_COPY.later}
            </button>
        </aside>
    );
};

export default InstallPrompt;
