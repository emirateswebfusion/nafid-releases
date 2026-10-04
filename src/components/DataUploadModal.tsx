import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Download, FileSpreadsheet, FileText, CheckCircle2, 
  AlertCircle, X, RefreshCw, Layers, ArrowRight, Table, AlertTriangle,
  Info, HelpCircle, FileCheck, Check, ListOrdered
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '../store/authStore';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { Button } from './ui/Button';

export type UploadEntityType = 'products' | 'suppliers' | 'customers' | 'staff';

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntity?: UploadEntityType;
  allowedEntities?: UploadEntityType[];
  hideEntityTabs?: boolean;
  onImportSuccess?: (count: number, entity: UploadEntityType) => void;
}

interface ParsedRow {
  id: string;
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
}

interface ColumnSpec {
  name: string;
  required: boolean;
  example: string;
}

// ─── Column Orders & Specs ───────────────────────────────────────────────────

const PRODUCT_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Product Name', required: true, example: 'Basmati Rice 5kg' },
  { name: 'MRP', required: true, example: '450' },
  { name: 'Barcode', required: false, example: '8901234567890' },
  { name: 'Item Code', required: false, example: 'RICE-01' },
  { name: 'Category', required: false, example: 'Groceries' },
  { name: 'Brand', required: false, example: 'Royal Gold' },
  { name: 'Purchase Price', required: false, example: '350' },
  { name: 'Stock', required: false, example: '50' },
  { name: 'Reorder Level', required: false, example: '10' },
  { name: 'Tax Rate %', required: false, example: '5' },
  { name: 'UOM', required: false, example: 'Kgs' },
  { name: 'HSN Code', required: false, example: '1006' },
];

const SUPPLIER_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Supplier Name', required: true, example: 'ABC Wholesalers Pvt Ltd' },
  { name: 'Phone', required: false, example: '9876543210' },
  { name: 'Address', required: false, example: 'Trade Tower, Suite 402' },
  { name: 'GSTIN', required: false, example: '07AAAAA0000A1Z5' },
  { name: 'Opening Balance', required: false, example: '5000' },
  { name: 'Balance Type', required: false, example: 'PAYABLE' },
  { name: 'Credit Limit', required: false, example: '50000' },
  { name: 'Notes', required: false, example: 'Primary grocery vendor' },
];

const CUSTOMER_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Customer Name', required: true, example: 'Rahul Sharma' },
  { name: 'Phone', required: false, example: '9899887766' },
  { name: 'Address', required: false, example: '123 Park Avenue' },
  { name: 'GSTIN', required: false, example: '07CCCCC2222C1Z9' },
  { name: 'Opening Balance', required: false, example: '1200' },
  { name: 'Balance Type', required: false, example: 'RECEIVABLE' },
  { name: 'Credit Limit', required: false, example: '10000' },
  { name: 'Notes', required: false, example: 'Regular retail customer' },
];

const STAFF_COLUMN_SPECS: ColumnSpec[] = [
  { name: 'Staff Name', required: true, example: 'Amit Kumar' },
  { name: 'Phone', required: false, example: '9811122233' },
  { name: 'Email', required: false, example: 'amit@store.com' },
  { name: 'Role / Designation', required: false, example: 'Biller & Cashier' },
  { name: 'Monthly Salary', required: false, example: '18000' },
  { name: 'Joining Date', required: false, example: '2026-01-15' },
  { name: 'Notes', required: false, example: 'Morning shift staff' },
];

// ─── Header Normalizers ─────────────────────────────────────────────────────

const PRODUCT_HEADER_MAP: Record<string, string> = {
  'product name': 'name',
  'product': 'name',
  'item name': 'name',
  'item': 'name',
  'title': 'name',
  'name': 'name',
  
  'sku': 'sku_barcode',
  'barcode': 'sku_barcode',
  'sku/barcode': 'sku_barcode',
  'code': 'sku_barcode',
  'barcode / sku': 'sku_barcode',

  'item code': 'item_code',
  'product code': 'item_code',

  'category': 'category',
  'cat': 'category',

  'brand': 'brand_manufacturer',
  'manufacturer': 'brand_manufacturer',
  'brand / manufacturer': 'brand_manufacturer',

  'purchase price': 'purchase_price',
  'cost price': 'purchase_price',
  'cost': 'purchase_price',
  'buying price': 'purchase_price',

  'selling price': 'base_price',
  'selling price / mrp': 'base_price',
  'mrp': 'base_price',
  'price': 'base_price',
  'rate': 'base_price',
  'sales price': 'base_price',

  'stock': 'current_stock',
  'current stock': 'current_stock',
  'quantity': 'current_stock',
  'qty': 'current_stock',
  'initial stock': 'current_stock',

  'reorder level': 'reorder_level',
  'min stock': 'reorder_level',

  'tax rate': 'tax_rate_percent',
  'tax rate %': 'tax_rate_percent',
  'tax %': 'tax_rate_percent',
  'gst %': 'tax_rate_percent',
  'gst': 'tax_rate_percent',

  'uom': 'uom',
  'unit': 'uom',

  'hsn': 'hsn_sac_code',
  'hsn code': 'hsn_sac_code',
  'hsn/sac': 'hsn_sac_code',
};

const PARTY_HEADER_MAP: Record<string, string> = {
  'name': 'name',
  'supplier name': 'name',
  'customer name': 'name',
  'staff name': 'name',
  'employee name': 'name',
  'party name': 'name',
  'company name': 'name',

  'phone': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  'mobile number': 'phone',
  'phone number': 'phone',

  'address': 'address',
  'location': 'address',

  'gstin': 'gstin',
  'gst': 'gstin',
  'gst number': 'gstin',

  'balance': 'balance',
  'opening balance': 'balance',

  'balance type': 'balance_type',
  'type': 'balance_type',

  'credit limit': 'credit_limit',

  'notes': 'notes',
  'remark': 'notes',
  'category': 'custom_category',

  'role': 'role_designation',
  'designation': 'role_designation',
  'role / designation': 'role_designation',

  'salary': 'monthly_salary',
  'monthly salary': 'monthly_salary',

  'email': 'email',
  'joining date': 'joining_date'
};

// ─── Template Samples ────────────────────────────────────────────────────────

const SAMPLE_PRODUCTS = [
  {
    'Product Name': 'Basmati Rice 5kg',
    'MRP': 450,
    'Barcode': '8901234567890',
    'Item Code': 'RICE-01',
    'Category': 'Groceries',
    'Brand': 'Royal Gold',
    'Purchase Price': 350,
    'Stock': 50,
    'Reorder Level': 10,
    'Tax Rate %': 5,
    'UOM': 'Kgs',
    'HSN Code': '1006'
  },
  {
    'Product Name': 'Sunflower Oil 1L',
    'MRP': 140,
    'Barcode': '8901234567891',
    'Item Code': 'OIL-01',
    'Category': 'Groceries',
    'Brand': 'Fortune',
    'Purchase Price': 110,
    'Stock': 100,
    'Reorder Level': 20,
    'Tax Rate %': 5,
    'UOM': 'Ltrs',
    'HSN Code': '1512'
  }
];

const SAMPLE_SUPPLIERS = [
  {
    'Supplier Name': 'ABC Wholesalers Pvt Ltd',
    'Phone': '9876543210',
    'Address': 'Trade Tower, Suite 402, Commercial Market',
    'GSTIN': '07AAAAA0000A1Z5',
    'Opening Balance': 5000,
    'Balance Type': 'PAYABLE',
    'Credit Limit': 50000,
    'Notes': 'Primary grocery distributor'
  },
  {
    'Supplier Name': 'Global Traders',
    'Phone': '9811223344',
    'Address': 'Industrial Area, Phase 2',
    'GSTIN': '07BBBBB1111B1Z2',
    'Opening Balance': 0,
    'Balance Type': 'PAYABLE',
    'Credit Limit': 25000,
    'Notes': 'Beverages & Snacks vendor'
  }
];

const SAMPLE_CUSTOMERS = [
  {
    'Customer Name': 'Rahul Sharma',
    'Phone': '9899887766',
    'Address': '123 Park Avenue, Block C',
    'GSTIN': '',
    'Opening Balance': 1200,
    'Balance Type': 'RECEIVABLE',
    'Credit Limit': 10000,
    'Notes': 'Regular retail buyer'
  },
  {
    'Customer Name': 'Metro Resto Cafe',
    'Phone': '9871122334',
    'Address': 'Sector 18, Commercial Hub',
    'GSTIN': '07CCCCC2222C1Z9',
    'Opening Balance': 0,
    'Balance Type': 'RECEIVABLE',
    'Credit Limit': 30000,
    'Notes': 'B2B Monthly billing customer'
  }
];

const SAMPLE_STAFF = [
  {
    'Staff Name': 'Amit Kumar',
    'Phone': '9811122233',
    'Email': 'amit@store.com',
    'Role / Designation': 'Biller & Cashier',
    'Monthly Salary': 18000,
    'Joining Date': '2026-01-15',
    'Notes': 'Morning shift cashier'
  },
  {
    'Staff Name': 'Priya Singh',
    'Phone': '9822233344',
    'Email': 'priya@store.com',
    'Role / Designation': 'Sales Executive',
    'Monthly Salary': 22000,
    'Joining Date': '2025-11-01',
    'Notes': 'Full-time sales staff'
  }
];

export function DataUploadModal({ 
  isOpen, 
  onClose, 
  defaultEntity = 'products',
  allowedEntities = ['products', 'suppliers', 'customers', 'staff'],
  hideEntityTabs = false,
  onImportSuccess 
}: DataUploadModalProps) {
  const { tenantId, user } = useAuthStore();
  const [entityType, setEntityType] = useState<UploadEntityType>(defaultEntity);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showOrderGuide, setShowOrderGuide] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setEntityType(defaultEntity);
      setParsedRows([]);
      setFileName('');
      setMessage(null);
    }
  }, [isOpen, defaultEntity]);

  if (!isOpen) return null;

  const getSpecs = (): ColumnSpec[] => {
    switch (entityType) {
      case 'products': return PRODUCT_COLUMN_SPECS;
      case 'suppliers': return SUPPLIER_COLUMN_SPECS;
      case 'customers': return CUSTOMER_COLUMN_SPECS;
      case 'staff': return STAFF_COLUMN_SPECS;
    }
  };

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
        } catch (err: any) {
          setMessage({ type: 'error', text: `Failed to parse Excel file: ${err.message}` });
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
        mappedData.is_gst_applicable = mappedData.tax_rate_percent > 0 ? 1 : 0;
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

  // ─── Download Demo Sample Templates ────────────────────────────────────────

  const downloadDemoFile = (format: 'csv' | 'xlsx') => {
    let sampleData: any[] = [];
    let filePrefix = 'product';

    if (entityType === 'products') {
      sampleData = SAMPLE_PRODUCTS;
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

  // ─── Execute Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setMessage({ type: 'error', text: 'No valid rows found to import.' });
      return;
    }

    setImporting(true);
    setMessage(null);

    try {
      const tid = tenantId || 'global';

      if (entityType === 'products') {
        const payload = validRows.map(r => ({
          product_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          sku_barcode: r.data.sku_barcode || null,
          item_code: r.data.item_code || null,
          category: r.data.category || null,
          brand_manufacturer: r.data.brand_manufacturer || null,
          purchase_price: r.data.purchase_price || 0,
          base_price: r.data.base_price || 0,
          current_stock: r.data.current_stock || 0,
          reorder_level: r.data.reorder_level || 0,
          is_gst_applicable: r.data.is_gst_applicable ?? 1,
          tax_rate_percent: r.data.tax_rate_percent || 0,
          uom: r.data.uom || 'Pcs',
          hsn_sac_code: r.data.hsn_sac_code || null,
          domain_attributes: '{}',
          billing_type: ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(r.data.uom) ? 'WEIGHT' : 'PIECE',
          pricing_mode: 'FIXED_PRICE'
        }));

        if (window.electronAPI?.dbBulkImportProducts) {
          const res = await window.electronAPI.dbBulkImportProducts(payload);
          if (res.success) {
            setMessage({ type: 'success', text: `Successfully imported ${payload.length} products!` });
            if (onImportSuccess) onImportSuccess(payload.length, 'products');
            setTimeout(() => { onClose(); }, 1200);
          } else {
            setMessage({ type: 'error', text: res.error || 'Failed to import products.' });
          }
        } else {
          setMessage({ type: 'error', text: 'Desktop database API is unavailable.' });
        }
      } else if (entityType === 'staff') {
        // Import Staff
        const partyPayload = validRows.map(r => ({
          party_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          phone: r.data.phone || null,
          address: r.data.address || null,
          gstin: null,
          balance: 0,
          balance_type: 'PAYABLE',
          credit_limit: 0,
          party_type: 'STAFF',
          custom_category: r.data.role_designation || 'Staff',
          notes: r.data.notes || null,
          created_by: user?.user_id || null,
          created_by_name: user?.name || null
        }));

        if (window.electronAPI?.dbBulkImportParties) {
          await window.electronAPI.dbBulkImportParties(partyPayload);
        }

        if (window.electronAPI?.dbSaveStaff) {
          for (const r of validRows) {
            try {
              await window.electronAPI.dbSaveStaff({
                tenant_id: tid,
                name: r.data.name,
                phone: r.data.phone || undefined,
                email: r.data.email || undefined,
                role_designation: r.data.role_designation || 'Staff',
                joining_date: r.data.joining_date || undefined,
                monthly_salary: r.data.monthly_salary || 0,
                status: 'ACTIVE'
              });
            } catch (e) {
              console.warn('Error saving staff:', e);
            }
          }
        }

        setMessage({ type: 'success', text: `Successfully imported ${validRows.length} staff members!` });
        if (onImportSuccess) onImportSuccess(validRows.length, 'staff');
        setTimeout(() => { onClose(); }, 1200);

      } else {
        // Suppliers or Customers
        const payload = validRows.map(r => ({
          party_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          phone: r.data.phone || null,
          address: r.data.address || null,
          gstin: r.data.gstin || null,
          balance: r.data.balance || 0,
          balance_type: r.data.balance_type || (entityType === 'suppliers' ? 'PAYABLE' : 'RECEIVABLE'),
          credit_limit: r.data.credit_limit || 0,
          party_type: entityType === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER',
          custom_category: r.data.custom_category || null,
          notes: r.data.notes || null,
          created_by: user?.user_id || null,
          created_by_name: user?.name || null
        }));

        if (window.electronAPI?.dbBulkImportParties) {
          const res = await window.electronAPI.dbBulkImportParties(payload);
          if (res.success) {
            setMessage({ type: 'success', text: `Successfully imported ${payload.length} ${entityType}!` });
            if (onImportSuccess) onImportSuccess(payload.length, entityType);
            setTimeout(() => { onClose(); }, 1200);
          } else {
            setMessage({ type: 'error', text: res.error || `Failed to import ${entityType}.` });
          }
        } else {
          setMessage({ type: 'error', text: 'Desktop database API is unavailable.' });
        }
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setMessage({ type: 'error', text: err.message || 'An error occurred during import.' });
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;
  const columnSpecs = getSpecs();
  const showTabs = !hideEntityTabs && allowedEntities.length > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" title="DATA IMPORT CENTER">
      <div className="space-y-5 p-1 text-slate-900 dark:text-slate-100 font-sans">

        {/* ── Top Bar Header & Entity Switcher ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Import Data ({entityType.toUpperCase()})
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  CSV / EXCEL
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bulk import spreadsheet records into your POS system in 3 easy steps.
              </p>
            </div>
          </div>

          {showTabs && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {allowedEntities.includes('products') && (
                <button
                  onClick={() => handleEntityChange('products')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    entityType === 'products'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  📦 Products
                </button>
              )}
              {allowedEntities.includes('customers') && (
                <button
                  onClick={() => handleEntityChange('customers')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    entityType === 'customers'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  👥 Customers
                </button>
              )}
              {allowedEntities.includes('suppliers') && (
                <button
                  onClick={() => handleEntityChange('suppliers')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    entityType === 'suppliers'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  🚚 Suppliers
                </button>
              )}
              {allowedEntities.includes('staff') && (
                <button
                  onClick={() => handleEntityChange('staff')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    entityType === 'staff'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  👔 Staff
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Status Message Banner ── */}
        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between gap-2 shadow-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200'
                : message.type === 'error'
                ? 'bg-rose-50 text-rose-900 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200'
                : 'bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {message.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP 1: EXPECTED COLUMN ORDER & FORMAT GUIDE ── */}
        <div className="bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                1
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-indigo-600" />
                EXPECTED COLUMN ORDER ({entityType.toUpperCase()})
              </h3>
            </div>
            <button
              onClick={() => setShowOrderGuide(!showOrderGuide)}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
            >
              {showOrderGuide ? 'Hide Guide' : 'Show Column Guide'}
            </button>
          </div>

          {showOrderGuide && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Arrange your spreadsheet columns in this exact sequence or use matching header titles:
              </p>
              
              <div className="flex flex-wrap gap-2 pt-1">
                {columnSpecs.map((col, idx) => (
                  <div
                    key={col.name}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-2 shadow-xs transition-all ${
                      col.required
                        ? 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-100 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-sans font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-semibold">{col.name}</span>
                    {col.required ? (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 font-sans font-black tracking-wide">
                        REQUIRED
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-sans">
                        Optional
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── EQUAL 50/50 GRID FOR STEP 2 (DEMO DOWNLOAD) & STEP 3 (UPLOAD FILE) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">

          {/* Left Card: STEP 2 - Download Demo File (50% Width) */}
          <div className="bg-gradient-to-br from-emerald-500/10 via-slate-50 to-indigo-500/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-indigo-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                  2
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  DOWNLOAD DEMO SAMPLE FILE
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                Download a pre-filled demo spreadsheet with standard example data to test or copy the exact format for <strong className="uppercase font-black text-emerald-700 dark:text-emerald-400">{entityType}</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDemoFile('xlsx')}
                className="w-full text-xs font-bold flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 border-none shadow-md py-2.5 rounded-xl cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Download Demo Excel (.xlsx)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDemoFile('csv')}
                className="w-full text-xs font-bold flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 py-2.5 rounded-xl cursor-pointer shadow-xs"
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Download Demo CSV (.csv)</span>
              </Button>
            </div>
          </div>

          {/* Right Card: STEP 3 - Upload Spreadsheet (50% Width) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                3
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600" />
                UPLOAD YOUR SPREADSHEET
              </h3>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[110px] relative ${
                dragActive
                  ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/80 scale-[1.01]'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />

              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center mb-1.5">
                <Upload className="w-5 h-5" />
              </div>

              <p className="text-xs font-black text-slate-900 dark:text-white">
                Click to browse or drag and drop file here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Supports CSV (.csv) and Excel (.xlsx, .xls) files up to 10MB
              </p>

              {fileName && (
                <span className="mt-2 text-xs bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 px-3 py-0.5 rounded-full font-bold flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Loaded: {fileName}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* ── STEP 4: PREVIEW TABLE & LIVE VALIDATION ── */}
        {parsedRows.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex items-center gap-3">
                <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase text-xs tracking-wider">
                  <Table className="w-4 h-4 text-indigo-600" />
                  Live Data Preview ({parsedRows.length} Rows)
                </span>
                <span className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                  ✓ {validCount} Valid
                </span>
                {invalidCount > 0 && (
                  <span className="bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 px-2.5 py-0.5 rounded-full font-bold">
                    ⚠ {invalidCount} Invalid
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setParsedRows([]); setFileName(''); setMessage(null); }}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Clear File
              </Button>
            </div>

            {/* Preview Table Container */}
            <div className="max-h-60 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-inner bg-white dark:bg-slate-900">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-bold">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">Status</th>
                    {entityType === 'products' ? (
                      <>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">MRP</th>
                        <th className="py-2.5 px-3">Barcode</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Cost Price</th>
                        <th className="py-2.5 px-3">Stock</th>
                        <th className="py-2.5 px-3">Tax %</th>
                      </>
                    ) : entityType === 'staff' ? (
                      <>
                        <th className="py-2.5 px-3">Staff Name</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Role / Designation</th>
                        <th className="py-2.5 px-3">Monthly Salary</th>
                        <th className="py-2.5 px-3">Joining Date</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Address</th>
                        <th className="py-2.5 px-3">GSTIN</th>
                        <th className="py-2.5 px-3">Opening Balance</th>
                        <th className="py-2.5 px-3">Balance Type</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {parsedRows.slice(0, 100).map((row) => (
                    <tr
                      key={row.id}
                      className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'bg-rose-50/60 dark:bg-rose-950/40 hover:bg-rose-100/50 text-rose-900 dark:text-rose-200'}
                    >
                      <td className="py-2 px-3 text-center">
                        {row.isValid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                        ) : (
                          <span title={row.errors.join(', ')}>
                            <AlertTriangle className="w-4 h-4 text-rose-600 inline cursor-pointer animate-pulse" />
                          </span>
                        )}
                      </td>
                      {entityType === 'products' ? (
                        <>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                          <td className="py-2 px-3 font-bold text-emerald-700 dark:text-emerald-400">₹{row.data.base_price ?? 0}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.sku_barcode || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.category || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">₹{row.data.purchase_price ?? 0}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.current_stock ?? 0} {row.data.uom}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.tax_rate_percent}%</td>
                        </>
                      ) : entityType === 'staff' ? (
                        <>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.phone || '—'}</td>
                          <td className="py-2 px-3 text-indigo-700 dark:text-indigo-400 font-bold">{row.data.role_designation || 'Staff'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">₹{row.data.monthly_salary ?? 0}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.joining_date || '—'}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.phone || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 max-w-[150px] truncate">{row.data.address || '—'}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.gstin || '—'}</td>
                          <td className="py-2 px-3 font-bold text-indigo-700 dark:text-indigo-400">₹{row.data.balance ?? 0}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.balance_type}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 100 && (
                <div className="py-2 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 font-sans">
                  Showing first 100 rows out of {parsedRows.length}...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer Actions ── */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={importing} className="font-bold text-xs">
            Cancel
          </Button>

          <Button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
          >
            {importing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Importing {validCount} Records...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import {validCount} Valid Records
              </>
            )}
          </Button>
        </div>

      </div>
    </Modal>
  );
}
