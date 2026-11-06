declare function parseFloat(string: unknown): number;
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PARTY_HEADER_MAP } from '../dataUploadTypes';
import { parseProductRows } from '../productFile';
import { parseOpeningBalanceGrid } from '../openingBalanceFile';
import type { ParsedRow, UploadEntityType } from '../dataUploadTypes';
import type { DataUploadState } from './useDataUploadState';

export interface UseDataUploadFileActionsContext {
  du: DataUploadState;
  entityType: UploadEntityType;
  setEntityType: (type: UploadEntityType) => void;
}

/** Entity switching and CSV/Excel parsing: reads a file and maps raw rows to entity fields. */
export function useDataUploadFileActions(ctx: UseDataUploadFileActionsContext) {
  const { du, entityType, setEntityType } = ctx;
  const { availableTiers, setFileName, setLoading, setMessage, setParsedRows } = du;

  const handleEntityChange = (type: UploadEntityType) => {
    if (du.importing || du.loading) return;
    setEntityType(type);
    setParsedRows([]);
    setFileName('');
    setMessage(null);
  };

  // ─── File Parser ────────────────────────────────────────────────────────────

  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (du.importing || du.loading) return;
    setParsedRows([]);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Choose a CSV or Excel file up to 10MB.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    setFileName(file.name);

    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    const isOpening = entityType === 'opening_balances';

    if (isCsv) {
      Papa.parse(file, {
        header: !isOpening,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (results.errors.length) {
            setMessage({ type: 'error', text: `CSV needs correction: ${results.errors[0].message}` });
            setLoading(false);
            return;
          }
          if (isOpening) processOpeningGrid(results.data as unknown[][]);
          else processRawData(results.data as Array<Record<string, unknown>>);
          setLoading(false);
        },
        error: (err) => {
          setMessage({ type: 'error', text: `Failed to parse CSV file: ${err.message}` });
          setLoading(false);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          if (isOpening) {
            processOpeningGrid(XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][]);
            return;
          }
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
          processRawData(rawData as Array<Record<string, unknown>>);
        } catch (err) {
          setMessage({ type: 'error', text: `Failed to parse Excel file: ${(err as Error).message}` });
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setMessage({ type: 'error', text: 'Error reading file from disk.' });
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processOpeningGrid = (grid: unknown[][]) => {
    const { rows, fileTotal, error } = parseOpeningBalanceGrid(grid);
    if (error) {
      setMessage({ type: 'error', text: error });
      setParsedRows([]);
      return;
    }
    setParsedRows(rows.map((row) => ({
      id: uuidv4(),
      data: { name: row.name, balance: row.amount, tax_rate_percent: 0, uom: '', hsn_sac_code: '' },
      isValid: !row.error,
      errors: row.error ? [row.error] : [],
    })));
    const sum = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    if (fileTotal !== null && Math.abs(fileTotal - sum) > 0.004) {
      setMessage({ type: 'error', text: `The rows add up to ${sum}, but the file's Total row says ${fileTotal}. Correct the file before importing.` });
    } else {
      setMessage({ type: 'info', text: `${rows.length} balances, net total ${sum}${fileTotal !== null ? ', matching the file total' : ''}. Choose the as-of date, then import.` });
    }
  };

  const processRawData = (rows: Record<string, unknown>[]) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      setMessage({ type: 'error', text: 'Uploaded file contains no rows or invalid data.' });
      setParsedRows([]);
      return;
    }

    if (entityType === 'products') {
      setParsedRows(parseProductRows(rows, availableTiers));
      return;
    }
    const headerMapping = PARTY_HEADER_MAP;

    const processed: ParsedRow[] = rows.map((rawRow, _idx) => {
      const mappedData: import('../dataUploadTypes').ParsedRowData & Record<string, unknown> = {} as import('../dataUploadTypes').ParsedRowData;
      const errors: string[] = [];

      // Map raw headers to normalized field keys
      Object.keys(rawRow).forEach((rawKey) => {
        const cleanKey = rawKey.trim().toLowerCase();
        const targetField = headerMapping[cleanKey];
        if (targetField) {
          mappedData[targetField] = rawRow[rawKey];
        }
      });

      // Direct fallback matching
      if (!mappedData.name && rawRow.name) mappedData.name = rawRow.name as string;
      if (!mappedData.sku_barcode && rawRow.sku_barcode) mappedData.sku_barcode = rawRow.sku_barcode as string;
      if (!mappedData.base_price && rawRow.base_price) mappedData.base_price = rawRow.base_price as number;
      if (!mappedData.purchase_price && rawRow.purchase_price) mappedData.purchase_price = rawRow.purchase_price as number;

      // Clean values & Validate
      const name = String(mappedData.name || rawRow['Product Name'] || rawRow['Supplier Name'] || rawRow['Customer Name'] || rawRow['Staff Name'] || rawRow['Name'] || '').trim();
      mappedData.name = name;

      if (!name) {
        errors.push('Name is required');
      }

      if (entityType === 'staff') {
        const phone = String(mappedData.phone ?? rawRow['Phone'] ?? '').trim();
        const email = String(mappedData.email ?? rawRow['Email'] ?? '').trim();
        const roleDesig = String(mappedData.role_designation ?? rawRow['Role / Designation'] ?? rawRow['Role'] ?? 'Staff').trim();
        const salary = parseFloat(mappedData.monthly_salary ?? rawRow['Monthly Salary'] ?? 0);
        const joining = String(mappedData.joining_date ?? rawRow['Joining Date'] ?? '').trim();

        mappedData.phone = phone;
        mappedData.email = email;
        mappedData.role_designation = roleDesig;
        mappedData.monthly_salary = isNaN(salary) ? 0 : salary;
        mappedData.joining_date = joining;
        mappedData.party_type = 'STAFF';
        mappedData.balance = 0;
        mappedData.balance_type = 'PAYABLE';
      } else {
        // Suppliers / Customers
        const phone = String(mappedData.phone ?? rawRow['Phone'] ?? rawRow['Mobile'] ?? '').trim();
        const address = String(mappedData.address ?? rawRow['Address'] ?? '').trim();
        const gstin = String(mappedData.gstin ?? rawRow['GSTIN'] ?? rawRow['GST'] ?? '').trim();
        const balance = parseFloat(mappedData.balance ?? rawRow['Opening Balance'] ?? 0);
        const creditLimit = parseFloat(mappedData.credit_limit ?? rawRow['Credit Limit'] ?? 0);
        let balanceType = String(mappedData.balance_type ?? rawRow['Balance Type'] ?? '').trim().toUpperCase();

        if (balanceType !== 'PAYABLE' && balanceType !== 'RECEIVABLE') {
          balanceType = entityType === 'suppliers' ? 'PAYABLE' : 'RECEIVABLE';
        }

        mappedData.phone = phone;
        mappedData.address = address;
        mappedData.gstin = gstin;
        mappedData.balance = isNaN(balance) ? 0 : balance;
        mappedData.balance_type = balanceType;
        mappedData.credit_limit = isNaN(creditLimit) ? 0 : creditLimit;
        mappedData.notes = String(mappedData.notes ?? rawRow['Notes'] ?? '').trim();
        mappedData.party_type = entityType === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER';
      }

      return {
        id: uuidv4(),
        data: mappedData,
        isValid: errors.length === 0,
        errors
      };
    });

    setParsedRows(processed);
  };

  return { handleEntityChange, handleFileUpload };
}
