import { useRef, useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { Search, Trash2, Scale, Ruler, Package, X } from 'lucide-react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function CartPane() {
  const { items, updateQuantity, removeItem, currentUserRole, shopDomain, addItem } = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
            (p.item_code && p.item_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (p.sku_barcode && p.sku_barcode.includes(searchQuery))
          ).slice(0, 8);
          setResults(filtered);
          setSelectedIndex(0);
        }
      }
    };

    const timeout = setTimeout(performSearch, 150);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

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
    <div className="flex flex-col h-full w-[60%] border-r border-border bg-background">
      {/* Top Bar with Search */}
      <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-4 relative">
        <div ref={searchContainerRef} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search products or scan barcode... [F2]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-11 pr-10 py-5 bg-background shadow-sm"
          />
          
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setResults([]); searchInputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="p-2 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50">
                Found {results.length} matching products
              </div>
              <div className="max-h-80 overflow-y-auto">
                {results.map((p, i) => (
                  <button
                    key={p.product_id}
                    onClick={() => handleSelectProduct(p)}
                    className={clsx(
                      "w-full flex items-center justify-between p-3 transition-colors text-left border-b border-border/50 last:border-0",
                      i === selectedIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx("p-2 rounded-lg", i === selectedIndex ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{p.name}</div>
                        <div className={clsx("text-[10px] font-mono", i === selectedIndex ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {p.item_code ? <span className="font-bold">{p.item_code}</span> : ''} {p.sku_barcode || 'NO BARCODE'} • {p.category || 'General'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black">₹{p.base_price.toFixed(2)}</div>
                      <div className={clsx("text-[10px]", i === selectedIndex ? "text-primary-foreground/80" : "text-muted-foreground")}>
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
          <Button variant="outline" className="h-auto py-3 flex items-center gap-2">
            <Scale className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-sm">Read Scale</span>
          </Button>
        )}
        {shopDomain === 'HARDWARE' && (
          <Button variant="outline" className="h-auto py-3 flex items-center gap-2">
            <Ruler className="w-5 h-5 text-orange-400" />
            <span className="font-semibold text-sm">Custom Cut</span>
          </Button>
        )}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/10">
        <div className="col-span-5">Item</div>
        <div className="col-span-2 text-right">Price</div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-1 text-center"></div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-4xl mb-2 opacity-50">🛒</div>
            <p>Cart is empty</p>
            <p className="text-xs mt-1 opacity-70">Scan a barcode to add items</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const itemTotal = item.base_price * item.quantity;
              const isLastItem = index === items.length - 1;

              return (
                <div key={item.product_id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors">
                  <div className="col-span-5">
                    <h3 className="text-foreground font-medium">{item.name}</h3>
                    <div className="flex gap-3 text-xs mt-1">
                      <span className="text-muted-foreground">Tax: {item.tax_rate_percent}%</span>
                      {currentUserRole === 'OWNER' && item.purchase_price > 0 && (
                        <span className="text-primary font-mono bg-primary/10 px-1.5 rounded">
                          Margin: {((item.base_price - item.purchase_price) / item.base_price * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-foreground">
                    ₹{item.base_price.toFixed(2)}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Input 
                      ref={isLastItem ? qtyInputRef : null}
                      type="number"
                      min="1"
                      className="w-20 text-center h-8 px-2"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2 text-right font-medium text-primary">
                    ₹{itemTotal.toFixed(2)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button 
                      onClick={() => removeItem(item.product_id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
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
