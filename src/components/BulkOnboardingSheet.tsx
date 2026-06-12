import { useState, useEffect } from 'react';
import { Save, Printer, AlertCircle, Trash2, Loader2, RefreshCw, CheckCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
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
  average_weight_per_piece: string;
  weight_override_allowed: boolean;
  error?: string;
}

export function BulkOnboardingSheet({ onClose }: { onClose: () => void }) {
  const { tenantId } = useAuthStore();
  const [rows, setRows] = useState<RowData[]>([createEmptyRow()]);
  const [grades, setGrades] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);

  // Bulk print state
  const [pendingPrintCount, setPendingPrintCount] = useState(0);
  const [printLimit, setPrintLimit] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<{ text: string, type: 'info' | 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadGrades();
    loadPendingPrintCount();
    
    if (window.electronAPI) {
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'price_coding' })
        .then(res => {
          if (res) setPriceCoding(res);
        })
        .catch(console.error);
    }
  }, []);

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
        const pending = await window.electronAPI.dbGetPendingPrintProducts({ tenant_id: tenantId || 'global', limit: 10000 });
        setPendingPrintCount(pending.length);
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
      average_weight_per_piece: '',
      weight_override_allowed: false
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
      // 0:Name, 1:Barcode, 2:ItemCode, 3:Category, 4:GradeName, 5:PurchasePrice, 6:MRP, 
      // 7:GST Applicable(Y/N), 8:Tax Rate %, 9:UOM, 10:Brand, 11:Stock, 12:Reorder Level, 
      // 13:Discount %, 14:Discount Flat, 15:Offer Price, 16:Billing Type, 17:Avg Weight, 18:Weight Override
      
      const name = r[0] || '';
      const barcode = r[1] || '';
      const itemCode = r[2] || '';
      const category = r[3] || '';
      const gradeName = r[4] || '';
      const purchasePrice = r[5] || '';
      const mrp = r[6] || '';
      const isGst = r[7] || 'Y';
      const taxRate = r[8] || '0';
      const uom = r[9] || 'Pcs';
      const brand = r[10] || '';
      const stock = r[11] || '1';
      const reorderLvl = r[12] || '0';
      const discPct = r[13] || '';
      const discFlat = r[14] || '';
      const offerPrc = r[15] || '';
      const bType = r[16] || 'PIECE';
      const avgWgt = r[17] || '';
      const wOverride = r[18] || 'N';
      
      let matchedGradeId = '';
      const cleanCat = category.trim();
      const cleanGrade = gradeName.trim();

      if (cleanCat && cleanGrade) {
        const found = grades.find(g => g.category.toLowerCase() === cleanCat.toLowerCase() && g.grade_name.toLowerCase() === cleanGrade.toLowerCase());
        if (found) matchedGradeId = found.grade_id;
      }

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
        billing_type: (bType.trim().toUpperCase() === 'WEIGHT' ? 'WEIGHT' : 'PIECE') as 'PIECE'|'WEIGHT',
        average_weight_per_piece: avgWgt.replace(/[^0-9.]/g, ''),
        weight_override_allowed: wOverride.trim().toUpperCase() === 'Y' || wOverride.trim().toUpperCase() === 'YES'
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

  const updateRow = (index: number, field: keyof RowData, value: any) => {
    const newRows = [...rows];
    const row = { ...newRows[index] };
    
    if (field === 'discount_percent') {
      row.discount_percent = value;
      if (value === '') {
        row.discount_flat = '';
      } else {
        const pct = parseFloat(value);
        const base = Number(row.mrp) || 0;
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
        const base = Number(row.mrp) || 0;
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
    } else if (field === 'mrp') {
      row.mrp = value;
      if (row.discount_percent) {
        const pct = parseFloat(row.discount_percent);
        const base = Number(value) || 0;
        if (!isNaN(pct) && base) {
          row.discount_flat = ((base * pct) / 100).toFixed(2);
        }
      } else if (row.discount_flat) {
        const flat = parseFloat(row.discount_flat);
        const base = Number(value) || 0;
        if (!isNaN(flat) && base) {
          row.discount_percent = ((flat / base) * 100).toFixed(2);
        }
      }
    } else if (field === 'billing_type') {
      row.billing_type = value;
      if (value !== 'WEIGHT') {
        row.average_weight_per_piece = '';
      }
    } else {
      (row as any)[field] = value;
    }

    if (field === 'category') {
      row.grade_id = '';
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

  const generateBarcode = (itemCode: string, purchasePrice: string) => {
    let prefix = itemCode || '';
    let priceCode = '';
    
    if (priceCoding && purchasePrice) {
      const priceStr = String(purchasePrice).replace(/\D/g, '');
      for (const char of priceStr) {
        if (priceCoding[char]) priceCode += priceCoding[char];
      }
    }

    if (prefix.length + priceCode.length > 10) {
      prefix = prefix.substring(0, Math.max(0, 10 - priceCode.length));
    }
    
    const remainingLength = 10 - prefix.length - priceCode.length;
    let randomPart = '';
    if (remainingLength > 0) {
      const min = Math.pow(10, remainingLength - 1);
      const max = Math.pow(10, remainingLength) - 1;
      randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
    }
    
    return prefix + randomPart + priceCode;
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

    const productsToInsert = validData.map(r => ({
      product_id: uuidv4(),
      tenant_id: tenantId || 'global',
      name: r.name.trim(),
      sku_barcode: r.sku_barcode.trim() || generateBarcode(r.item_code.trim(), r.purchase_price),
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
      average_weight_per_piece: r.average_weight_per_piece ? Number(r.average_weight_per_piece) : null,
      weight_override_allowed: r.weight_override_allowed ? 1 : 0,
      domain_attributes: {}
    }));

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
        setMessage({ type: 'error', text: err.message });
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
        setPrintStatusMsg({ type: 'error', text: err.message });
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
        limit: printLimit
      });

      if (pendingProducts.length === 0) {
        setPrintStatusMsg({ type: 'error', text: 'No pending products to print.' });
        setPrinting(false);
        return;
      }

      setPrintStatusMsg({ type: 'info', text: `Spooling ${pendingProducts.length} products...` });

      // Format for printer
      const printItems = pendingProducts.map(p => ({
        barcode: p.sku_barcode,
        price: p.base_price,
        name: p.name,
        quantity: Math.max(1, p.current_stock), 
      }));

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
      setPrintStatusMsg({ type: 'error', text: `Error: ${err.message}` });
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
            <b>Expected Excel Columns:</b> Name → Barcode → Item Code → Category → Grade → Purchase → MRP → GST(Y/N) → Tax% → UOM → Brand → Stock → Reorder Level → Disc% → DiscFlat → OfferPrice → Billing(Piece/Weight) → AvgWgt → WgtOverride(Y/N)
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
                <th className="px-3 py-3 font-semibold min-w-[150px]">Category</th>
                <th className="px-3 py-3 font-semibold min-w-[150px]">Grade</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Purchase</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">MRP *</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">GST?</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Tax %</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">UOM</th>
                <th className="px-3 py-3 font-semibold min-w-[120px]">Brand</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Stock</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Reorder</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Disc %</th>
                <th className="px-3 py-3 font-semibold min-w-[80px]">Disc Flat</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Offer Prc</th>
                <th className="px-3 py-3 font-semibold min-w-[120px]">Billing</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Avg Wgt / Pc</th>
                <th className="px-3 py-3 font-semibold min-w-[100px]">Wgt Override?</th>
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
                      <select value={row.grade_id} onChange={(e) => updateRow(index, 'grade_id', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" disabled={!row.category || availableGrades.length === 0}>
                        <option value="">- Grade -</option>
                        {availableGrades.map(g => <option key={g.grade_id} value={g.grade_id}>{g.grade_name} (₹{g.rate})</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="text" value={row.purchase_price} onChange={(e) => updateRow(index, 'purchase_price', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" placeholder="0" /></td>
                    <td className="p-1"><input type="text" value={row.mrp} onChange={(e) => updateRow(index, 'mrp', e.target.value.replace(/[^0-9.]/g, ''))} className={`w-full bg-transparent px-2 py-1.5 outline-none border ${row.error && row.name && !row.mrp ? 'border-destructive' : 'border-transparent focus:border-primary'} rounded-md font-bold`} placeholder="0" /></td>
                    <td className="p-1 text-center"><input type="checkbox" checked={row.is_gst_applicable} onChange={(e) => updateRow(index, 'is_gst_applicable', e.target.checked)} className="w-4 h-4 accent-primary" /></td>
                    <td className="p-1"><input type="text" value={row.tax_rate_percent} onChange={(e) => updateRow(index, 'tax_rate_percent', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" disabled={!row.is_gst_applicable} /></td>
                    <td className="p-1">
                      <select value={row.uom} onChange={(e) => updateRow(index, 'uom', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md">
                        {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="text" value={row.brand} onChange={(e) => updateRow(index, 'brand', e.target.value)} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.stock} onChange={(e) => updateRow(index, 'stock', e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.reorder_level} onChange={(e) => updateRow(index, 'reorder_level', e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md" /></td>
                    <td className="p-1"><input type="text" value={row.discount_percent} onChange={(e) => updateRow(index, 'discount_percent', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.offer_price} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1"><input type="text" value={row.discount_flat} onChange={(e) => updateRow(index, 'discount_flat', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.offer_price} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1"><input type="text" value={row.offer_price} onChange={(e) => updateRow(index, 'offer_price', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!!row.discount_percent || !!row.discount_flat} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" /></td>
                    <td className="p-1">
                      <select value={row.billing_type} onChange={(e) => updateRow(index, 'billing_type', e.target.value as 'PIECE'|'WEIGHT')} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md">
                        <option value="PIECE">Piece</option>
                        <option value="WEIGHT">Weight</option>
                      </select>
                    </td>
                    <td className="p-1"><input type="text" value={row.average_weight_per_piece} onChange={(e) => updateRow(index, 'average_weight_per_piece', e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-transparent px-2 py-1.5 outline-none border border-transparent focus:border-primary rounded-md disabled:opacity-50" disabled={row.billing_type !== 'WEIGHT'} /></td>
                    <td className="p-1 text-center"><input type="checkbox" checked={row.weight_override_allowed} onChange={(e) => updateRow(index, 'weight_override_allowed', e.target.checked)} className="w-4 h-4 accent-primary" /></td>
                    <td className="p-1 text-center sticky right-0 bg-card z-10">
                      <button onClick={() => removeRow(index)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
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
              <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Pending</span>
              <div className="flex items-center justify-center gap-1">
                <span className="font-bold text-lg text-foreground leading-none">{pendingPrintCount}</span>
                <Button variant="ghost" size="icon" onClick={handleResetPending} disabled={pendingPrintCount === 0 || printing} className="h-5 w-5 text-muted-foreground hover:text-green-600" title="Mark all as printed">
                  <CheckCheck className="w-3 h-3" />
                </Button>
              </div>
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
