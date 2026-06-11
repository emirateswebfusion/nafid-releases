import { useState, useEffect } from 'react';
import { Save, Printer, AlertCircle, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { v4 as uuidv4 } from 'uuid';

interface RowData {
  id: string;
  name: string;
  category: string;
  grade_id: string;
  mrp: string;
  purchase_price: string;
  stock: string;
  error?: string;
}

export function BulkOnboardingTab() {
  const { tenantId } = useAuthStore();
  const [rows, setRows] = useState<RowData[]>([createEmptyRow()]);
  const [grades, setGrades] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Bulk print state
  const [pendingPrintCount, setPendingPrintCount] = useState(0);
  const [printLimit, setPrintLimit] = useState(10);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadGrades();
    loadPendingPrintCount();
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
        // We can just fetch a large limit to get the count, or implement a specific count query.
        // For now, let's fetch up to 1000 and count.
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
      category: '',
      grade_id: '',
      mrp: '',
      purchase_price: '',
      stock: '1'
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
      
      const [name, category, gradeName, mrp, purchase_price, stock] = r;
      
      let matchedGradeId = '';
      const cleanCat = category ? category.trim() : '';
      const cleanGrade = gradeName ? gradeName.trim() : '';

      if (cleanCat && cleanGrade) {
        const found = grades.find(g => g.category.toLowerCase() === cleanCat.toLowerCase() && g.grade_name.toLowerCase() === cleanGrade.toLowerCase());
        if (found) matchedGradeId = found.grade_id;
      }

      const newData = {
        id: uuidv4(),
        name: name ? name.trim() : '',
        category: cleanCat,
        grade_id: matchedGradeId,
        mrp: mrp ? mrp.replace(/[^0-9.]/g, '') : '',
        purchase_price: purchase_price ? purchase_price.replace(/[^0-9.]/g, '') : '',
        stock: stock ? stock.replace(/[^0-9]/g, '') : '1'
      };

      if (currentRowIndex < newRows.length) {
        newRows[currentRowIndex] = { ...newRows[currentRowIndex], ...newData };
      } else {
        newRows.push(newData);
      }
      currentRowIndex++;
    }
    
    // Ensure at least one empty row at the end
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

  const updateRow = (index: number, field: keyof RowData, value: string) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    
    // Auto clear grade if category changes and doesn't match
    if (field === 'category') {
      newRows[index].grade_id = '';
    }

    if (index === newRows.length - 1 && value !== '') {
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
      category: r.category.trim() || 'General',
      grade_id: r.grade_id || null,
      base_price: Number(r.mrp) || 0,
      purchase_price: Number(r.purchase_price) || 0,
      current_stock: Number(r.stock) || 0,
      pricing_mode: r.grade_id ? 'GRADE_RATE' : 'FIXED_PRICE',
      billing_type: 'PIECE'
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

  const handleBulkPrint = async () => {
    if (!window.electronAPI) return;
    if (printLimit <= 0) {
       setMessage({ type: 'error', text: 'Please specify a valid number of products to print.' });
       return;
    }

    setPrinting(true);
    setMessage(null);

    try {
      const pendingProducts = await window.electronAPI.dbGetPendingPrintProducts({
        tenant_id: tenantId || 'global',
        limit: printLimit
      });

      if (pendingProducts.length === 0) {
        setMessage({ type: 'error', text: 'No pending products to print.' });
        setPrinting(false);
        return;
      }

      // Format for printer
      const printItems = pendingProducts.map(p => ({
        barcode: p.sku_barcode,
        price: p.base_price,
        name: p.name,
        quantity: Math.max(1, p.current_stock), // Print labels based on stock
      }));

      const printRes = await window.electronAPI.printBulkBarcodes(tenantId || 'global', printItems);

      if (printRes.success) {
        // Mark as printed
        const ids = pendingProducts.map(p => p.product_id);
        const updateRes = await window.electronAPI.dbUpdatePrintStatus(ids);
        if (updateRes.success) {
          setMessage({ type: 'success', text: `Printed labels for ${pendingProducts.length} products.` });
          loadPendingPrintCount();
        } else {
          setMessage({ type: 'error', text: `Printed, but failed to update status: ${updateRes.error}` });
        }
      } else {
         setMessage({ type: 'error', text: `Print failed: ${printRes.error}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error: ${err.message}` });
    }
    setPrinting(false);
  };

  return (
    <div className="space-y-6">
      
      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${message.type === 'success' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Grid Section */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
        <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-foreground">Bulk Data Entry</h3>
            <p className="text-xs text-muted-foreground mt-1">
              You can copy data from Excel and paste it into the first cell. 
              Column order: <b>Name, Category, Grade, MRP, Purchase Price, Stock</b>.
            </p>
          </div>
          <Button onClick={handleBulkSave} disabled={loading} className="gap-2 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Products
          </Button>
        </div>

        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/40 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 font-semibold w-[25%]">Product Name *</th>
                <th className="px-4 py-3 font-semibold w-[15%]">Category</th>
                <th className="px-4 py-3 font-semibold w-[15%]">Grade</th>
                <th className="px-4 py-3 font-semibold w-[12%]">MRP *</th>
                <th className="px-4 py-3 font-semibold w-[12%]">Purchase</th>
                <th className="px-4 py-3 font-semibold w-[10%]">Stock</th>
                <th className="px-4 py-3 font-semibold w-[10%] text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => {
                const availableGrades = grades.filter(g => g.category.toLowerCase() === row.category.toLowerCase());
                return (
                  <tr key={row.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="p-1">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(index, 'name', e.target.value)}
                          onPaste={(e) => handlePaste(e, index)}
                          className={`w-full bg-transparent px-3 py-2 outline-none border ${row.error && row.name ? 'border-destructive' : 'border-transparent focus:border-primary'} rounded-md transition-colors`}
                          placeholder="Name..."
                        />
                        {row.error && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive text-[10px] font-bold">{row.error}</span>}
                      </div>
                    </td>
                    <td className="p-1">
                      {categories.length > 0 ? (
                        <>
                          <input 
                            list={`categories-list-${row.id}`} 
                            value={row.category}
                            onChange={(e) => updateRow(index, 'category', e.target.value)}
                            className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors"
                            placeholder="Category..."
                          />
                          <datalist id={`categories-list-${row.id}`}>
                            {categories.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </>
                      ) : (
                        <input
                          type="text"
                          value={row.category}
                          onChange={(e) => updateRow(index, 'category', e.target.value)}
                          className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors"
                          placeholder="Category..."
                        />
                      )}
                    </td>
                    <td className="p-1">
                      <select
                        value={row.grade_id}
                        onChange={(e) => updateRow(index, 'grade_id', e.target.value)}
                        className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors disabled:opacity-50 appearance-none"
                        disabled={!row.category || availableGrades.length === 0}
                      >
                        <option value="">- Select Grade -</option>
                        {availableGrades.map(g => (
                          <option key={g.grade_id} value={g.grade_id}>{g.grade_name} (₹{g.rate})</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={row.mrp}
                        onChange={(e) => updateRow(index, 'mrp', e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={row.purchase_price}
                        onChange={(e) => updateRow(index, 'purchase_price', e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={row.stock}
                        onChange={(e) => updateRow(index, 'stock', e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full bg-transparent px-3 py-2 outline-none border border-transparent focus:border-primary rounded-md transition-colors text-center"
                        placeholder="1"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button 
                        onClick={() => removeRow(index)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Print Section */}
      <div className="bg-background border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <Printer className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">Bulk Label Printing</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Print barcode labels for newly imported products. Labels are generated based on the stock count of each product.
            </p>
            
            <div className="mt-6 flex items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Pending Products</label>
                <div className="px-4 py-2.5 bg-muted rounded-lg font-bold text-foreground">
                  {pendingPrintCount}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Products to Print</label>
                <Input 
                  type="number" 
                  min={1} 
                  max={100}
                  value={printLimit}
                  onChange={(e) => setPrintLimit(Number(e.target.value))}
                  className="w-32"
                />
              </div>
              <Button 
                onClick={handleBulkPrint} 
                disabled={printing || pendingPrintCount === 0}
                className="gap-2 mb-0.5"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Print Labels
              </Button>
            </div>
            
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={loadPendingPrintCount} className="text-xs">
                <RefreshCw className="w-3 h-3 mr-2" /> Refresh Count
              </Button>
            </div>
            
          </div>
        </div>
      </div>

    </div>
  );
}
