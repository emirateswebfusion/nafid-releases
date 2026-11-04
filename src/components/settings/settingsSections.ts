import {
  Settings, Printer, Wifi, EyeOff, Palette, Store, Package, Monitor, Shield, FileText, Power, BookOpen, Layers,
  AlertOctagon, LayoutGrid, Landmark, Hash, Receipt, Wallet, Users, Tags, KeyRound, RefreshCw, ShoppingCart,
} from 'lucide-react';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';

export interface SettingsSection {
  id: string;
  label: string;
  icon: typeof Settings | typeof WhatsAppIcon;
  /** Shown under the page title. */
  description: string;
  /** Extra words the sidebar search matches (the label and description always match). */
  keywords?: string;
  ownerOnly?: boolean;
}

export interface SettingsGroup {
  category: string;
  icon: typeof Settings | typeof WhatsAppIcon;
  items: SettingsSection[];
}

/** Settings navigation: each page holds one kind of setting so owners find things in one place. */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    category: 'Shop',
    icon: Store,
    items: [
      { id: 'store', label: 'Shop Profile', icon: Store, ownerOnly: true,
        description: 'Shop name, contact details, address, store timezone and your Nafid Connect code.',
        keywords: 'name phone email website address timezone connect code' },
      { id: 'tax_bank', label: 'Tax, Bank & UPI', icon: Landmark, ownerOnly: true,
        description: 'GSTIN and state, Bill of Supply to GST conversion, and the bank and UPI details printed on bills.',
        keywords: 'gst gstin state tax bank account ifsc branch upi qr conversion profit margin inclusive exclusive' },
      { id: 'numbering', label: 'Invoice Numbering', icon: Hash, ownerOnly: true,
        description: 'Terminal code, invoice starting number, B2B / B2C series, and scrap, quotation, return and purchase bill counters.',
        keywords: 'invoice counter prefix terminal series b2b b2c scrap quotation return purchase number' },
      { id: 'filing_only', label: 'Revenue & Filing-only', icon: FileText, ownerOnly: true,
        description: 'Choose which new bills count as revenue and set up filing-only bills.',
        keywords: 'revenue filing b2b b2c exclude stock' },
    ],
  },
  {
    category: 'Billing & Sales',
    icon: ShoppingCart,
    items: [
      { id: 'billing', label: 'Billing Rules', icon: Receipt, ownerOnly: true,
        description: 'Price override display, purchase cost visibility, biller PIN, sales staff tracking and Convert to GST.',
        keywords: 'mrp override purchase cost pin biller sales staff commission convert gst staff credit' },
      { id: 'cash', label: 'Cash Drawer & Register', icon: Wallet, ownerOnly: true,
        description: 'When the cash drawer opens and closes, the default opening amount, and what cash register totals include.',
        keywords: 'cash drawer register opening balance amount auto close pending scrap returns upi card' },
      { id: 'customers', label: 'Customers & Loyalty', icon: Users, ownerOnly: true,
        description: 'Party ledger balance mode, fully paid cash sales in ledgers, and loyalty points rules.',
        keywords: 'party ledger balance gst estimate loyalty points earning redemption customer' },
      { id: 'billing_ui', label: 'Billing Page Layout', icon: LayoutGrid,
        description: 'Rearrange POS billing columns, customize theme colors, adjust touchscreen target density, and tailor layout for cashiers.',
        keywords: 'columns layout cashier touch density customizer' },
    ],
  },
  {
    category: 'Printing',
    icon: Printer,
    items: [
      { id: 'printing', label: 'Print Templates', icon: Printer, ownerOnly: true,
        description: 'Select paper formats for normal print (BOS / Estimate) and choose invoice and thermal template styles.',
        keywords: 'thermal a4 a5 format style template time format paper' },
      { id: 'print_options', label: 'Bill Content', icon: FileText, ownerOnly: true,
        description: 'Choose what appears on printed bills: field checklist, column order, terms, declarations, scrap bills and receipt font.',
        keywords: 'checklist columns terms conditions instructions declaration irn font scrap description transporter eway reverse charge quotation offers title estimate' },
      { id: 'labels', label: 'Barcode Labels', icon: Tags, ownerOnly: true,
        description: 'Default barcode or QR code type, shop name on labels, and auto-printing labels for new products.',
        keywords: 'barcode qr label sticker print' },
    ],
  },
  {
    category: 'Products & Inventory',
    icon: Package,
    items: [
      { id: 'products', label: 'Products & Inventory', icon: Package,
        description: 'Price coding, service charge, bulk import, paper stock, and default views for inventory and the stock report.',
        keywords: 'price coding service charge bulk import paper stock badge tiers inventory stock report default view' },
    ],
  },
  {
    category: 'Devices',
    icon: Monitor,
    items: [
      { id: 'hardware', label: 'Printers & Devices', icon: Monitor,
        description: 'Configure receipt printers, barcode label printers, A4 printers, weighing scales and hardware connections.',
        keywords: 'printer receipt thermal barcode a4 scale weighing usb network ip port margin' },
    ],
  },
  {
    category: 'Connections',
    icon: Wifi,
    items: [
      { id: 'network', label: 'Network & Sync', icon: Wifi, ownerOnly: true,
        description: 'Configure Cloud API sync, local Wi-Fi direct connections, and hybrid store networks.',
        keywords: 'cloud lan wifi sync hybrid master server ip pairing' },
      { id: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon,
        description: 'Connect WhatsApp, send bills automatically, and set up the shop closing report.',
        keywords: 'whatsapp qr message closing report auto send' },
    ],
  },
  {
    category: 'Security & Privacy',
    icon: Shield,
    items: [
      { id: 'account', label: 'Change Password', icon: KeyRound,
        description: 'Update your account password regularly to keep your shop secure.',
        keywords: 'password login account security' },
      { id: 'staff_masking', label: 'Staff Privacy & Data Masking', icon: EyeOff, ownerOnly: true,
        description: 'Mask aggregate stock valuations and customize sales history visibility and revenue display for staff.',
        keywords: 'staff hide mask privacy revenue' },
      { id: 'emergency_purge', label: 'Emergency Reset & Kill Switch', icon: AlertOctagon, ownerOnly: true,
        description: 'Configure on-site panic hotkeys, multi-click gestures, and remote cloud wipe signals.',
        keywords: 'panic wipe reset hotkey kill' },
    ],
  },
  {
    category: 'App & Appearance',
    icon: Palette,
    items: [
      { id: 'design', label: 'Theme & Font Size', icon: Palette,
        description: 'Brand accent colors, interface fonts, font size and touchscreen reading density.',
        keywords: 'theme color font size scale typography dark' },
      { id: 'terminology', label: 'Ledger Terminology', icon: BookOpen,
        description: 'Customise how Receivable, Payable, Received, and Paid terms are displayed across ledgers and reports.',
        keywords: 'receivable payable received paid words' },
      { id: 'dashboard_cards', label: 'Dashboard Cards Order', icon: Layers,
        description: 'Rearrange the display sequence of POS dashboard module cards according to your preferred workflow.',
        keywords: 'dashboard cards order home' },
      { id: 'system', label: "Updates & What's New", icon: RefreshCw,
        description: 'App version, software updates and the latest feature highlights.',
        keywords: 'update version download install whats new' },
    ],
  },
  {
    category: 'Features & Modules',
    icon: Power,
    items: [
      { id: 'features', label: 'Features & Modules', icon: Power, ownerOnly: true,
        description: 'Turn individual modules on or off across the app — dashboards, billing, and managers hide disabled features.',
        keywords: 'modules enable disable turn on off' },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap(g => g.items);

export function findSettingsSection(id: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find(s => s.id === id);
}

/** Whether a section matches a sidebar search: every word must appear in its label, description or keywords. */
export function sectionMatchesSearch(section: SettingsSection, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${section.label} ${section.description} ${section.keywords ?? ''}`.toLowerCase();
  return words.every(w => haystack.includes(w));
}
