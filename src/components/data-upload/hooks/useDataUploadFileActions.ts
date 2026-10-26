import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PARTY_HEADER_MAP, PRODUCT_HEADER_MAP, resolveDynamicTierName } from '../dataUploadTypes';
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
    setEntityType(type);
    setParsedRows([]);
    setFileName('');
    setMessage(null);
  };

  // ─── File Parser ────────────────────────────────────────────────────────────

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setLoading(true);
    setMessage(null);
    setFileName(file.name);

    const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';

    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processRawData(results.data);
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
          const workbook = XLSX.read(buffer, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          processRawData(rawData);
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
      reader.readAsBinaryString(file);
    }
  };

  const processRawData = (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      setMessage({ type: 'error', text: 'Uploaded file contains no rows or invalid data.' });
      setParsedRows([]);
      return;
    }

    const headerMapping = entityType === 'products' ? PRODUCT_HEADER_MAP : PARTY_HEADER_MAP;

    const processed: ParsedRow[] = rows.map((rawRow, idx) => {
      const mappedData: Record<string, any> = {};
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
      if (!mappedData.name && rawRow.name) mappedData.name = rawRow.name;
      if (!mappedData.sku_barcode && rawRow.sku_barcode) mappedData.sku_barcode = rawRow.sku_barcode;
      if (!mappedData.base_price && rawRow.base_price) mappedData.base_price = rawRow.base_price;
      if (!mappedData.purchase_price && rawRow.purchase_price) mappedData.purchase_price = rawRow.purchase_price;

      // Clean values & Validate
      const name = String(mappedData.name || rawRow['Product Name'] || rawRow['Supplier Name'] || rawRow['Customer Name'] || rawRow['Staff Name'] || rawRow['Name'] || '').trim();
      mappedData.name = name;

      if (!name) {
        errors.push('Name is required');
      }

      if (entityType === 'products') {
        const basePrice = parseFloat(mappedData.base_price ?? rawRow['Selling Price / MRP'] ?? rawRow['Selling Price'] ?? rawRow['MRP'] ?? 0);
        const purchasePrice = parseFloat(mappedData.purchase_price ?? rawRow['Purchase Price'] ?? 0);
        const stock = parseFloat(mappedData.current_stock ?? rawRow['Stock'] ?? 0);
        const reorder = parseFloat(mappedData.reorder_level ?? rawRow['Reorder Level'] ?? 0);
        const taxRate = parseFloat(mappedData.tax_rate_percent ?? rawRow['Tax Rate %'] ?? rawRow['GST %'] ?? 0);

        if (isNaN(basePrice) || basePrice <= 0) {
          errors.push('MRP must be greater than 0');
        }

        mappedData.base_price = basePrice || 0;
        mappedData.purchase_price = isNaN(purchasePrice) ? 0 : purchasePrice;
        mappedData.current_stock = isNaN(stock) ? 0 : stock;
        mappedData.reorder_level = isNaN(reorder) ? 0 : reorder;
        mappedData.tax_rate_percent = isNaN(taxRate) ? 0 : taxRate;
        mappedData.sku_barcode = String(mappedData.sku_barcode ?? rawRow['Barcode'] ?? '').trim();
        mappedData.item_code = String(mappedData.item_code ?? rawRow['Item Code'] ?? '').trim();
        mappedData.category = String(mappedData.category ?? rawRow['Category'] ?? '').trim();
        mappedData.brand_manufacturer = String(mappedData.brand_manufacturer ?? rawRow['Brand'] ?? '').trim();
        mappedData.uom = String(mappedData.uom ?? rawRow['UOM'] ?? 'Pcs').trim() || 'Pcs';
        mappedData.hsn_sac_code = String(mappedData.hsn_sac_code ?? rawRow['HSN Code'] ?? '').trim();
        mappedData.is_gst_applicable = (mappedData.tax_rate_percent > 0 || mappedData.hsn_sac_code.length > 0) ? 1 : 0;

        // Dynamic tier pricing extraction across all headers:
        // Any non-standard column with a valid numeric price is dynamically extracted as a price tier
        const tierPrices: Record<string, number> = {};
        Object.keys(rawRow).forEach((rawKey) => {
          const tierName = resolveDynamicTierName(rawKey, availableTiers);
          if (tierName) {
            const rawVal = rawRow[rawKey];
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              const str = String(rawVal).trim();
              const cleaned = str.replace(/^[₹$€£\s]+/, '').replace(/,/g, '');
              if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
                const valNum = parseFloat(cleaned);
                if (!isNaN(valNum) && valNum >= 0) {
                  tierPrices[tierName] = valNum;
                }
              }
            }
          }
        });

        mappedData.tier_prices = tierPrices;
      } else if (entityType === 'staff') {
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
