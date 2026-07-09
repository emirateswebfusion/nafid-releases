import { useState, useMemo } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type BillSettings, type ReceiptData, type ReceiptItem } from '../utils/receiptGenerator';
import { generateInvoiceHtml, type InvoiceData, type InvoiceItemDisplay } from '../utils/invoiceHtmlGenerator';

const SAMPLE_ITEMS: ReceiptItem[] = [
  { name: 'Premium Basmati Rice', quantity: 2, unit_price: 125.00, total: 250.00, originalRate: 140.00, discountLabel: '₹15 off' },
  { name: 'Organic Wheat Flour', quantity: 1, unit_price: 45.00, total: 45.00 },
  { name: 'Cold Pressed Coconut Oil', quantity: 3, unit_price: 85.00, total: 255.00 },
  { name: 'Honey (500g)', quantity: 1, unit_price: 120.00, total: 120.00 },
  { name: 'Green Tea (100packs)', quantity: 2, unit_price: 95.00, total: 190.00, originalRate: 110.00, discountLabel: '10% off' },
];

const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((s, i) => s + i.total, 0);
const SAMPLE_CGST = 43.00;
const SAMPLE_SGST = 43.00;
const SAMPLE_DISCOUNT = 50.00;
const SAMPLE_GRAND_TOTAL = SAMPLE_SUBTOTAL + SAMPLE_CGST + SAMPLE_SGST - SAMPLE_DISCOUNT;

function createSampleReceiptData(showProductOffers = true, billSettings?: BillSettings): ReceiptData {
  const bs = billSettings || DEFAULT_BILL_SETTINGS;
  return {
    shopName: bs.showShopName ? 'Vendora Mart' : '',
    shopGstin: bs.showShopGstin ? '32AAAAA1111A1Z1' : undefined,
    shopState: bs.showShopState ? 'KL' : undefined,
    shopAddress: bs.showShopAddress ? '123, Main Street, Kochi, Kerala - 682001' : undefined,
    shopPhone: bs.showPhone ? '+91 98765 43210' : undefined,
    upiId: 'vendora@upi',
    showUpiQr: false,
    showProductOffers,
    invoiceNumber: 'INV-001',
    date: new Date().toLocaleDateString('en-IN'),
    billerName: bs.showShopName ? 'Admin' : undefined,
    items: SAMPLE_ITEMS,
    subtotal: SAMPLE_SUBTOTAL,
    tax: SAMPLE_CGST + SAMPLE_SGST,
    cgst: bs.showTaxBreakup ? SAMPLE_CGST : undefined,
    sgst: bs.showTaxBreakup ? SAMPLE_SGST : undefined,
    igst: bs.showTaxBreakup ? 0 : undefined,
    discount: SAMPLE_DISCOUNT,
    discountType: 'FIXED',
    discountValue: 50,
    grandTotal: SAMPLE_GRAND_TOTAL,
    receivedAmount: 950.00,
    balanceAmount: 950.00 - SAMPLE_GRAND_TOTAL,
    invoiceType: 'GST',
    customerGstin: bs.showCustomerGstin ? '32AAAAA1111A1Z1' : undefined,
    isB2B: true,
    billSettings: bs,
  };
}

function createSampleInvoiceData(showProductOffers = true, billSettings?: BillSettings): InvoiceData {
  const bs = billSettings || DEFAULT_BILL_SETTINGS;
  return {
    shopName: bs.showShopName ? 'Vendora Mart' : '',
    shopGstin: bs.showShopGstin ? '32AAAAA1111A1Z1' : undefined,
    shopState: bs.showShopState ? 'KL' : undefined,
    shopAddress: bs.showShopAddress ? '123, Main Street, Kochi, Kerala - 682001' : undefined,
    shopPhone: bs.showPhone ? '+91 98765 43210' : undefined,
    upiId: 'vendora@upi',
    invoiceNumber: 'INV-001',
    date: new Date().toLocaleDateString('en-IN'),
    billerName: 'Admin',
    items: SAMPLE_ITEMS as InvoiceItemDisplay[],
    subtotal: SAMPLE_SUBTOTAL,
    tax: SAMPLE_CGST + SAMPLE_SGST,
    cgst: bs.showTaxBreakup ? SAMPLE_CGST : undefined,
    sgst: bs.showTaxBreakup ? SAMPLE_SGST : undefined,
    igst: bs.showTaxBreakup ? 0 : undefined,
    discount: SAMPLE_DISCOUNT,
    discountType: 'FIXED',
    discountValue: 50,
    grandTotal: SAMPLE_GRAND_TOTAL,
    receivedAmount: 950.00,
    balanceAmount: 950.00 - SAMPLE_GRAND_TOTAL,
    invoiceType: 'GST',
    customerName: 'Rajesh Sharma',
    customerPhone: '+91 98765 12345',
    customerGstin: bs.showCustomerGstin ? '32AAAAA2222A1Z1' : undefined,
    customerState: bs.showCustomerGstin ? 'KL' : undefined,
    showProductOffers,
    billSettings: bs,
    isB2B: Boolean(bs.showCustomerGstin && '32AAAAA2222A1Z1'),
  };
}

const FONT_MAP: Record<string, string> = {
  courier: '"Courier New", monospace',
  consolas: 'Consolas, monospace',
  lucida: '"Lucida Console", monospace',
  'lucida-sans': '"Lucida Sans Typewriter", "Lucida Console", monospace',
  monospace: 'monospace',
};

interface PaperPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  format: 'thermal' | 'a4';
  thermalStyle: 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe';
  a4Style: 'standard' | 'modern' | 'classic';
  paperWidth: number;
  showProductOffers: boolean;
  receiptFont?: string;
  billSettings?: BillSettings;
}

export function PaperPreviewModal({ isOpen, onClose, format, thermalStyle, a4Style, paperWidth, showProductOffers, receiptFont = 'courier', billSettings }: PaperPreviewModalProps) {
  const [zoom, setZoom] = useState(1);

  const style = format === 'thermal' ? thermalStyle : a4Style;

  const content = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'thermal') {
      const data = createSampleReceiptData(showProductOffers, billSettings);
      return generateReceiptText(data, paperWidth, undefined, style);
    } else {
      const data = createSampleInvoiceData(showProductOffers, billSettings);
      return generateInvoiceHtml(data, style as 'standard' | 'modern' | 'classic');
    }
  }, [isOpen, format, style, paperWidth, showProductOffers, billSettings]);

  if (!isOpen) return null;

  const styleLabel = style.charAt(0).toUpperCase() + style.slice(1);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.max(0.3, Math.min(3, z + delta)));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/70 backdrop-blur-sm" onWheel={handleWheel}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-foreground">
            {format === 'thermal' ? 'Thermal Receipt' : 'A4 Invoice'} — <span className="text-primary">{styleLabel}</span>
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            {format === 'thermal' ? `${paperWidth}mm` : 'A4'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground w-10 text-center font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.1))}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Reset Zoom"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-900/50">
        <div className="min-h-full flex flex-col items-center p-6">
        <div
          className="transition-transform duration-150"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          {format === 'thermal' ? (
            <div
              className="bg-white shadow-2xl rounded-sm overflow-hidden"
              style={{
                width: 'fit-content',
              }}
            >
              <div className="bg-gray-100 px-4 py-1 flex items-center gap-2 border-b border-gray-200">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-gray-400 ml-2 font-mono">thermal-receipt</span>
              </div>
              <pre
                className="font-mono whitespace-pre overflow-hidden select-text"
                style={{
                  margin: 0,
                  padding: '10px 8px',
                  fontSize: '12px',
                  fontFamily: FONT_MAP[receiptFont] || '"Courier New", monospace',
                  color: '#000',
                  fontWeight: 700,
                  lineHeight: 1.3,
                  background: '#fff',
                  minHeight: '200px',
                }}
              >
                {content || ' '}
              </pre>
            </div>
          ) : (
            <div
              className="bg-white shadow-2xl overflow-hidden"
              style={{
                width: '820px',
                minHeight: '1100px',
              }}
            >
              <div className="bg-gray-100 px-4 py-1 flex items-center gap-2 border-b border-gray-200">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-gray-400 ml-2 font-mono">a4-invoice</span>
              </div>
              <iframe
                srcDoc={content}
                title="A4 Invoice Preview"
                className="w-full border-0"
                style={{
                  height: '1100px',
                  background: '#fff',
                }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
