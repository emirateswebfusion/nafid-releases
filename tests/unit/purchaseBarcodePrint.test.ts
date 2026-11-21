// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePurchaseBarcodePrint } from '../../src/components/purchase/hooks/usePurchaseBarcodePrint';
import { printingApi } from '../../src/data/printing';
import type { PurchaseBill, PurchaseBillItem, PurchaseFormItem } from '../../src/components/purchase/purchaseTypes';

vi.mock('../../src/data/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/client')>();
  return {
    ...actual,
    isDesktopRuntime: () => true,
    hasBridge: (channel: string) => ['printBarcode', 'printBulkBarcodes', 'settingsGet', 'dbGetGrades', 'dbGetProductsByIds'].includes(channel),
  };
});

vi.mock('../../src/data/printing', () => ({
  printingApi: {
    printBarcode: vi.fn(async () => ({ success: true })),
    printBulkBarcodes: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('../../src/data/settings', () => ({
  settingsApi: {
    get: vi.fn(async () => 'barcode'),
  },
}));

vi.mock('../../src/data/grades', () => ({
  gradesApi: {
    getGrades: vi.fn(async () => []),
  },
}));

vi.mock('../../src/data/products', () => ({
  productsApi: {
    getProductsByIds: vi.fn(async () => []),
  },
}));

describe('usePurchaseBarcodePrint', () => {
  const setStatusMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens barcode print modal for a purchase form item with purchased quantity pre-filled', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const formItem: PurchaseFormItem = {
      product_id: 'prod-101',
      name: 'Cotton T-Shirt (GST)',
      quantity: '8',
      purchase_price: '250',
      selling_price: '499',
      sku_barcode: '8901234567890',
    };

    await act(async () => {
      await result.current.openBarcodeModalForFormItem(formItem);
    });

    expect(result.current.printModalProduct).not.toBeNull();
    expect(result.current.printModalProduct?.sku_barcode).toBe('8901234567890');
    expect(result.current.printModalProduct?.name).toBe('Cotton T-Shirt');
    expect(result.current.printQuantity).toBe(8);
  });

  it('prints a product label with effective price and dispatched quantity', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const formItem: PurchaseFormItem = {
      product_id: 'prod-102',
      name: 'Wireless Mouse',
      quantity: '3',
      purchase_price: '500',
      selling_price: '799',
      sku_barcode: 'MOUSE123',
    };

    await act(async () => {
      await result.current.openBarcodeModalForFormItem(formItem);
    });

    await act(async () => {
      await result.current.printProductLabel(result.current.printModalProduct!);
    });

    expect(printingApi.printBarcode).toHaveBeenCalledWith(
      'tenant-1',
      'MOUSE123',
      799,
      'Wireless Mouse',
      3,
      undefined,
      'SP'
    );
    expect(setStatusMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', text: expect.stringContaining('Barcode printed successfully (3 labels)') })
    );
  });

  it('prints bulk barcodes for all items in a purchase bill', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const bill: PurchaseBill = {
      purchase_bill_id: 'pb-01',
      tenant_id: 'tenant-1',
      bill_number: 'BILL-001',
      bill_date: '2026-11-21',
      supplier_name: 'Test Supplier',
      bill_type: 'GST',
      total_amount: 5000,
      created_at: '2026-11-21T10:00:00Z',
    } as PurchaseBill;

    const items: PurchaseBillItem[] = [
      {
        item_id: 'item-1',
        purchase_bill_id: 'pb-01',
        product_id: 'prod-1',
        product_name: 'Item One',
        sku_barcode: 'BAR001',
        quantity: 5,
        purchase_price: 100,
        product_base_price: 150,
        total_amount: 500,
      } as PurchaseBillItem,
      {
        item_id: 'item-2',
        purchase_bill_id: 'pb-01',
        product_id: 'prod-2',
        product_name: 'Item Two',
        sku_barcode: 'BAR002',
        quantity: 10,
        purchase_price: 200,
        product_base_price: 300,
        total_amount: 2000,
      } as PurchaseBillItem,
    ];

    await act(async () => {
      await result.current.printBulkBarcodesForBill(bill, items);
    });

    expect(printingApi.printBulkBarcodes).toHaveBeenCalledWith(
      'tenant-1',
      [
        {
          barcode: 'BAR001',
          name: 'Item One',
          price: 150,
          quantity: 5,
          sp: undefined,
          spType: undefined,
        },
        {
          barcode: 'BAR002',
          name: 'Item Two',
          price: 300,
          quantity: 10,
          sp: undefined,
          spType: undefined,
        },
      ]
    );

    expect(setStatusMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', text: expect.stringContaining('Successfully sent 15 barcode label(s)') })
    );
  });

  it('shows error toast when item has no barcode', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const formItemWithoutBarcode: PurchaseFormItem = {
      product_id: 'prod-999',
      name: 'Unbarcoded Item',
      quantity: '2',
      purchase_price: '50',
      selling_price: '100',
    };

    await act(async () => {
      await result.current.openBarcodeModalForFormItem(formItemWithoutBarcode);
    });

    expect(result.current.printModalProduct).toBeNull();
    expect(setStatusMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text: expect.stringContaining('Product has no barcode') })
    );
  });

  it('opens bulk barcode modal for a purchase bill and closes it cleanly', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const bill: PurchaseBill = {
      purchase_bill_id: 'pb-02',
      tenant_id: 'tenant-1',
      bill_number: 'BILL-002',
      bill_date: '2026-11-21',
      supplier_name: 'Test Supplier',
      bill_type: 'GST',
      total_amount: 1000,
      created_at: '2026-11-21T10:00:00Z',
    } as PurchaseBill;

    const items: PurchaseBillItem[] = [
      {
        item_id: 'item-10',
        purchase_bill_id: 'pb-02',
        product_id: 'prod-10',
        product_name: 'Test Item',
        sku_barcode: 'TEST1234',
        quantity: 4,
        purchase_price: 100,
        product_base_price: 150,
        total_amount: 400,
      } as PurchaseBillItem,
    ];

    await act(async () => {
      await result.current.openBulkBarcodeModal(bill, items);
    });

    expect(result.current.bulkPrintModalOpen).toBe(true);
    expect(result.current.bulkPrintBill?.bill_number).toBe('BILL-002');
    expect(result.current.bulkPrintItems).toHaveLength(1);

    act(() => {
      result.current.closeBulkBarcodeModal();
    });

    expect(result.current.bulkPrintModalOpen).toBe(false);
    expect(result.current.bulkPrintBill).toBeNull();
  });

  it('executes bulk barcode print without price when showPrice is false', async () => {
    const { result } = renderHook(() =>
      usePurchaseBarcodePrint({ tenantId: 'tenant-1', setStatusMessage })
    );

    const printItems = [
      {
        barcode: 'TESTBARCODE',
        name: 'Item without price',
        price: 299,
        quantity: 2,
        sp: 250,
        spType: 'OFF' as const,
      },
    ];

    await act(async () => {
      await result.current.executeBulkBarcodePrint(printItems, false);
    });

    expect(printingApi.printBulkBarcodes).toHaveBeenCalledWith(
      'tenant-1',
      [
        {
          barcode: 'TESTBARCODE',
          name: 'Item without price',
          price: undefined,
          quantity: 2,
          sp: undefined,
          spType: undefined,
        },
      ]
    );
  });
});
