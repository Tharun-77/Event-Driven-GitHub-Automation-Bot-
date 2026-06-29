import { render, screen } from '@testing-library/react';
import LandingPage from '../page';

describe('Landing page', () => {
  it('shows a "Sign in with GitHub" link to the API login route', () => {
    render(<LandingPage />);
    const link = screen.getByRole('link', { name: /sign in with github/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/github/login'),
    );
  });
});
