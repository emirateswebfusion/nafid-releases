import { useRef, useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { Search, Trash, Pencil, Scale, Ruler, Package, X } from 'lucide-react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { isAdminRole } from '../utils/permissions';


export function CartPane({ onEditProduct }: { onEditProduct?: (item: any) => void } = {}) {
  const { items, lastAddedProductId, updateQuantity, updatePiecesOverride, updateItemOfferPrice, removeItem, currentUserRole, shopDomain, addItem } = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (lastAddedProductId && itemRefs.current[lastAddedProductId]) {
      itemRefs.current[lastAddedProductId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lastAddedProductId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchResultListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchResultListRef.current && selectedIndex >= 0) {
      const container = searchResultListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      if (window.electronAPI) {
        const { tenantId } = useAuthStore.getState();
        const products = await window.electronAPI.dbGetProducts({ 
          tenant_id: tenantId, 
          search: searchQuery, 
          limit: 50 
        });
        if (Array.isArray(products)) {
          setResults(products);
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
    let piecesPerKg;
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightProduct = product.billing_type === 'WEIGHT' || weightUoms.includes((product.uom || '').toLowerCase());
    const effectiveBillingType: 'WEIGHT' | 'PIECE' = isWeightProduct ? 'WEIGHT' : 'PIECE';

    if (isWeightProduct && product.domain_attributes) {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes)
          : product.domain_attributes;
        const storedPpk = Number(da.pcs_per_kg) || 0;
        const totalPcs = Number(da.pcs) || 0;
        const stockKg = Number(product.current_stock) || 0;
        // Prefer stored ratio; fall back to pcs count even when stock is 0/negative
        piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
      } catch {
        piecesPerKg = 1;
      }
    } else if (isWeightProduct) {
      piecesPerKg = 1;
    }
    // For heavy items (1 piece > 1 Kg), default to 1 piece instead of 1 Kg
    const initialQtyForProduct = (isWeightProduct && piecesPerKg && piecesPerKg > 0 && piecesPerKg < 1)
      ? +(1 / piecesPerKg).toFixed(3)
      : undefined;
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: product.base_price,
      purchase_price: product.purchase_price ?? 0,
      tax_rate_percent: product.tax_rate_percent ?? 0,
      uom: product.uom,
      billing_type: effectiveBillingType,
      pieces_per_kg: piecesPerKg,
      grade_id: product.grade_id,
      pricing_mode: product.pricing_mode,
      grade_rate: product.grade_rate,
      quantity: initialQtyForProduct,
    });
    setSearchQuery('');
    setResults([]);
    setTimeout(() => {
      const input = qtyInputsRef.current[product.product_id];
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
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
    'F3': () => {
      if (items.length > 0) {
        const lastItemId = items[items.length - 1].product_id;
        const input = qtyInputsRef.current[lastItemId];
        if (input) {
          input.focus();
          input.select();
        }
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
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (!val.trim()) setResults([]);
            }}
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
          {searchQuery.trim().length > 0 && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-2.5 bg-muted/80 border-b border-border flex items-center justify-between text-xs font-semibold select-none">
                <span className="font-extrabold tracking-tight text-foreground uppercase text-[11px]">Matching Products</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {results.length} Found
                </span>
              </div>
              <div ref={searchResultListRef} className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-border">
                {results.map((p, i) => {
                  const basePrice = Number(p.pricing_mode === 'GRADE_RATE' ? (p.grade_rate || 0) : p.base_price) || 0;
                  let finalPrice: number | null = null;
                  if (p.offer_price != null && Number(p.offer_price) > 0) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat != null && Number(p.discount_flat) > 0) {
                    finalPrice = Math.max(0, basePrice - Number(p.discount_flat));
                  } else if (p.discount_percent != null && Number(p.discount_percent) > 0) {
                    finalPrice = Math.max(0, basePrice * (1 - Number(p.discount_percent) / 100));
                  }
                  const hasDiscount = finalPrice !== null && finalPrice < basePrice;
                  const displayPrice = hasDiscount ? finalPrice! : basePrice;

                  return (
                    <button
                      key={p.product_id}
                      data-search-index={i}
                      onClick={() => handleSelectProduct(p)}
                      className={clsx(
                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group select-none border-l-4",
                        i === selectedIndex
                          ? "bg-primary/10 border-l-primary shadow-xs font-semibold text-foreground"
                          : "hover:bg-muted/60 border-l-transparent text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <div className={clsx(
                          "p-2 rounded-xl shrink-0 transition-colors",
                          i === selectedIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-primary"
                        )}>
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{p.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.sku_barcode && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                                {p.sku_barcode}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground truncate">{p.category || 'General'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {hasDiscount ? (
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-xs text-muted-foreground/70 line-through">
                                ₹{basePrice.toFixed(2)}
                              </span>
                              <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                                ₹{displayPrice.toFixed(2)}
                              </span>
                            </div>
                            <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 rounded uppercase">
                              {p.offer_price ? 'OFFER' : 'OFF'}
                            </span>
                          </div>
                        ) : (
                          <div className="font-mono font-black text-sm text-foreground">
                            ₹{displayPrice.toFixed(2)}
                          </div>
                        )}
                        <div className="text-[10px] font-medium text-muted-foreground mt-0.5">
                          Stock: {(() => {
                            const ppk = p.domain_attributes ? (() => { try { const d = JSON.parse(typeof p.domain_attributes === 'string' ? p.domain_attributes : '{}'); const storedPpk = Number(d.pcs_per_kg) || 0; const totalPcs = Number(d.pcs) || 0; const stockKg = Number(p.current_stock) || 0; return storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 0); } catch { return 0; } })() : 0;
                            return Number(p.current_stock) > 0 && ppk > 0 ? `${Number(p.current_stock).toFixed(2)} Kg (${Math.round(Number(p.current_stock) * ppk)} pcs)` : `${p.current_stock} ${p.uom || ''}`;
                          })()}
                        </div>
                      </div>
                    </button>
                  );
                })}
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
        <div className="col-span-5 flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted-foreground w-6 shrink-0">Sl.</span>
          <span>Item</span>
        </div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">Price</div>
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
              const rawRate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0)
                ? Number(item.grade_rate)
                : Number(item.base_price || 0);
              const catalogPriceCP = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                : item.catalog_discount_flat != null ? rawRate - Number(item.catalog_discount_flat)
                : item.catalog_discount_percent != null ? rawRate * (1 - Number(item.catalog_discount_percent) / 100)
                : rawRate;
              const isAdhocOfferCP = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
              const isAdhocDiscFlatCP = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
              const isAdhocDiscPctCP = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
              const effectiveRate = isAdhocOfferCP ? Number(item.offer_price)
                : isAdhocDiscFlatCP ? Math.max(0, catalogPriceCP - Number(item.discount_flat))
                : isAdhocDiscPctCP ? Math.max(0, catalogPriceCP * (1 - Number(item.discount_percent) / 100))
                : catalogPriceCP;

              const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
              const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
              const ppk = item.pieces_per_kg || 1;
              const weightKg = Number(item.quantity) || 0;
              const pieces = item.pieces_override ?? 1;
              const itemTotal = effectiveRate * weightKg;

              const handlePcsChange = (pcsVal: number) => {
                updatePiecesOverride(item.product_id, pcsVal);
                if (item.pieces_per_kg && item.pieces_per_kg > 0 && pcsVal > 0) {
                  const newKg = +(pcsVal / item.pieces_per_kg).toFixed(3);
                  updateQuantity(item.product_id, newKg);
                }
              };

              const handleKgChange = (kgVal: number) => {
                updateQuantity(item.product_id, kgVal);
                if (item.pieces_per_kg && item.pieces_per_kg > 0 && kgVal > 0) {
                  const newPcs = Math.max(1, Math.round(kgVal * item.pieces_per_kg));
                  updatePiecesOverride(item.product_id, newPcs);
                }
              };

              const isLastAdded = item.product_id === lastAddedProductId;

              return (
                <div
                  key={item.product_id}
                  ref={el => { itemRefs.current[item.product_id] = el; }}
                  className={clsx(
                    "grid grid-cols-12 gap-4 px-6 py-4 items-center transition-all duration-200",
                    isLastAdded
                      ? "ring-2 ring-primary bg-primary/10 border-l-4 border-l-primary shadow-md scale-[1.005]"
                      : "hover:bg-muted/30"
                  )}
                >
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-muted-foreground/70 w-5 shrink-0 select-none">#{index + 1}</span>
                      <h3 className="text-foreground font-medium">{item.name}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                      {item.sku_barcode ? (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                          {item.sku_barcode}
                        </span>
                      ) : item.item_code ? (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                          Code: {item.item_code}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">No barcode</span>
                      )}
                      <span className="text-muted-foreground">Tax: {item.tax_rate_percent}%</span>
                      {item.pricing_mode === 'GRADE_RATE' && (
                        <span className="text-indigo-500 font-medium">Grade Rate: ₹{item.grade_rate}</span>
                      )}
                      {isAdminRole(currentUserRole) && item.purchase_price > 0 && (
                        <span className="text-primary font-mono bg-primary/10 px-1.5 rounded">
                          Margin: {((effectiveRate - item.purchase_price) / effectiveRate * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center flex-col items-center gap-1">
                    {isPiecesWeight ? (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase w-5">Pcs</span>
                          <Input
                             type="number" min="1" step="1"
                             className="w-14 text-center h-7 px-1 text-xs"
                             value={pieces}
                             onFocus={e => e.target.select()}
                             onBlur={e => { if (!e.target.value || Number(e.target.value) <= 0) handlePcsChange(1); }}
                             onChange={e => handlePcsChange(e.target.value === '' ? '' as any : Number(e.target.value))}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase w-5">Kg</span>
                          <Input
                            type="number" min="0" step="0.001"
                            className="w-14 text-center h-7 px-1 text-xs"
                            value={weightKg}
                            onChange={e => handleKgChange(e.target.value === '' ? 0 : Number(e.target.value))}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-6 text-right font-bold uppercase">{item.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs'}</span>
                        <Input 
                          ref={(el) => {
                            if (el) qtyInputsRef.current[item.product_id] = el;
                          }}
                          type="number"
                          min={item.billing_type === 'WEIGHT' ? '0' : '1'}
                          step={item.billing_type === 'WEIGHT' ? '0.001' : '1'}
                          className="w-16 text-center h-8 px-2"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-right text-foreground flex flex-col justify-center items-end gap-1">
                    {item.billing_type === 'WEIGHT' ? (
                      <div className="flex items-center gap-0.5 bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                        <span className="text-[9px] font-extrabold text-primary">₹</span>
                        <input
                          type="number" step="any" min="0"
                          className="w-14 text-center h-5 bg-transparent border-0 text-[11px] font-black text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={effectiveRate}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const num = parseFloat(e.target.value);
                            if (!isNaN(num) && num >= 0) updateItemOfferPrice(item.product_id, num);
                          }}
                          placeholder="Rate/Kg"
                          title="Edit rate per Kg"
                        />
                        <span className="text-[9px] font-extrabold text-primary/70">/Kg</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                        <span className="text-[9px] font-extrabold text-primary">₹</span>
                        <input
                          type="number" step="any" min="0"
                          className="w-14 text-center h-5 bg-transparent border-0 text-[11px] font-black text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={effectiveRate}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const num = parseFloat(e.target.value);
                            if (!isNaN(num) && num >= 0) updateItemOfferPrice(item.product_id, num);
                          }}
                          placeholder="Rate/Pc"
                          title="Edit rate per Piece"
                        />
                        <span className="text-[9px] font-extrabold text-primary/70">/Pc</span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-right font-medium text-primary">
                    ₹{itemTotal.toFixed(2)}
                    {rawRate * weightKg > itemTotal + 0.005 && (
                      <div className="text-[10px] text-muted-foreground/50 line-through font-semibold">
                        ₹{(rawRate * weightKg).toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-center items-center gap-1">
                    {onEditProduct && (
                      <button 
                        onClick={() => onEditProduct(item)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 cursor-pointer"
                        title="Edit Product"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => removeItem(item.product_id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
                      title="Remove Item"
                    >
                      <Trash className="w-4 h-4" />
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
