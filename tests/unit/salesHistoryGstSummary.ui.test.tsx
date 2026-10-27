// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SalesTaxSummary } from '../../src/components/sales/views/SalesTaxSummary';

afterEach(cleanup);
describe('Sales History GST summary visibility', () => {
  it('shows all three figures when masking is off', () => {
    render(<SalesTaxSummary totalIncludingGst={118} gstAmount={18} isHidden={false} isMasked={false} />);
    expect(screen.getByText('Sales excluding GST').parentElement!.textContent).toContain('100.00');
    expect(screen.getByText('GST Amount').parentElement!.textContent).toContain('18.00');
  });
  it('does not reveal real amounts through the breakdown when masking is on', () => {
    render(<SalesTaxSummary totalIncludingGst={50} gstAmount={18} isHidden={false} isMasked />);
    expect(screen.getAllByText('Protected')).toHaveLength(2);
    expect(screen.queryByText('₹18.00')).toBeNull();
    expect(screen.getByText('Grand Total including GST').parentElement!.textContent).toContain('50.00');
  });
  it('hides every amount in hidden mode', () => {
    render(<SalesTaxSummary totalIncludingGst={0} gstAmount={18} isHidden isMasked />);
    expect(screen.getAllByText('••••••••')).toHaveLength(3);
    expect(screen.queryByText('₹18.00')).toBeNull();
  });
});
