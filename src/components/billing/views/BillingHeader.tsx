import React from 'react';
import { isAdminRole } from '../../../utils/permissions';
import { Store, RotateCcw, TrendingUp, PauseCircle, Truck, Recycle, FileText, ArrowLeftRight, Banknote, BookOpen, Users, Package, User, Layers, Shield, Settings, X } from 'lucide-react';
import clsx from 'clsx';
import { displayInvoiceNumber } from '../../../utils/invoiceNumberHelper';
import { isHeaderButtonVisible, QUICK_PAGES_LIST } from '../../../store/billingUIStore';
import { isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { useCartStore } from '../../../store/cartStore';
import type { UserRole, InvoiceType, CartItem } from '../../../store/cartStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { Tab } from '../../../store/tabStore';
import type { FeatureFlags } from '../../../featureFlags';
import type { Invoice } from '../../../data/invoices';

export interface BillingHeaderProps {
  activeTab: Tab | undefined;
  authRole: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  clearCart: () => void;
  customerAddress: string;
  customerGstin: string;
  customerName: string;
  customerNameInputRef: React.RefObject<HTMLInputElement | null>;
  customerPhone: string;
  discountValue: number;
  editingActive: string | null;
  editingInvoiceNumber: string | null;
  enableScrap: boolean;
  enableThreeInvoiceSeries: boolean;
  featureFlags: FeatureFlags | null;
  getActiveTab: () => Tab | undefined;
  heldBills: unknown[];
  invoiceType: InvoiceType;
  isCashSettlementEnabled: boolean;
  isPastBillMode: boolean;
  isQuotationActive: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapActive: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  loadHeldBills: () => Promise<void>;
  localDiscText: string;
  loyaltyCustomerData: { customerId: string | null; pointsBalance: number; };
  nextInvoiceNumber: string;
  nextQuotationNumber: string;
  nextReturnNumber: string;
  nextScrapInvoiceNumber: string;
  pointsToRedeem: number;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveScrapInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setActiveDiscField: React.Dispatch<React.SetStateAction<"FLAT" | "PCT" | null>>;
  setCashRegisterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setIsPastBillMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setLocalDiscText: React.Dispatch<React.SetStateAction<string>>;
  setLoyaltyCustomerData: React.Dispatch<React.SetStateAction<{ customerId: string | null; pointsBalance: number; }>>;
  setPointsToRedeem: React.Dispatch<React.SetStateAction<number>>;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setReturnMode: (isReturnMode: boolean) => void;
  setRole: (role: UserRole) => void;
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Partial<Invoice> | null>>;
  setShowCustomerDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowHeldBillsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLoyaltyRedemption: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTransportModal: React.Dispatch<React.SetStateAction<boolean>>;
  shopName: string | null;
  showCashRegister: boolean;
  storeReturnDeduction: number;
  storeScrapDeduction: number;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  toggleQuotationMode: () => void;
  uiConfig: BillingUIConfig;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Billing top header: back to dashboard, shop name and the header actions (cash register, history, held bills,
 * transport, scrap / quotation / return mode toggles, quick actions, settings). Which buttons show follows `uiConfig`.
 */
export function BillingHeader({
  activeTab, authRole, clearCart, customerAddress, customerGstin, customerName, customerNameInputRef, customerPhone,
  discountValue, editingActive, editingInvoiceNumber, enableScrap, enableThreeInvoiceSeries, featureFlags,
  getActiveTab, heldBills, invoiceType, isCashSettlementEnabled, isPastBillMode, isQuotationActive, isQuotationMode,
  isReturnMode, isScrapActive, isScrapMode, items, loadHeldBills, localDiscText, loyaltyCustomerData,
  nextInvoiceNumber, nextQuotationNumber, nextReturnNumber, nextScrapInvoiceNumber, pointsToRedeem,
  reserveInvoiceNumberForTab, reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab, searchRef,
  setActiveDiscField, setCashRegisterOpen, setDiscount, setIsPastBillMode, setIsScrapMode, setLocalDiscText,
  setLoyaltyCustomerData, setPointsToRedeem, setQuotationMode, setReturnMode, setRole, setSelectedReturnInvoice,
  setShowCustomerDropdown, setShowHeldBillsPanel, setShowLoyaltyRedemption, setShowTransportModal, shopName,
  showCashRegister, storeReturnDeduction, storeScrapDeduction, syncActiveSnapshot, tenantId, toggleQuotationMode,
  uiConfig, updateActiveTab,
}: BillingHeaderProps) {
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (isAdminRole(authRole)) setRole('ADMIN');
              window.dispatchEvent(new CustomEvent('open-dashboard'));
            }}
            className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
            title="Return to Dashboard"
          >
            <Store className="w-4 h-4" />
          </button>
          <div className="min-w-0 leading-tight select-none" data-panic-click="true" data-panic-target="LOGO">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground truncate block">{shopName || 'Billing Terminal'}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={clsx(
              'text-xs font-bold font-mono px-2 py-0.5 rounded-md border shrink-0 min-w-[90px] text-center',
              isReturnMode
                ? 'text-rose-600 bg-rose-500/10 border-rose-500/20'
                : isScrapMode
                  ? 'text-orange-600 bg-orange-500/10 border-orange-500/20'
                  : isQuotationMode
                    ? 'text-blue-600 bg-blue-500/10 border-blue-500/20'
                    : 'text-primary bg-primary/10 border-primary/20'
            )}>
              {isReturnMode ? (nextReturnNumber || '') : isScrapMode ? (nextScrapInvoiceNumber || '') : isQuotationMode ? (nextQuotationNumber || '') : (editingActive ? (editingInvoiceNumber || '') : displayInvoiceNumber(nextInvoiceNumber || '', invoiceType, enableThreeInvoiceSeries))}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isHeaderButtonVisible(uiConfig, 'showClearCart') && (
          items.length > 0 ||
          Boolean(customerName?.trim()) ||
          Boolean(customerPhone?.trim()) ||
          Boolean(customerAddress?.trim()) ||
          Boolean(customerGstin?.trim()) ||
          Boolean(activeTab?.billDate) ||
          Boolean(activeTab?.customerId) ||
          Boolean(activeTab?.description?.trim()) ||
          (discountValue && Number(discountValue) > 0) ||
          Boolean(localDiscText?.trim()) ||
          (activeTab?.snapshot?.discountValue && Number(activeTab.snapshot.discountValue) > 0) ||
          Boolean(storeScrapDeduction) ||
          Boolean(storeReturnDeduction) ||
          Boolean(activeTab?.transporterName?.trim()) ||
          Boolean(activeTab?.vehicleNumber?.trim()) ||
          Boolean(activeTab?.transporterDocNo?.trim()) ||
          Boolean(activeTab?.ewayBillNo?.trim()) ||
          Boolean(activeTab?.shippingName?.trim()) ||
          Boolean(activeTab?.shippingAddress?.trim()) ||
          Boolean(activeTab?.shippingGstin?.trim()) ||
          Boolean(activeTab?.manualTotalOverride) ||
          Boolean(activeTab?.receivedAmount && Number(activeTab.receivedAmount) > 0) ||
          Boolean(editingActive) ||
          Boolean(loyaltyCustomerData?.customerId) ||
          Boolean(pointsToRedeem && pointsToRedeem > 0)
        ) && (
          <button
            onClick={async () => {
              const tab = getActiveTab();
              clearCart();
              setDiscount(0, 'FIXED');
              setActiveDiscField(null);
              setLocalDiscText('');
              setShowCustomerDropdown(false);
              setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
              setShowLoyaltyRedemption(false);
              setPointsToRedeem(0);
              let normalInvoiceNumber = '';
              if (isDesktopRuntime()) {
                try {
                  const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? 'gst_b2c' : 'normal') : undefined;
                  const result = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
                  if (result.success && result.invoiceNumber) {
                    normalInvoiceNumber = result.invoiceNumber;
                  }
                } catch (e) {
                  console.error(e);
                }
              }
              const fallbackTitle = normalInvoiceNumber || tab?.reservedScrapInvoiceNumber || '';
              updateActiveTab({ 
                customerId: '',
                customerName: '', 
                customerPhone: '', 
                customerGstin: '', 
                customerAddress: '', 
                billDate: null,
                description: '',
                transporterName: '',
                vehicleNumber: '',
                transporterDocNo: '',
                transporterDocDate: '',
                ewayBillNo: '',
                ewayBillDate: '',
                shippingName: '',
                shippingAddress: '',
                shippingGstin: '',
                manualTotalOverride: null,
                paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', 
                receivedAmount: 0, 
                reservedInvoiceNumber: normalInvoiceNumber,
                title: fallbackTitle 
              });
              syncActiveSnapshot();
              if (uiConfig.entryFocusOrder === 'customer-first') {
                customerNameInputRef.current?.focus();
              } else {
                searchRef.current?.focus();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Clear Cart"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Clear Cart</span>
          </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showHistory') && (!featureFlags || featureFlags.sales_history || isScrapMode) && (
        <button
          onClick={() => {
            if (isScrapMode) {
              window.dispatchEvent(new CustomEvent('open-scrap-manager', { detail: { initialView: 'invoices' } }));
            } else {
              window.dispatchEvent(new CustomEvent('open-sales-history'));
            }
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer"
          title="Sales History"
        >
          <TrendingUp className="w-4 h-4 text-primary" />
          <span>History</span>
        </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showHeldBills') && (
        <button
          onClick={() => {
            loadHeldBills();
            setShowHeldBillsPanel(true);
          }}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer border",
            heldBills.length > 0
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
          )}
          title="View Held Bills / Drafts"
        >
          <PauseCircle className={clsx("w-4 h-4", heldBills.length > 0 ? "text-amber-500" : "text-primary")} />
          <span>Held Bills</span>
          {heldBills.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-amber-500 text-white leading-none shadow-xs">
              {heldBills.length}
            </span>
          )}
        </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showTransport') && (
        <button
          onClick={() => setShowTransportModal(true)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer border",
            (activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo)
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
          )}
          title="Transporter & E-Way Bill Details"
        >
          <Truck className={clsx("w-4 h-4", (activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo) ? "text-emerald-500" : "text-primary")} />
          <span>Transport</span>
          {(activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo) && (
            <span className="inline-flex items-center justify-center min-w-[8px] h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showScrap') && enableScrap && (!featureFlags || featureFlags.scrap) && (
          <button
            onClick={() => {
              const next = !isScrapMode;
              setIsScrapMode(next);
              if (next && isQuotationMode) setQuotationMode(false);
              if (next && isReturnMode) setReturnMode(false);
              if (next && isPastBillMode) setIsPastBillMode(false);
              if (next) {
                reserveScrapInvoiceNumberForTab();
              } else {
                if (editingInvoiceNumber) {
                  useCartStore.getState().setEditingInvoice(null, null, null);
                  setDiscount(0, 'FIXED');
                }
                updateActiveTab({ scrapPaymentStatus: 'PENDING', reservedScrapInvoiceNumber: '' });
              }
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className={clsx(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
              isScrapActive
                ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Scrap Mode (F5)"
          >
            <Recycle className={clsx("w-4 h-4", isScrapActive && "text-orange-500")} />
            <span>Scrap</span>
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F5</span>
          </button>
        )}
        {(isHeaderButtonVisible(uiConfig, 'showQuotation') || isQuotationActive) && (!featureFlags || featureFlags.quotations) && (
        <button
            onClick={() => {
              toggleQuotationMode();
              syncActiveSnapshot();
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
          className={clsx(
            "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
            isQuotationActive
              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
          )}
          title="Quotation Mode (F6)"
        >
          <FileText className={clsx("w-4 h-4", isQuotationActive && "text-blue-500")} />
          <span>Quotation</span>
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F6</span>
        </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showReturn') && (!featureFlags || featureFlags.returns) && (
        <button
          onClick={async () => {
            const next = !isReturnMode;
            if (next) {
              await reserveReturnNumberForTab();
              setReturnMode(true);
              if (isScrapMode) setIsScrapMode(false);
              if (isQuotationMode) setQuotationMode(false);
              if (isPastBillMode) setIsPastBillMode(false);
            } else {
              updateActiveTab({
                customerName: '',
                customerPhone: '',
                customerGstin: '',
                customerAddress: '',
                customerId: '',
                receivedAmount: 0,
                actualRefundPaid: 0,
                reservedReturnNumber: '',
              });
              setReturnMode(false);
              setSelectedReturnInvoice(null);
              await reserveInvoiceNumberForTab();
            }
            syncActiveSnapshot();
            setTimeout(() => searchRef.current?.focus(), 100);
          }}
          className={clsx(
            "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
            isReturnMode
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
          )}
          title="Return Mode (F7)"
        >
          <ArrowLeftRight className={clsx("w-4 h-4", isReturnMode && "text-rose-500")} />
          <span>Return</span>
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F7</span>
        </button>
        )}
        {isHeaderButtonVisible(uiConfig, 'showRegister') && showCashRegister && (
          <button
            onClick={() => setCashRegisterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Cash Register"
          >
            <Banknote className="w-4 h-4 text-primary" />
            <span>Register</span>
          </button>
        )}
        {/* ─── QUICK PAGE SHORTCUTS (EASY ENTER TO LEDGER, CUSTOMERS, ETC.) ─── */}
        {uiConfig.showQuickActions !== false && (uiConfig.quickPageShortcuts || ['ledger']).map((pageKey) => {
          const pageDef = QUICK_PAGES_LIST.find(p => p.key === pageKey);
          if (!pageDef) return null;
          if (pageDef.featureKey && featureFlags && (featureFlags as Record<string, unknown>)[pageDef.featureKey] === false) return null;

          return (
            <button
              key={pageKey}
              onClick={() => {
                sessionStorage.setItem('last_pos_nav_source', 'header_button');
                window.dispatchEvent(new CustomEvent(pageDef.eventName));
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title={`Quick Enter: ${pageDef.label}`}
            >
              {pageKey === 'ledger' && <BookOpen className="w-4 h-4 text-emerald-500" />}
              {pageKey === 'customers' && <Users className="w-4 h-4 text-blue-500" />}
              {pageKey === 'inventory' && <Package className="w-4 h-4 text-amber-500" />}
              {pageKey === 'purchase_bills' && <FileText className="w-4 h-4 text-purple-500" />}
              {pageKey === 'financial_report' && <TrendingUp className="w-4 h-4 text-cyan-500" />}
              {pageKey === 'stock_report' && <Package className="w-4 h-4 text-teal-500" />}
              {pageKey === 'staff' && <User className="w-4 h-4 text-indigo-500" />}
              {pageKey === 'combo_offers' && <Layers className="w-4 h-4 text-rose-500" />}
              {pageKey === 'warranties' && <Shield className="w-4 h-4 text-green-500" />}
              <span>{pageDef.label.split(' ')[0]}</span>
            </button>
          );
        })}
        <button
          onClick={() => {
            sessionStorage.setItem('last_pos_nav_source', 'header_button');
            window.dispatchEvent(new CustomEvent('open-settings-manager'));
          }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <span className="w-px h-5 bg-border/40" />
        <button
          onClick={() => {
            sessionStorage.setItem('last_pos_nav_source', 'page_exit');
            if (isAdminRole(authRole)) setRole('ADMIN');
            window.dispatchEvent(new CustomEvent('open-dashboard'));
          }}
          className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
          title="Dashboard"
        >
          <X className="w-4 h-4 text-destructive" />
        </button>
      </div>
      </div>
    </header>
  );
}
