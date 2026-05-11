import { useRef, useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { Search, Trash2, Scale, Ruler, Package, X } from 'lucide-react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';

export function CartPane() {
  const { items, updateQuantity, removeItem, currentUserRole, shopDomain, addItem } = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Handle Search logic
  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      if (window.electronAPI) {
        const { tenantId } = useAuthStore.getState();
        const products = await window.electronAPI.dbGetProducts(tenantId || '');
        if (Array.isArray(products)) {
          const filtered = products.filter((p: any) => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.sku_barcode && p.sku_barcode.includes(searchQuery))
          ).slice(0, 8); // Top 8 results
          setResults(filtered);
          setSelectedIndex(0);
        }
      }
    };

    const timeout = setTimeout(performSearch, 150); // Debounce
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Handle Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (product: any) => {
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: product.base_price,
      purchase_price: product.purchase_price ?? 0,
      tax_rate_percent: product.tax_rate_percent ?? 0,
    });
    setSearchQuery('');
    setResults([]);
    searchInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (results.length > 0) {
        handleSelectProduct(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setResults([]);
      setSearchQuery('');
    }
  };

  useKeyboardShortcuts({
    'F2': () => searchInputRef.current?.focus(),
    'F4': () => {
      if (items.length > 0) {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }
    }
  });

  return (
    <div className="flex flex-col h-full w-[60%] border-r border-neutral-800 bg-neutral-950">
      {/* Top Bar with Search */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center gap-4 relative">
        <div ref={searchContainerRef} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search products or scan barcode... [F2]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg py-3 pl-11 pr-10 text-neutral-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-600"
          />
          
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setResults([]); searchInputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-800 rounded-full text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-neutral-800 text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-950/50">
                Found {results.length} matching products
              </div>
              <div className="max-h-80 overflow-y-auto">
                {results.map((p, i) => (
                  <button
                    key={p.product_id}
                    onClick={() => handleSelectProduct(p)}
                    className={clsx(
                      "w-full flex items-center justify-between p-3 transition-colors text-left border-b border-neutral-800/50 last:border-0",
                      i === selectedIndex ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx("p-2 rounded-lg", i === selectedIndex ? "bg-white/20" : "bg-neutral-800 text-neutral-400")}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{p.name}</div>
                        <div className={clsx("text-[10px] font-mono", i === selectedIndex ? "text-blue-100" : "text-neutral-500")}>
                          {p.sku_barcode || 'NO BARCODE'} • {p.category || 'General'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black">₹{p.base_price.toFixed(2)}</div>
                      <div className={clsx("text-[10px]", i === selectedIndex ? "text-blue-100" : "text-neutral-500")}>
                        Stock: {p.current_stock}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Domain-Specific Hardware Toggles */}
        {shopDomain === 'JEWELRY' && (
          <button className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 transition-colors flex items-center gap-2">
            <Scale className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-sm">Read Scale</span>
          </button>
        )}
        {shopDomain === 'HARDWARE' && (
          <button className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 transition-colors flex items-center gap-2">
            <Ruler className="w-5 h-5 text-orange-400" />
            <span className="font-semibold text-sm">Custom Cut</span>
          </button>
        )}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        <div className="col-span-5">Item</div>
        <div className="col-span-2 text-right">Price</div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-1 text-center"></div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600">
            <div className="text-4xl mb-2">🛒</div>
            <p>Cart is empty</p>
            <p className="text-xs mt-1">Scan a barcode to add items</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {items.map((item, index) => {
              const itemTotal = item.base_price * item.quantity;
              const isLastItem = index === items.length - 1;

              return (
                <div key={item.product_id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-neutral-900/30 transition-colors border-b border-neutral-800/30">
                  <div className="col-span-5">
                    <h3 className="text-neutral-200 font-medium">{item.name}</h3>
                    <div className="flex gap-3 text-xs mt-1">
                      <span className="text-neutral-500">Tax: {item.tax_rate_percent}%</span>
                      {currentUserRole === 'OWNER' && item.purchase_price > 0 && (
                        <span className="text-emerald-500/70 font-mono bg-emerald-500/10 px-1.5 rounded">
                          Margin: {((item.base_price - item.purchase_price) / item.base_price * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-neutral-300">
                    ₹{item.base_price.toFixed(2)}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <input 
                      ref={isLastItem ? qtyInputRef : null}
                      type="number"
                      min="1"
                      className="w-16 bg-neutral-900 border border-neutral-700 rounded text-center py-1 text-neutral-200 focus:outline-none focus:border-blue-500"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.product_id, parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-2 text-right font-medium text-blue-400">
                    ₹{itemTotal.toFixed(2)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button 
                      onClick={() => removeItem(item.product_id)}
                      className="text-neutral-600 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
