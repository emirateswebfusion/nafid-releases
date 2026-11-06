import {
  ShoppingCart, LayoutGrid, ShoppingBag, ChefHat,
  Banknote,
  Package,
  Globe,
  Megaphone,
  Bot,
  Tags,
  Layers,
  FileText,
  Landmark,
  BarChart3,
  ClipboardList,
  Receipt,
  ShieldCheck,
  Undo2,
  Archive,
  BookOpen,
  Wallet,
  UserCheck,
  UserCog,
  Boxes,
  TrendingUp,
  RefreshCcw,
} from 'lucide-react';
import { isUaeStore, localizeTaxText } from '../../utils/localization/storeProfile';

export interface CardMetaItem {
  id: string;
  title: string;
  desc: string;
  icon: typeof ShoppingCart;
  color: string;
  bgColor: string;
  badge?: string;
  shortcut?: string;
}

export const ALL_CARD_DEFINITIONS: Record<string, Omit<CardMetaItem, 'id'>> = {
  billing: {
    title: 'Billing',
    desc: 'Create new invoices and manage sales',
    icon: ShoppingCart,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    shortcut: 'F1',
  },
  tables: { title: 'Tables & Orders', desc: 'Seating, running orders and kitchen tickets', icon: LayoutGrid, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  'takeaway-delivery': { title: 'Takeaway & Delivery', desc: 'Takeaway tokens and delivery orders', icon: ShoppingBag, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  'kitchen-display': { title: 'Kitchen Display', desc: 'Preparing, ready and served kitchen tickets', icon: ChefHat, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  cashier: {
    title: 'Cashier Settlement',
    desc: 'Settle pending bills, manage cash drawer, and day-end closing',
    icon: Banknote,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  inventory: {
    title: 'Inventory Manager',
    desc: 'Manage products, stock levels, and pricing',
    icon: Package,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  ecommerce: {
    title: 'E-Commerce Portal',
    desc: 'FusionCart online vendor portal, catalog sync & orders',
    icon: Globe,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
  },
  advertisements: {
    title: 'Advertisements & Promotions',
    desc: 'Create Instagram-style promotional cards & track customer views',
    icon: Megaphone,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  'ai-assistant': {
    title: 'AI Business Assistant',
    desc: 'Chat to analyze sales, inventory, customer credit & insights',
    icon: Bot,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  grades: {
    title: 'Categories & Grades',
    desc: 'Configure category classifications, grade rules, purchase price, and MRP',
    icon: Tags,
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500/10',
  },
  'pricing-tiers': {
    title: 'Pricing Tiers',
    desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices',
    icon: Layers,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  'gst-reports': {
    title: isUaeStore() ? 'VAT Return & Audit' : 'GST Reports',
    desc: isUaeStore()
      ? 'FTA VAT 201 return, Input/Output tax breakdown, and FAF audit export'
      : 'GSTR-1, HSN summary, and GST return export',
    icon: FileText,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  'financial-report': {
    title: 'Financial Report',
    desc: localizeTaxText('View P&L statement, revenue breakdown, GST liability & profit margins'),
    icon: Landmark,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
  },
  'stock-print': {
    title: 'Stock Report',
    desc: 'Print A4 stock reports with PDF export',
    icon: BarChart3,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
  quotations: {
    title: 'Quotations',
    desc: 'Create and manage A4 quotations',
    icon: ClipboardList,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  'purchase-bills': {
    title: 'Purchase Bills',
    desc: localizeTaxText('Record and manage GST purchase bills'),
    icon: Receipt,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  warranties: {
    title: 'Warranty Bills',
    desc: 'Register and print warranty certificates',
    icon: ShieldCheck,
    color: 'text-lime-600',
    bgColor: 'bg-lime-600/10',
  },
  returns: {
    title: 'Returns',
    desc: 'View returned items, manage refunds, and restore stock',
    icon: Undo2,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  scrap: {
    title: 'Scrap Management',
    desc: 'Track scrap purchases, sales & profit',
    icon: Archive,
    color: 'text-stone-500',
    bgColor: 'bg-stone-500/10',
  },
  parties: {
    title: 'Ledger',
    desc: 'Track credit parties, balances, and payments',
    icon: BookOpen,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
  },
  payments: {
    title: 'Payment Methods',
    desc: 'Manage bank accounts, cards & UPI ids for receiving payments',
    icon: Wallet,
    color: 'text-teal-600',
    bgColor: 'bg-teal-600/10',
  },
  customers: {
    title: 'Customers',
    desc: 'Browse customer list, points balances, and purchase history',
    icon: UserCheck,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  staff: {
    title: 'Staff Administration',
    desc: 'Manage biller accounts and permissions',
    icon: UserCog,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
  'combo-offers': {
    title: 'Combo Offers',
    desc: 'Create and manage product bundles and combo offers',
    icon: Boxes,
    color: 'text-violet-600',
    bgColor: 'bg-violet-600/10',
  },
  history: {
    title: 'Sales History',
    desc: 'Review past transactions and reports',
    icon: TrendingUp,
    color: 'text-amber-600',
    bgColor: 'bg-amber-600/10',
  },
  'recycle-bin': {
    title: 'Recycle Bin',
    desc: 'Recover deleted bills, inventory items & contacts',
    icon: RefreshCcw,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};
