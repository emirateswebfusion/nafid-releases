// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OrderDetailsDialog } from '../../src/components/restaurant/modals/OrderDetailsDialog';
afterEach(cleanup);
it('keeps edited details after a rejected save and permits retry', async () => {
 const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
 render(<OrderDetailsDialog title="Edit order" orderType="DINE_IN" staff={[]} onCancel={() => {}} onSave={save} />);
 fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Guest' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
 await screen.findByRole('alert');
 expect((screen.getByLabelText('Customer name') as HTMLInputElement).value).toBe('Guest');
 fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
 await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
 expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ customer_name: 'Guest', covers: 2 }));
});
it('blocks repeated saves and cancellation while persistence is pending', async () => {
 let finish: (value: boolean) => void = () => {};
 const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })); const cancel = vi.fn();
 render(<OrderDetailsDialog title="Edit order" orderType="TAKEAWAY" staff={[]} onCancel={cancel} onSave={save} />);
 fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
 expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
 expect(cancel).not.toHaveBeenCalled();
 finish(true);
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDefined());
 expect(save).toHaveBeenCalledTimes(1);
});
it('validates guest count before persistence', () => {
 const save = vi.fn();
 render(<OrderDetailsDialog title="Edit order" orderType="DINE_IN" staff={[]} onCancel={() => {}} onSave={save} />);
 fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '0' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
 expect(screen.getByRole('alert').textContent).toContain('at least one guest');
 expect(save).not.toHaveBeenCalled();
});
