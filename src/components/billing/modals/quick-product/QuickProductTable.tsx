import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  type QuickProductColumnId,
  type QuickProductRow,
  type QuickProductItemInput,
  ALL_QUICK_COLUMNS,
  DEFAULT_QUICK_COLUMNS,
  STORAGE_KEY_QUICK_COLUMNS,
} from './types';
import { QuickProductColumnsModal } from './QuickProductColumnsModal';
import { parseAmount } from '../../../../utils/pricing/money';
import {
  Plus, Trash2, SlidersHorizontal, Save, Clock,
  AlertCircle, Loader2
} from 'lucide-react';
import clsx from 'clsx';

export interface QuickProductTableProps {
  initialProductName?: string;
  invoiceType: string;
  configuredCategories: string[];
  onSubmit: (items: QuickProductItemInput[], asTemp?: boolean) => Promise<void>;
  onClose: () => void;
  onSwitchToGrid: () => void;
}

const createBlankRow = (id: string, name = ''): QuickProductRow => ({
  id,
  name,
  basePrice: '',
  qty: '1',
  purchasePrice: '',
  category: '',
  itemCode: '',
  barcode: '',
  uom: 'Pcs',
  taxRate: 0,
});

const isCaretAtStart = (input: HTMLInputElement | HTMLSelectElement): boolean => {
  if (input.tagName === 'SELECT') return true;
  const el = input as HTMLInputElement;
  try {
    return el.selectionStart === 0 || el.selectionStart === null;
  } catch {
    // For type="number" or unsupported types, Chromium throws InvalidStateError.
    return true;
  }
};

const isCaretAtEnd = (input: HTMLInputElement | HTMLSelectElement): boolean => {
  if (input.tagName === 'SELECT') return true;
  const el = input as HTMLInputElement;
  try {
    return el.selectionEnd === (el.value?.length ?? 0) || el.selectionEnd === null;
  } catch {
    // For type="number" or unsupported types, Chromium throws InvalidStateError.
    return true;
  }
};

export const QuickProductTable: React.FC<QuickProductTableProps> = ({
  initialProductName = '',
  invoiceType: _invoiceType,
  configuredCategories: _configuredCategories,
  onSubmit,
  onClose,
  onSwitchToGrid,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load visible columns from localStorage
  const [visibleColumns, setVisibleColumns] = useState<QuickProductColumnId[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_QUICK_COLUMNS);
      if (stored) {
        const parsed = JSON.parse(stored) as QuickProductColumnId[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.includes('name')) parsed.unshift('name');
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_QUICK_COLUMNS;
  });

  const saveVisibleColumns = (cols: QuickProductColumnId[]) => {
    const safeCols: QuickProductColumnId[] = cols.includes('name') ? cols : (['name', ...cols] as QuickProductColumnId[]);
    setVisibleColumns(safeCols);
    try {
      localStorage.setItem(STORAGE_KEY_QUICK_COLUMNS, JSON.stringify(safeCols));
    } catch {
      // ignore
    }
  };

  const toggleColumn = (colId: QuickProductColumnId) => {
    if (colId === 'name') return; // Name is always required
    if (visibleColumns.includes(colId)) {
      saveVisibleColumns(visibleColumns.filter(c => c !== colId));
    } else {
      saveVisibleColumns([...visibleColumns, colId]);
    }
  };

  // Rows state
  const [rows, setRows] = useState<QuickProductRow[]>(() => {
    const trimmed = initialProductName.trim();
    if (trimmed) {
      return [createBlankRow('row-1', trimmed), createBlankRow('row-2', '')];
    }
    return [createBlankRow('row-1', ''), createBlankRow('row-2', ''), createBlankRow('row-3', '')];
  });

  // Focus a specific cell in table
  const focusCell = useCallback((rowIdx: number, colIdx: number) => {
    const el = containerRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-quick-row="${rowIdx}"][data-quick-col="${colIdx}"]`
    );
    if (el) {
      el.focus();
      if ('select' in el && typeof el.select === 'function') {
        el.select();
      }
    }
  }, []);

  // Initial focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = initialProductName.trim();
      if (trimmed && visibleColumns.includes('basePrice')) {
        const rateColIdx = visibleColumns.indexOf('basePrice');
        focusCell(0, rateColIdx !== -1 ? rateColIdx : 0);
      } else {
        focusCell(0, 0);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [initialProductName, visibleColumns, focusCell]);

  // Ensure there is always a blank row at the bottom when user types into the last row
  const updateRowField = (rowIdx: number, field: keyof QuickProductRow, value: string | number) => {
    setRows(prevRows => {
      const next = prevRows.map((r, i) => (i === rowIdx ? { ...r, [field]: value } : r));
      // If typing in the last row and it's not empty, auto-append a new row
      if (rowIdx === next.length - 1) {
        const lastRow = next[rowIdx];
        const hasContent = Boolean(
          lastRow.name.trim() ||
          lastRow.basePrice ||
          lastRow.purchasePrice ||
          lastRow.itemCode ||
          lastRow.barcode
        );
        if (hasContent) {
          next.push(createBlankRow(uuidv4(), ''));
        }
      }
      return next;
    });
  };

  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) {
      setRows([createBlankRow(uuidv4(), '')]);
      setTimeout(() => focusCell(0, 0), 0);
      return;
    }
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
    const targetRow = Math.max(0, rowIdx - 1);
    setTimeout(() => focusCell(targetRow, 0), 0);
  };

  const appendNewRow = () => {
    const newIdx = rows.length;
    setRows(prev => [...prev, createBlankRow(uuidv4(), '')]);
    setTimeout(() => focusCell(newIdx, 0), 0);
  };

  // Submit all valid rows
  const handleSave = async (asTemp = false) => {
    if (isSubmitting) return;
    setErrorMessage(null);

    // Filter valid rows: name must be filled
    const validRows = rows.filter(r => r.name.trim() !== '');
    if (validRows.length === 0) {
      setErrorMessage('Please enter at least one product with a name.');
      focusCell(0, 0);
      return;
    }

    setIsSubmitting(true);
    try {
      const items: QuickProductItemInput[] = validRows.map(r => {
        const qtyNum = parseFloat(r.qty);
        const rateNum = parseAmount(r.basePrice);
        const costNum = parseAmount(r.purchasePrice);
        return {
          name: r.name.trim(),
          basePrice: rateNum ?? 0,
          qty: isNaN(qtyNum) || qtyNum <= 0 ? 1 : qtyNum,
          purchasePrice: costNum ?? undefined,
          category: r.category?.trim() || undefined,
          itemCode: r.itemCode?.trim() || undefined,
          barcode: r.barcode?.trim() || undefined,
          uom: r.uom || 'Pcs',
          taxRate: r.taxRate || 0,
        };
      });

      await onSubmit(items, asTemp);
    } catch (err) {
      setErrorMessage((err as Error)?.message || 'Failed to add products');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Global & Cell Keyboard Handler
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    // 1. Submit Shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave(false);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      handleSave(true);
      return;
    }
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      handleSave(true);
      return;
    }
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      handleSave(false);
      return;
    }

    // 2. Auxiliary Shortcuts
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      setShowColumnsModal(prev => !prev);
      return;
    }
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      onSwitchToGrid();
      return;
    }
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      appendNewRow();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    // 3. Enter Navigation:
    // "workflow: space -> add new product window -> name (focus cursor) -> enter -> rate -> enter qty"
    // "if click enter without value then move next ex: 1st line click enter in qty (with or without value) then move to 2nd line"
    if (e.key === 'Enter') {
      e.preventDefault();
      if (colIdx < visibleColumns.length - 1) {
        // Move to next column in current row
        focusCell(rowIdx, colIdx + 1);
      } else {
        // Last visible column in row (e.g. rate or qty)!
        // Move to next line (column 0 of rowIdx + 1)
        if (rowIdx + 1 < rows.length) {
          focusCell(rowIdx + 1, 0);
        } else {
          // At the last row: append a new row and focus it!
          const newIdx = rows.length;
          setRows(prev => [...prev, createBlankRow(uuidv4(), '')]);
          setTimeout(() => focusCell(newIdx, 0), 0);
        }
      }
      return;
    }

    // 4. Arrow Navigation:
    // "also back arrow for back , front arrow for front"
    if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (isCaretAtEnd(input)) {
        if (colIdx < visibleColumns.length - 1) {
          e.preventDefault();
          focusCell(rowIdx, colIdx + 1);
        } else if (rowIdx < rows.length - 1) {
          e.preventDefault();
          focusCell(rowIdx + 1, 0);
        }
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (isCaretAtStart(input)) {
        if (colIdx > 0) {
          e.preventDefault();
          focusCell(rowIdx, colIdx - 1);
        } else if (rowIdx > 0) {
          e.preventDefault();
          focusCell(rowIdx - 1, visibleColumns.length - 1);
        }
      }
      return;
    }

    // 5. Tab Navigation
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) {
          focusCell(rowIdx, colIdx - 1);
        } else if (rowIdx > 0) {
          focusCell(rowIdx - 1, visibleColumns.length - 1);
        }
      } else {
        if (colIdx < visibleColumns.length - 1) {
          focusCell(rowIdx, colIdx + 1);
        } else if (rowIdx < rows.length - 1) {
          focusCell(rowIdx + 1, 0);
        } else {
          appendNewRow();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (rowIdx < rows.length - 1) {
        e.preventDefault();
        focusCell(rowIdx + 1, colIdx);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (rowIdx > 0) {
        e.preventDefault();
        focusCell(rowIdx - 1, colIdx);
      }
      return;
    }
  };

  const validRowCount = rows.filter(r => r.name.trim() !== '').length;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full max-h-[82vh] bg-card text-foreground select-none"
    >
      {/* Top action / info bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg text-primary text-xs font-bold">
            <span>Fast Multi-Product Entry</span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Press <kbd className="px-1.5 py-0.5 text-[10px] bg-background border border-border rounded font-mono font-bold text-foreground">Enter</kbd> to jump fields & rows continuously.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColumnsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-background hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs hover:border-border"
            title="Configure visible fields (Alt+C)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            <span>Fields</span>
            <span className="px-1 text-[10px] rounded bg-muted text-muted-foreground font-mono">
              {visibleColumns.length}
            </span>
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-destructive hover:underline cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Spreadsheet Table Container */}
      <div className="flex-1 overflow-x-auto overflow-y-auto px-6 py-4">
        <table className="w-full border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <th className="w-8 text-center px-1">#</th>
              {visibleColumns.map(colId => {
                const def = ALL_QUICK_COLUMNS.find(c => c.id === colId);
                if (!def) return null;
                return (
                  <th key={colId} className={clsx('px-2 py-1', def.minWidth)}>
                    <div className="flex items-center gap-1">
                      <span>{def.label}</span>
                      {def.required && <span className="text-destructive">*</span>}
                    </div>
                  </th>
                );
              })}
              <th className="w-10 text-center px-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const isLastRow = rowIdx === rows.length - 1;
              const hasName = Boolean(row.name.trim());

              return (
                <tr
                  key={row.id}
                  className={clsx(
                    'group transition-colors rounded-xl',
                    hasName ? 'bg-background hover:bg-muted/15' : 'bg-muted/10 hover:bg-muted/20'
                  )}
                >
                  {/* Row number */}
                  <td className="w-8 text-center text-xs font-mono text-muted-foreground/60 group-hover:text-foreground">
                    {rowIdx + 1}
                  </td>

                  {/* Dynamic Visible Columns */}
                  {visibleColumns.map((colId, colIdx) => {
                    const def = ALL_QUICK_COLUMNS.find(c => c.id === colId);
                    if (!def) return null;

                    return (
                      <td key={colId} className="px-1.5 py-1">
                        <div className="relative flex items-center">
                          {def.prefix && (
                            <span className="absolute left-2.5 text-xs font-bold text-muted-foreground pointer-events-none select-none">
                              {def.prefix}
                            </span>
                          )}

                          {def.type === 'select' ? (
                            <select
                              data-quick-row={rowIdx}
                              data-quick-col={colIdx}
                              value={colId === 'taxRate' ? row.taxRate : row.uom}
                              onChange={e => {
                                const val = colId === 'taxRate' ? parseFloat(e.target.value) : e.target.value;
                                updateRowField(rowIdx, colId, val);
                              }}
                              onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                              className="w-full bg-background border border-border/80 rounded-xl px-2.5 py-2 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden transition-all shadow-2xs font-medium cursor-pointer"
                            >
                              {def.options?.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={def.type}
                              step={def.type === 'number' ? 'any' : undefined}
                              inputMode={def.prefix ? 'decimal' : undefined}
                              data-quick-row={rowIdx}
                              data-quick-col={colIdx}
                              placeholder={
                                def.id === 'name'
                                  ? (isLastRow && !hasName ? '+ Type product name...' : 'Item name')
                                  : def.id === 'basePrice'
                                  ? '0.00'
                                  : def.id === 'qty'
                                  ? '1'
                                  : def.shortLabel
                              }
                              value={
                                def.id === 'name'
                                  ? row.name
                                  : def.id === 'basePrice'
                                  ? row.basePrice
                                  : def.id === 'qty'
                                  ? row.qty
                                  : def.id === 'purchasePrice'
                                  ? row.purchasePrice
                                  : def.id === 'category'
                                  ? row.category
                                  : def.id === 'itemCode'
                                  ? row.itemCode
                                  : def.id === 'barcode'
                                  ? row.barcode
                                  : ''
                              }
                              onChange={e => {
                                const val = def.id === 'itemCode' ? e.target.value.toUpperCase() : e.target.value;
                                updateRowField(rowIdx, def.id, val);
                              }}
                              onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                              onWheel={e => {
                                if (def.type === 'number') (e.target as HTMLInputElement).blur();
                              }}
                              className={clsx(
                                'w-full bg-background border border-border/80 rounded-xl px-2.5 py-2 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden transition-all shadow-2xs',
                                def.prefix && 'pl-6',
                                def.id === 'name' && 'font-semibold',
                                def.id === 'basePrice' && 'font-bold text-emerald-600 dark:text-emerald-400',
                                (def.id === 'itemCode' || def.id === 'barcode') && 'font-mono text-xs tracking-wider uppercase'
                              )}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {/* Remove row button */}
                  <td className="w-10 text-center px-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => removeRow(rowIdx)}
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Add row helper at bottom of table */}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={appendNewRow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border hover:border-primary/50 text-xs font-semibold text-muted-foreground hover:text-primary transition-all cursor-pointer bg-background/50 hover:bg-primary/5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
            <kbd className="text-[10px] bg-muted px-1 rounded text-muted-foreground font-mono">Alt+N</kbd>
          </button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {validRowCount}
            </span>
            <span>{validRowCount === 1 ? 'product ready' : 'products ready'}</span>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="px-6 py-2 bg-muted/10 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">Enter</kbd>
            <span>Next cell / Next line</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">← / →</kbd>
            <span>Prev / Next field</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">↑ / ↓</kbd>
            <span>Move lines</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">Alt+C</kbd>
            <span>Fields</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-6 py-3.5 border-t border-border bg-background">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer"
        >
          Cancel <span className="font-mono text-[10px] ml-1">(Esc)</span>
        </button>

        <div className="flex items-center gap-2.5">
          {/* Save as Temp */}
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSubmitting || validRowCount === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-500/10 hover:bg-violet-500/20 active:scale-95 disabled:opacity-40 text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
            title="Save as temporary bill line without saving to inventory (Ctrl+T)"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            <span>Save as Temp</span>
            <kbd className="px-1.5 py-0.5 bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded text-[10px] font-mono ml-0.5">
              Ctrl+T
            </kbd>
          </button>

          {/* Add to Inventory */}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isSubmitting || validRowCount === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary/90 active:scale-95 disabled:opacity-40 text-primary-foreground rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer"
            title="Add all valid products to inventory and billing cart (Ctrl+Enter)"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Add to Inventory</span>
            <kbd className="px-1.5 py-0.5 bg-primary-foreground/20 text-primary-foreground rounded text-[10px] font-mono ml-0.5">
              Ctrl+Enter
            </kbd>
          </button>
        </div>
      </div>

      {/* Columns configuration modal */}
      <QuickProductColumnsModal
        isOpen={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onSetColumns={saveVisibleColumns}
      />
    </div>
  );
};
