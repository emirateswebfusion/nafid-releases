import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { SAMPLE_CUSTOMERS, SAMPLE_PRODUCTS, SAMPLE_STAFF, SAMPLE_SUPPLIERS } from '../dataUploadTypes';
import type { UploadEntityType } from '../dataUploadTypes';
import type { DataUploadState } from './useDataUploadState';

export interface UseDataUploadDemoActionsContext {
  du: DataUploadState;
  entityType: UploadEntityType;
}

/** Builds and downloads the demo CSV / Excel template for the selected entity. */
export function useDataUploadDemoActions(ctx: UseDataUploadDemoActionsContext) {
  const { du, entityType } = ctx;
  const { availableTiers } = du;

  // ─── Download Demo Sample Templates ────────────────────────────────────────

  const downloadDemoFile = (format: 'csv' | 'xlsx') => {
    let sampleData: Record<string, unknown>[];
    let filePrefix: string;

    if (entityType === 'products') {
      if (availableTiers && availableTiers.length > 0) {
        sampleData = SAMPLE_PRODUCTS.map((prod, idx) => {
          const augmented: Record<string, unknown> = { ...prod };
          availableTiers.forEach((t: { name: string }) => {
            augmented[t.name] = idx === 0 ? Math.round(Number(prod.MRP) * 0.9) : Math.round(Number(prod.MRP) * 0.95);
          });
          return augmented;
        });
      } else {
        sampleData = SAMPLE_PRODUCTS;
      }
      filePrefix = 'products_demo_template';
    } else if (entityType === 'suppliers') {
      sampleData = SAMPLE_SUPPLIERS;
      filePrefix = 'suppliers_demo_template';
    } else if (entityType === 'customers') {
      sampleData = SAMPLE_CUSTOMERS;
      filePrefix = 'customers_demo_template';
    } else {
      sampleData = SAMPLE_STAFF;
      filePrefix = 'staff_demo_template';
    }

    if (format === 'csv') {
      const csvString = Papa.unparse(sampleData);
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filePrefix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Demo Sample');
      XLSX.writeFile(workbook, `${filePrefix}.xlsx`);
    }
  };

  return { downloadDemoFile };
}
