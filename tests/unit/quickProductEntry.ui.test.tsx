// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { QuickProductTable } from '../../src/components/billing/modals/quick-product/QuickProductTable';
import { QuickProductColumnsModal } from '../../src/components/billing/modals/quick-product/QuickProductColumnsModal';
import { DEFAULT_QUICK_COLUMNS } from '../../src/components/billing/modals/quick-product/types';

describe('QuickProductTable and QuickProductColumnsModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders quick product table with default columns (Name, Rate, Qty)', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName=""
        invoiceType="NON_GST"
        configuredCategories={['General', 'Beverages']}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    expect(screen.getByText('Fast Multi-Product Entry')).toBeDefined();
    expect(screen.getByText('Item Name')).toBeDefined();
    expect(screen.getByText('Rate / MRP')).toBeDefined();
    expect(screen.getByText('Quantity')).toBeDefined();
    expect(screen.getByRole('button', { name: /add to inventory/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /save as temp/i })).toBeDefined();
  });

  it('navigates through cells with Enter key: name -> rate -> qty -> next row', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName=""
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    // Row 0, Col 0: Item Name
    const nameInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="0"]') as HTMLInputElement;
    expect(nameInput0).not.toBeNull();

    // Change name
    fireEvent.change(nameInput0, { target: { value: 'Test Biscuit' } });
    expect(nameInput0.value).toBe('Test Biscuit');

    // Press Enter -> moves to Col 1 (Rate)
    fireEvent.keyDown(nameInput0, { key: 'Enter' });
    const rateInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    expect(document.activeElement).toBe(rateInput0);

    // Change rate
    fireEvent.change(rateInput0, { target: { value: '25' } });

    // Press Enter -> moves to Col 2 (Qty)
    fireEvent.keyDown(rateInput0, { key: 'Enter' });
    const qtyInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="2"]') as HTMLInputElement;
    expect(document.activeElement).toBe(qtyInput0);

    // Press Enter on Qty -> moves to Row 1, Col 0 (Next row name!)
    fireEvent.keyDown(qtyInput0, { key: 'Enter' });
    const nameInput1 = document.querySelector('[data-quick-row="1"][data-quick-col="0"]') as HTMLInputElement;
    expect(document.activeElement).toBe(nameInput1);
  });

  it('navigates through cells with Arrow keys: left and right across columns (including number inputs)', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName=""
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    // Row 0, Col 0: Item Name
    const nameInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="0"]') as HTMLInputElement;
    nameInput0.focus();

    // ArrowRight from Name (col 0) -> Rate (col 1)
    fireEvent.keyDown(nameInput0, { key: 'ArrowRight' });
    const rateInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    expect(document.activeElement).toBe(rateInput0);

    // ArrowRight from Rate (col 1) -> Qty (col 2)
    fireEvent.keyDown(rateInput0, { key: 'ArrowRight' });
    const qtyInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="2"]') as HTMLInputElement;
    expect(document.activeElement).toBe(qtyInput0);

    // ArrowLeft from Qty (col 2) -> Rate (col 1)
    fireEvent.keyDown(qtyInput0, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rateInput0);

    // ArrowLeft from Rate (col 1) -> Name (col 0)
    fireEvent.keyDown(rateInput0, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(nameInput0);
  });

  it('navigates through cells with Tab and Shift+Tab', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName=""
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    const nameInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="0"]') as HTMLInputElement;
    nameInput0.focus();

    // Tab -> Rate
    fireEvent.keyDown(nameInput0, { key: 'Tab' });
    const rateInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    expect(document.activeElement).toBe(rateInput0);

    // Shift+Tab -> Name
    fireEvent.keyDown(rateInput0, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nameInput0);
  });

  it('submits items as temp when Save as Temp is triggered', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName="Instant Coffee"
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    // Set rate for row 0
    const rateInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    fireEvent.change(rateInput0, { target: { value: '150' } });

    // Click Save as Temp
    const saveTempBtn = screen.getByRole('button', { name: /save as temp/i });
    fireEvent.click(saveTempBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Instant Coffee',
          basePrice: 150,
          qty: 1,
        }),
      ]),
      true
    );
  });

  it('submits items to inventory when Add to Inventory is triggered', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSwitchToGrid = vi.fn();

    render(
      <QuickProductTable
        initialProductName="Milk Pack"
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onSwitchToGrid={onSwitchToGrid}
      />
    );

    // Set rate for row 0
    const rateInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    fireEvent.change(rateInput0, { target: { value: '30' } });

    // Set qty for row 0
    const qtyInput0 = document.querySelector('[data-quick-row="0"][data-quick-col="2"]') as HTMLInputElement;
    fireEvent.change(qtyInput0, { target: { value: '5' } });

    // Click Add to Inventory
    const addInvBtn = screen.getByRole('button', { name: /add to inventory/i });
    fireEvent.click(addInvBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Milk Pack',
          basePrice: 30,
          qty: 5,
        }),
      ]),
      false
    );
  });

  it('rate box takes numbers only: commas, letters and symbols are dropped, no spinner arrows', () => {
    render(
      <QuickProductTable
        initialProductName=""
        invoiceType="NON_GST"
        configuredCategories={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        onSwitchToGrid={vi.fn()}
      />
    );
    const rate = document.querySelector('[data-quick-row="0"][data-quick-col="1"]') as HTMLInputElement;
    expect(rate.type).toBe('text');
    fireEvent.change(rate, { target: { value: '1,250' } });
    expect(rate.value).toBe('1250');
    fireEvent.change(rate, { target: { value: '₹99.5a0' } });
    expect(rate.value).toBe('99.50');
    fireEvent.change(rate, { target: { value: '1.2.3' } });
    expect(rate.value).toBe('1.23');
  });

  it('renders and configures columns modal', () => {
    const onToggleColumn = vi.fn();
    const onSetColumns = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <QuickProductColumnsModal
        isOpen={true}
        onClose={onClose}
        visibleColumns={DEFAULT_QUICK_COLUMNS}
        onToggleColumn={onToggleColumn}
        onSetColumns={onSetColumns}
      />
    );

    expect(screen.getByText('Configure Columns')).toBeDefined();
    expect(screen.getByText('Name + Rate')).toBeDefined();
    expect(screen.getByText('Purchase Price')).toBeDefined();

    // Click preset "Name + Rate"
    const presetBtn = screen.getByText('Name + Rate');
    fireEvent.click(presetBtn);
    expect(onSetColumns).toHaveBeenCalledWith(['name', 'basePrice']);

    // Modal closed
    rerender(
      <QuickProductColumnsModal
        isOpen={false}
        onClose={onClose}
        visibleColumns={DEFAULT_QUICK_COLUMNS}
        onToggleColumn={onToggleColumn}
        onSetColumns={onSetColumns}
      />
    );
    expect(screen.queryByText('Configure Columns')).toBeNull();
  });
});
