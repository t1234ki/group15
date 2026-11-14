import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { INSTALL_COPY } from '../config/commonConfig';
import InstallPrompt from '../common-ui/install-prompt/InstallPrompt';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const fireInstallPrompt = () => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    }) as BeforeInstallPromptEvent;
    act(() => window.dispatchEvent(event));
    return event;
};

describe('install app prompt', () => {
    it('offers the browser install prompt after the browser reports it is available', async () => {
        const user = userEvent.setup();
        render(<InstallPrompt />);

        const event = fireInstallPrompt();

        expect(event.defaultPrevented).toBe(true);
        expect(await screen.findByText(INSTALL_COPY.message)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: INSTALL_COPY.install }));

        expect(event.prompt).toHaveBeenCalledOnce();
        expect(screen.queryByRole('region', { name: INSTALL_COPY.title })).toBeNull();
    });

    it('remembers when a visitor dismisses the prompt', async () => {
        const user = userEvent.setup();
        render(<InstallPrompt />);

        fireInstallPrompt();
        expect(await screen.findByText(INSTALL_COPY.message)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: INSTALL_COPY.later }));

        expect(screen.queryByRole('region', { name: INSTALL_COPY.title })).toBeNull();
        expect(window.localStorage.getItem('laundrylo.installPromptDismissedAt')).not.toBeNull();

        fireInstallPrompt();
        expect(screen.queryByRole('region', { name: INSTALL_COPY.title })).toBeNull();
    });

    it('does not ask again during the dismissal period', async () => {
        window.localStorage.setItem('laundrylo.installPromptDismissedAt', String(Date.now()));
        render(<InstallPrompt />);

        expect(screen.queryByRole('region', { name: INSTALL_COPY.title })).toBeNull();
    });
});
