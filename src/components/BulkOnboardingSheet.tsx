import { useState, useEffect } from 'react';
import { Save, Printer, AlertCircle, Trash, Loader2, RefreshCw, CheckCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { Select } from './ui/Select';
import { v4 as uuidv4 } from 'uuid';

interface RowData {
  id: string;
  name: string;
  sku_barcode: string;
  item_code: string;
  category: string;
  grade_id: string;
  purchase_price: string;
  mrp: string;
  is_gst_applicable: boolean;
  tax_rate_percent: string;
  uom: string;
  brand: string;
  stock: string;
  reorder_level: string;
  discount_percent: string;
  discount_flat: string;
  offer_price: string;
  billing_type: 'PIECE' | 'WEIGHT';
  error?: string;
}

export function BulkOnboardingSheet({ onClose }: { onClose: () => void }) {
  const { tenantId } = useAuthStore();
  const [rows, setRows] = useState<RowData[]>([createEmptyRow()]);
  const [grades, setGrades] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  // Bulk print state
  const [pendingPrintCount, setPendingPrintCount] = useState(0);
  const [printLimit, setPrintLimit] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<{ text: string, type: 'info' | 'success' | 'error' } | null>(null);
  const [printDate, setPrintDate] = useState('');
  const [printDateEnd, setPrintDateEnd] = useState('');
  const [printOnlyPending, setPrintOnlyPending] = useState(true);

  useEffect(() => {
    loadGrades();
  }, []);

  useEffect(() => {
    loadPendingPrintCount();
  }, [printDate, printDateEnd, printOnlyPending]);

  const loadGrades = async () => {
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.dbGetGrades(tenantId || 'global');
        if (Array.isArray(data)) {
          setGrades(data);
          const uniqueCats = Array.from(new Set(data.map(g => g.category)));
          setCategories(uniqueCats);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const loadPendingPrintCount = async () => {
    if (window.electronAPI) {
      try {
        const pending = await window.electronAPI.dbGetPendingPrintProducts({ tenant_id: tenantId || 'global', limit: 10000, date: printDate || undefined, dateEnd: printDateEnd || undefined, only_pending: printOnlyPending });
        setPendingPrintCount(pending.length);
        setPrintLimit(pending.length);
      } catch (err) {
        console.error(err);
      }
    }
  };

  function createEmptyRow(): RowData {
    return {
      id: uuidv4(),
      name: '',
      sku_barcode: '',
      item_code: '',
      category: '',
      grade_id: '',
      purchase_price: '',
      mrp: '',
      is_gst_applicable: false,
      tax_rate_percent: '0',
      uom: 'Pcs',
      brand: '',
      stock: '1',
      reorder_level: '0',
      discount_percent: '',
      discount_flat: '',
      offer_price: '',
      billing_type: 'PIECE',
    };
  }

  const handlePaste = (e: React.ClipboardEvent, rowIndex: number) => {
    const text = e.clipboardData.getData('text');
    if (!text || text.indexOf('\t') === -1) return; // Not a TSV paste
    e.preventDefault();

    const pastedRows = text.split('\n').map(r => r.split('\t'));
    const newRows = [...rows];
    let currentRowIndex = rowIndex;

    for (const r of pastedRows) {
      if (r.length < 2 && !r[0]) continue;
      
      // Expected Order:
      // 0:Name, 1:Barcode, 2:ItemCode, 3:Brand, 4:Category, 5:GradeName, 6:PurchasePrice, 7:MRP,
      // 8:Stock, 9:Reorder Level, 10:Discount %, 11:Discount Flat, 12:Offer Price,
      // 13:GST Applicable(Y/N), 14:Tax Rate %, 15:UOM
      
      const name = r[0] || '';
      const barcode = r[1] || '';
      const itemCode = r[2] || '';
      const brand = r[3] || '';
      const category = r[4] || '';
      const gradeName = r[5] || '';
      const purchasePrice = r[6] || '';
      const mrp = r[7] || '';
      const stock = r[8] || '1';
      const reorderLvl = r[9] || '0';
      const discPct = r[10] || '';
      const discFlat = r[11] || '';
      const offerPrc = r[12] || '';
      const isGst = r[13] || 'Y';
      const taxRate = r[14] || '0';
      const uom = r[15] || 'Pcs';

      let matchedGradeId = '';
      const cleanCat = category.trim();
      const cleanGrade = gradeName.trim();

      if (cleanCat && cleanGrade) {
        const found = grades.find(g => g.category.toLowerCase() === cleanCat.toLowerCase() && g.grade_name.toLowerCase() === cleanGrade.toLowerCase());
        if (found) matchedGradeId = found.grade_id;
      }

      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
      const billing_type: 'PIECE'|'WEIGHT' = weightUoms.includes(uom.trim()) ? 'WEIGHT' : 'PIECE';

      const newData: RowData = {
        id: uuidv4(),
        name: name.trim(),
        sku_barcode: barcode.trim(),
        item_code: itemCode.trim(),
        category: cleanCat,
        grade_id: matchedGradeId,
        purchase_price: purchasePrice.replace(/[^0-9.]/g, ''),
        mrp: mrp.replace(/[^0-9.]/g, ''),
        is_gst_applicable: isGst.trim().toUpperCase() === 'Y' || isGst.trim().toUpperCase() === 'YES',
        tax_rate_percent: taxRate.replace(/[^0-9.]/g, ''),
        uom: uom.trim() || 'Pcs',
        brand: brand.trim(),
        stock: stock.replace(/[^0-9]/g, '') || '1',
        reorder_level: reorderLvl.replace(/[^0-9]/g, '') || '0',
        discount_percent: discPct.replace(/[^0-9.]/g, ''),
        discount_flat: discFlat.replace(/[^0-9.]/g, ''),
        offer_price: offerPrc.replace(/[^0-9.]/g, ''),
        billing_type,
      };

      if (currentRowIndex < newRows.length) {
        newRows[currentRowIndex] = { ...newRows[currentRowIndex], ...newData };
      } else {
        newRows.push(newData);
      }
      currentRowIndex++;
    }
    
    if (newRows[newRows.length - 1].name) {
      newRows.push(createEmptyRow());
    }

    setRows(validateRows(newRows));
  };

  const validateRows = (data: RowData[]) => {
    return data.map(r => {
      let err = '';
      if (r.name && !r.mrp) err = 'MRP is required';
      else if (r.name && Number(r.mrp) <= 0) err = 'MRP must be > 0';
      return { ...r, error: err };
    });
  };

  const getEffectiveMrp = (r: RowData) => {
    let base = Number(r.mrp) || 0;
    if (r.grade_id) {
      const grade = grades.find(g => g.grade_id === r.grade_id);
      if (grade && grade.rate) {
        base += Number(grade.rate);
      }
    }
    return base;
  };

  const updateRow = (index: number, field: keyof RowData, value: any) => {
    const newRows = [...rows];
    const row = { ...newRows[index] };
    
    if (field === 'discount_percent') {
      row.discount_percent = value;
      if (value === '') {
        row.discount_flat = '';
      } else {
        const pct = parseFloat(value);
        const base = getEffectiveMrp(row);
        if (!isNaN(pct) && base) {
          row.discount_flat = ((base * pct) / 100).toFixed(2);
          row.offer_price = '';
        }
      }
    } else if (field === 'discount_flat') {
      row.discount_flat = value;
      if (value === '') {
        row.discount_percent = '';
      } else {
        const flat = parseFloat(value);
        const base = getEffectiveMrp(row);
        if (!isNaN(flat) && base) {
          row.discount_percent = ((flat / base) * 100).toFixed(2);
          row.offer_price = '';
        }
      }
    } else if (field === 'offer_price') {
      row.offer_price = value;
      if (value !== '') {
        row.discount_percent = '';
        row.discount_flat = '';
      }
    } else if (field === 'mrp' || field === 'grade_id') {
      if (field === 'mrp') row.mrp = value;
      if (field === 'grade_id') row.grade_id = value;

      if (row.discount_percent) {
        const pct = parseFloat(row.discount_percent);
        const base = getEffectiveMrp(row);
        if (!isNaN(pct) && base) {
          row.discount_flat = ((base * pct) / 100).toFixed(2);
        }
      } else if (row.discount_flat) {
        const flat = parseFloat(row.discount_flat);
        const base = getEffectiveMrp(row);
        if (!isNaN(flat) && base) {
          row.discount_percent = ((flat / base) * 100).toFixed(2);
        }
      }
    } else if (field === 'billing_type') {
      row.billing_type = value;
    } else if (field === 'uom') {
      row.uom = value;
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
      row.billing_type = weightUoms.includes(value) ? 'WEIGHT' : 'PIECE';
    } else {
      (row as any)[field] = value;
    }

    if (field === 'category') {
      row.grade_id = '';
      // Recalculate discount if grade is removed
      if (row.discount_percent) {
        const pct = parseFloat(row.discount_percent);
        const base = getEffectiveMrp(row);
        if (!isNaN(pct) && base) {
          row.discount_flat = ((base * pct) / 100).toFixed(2);
        }
      } else if (row.discount_flat) {
        const flat = parseFloat(row.discount_flat);
        const base = getEffectiveMrp(row);
        if (!isNaN(flat) && base) {
          row.discount_percent = ((flat / base) * 100).toFixed(2);
        }
      }
    }

    newRows[index] = row;

    if (index === newRows.length - 1 && value !== '' && field === 'name') {
      newRows.push(createEmptyRow());
    }
    setRows(validateRows(newRows));
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) {
      setRows([createEmptyRow()]);
      return;
    }
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(validateRows(newRows));
  };

  const getNextBarcode = async () => {
    let nextBarcode = '1';
    if (window.electronAPI) {
      try {
        const lastProduct = await window.electronAPI.dbGetProducts({
          tenant_id: tenantId,
          limit: 1,
          sortBy: 'created_at'
        });
        if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
          const lastBarcode = lastProduct[0].sku_barcode;
          const match = lastBarcode.match(/(\d+)[^\d]*$/);
          if (match) {
            const numStr = match[1];
            const nextNum = (BigInt(numStr) + 1n).toString();
            nextBarcode = nextNum.padStart(numStr.length, '0');
          }
        }
      } catch (err) {
        console.error("Failed to fetch last barcode", err);
      }
    }
    return nextBarcode;
  };

  const handleBulkSave = async () => {
    const validData = rows.filter(r => r.name.trim() !== '');
    if (validData.length === 0) {
      setMessage({ type: 'error', text: 'No data to save.' });
      return;
    }

    const hasErrors = validData.some(r => r.error);
    if (hasErrors) {
      setMessage({ type: 'error', text: 'Please fix the errors in the grid before saving.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    let nextBarcode = await getNextBarcode();
    const productsToInsert: any[] = [];
    for (const r of validData) {
      let barcode = r.sku_barcode.trim();
      if (!barcode) {
        barcode = nextBarcode;
        const match = barcode.match(/(\d+)[^\d]*$/);
        if (match) {
          const numStr = match[1];
          const nextNum = (BigInt(numStr) + 1n).toString();
          nextBarcode = nextNum.padStart(numStr.length, '0');
        }
      }
      productsToInsert.push({
        product_id: uuidv4(),
        tenant_id: tenantId || 'global',
        name: r.name.trim(),
        sku_barcode: barcode,
        item_code: r.item_code.trim() || null,
        category: r.category.trim() || 'General',
        grade_id: r.grade_id || null,
        purchase_price: Number(r.purchase_price) || 0,
        base_price: Number(r.mrp) || 0,
        is_gst_applicable: r.is_gst_applicable ? 1 : 0,
        tax_rate_percent: Number(r.tax_rate_percent) || 0,
        uom: r.uom.trim() || 'Pcs',
        brand_manufacturer: r.brand.trim() || null,
        current_stock: Number(r.stock) || 0,
        reorder_level: Number(r.reorder_level) || 0,
        discount_percent: r.discount_percent ? Number(r.discount_percent) : null,
        discount_flat: r.discount_flat ? Number(r.discount_flat) : null,
        offer_price: r.offer_price ? Number(r.offer_price) : null,
        billing_type: r.billing_type,
        pricing_mode: r.grade_id ? 'GRADE_RATE' : 'FIXED_PRICE',
        domain_attributes: {}
      });
    }

    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.dbBulkImportProducts(productsToInsert);
        if (res.success) {
          setMessage({ type: 'success', text: `Successfully imported ${productsToInsert.length} products.` });
          setRows([createEmptyRow()]);
          loadPendingPrintCount();
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to import products.' });
        }
      } catch (err: any) {
        console.error('Bulk import error:', err);
        setMessage({ type: 'error', text: 'An error occurred. Please try again.' });
      }
    }
    setLoading(false);
  };

  const handleResetPending = async () => {
    if (!window.electronAPI) return;
    if (confirm('Are you sure you want to mark all pending products as printed?')) {
      try {
        const res = await window.electronAPI.dbResetPrintStatus(tenantId || 'global');
        if (res.success) {
          setPrintStatusMsg({ type: 'success', text: 'All pending items marked as printed.' });
          loadPendingPrintCount();
        } else {
          setPrintStatusMsg({ type: 'error', text: res.error || 'Failed to reset print status.' });
        }
      } catch (err: any) {
        console.error('Reset print status error:', err);
        setPrintStatusMsg({ type: 'error', text: 'An error occurred. Please try again.' });
      }
    }
  };

  const handleBulkPrint = async () => {
    if (!window.electronAPI) return;
    if (printLimit <= 0) {
       setPrintStatusMsg({ type: 'error', text: 'Please specify a valid number of products to print.' });
       return;
    }

    setPrinting(true);
    setPrintStatusMsg({ type: 'info', text: 'Preparing print job...' });

    try {
      const pendingProducts = await window.electronAPI.dbGetPendingPrintProducts({
        tenant_id: tenantId || 'global',
        limit: printLimit,
        date: printDate || undefined,
        dateEnd: printDateEnd || undefined,
        only_pending: printOnlyPending
      });

      if (pendingProducts.length === 0) {
        setPrintStatusMsg({ type: 'error', text: 'No pending products to print.' });
        setPrinting(false);
        return;
      }

      setPrintStatusMsg({ type: 'info', text: `Spooling ${pendingProducts.length} products...` });

      // Format for printer
      const printItems = pendingProducts.map(p => {
        const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
        const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
        const effectiveMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
          ? gradeRate 
          : Number(p.base_price);

        let sp: number | undefined;
        let spType: 'SP' | 'OFF' = 'SP';
        if (p.offer_price) {
          sp = Number(p.offer_price);
          spType = 'OFF';
        } else if (p.discount_flat) {
          sp = effectiveMrp - Number(p.discount_flat);
          spType = 'SP';
        } else if (p.discount_percent) {
          sp = effectiveMrp * (1 - Number(p.discount_percent) / 100);
          spType = 'SP';
        }
        if (sp !== undefined && sp === effectiveMrp) {
           sp = undefined;
        }

        return {
          barcode: p.sku_barcode,
          price: effectiveMrp,
          name: p.name,
          quantity: Math.max(1, p.current_stock),
          sp,
          spType
        };
      });

      const printRes = await window.electronAPI.printBulkBarcodes(tenantId || 'global', printItems);

      if (printRes.success) {
        const ids = pendingProducts.map(p => p.product_id);
        const updateRes = await window.electronAPI.dbUpdatePrintStatus(ids);
        if (updateRes.success) {
          setPrintStatusMsg({ type: 'success', text: `Successfully sent labels for ${pendingProducts.length} products to printer.` });
          loadPendingPrintCount();
        } else {
          setPrintStatusMsg({ type: 'error', text: `Printed, but failed to update status: ${updateRes.error}` });
        }
      } else {
         setPrintStatusMsg({ type: 'error', text: `Print failed: ${printRes.error}` });
      }
    } catch (err: any) {
      console.error('Bulk print error:', err);
      setPrintStatusMsg({ type: 'error', text: 'An error occurred. Please try again.' });
    }
    setPrinting(false);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      fullScreen={true}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Save className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Bulk Import Sheet</h2>
            <p className="text-muted-foreground text-sm font-normal">Paste from Excel or type manually.</p>
          </div>
        </div>
      }
    >
      <div className="h-full flex flex-col gap-6 relative">
        {message && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 shrink-0 ${message.type === 'success' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <div className="flex justify-between items-center shrink-0">
          <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border overflow-hidden whitespace-nowrap overflow-x-auto max-w-[70vw]">
            <b>Expected Excel Columns:</b> Name → Barcode → Item Code → Brand → Category → Grade → Purchase → MRP → Stock → Reorder Level → Disc% → DiscFlat → OfferPrice → GST(Y/N) → Tax% → UOM → Billing(Piece/Weight) → AvgWgt → WgtOverride(Y/N)
          </div>
          <Button onClick={handleBulkSave} disabled={loading} className="gap-2 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Data
          </Button>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto border border-border rounded-xl shadow-inner relative custom-scrollbar bg-card">
          <table className="w-max text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/80 sticky top-0 z-20 shadow-sm backdrop-blur-md">
              <tr>
                <th className="px-3 py-3 font-semibold min-w-[200px] sticky left-0 bg-muted/80 backdrop-blur-md z-30">Product Name *</th>
                <th className="px-3 py-3 font-semibold min-w-[120px]">Barcode</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Item Code</th>
                <th className="px-3 py-3 font-semibold min-w-[120px]">Brand</th>
                <th className="px-3 py-3 font-semibold min-w-[150px]">Category</th>
                <th className="px-3 py-3 font-semibold min-w-[150px]">Grade</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Purchase</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">MRP *</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Stock</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Reorder</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Disc %</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Disc Flat</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Offer Prc</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">GST?</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Tax %</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">UOM</th>
                <th className="px-3 py-3 font-semibold w-[50px] text-center sticky right-0 bg-muted/80 backdrop-blur-md z-30">Act</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => {
                const availableGrades = grades.filter(g => g.category.toLowerCase() === row.category.toLowerCase());
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="p-1 sticky left-0 bg-card z-10">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(index, 'name', e.target.value)}
                          onPaste={(e) => handlePaste(e, index)}
                          className={`w-full bg-transparent px-2 py-1.5 outline-none border ${row.error && row.name ? 'border-destructive' : 'border-transparent focus:border-primary'} rounded-md transition-colors text-sm font-medium`}
                          placeholder="Name (paste here)"
                        />
                      </div>
                    </td>
                    <td className="p-1"><input type="text" value={row.sku_barcode} onChange={(e) => updateRow(index, 'sku_barcode', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" placeholder="Auto" /></td>
                    <td className="p-1"><input type="text" value={row.item_code} onChange={(e) => updateRow(index, 'item_code', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.brand} onChange={(e) => updateRow(index, 'brand', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1">
                      {categories.length > 0 ? (
                        <>
                          <input list={`categories-list-${row.id}`} value={row.category} onChange={(e) => updateRow(index, 'category', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" />
                          <datalist id={`categories-list-${row.id}`}>{categories.map(c => <option key={c} value={c} />)}</datalist>
                        </>
                      ) : (
                        <input type="text" value={row.category} onChange={(e) => updateRow(index, 'category', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" />
                      )}
                    </td>
                    <td className="p-1">
                      <Select value={row.grade_id} onChange={v => updateRow(index, 'grade_id', v)} placeholder="- Grade -" size="sm" searchable disabled={!row.category || availableGrades.length === 0} options={availableGrades.map(g => ({value:g.grade_id,label:g.grade_name+' (₹'+g.rate+')'}))} />
                    </td>
                    <td className="p-1"><input type="text" value={row.purchase_price} onChange={(e) => updateRow(index, 'purchase_price', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" placeholder="0" /></td>
                    <td className="p-1"><input type="text" value={row.mrp} onChange={(e) => updateRow(index, 'mrp', e.target.value.replace(/[^0-9.]/g, ''))} className={`w-full bg-transparent px-2 py-1.5 outline-none border ${row.error && row.name && !row.mrp ? 'border-destructive' : 'border-transparent focus:border-primary'} rounded-md font-bold`} placeholder="0" /></td>
                    <td className="p-1"><input type="text" value={row.stock} onChange={(e) => updateRow(index, 'stock', e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.reorder_level} onChange={(e) => updateRow(index, 'reorder_level', e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.discount_percent} onChange={(e) => updateRow(index, 'discount_percent', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.offer_price} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1"><input type="text" value={row.discount_flat} onChange={(e) => updateRow(index, 'discount_flat', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.offer_price} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1"><input type="text" value={row.offer_price} onChange={(e) => updateRow(index, 'offer_price', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.discount_percent || !!row.discount_flat} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1 text-center"><input type="checkbox" checked={row.is_gst_applicable} onChange={(e) => updateRow(index, 'is_gst_applicable', e.target.checked)} className="w-4 h-4 accent-primary" /></td>
                    <td className="p-1"><input type="text" value={row.tax_rate_percent} onChange={(e) => updateRow(index, 'tax_rate_percent', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" disabled={!row.is_gst_applicable} /></td>
                    <td className="p-1">
                      <Select value={row.uom} onChange={v => updateRow(index, 'uom', v)} options={['Pcs','Kgs','Grams','Mtrs','Ltrs','Box','Dozen'].map(u => ({value:u,label:u}))} />
                    </td>
                    <td className="p-1 text-center sticky right-0 bg-card z-10">
                      <button onClick={() => removeRow(index)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"><Trash className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bulk Print Toolbar */}
        <div className="shrink-0 bg-muted/20 border border-border rounded-xl p-4 flex items-center gap-6 shadow-sm">
          <div className="flex items-center gap-3 border-r border-border pr-6">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Bulk Label Print</h3>
              <p className="text-xs text-muted-foreground">Print labels from pending queue</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-1">
            <div className="text-center">
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{printOnlyPending ? 'Pending' : 'Total'}</span>
              <div className="flex items-center justify-center gap-1">
                <span className="font-bold text-lg text-foreground leading-none">{pendingPrintCount}</span>
                {printOnlyPending && (
                  <Button variant="ghost" size="icon" onClick={handleResetPending} disabled={pendingPrintCount === 0 || printing} className="h-5 w-5 text-muted-foreground hover:text-green-600" title="Mark all as printed">
                    <CheckCheck className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status Filter</span>
              <label className="flex items-center gap-2 h-8 text-sm cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={printOnlyPending} onChange={(e) => setPrintOnlyPending(e.target.checked)} className="accent-primary w-4 h-4" />
                Only Pending
              </label>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Date Filter</span>
              <DateRangeFilter
                startDate={printDate}
                endDate={printDateEnd}
                onChange={(start, end) => {
                  setPrintDate(start);
                  setPrintDateEnd(end);
                }}
              />
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Print Qty</span>
              <Input type="number" min={1} max={500} value={printLimit} onChange={(e) => setPrintLimit(Number(e.target.value))} className="w-20 h-8 text-sm" />
            </div>
            <Button onClick={handleBulkPrint} disabled={printing || pendingPrintCount === 0} className="gap-2 shrink-0 h-8 text-sm">
              {printing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
              Print {printLimit} Labels
            </Button>
            <Button variant="ghost" size="icon" onClick={loadPendingPrintCount} className="h-8 w-8 ml-auto" title="Refresh count">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {printStatusMsg && (
            <div className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 ${
              printStatusMsg.type === 'error' ? 'bg-destructive/10 text-destructive' :
              printStatusMsg.type === 'success' ? 'bg-green-500/10 text-green-600' :
              'bg-blue-500/10 text-blue-600 flex items-center gap-2'
            }`}>
              {printStatusMsg.type === 'info' && <Loader2 className="w-3 h-3 animate-spin" />}
              {printStatusMsg.text}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
