// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrialRegistration } from '../../src/components/auth/TrialRegistration';

const api = vi.hoisted(() => ({ policy: vi.fn(), register: vi.fn(), login: vi.fn() }));
vi.mock('../../src/data/cloud/trials', () => ({ trialsCloud: api }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ login: api.login }) } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); api.policy.mockResolvedValue({ default_days: 30 }); api.register.mockResolvedValue({ success: true, tenant_id: 'trial' }); api.login.mockResolvedValue({ success: true }); });

async function review() {
  const user = userEvent.setup();
  render(<TrialRegistration onSignIn={vi.fn()} />);
  await user.type(screen.getByLabelText('Shop name'), 'Al Noor');
  await user.type(screen.getByLabelText('Your name'), 'Owner');
  await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
  await user.type(screen.getByLabelText('Phone number'), '+971501234567');
  await user.type(screen.getByLabelText('City / emirate'), 'Dubai');
  await user.click(screen.getByRole('button', { name: 'Review shop details' }));
  return user;
}
it('loads the Super Admin default and creates the reviewed shop before signing in', async () => {
  api.policy.mockResolvedValue({ default_days: 45 });
  const user = await review();
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
  await user.type(screen.getByLabelText('Confirm password'), 'Password123');
  await user.click(screen.getByRole('button', { name: 'Start 45-day free trial' }));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('owner@example.com', 'Password123'));
  expect(api.register).toHaveBeenCalledWith(expect.objectContaining({
    shop_name: 'Al Noor', owner_name: 'Owner', owner_email: 'owner@example.com', owner_password: 'Password123',
    phone: '+971501234567', city: 'Dubai', country: 'AE', business_category: 'retail',
  }));
});
it('allows selecting a business category and registers with matching feature flags', async () => {
  const user = userEvent.setup();
  render(<TrialRegistration onSignIn={vi.fn()} />);
  await user.type(screen.getByLabelText('Shop name'), 'Al Noor Cafe');
  await user.type(screen.getByLabelText('Your name'), 'Owner');
  await user.type(screen.getByLabelText('Email address'), 'cafe@example.com');
  await user.type(screen.getByLabelText('Phone number'), '+971501234567');
  await user.type(screen.getByLabelText('City / emirate'), 'Dubai');
  await user.selectOptions(screen.getByLabelText('Business category'), 'restaurant');
  await user.click(screen.getByRole('button', { name: 'Review shop details' }));
  expect(screen.getByText('Restaurant / Cafeteria')).toBeDefined();
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
  await user.type(screen.getByLabelText('Confirm password'), 'Password123');
  await user.click(screen.getByRole('button', { name: 'Start 30-day free trial' }));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('cafe@example.com', 'Password123'));
  expect(api.register).toHaveBeenCalledWith(expect.objectContaining({
    shop_name: 'Al Noor Cafe',
    business_category: 'restaurant',
    feature_flags: expect.objectContaining({ restaurant_mode: true, dining_tables: true }),
  }));
});
it('rejects mismatched passwords before sending registration', async () => {
  const user = await review();
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
  await user.type(screen.getByLabelText('Confirm password'), 'Different123');
  await user.click(screen.getByRole('button', { name: 'Start 30-day free trial' }));
  expect(screen.getByRole('alert').textContent).toContain('Passwords do not match');
  expect(api.register).not.toHaveBeenCalled();
});
it('shows registration failures and does not sign in', async () => {
  api.register.mockRejectedValue(new Error('Email already registered'));
  const user = await review();
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
  await user.type(screen.getByLabelText('Confirm password'), 'Password123');
  await user.click(screen.getByRole('button', { name: 'Start 30-day free trial' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Email already registered'));
  expect(api.login).not.toHaveBeenCalled();
});
