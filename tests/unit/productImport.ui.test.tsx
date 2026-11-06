// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { useDataUploadState } from '../../src/components/data-upload/hooks/useDataUploadState';
import { useDataUploadFileActions } from '../../src/components/data-upload/hooks/useDataUploadFileActions';
import { useDataUploadImportActions } from '../../src/components/data-upload/hooks/useDataUploadImportActions';
const bulkImportProducts = vi.hoisted(() => vi.fn());
vi.mock('../../src/data/products', () => ({ productsApi: { bulkImportProducts } }));
vi.mock('../../src/data/client', () => ({ hasBridge: () => true }));
vi.mock('../../src/data/parties', () => ({ partiesApi: {} }));
vi.mock('../../src/data/staff', () => ({ staffApi: {} }));
function setup(tenantId: string | null = 't') {
  const onImportSuccess = vi.fn();
  const view = renderHook(() => {
    const du = useDataUploadState();
    return { du, files: useDataUploadFileActions({ du, entityType: 'products', setEntityType: vi.fn() }),
      importer: useDataUploadImportActions({ du, entityType: 'products', tenantId, userId: 'u', userName: 'Owner', onClose: vi.fn(), onImportSuccess }) };
  });
  return { view, onImportSuccess };
}
beforeEach(() => bulkImportProducts.mockReset().mockResolvedValue({ success: true }));
async function upload(view: ReturnType<typeof setup>['view'], file: File) {
  act(() => view.result.current.files.handleFileUpload(file));
  await waitFor(() => expect(view.result.current.du.loading).toBe(false));
}
it('parses a real CSV file, imports through the bridge, preserves discounts and clears the submitted preview', async () => {
  const { view, onImportSuccess } = setup();
  await upload(view, new File(['Name,MRP,Barcode,Discount %,Offer Price\nDrill,100,0012,5,90'], 'products.CSV'));
  expect(view.result.current.du.parsedRows).toHaveLength(1);
  await act(() => view.result.current.importer.handleImport());
  expect(bulkImportProducts.mock.calls[0][0][0]).toMatchObject({ name: 'Drill', base_price: 100, sku_barcode: '0012', discount_percent: 5, offer_price: 90 });
  expect(onImportSuccess).toHaveBeenCalledWith(1, 'products');
  expect(view.result.current.du.parsedRows).toHaveLength(0);
});
it('parses real Excel and preserves displayed leading zeros', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Name', 'MRP', 'Barcode', 'Stock'], ['Drill', 100, 12, 3]]);
  sheet.C2.z = '00000';
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Products');
  const { view } = setup();
  await upload(view, new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'products.xlsx'));
  expect(view.result.current.du.parsedRows[0].data).toMatchObject({ sku_barcode: '00012', base_price: 100, current_stock: 3 });
});
it.each(['broken.xlsx', 'unsupported.txt'])('removes the old preview if a replacement %s fails', async name => {
  const { view } = setup();
  await upload(view, new File(['Name,MRP\nDrill,100'], 'good.csv'));
  await upload(view, new File(['not an Excel file'], name));
  expect(view.result.current.du.parsedRows).toHaveLength(0);
  await act(() => view.result.current.importer.handleImport());
  expect(bulkImportProducts).not.toHaveBeenCalled();
});
it('blocks the entire product file when any row is invalid', async () => {
  const { view } = setup();
  await upload(view, new File(['Name,MRP,Stock\nGood,100,1\nBad,200,abc'], 'products.csv'));
  await act(() => view.result.current.importer.handleImport());
  expect(bulkImportProducts).not.toHaveBeenCalled();
  expect(view.result.current.du.message?.text).toContain('Nothing was imported');
});
it('does not re-enter the import while the first request is pending', async () => {
  const { view } = setup();
  await upload(view, new File(['Name,MRP\nDrill,100'], 'products.csv'));
  let finish: (value: { success: boolean }) => void = () => {};
  bulkImportProducts.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await act(async () => {
    const first = view.result.current.importer.handleImport();
    const second = view.result.current.importer.handleImport();
    finish({ success: true }); await Promise.all([first, second]);
  });
  expect(bulkImportProducts).toHaveBeenCalledTimes(1);
});
it('retains retryable rows after a database failure and blocks missing shop identity', async () => {
  const { view } = setup();
  await upload(view, new File(['Name,MRP\nDrill,100'], 'products.csv'));
  bulkImportProducts.mockResolvedValue({ success: false, error: 'Disk full' });
  await act(() => view.result.current.importer.handleImport());
  expect(view.result.current.du.parsedRows).toHaveLength(1);
  expect(view.result.current.du.message?.text).toBe('Disk full');
  const missing = setup(null);
  await upload(missing.view, new File(['Name,MRP\nDrill,100'], 'products.csv'));
  bulkImportProducts.mockClear();
  await act(() => missing.view.result.current.importer.handleImport());
  expect(bulkImportProducts).not.toHaveBeenCalled();
});
