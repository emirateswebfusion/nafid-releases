import { ShoppingCart, Banknote, Package, Globe, Megaphone, Bot, Tags, Layers, Landmark, BarChart3, ClipboardList, Receipt, ShieldCheck, Undo2, Archive, BookOpen, Wallet, UserCheck, UserCog, Boxes, TrendingUp, RefreshCcw } from 'lucide-react';
import { cashierPageTitle, isAiAssistantAvailable, type FeatureKey } from '../../../config/featureFlags';
import { hasPermission } from '../../../utils/permissions';
import type { FeatureFlags } from '../../../config/featureFlags';

export interface UseDashboardCardsContext {
  cardOrder: string[];
  enableScrap: boolean;
  featureFlags: FeatureFlags | null;
  permissions: string[];
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
}

export function useDashboardCards(ctx: UseDashboardCardsContext) {
  const { cardOrder, enableScrap, featureFlags, permissions, role } = ctx;
  const cards = [
    {
      id: 'billing',
      title: 'Billing',
      desc: 'Create new invoices and manage sales',
      icon: ShoppingCart,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-billing-page')),
      shortcut: 'F1',
      perm: 'sales.create'
    },
    {
      id: 'cashier',
      title: cashierPageTitle(featureFlags),
      desc: 'Settle pending bills, manage cash drawer, and day-end closing',
      icon: Banknote,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-cashier-settlement')),
      perm: 'cash_register.view'
    },
    {
      id: 'inventory',
      title: 'Inventory Manager',
      desc: 'Manage products, stock levels, and pricing',
      icon: Package,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-inventory-manager')),
      perm: 'products.view'
    },
    {
      id: 'ecommerce',
      title: 'E-Commerce Portal',
      desc: 'FusionCart online vendor portal, catalog sync & orders',
      icon: Globe,
      color: 'text-sky-500',
      bgColor: 'bg-sky-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-ecommerce-portal')),
      perm: 'products.view',
      badge: 'NEW'
    },
    {
      id: 'advertisements',
      title: 'Advertisements & Promotions',
      desc: 'Create Instagram-style promotional cards & track customer views',
      icon: Megaphone,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-ads-manager')),
      badge: 'NEW'
    },
    ...(isAiAssistantAvailable ? [{
      id: 'ai-assistant',
      title: 'AI Business Assistant',
      desc: 'Chat to analyze sales, inventory, customer credit & insights',
      icon: Bot,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-ai-assistant')),
      badge: 'NEW',
    }] : []),
    {
      id: 'grades',
      title: 'Categories & Grades',
      desc: 'Configure category classifications, grade rules, purchase price, and MRP',
      icon: Tags,
      color: 'text-fuchsia-500',
      bgColor: 'bg-fuchsia-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-grades')),
      perm: 'products.view'
    },
    {
      id: 'pricing-tiers',
      title: 'Pricing Tiers',
      desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices',
      icon: Layers,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-pricing-tiers')),
      perm: 'combos.view'
    },
    {
      id: 'financial-report',
      title: 'Financial Report',
      desc: 'View P&L statement, revenue breakdown, GST liability & profit margins',
      icon: Landmark,
      color: 'text-green-600',
      bgColor: 'bg-green-600/10',
      action: () => window.dispatchEvent(new CustomEvent('open-financial-report')),
      perm: 'reports.financial'
    },
    {
      id: 'stock-print',
      title: 'Stock Report',
      desc: 'Print A4 stock reports with PDF export',
      icon: BarChart3,
      color: 'text-teal-500',
      bgColor: 'bg-teal-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-stock-report')),
      perm: 'reports.view'
    },
    {
      id: 'quotations',
      title: 'Quotations',
      desc: 'Create and manage A4 quotations',
      icon: ClipboardList,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-quotation-manager')),
      perm: 'quotations.view'
    },
    {
      id: 'purchase-bills',
      title: 'Purchase Bills',
      desc: 'Record and manage GST purchase bills',
      icon: Receipt,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-purchase-bills')),
      perm: 'purchases.view'
    },
    {
      id: 'warranties',
      title: 'Warranty Bills',
      desc: 'Register and print warranty certificates',
      icon: ShieldCheck,
      color: 'text-lime-600',
      bgColor: 'bg-lime-600/10',
      action: () => window.dispatchEvent(new CustomEvent('open-warranty-manager')),
      perm: 'warranties.view'
    },
    {
      id: 'returns',
      title: 'Returns',
      desc: 'View returned items, manage refunds, and restore stock',
      icon: Undo2,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-returns-manager')),
      perm: 'sales.refund'
    },
    ...(enableScrap ? [{
      id: 'scrap',
      title: 'Scrap Management',
      desc: 'Track scrap purchases, sales & profit',
      icon: Archive,
      color: 'text-stone-500',
      bgColor: 'bg-stone-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-scrap-manager')),
      perm: 'scrap.view'
    }] : []),
    {
      id: 'parties',
      title: 'Ledger',
      desc: 'Track credit parties, balances, and payments',
      icon: BookOpen,
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-parties-manager')),
      perm: 'customers.view'
    },
    {
      id: 'payments',
      title: 'Payment Methods',
      desc: 'Manage bank accounts, cards & UPI ids for receiving payments',
      icon: Wallet,
      color: 'text-teal-600',
      bgColor: 'bg-teal-600/10',
      action: () => window.dispatchEvent(new CustomEvent('open-payments-page')),
      perm: 'settings.view'
    },
    {
      id: 'customers',
      title: 'Customers',
      desc: 'Browse customer list, points balances, and purchase history',
      icon: UserCheck,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-customers-page')),
      perm: 'customers.view'
    },
    {
      id: 'staff',
      title: 'Staff Administration',
      desc: 'Manage biller accounts and permissions',
      icon: UserCog,
      color: 'text-slate-500',
      bgColor: 'bg-slate-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
      perm: 'users.view'
    },
    {
      id: 'combo-offers',
      title: 'Combo Offers',
      desc: 'Create and manage product bundles and combo offers',
      icon: Boxes,
      color: 'text-violet-600',
      bgColor: 'bg-violet-600/10',
      action: () => window.dispatchEvent(new CustomEvent('open-combo-manager')),
      perm: 'combos.view'
    },
    {
      id: 'history',
      title: 'Sales History',
      desc: 'Review past transactions and reports',
      icon: TrendingUp,
      color: 'text-amber-600',
      bgColor: 'bg-amber-600/10',
      action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
      perm: 'sales.view'
    },
    {
      id: 'recycle-bin',
      title: 'Recycle Bin',
      desc: 'Recover deleted bills, inventory items & contacts',
      icon: RefreshCcw,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      action: () => window.dispatchEvent(new CustomEvent('open-recycle-bin')),
      perm: 'sales.view'
    },
  ];

  const FEATURE_BY_CARD: Record<string, FeatureKey> = {
    'ai-assistant': 'ai_assistant',
    billing: 'billing',
    cashier: 'cash_settlement',
    inventory: 'inventory',
    ecommerce: 'ecommerce',
    'combo-offers': 'combo_offers',
    grades: 'categories_grades',
    'pricing-tiers': 'pricing_tiers',
    'stock-print': 'stock_report',
    quotations: 'quotations',
    'purchase-bills': 'purchase_bills',
    warranties: 'warranties',
    returns: 'returns',
    scrap: 'scrap',
    parties: 'parties',
    payments: 'payments',
    customers: 'customers',
    staff: 'staff',
    history: 'sales_history',
    'recycle-bin': 'recycle_bin',
  };

  // Sort cards according to user's custom sequence
  const sortedCards = [...cards].sort((a, b) => {
    const indexA = cardOrder.indexOf(a.id);
    const indexB = cardOrder.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const visibleCards = sortedCards.filter(c => {
    // 1. Feature Flag check
    if (c.id === 'ai-assistant') {
      if (!isAiAssistantAvailable || (featureFlags && featureFlags.ai_assistant === false)) return false;
    } else if (featureFlags) {
      if (c.id === 'cashier' && !featureFlags.cash_settlement) return false;
      if (c.id === 'recycle-bin') {
        if (featureFlags.recycle_bin === false) return false;
      } else {
        const f = FEATURE_BY_CARD[c.id];
        if (f && !featureFlags[f]) return false;
      }
    }

    // 2. Permission check
    if (c.perm && !hasPermission({ role, permissions }, c.perm)) {
      return false;
    }

    return true;
  });

  const visibleCardIds = visibleCards.map(c => c.id);

  return { visibleCards, visibleCardIds };
}
