import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../__mocks__/renderWithProviders';

describe('mobile navigation', () => {
    it('opens the menu and exposes the primary links and booking action', async () => {
        const user = userEvent.setup();
        renderApp();

        const toggle = screen.getByRole('button', {
            name: 'Open navigation menu',
            hidden: true,
        });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle).toHaveAttribute('aria-controls', 'primary-navigation');

        await user.click(toggle);

        const openToggle = screen.getByRole('button', {
            name: 'Close navigation menu',
            hidden: true,
        });
        expect(openToggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('navigation', { name: 'Primary' }).textContent).toContain(
            'Book Now'
        );
    });

    it('closes on Escape and returns focus to the menu toggle', async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(
            screen.getByRole('button', { name: 'Open navigation menu', hidden: true })
        );
        await user.keyboard('{Escape}');

        const toggle = screen.getByRole('button', { name: 'Open navigation menu' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle).toHaveFocus();
    });

    it('closes after selecting a primary navigation link', async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(
            screen.getByRole('button', { name: 'Open navigation menu', hidden: true })
        );
        await user.click(screen.getByRole('link', { name: 'Services' }));

        expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        expect(screen.getByRole('heading', { name: 'Our Services' })).toBeInTheDocument();
    });
});
