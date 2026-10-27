import { useState, useMemo, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';
import Barcode from 'react-barcode';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type BillSettings, type ReceiptData, type ReceiptItem } from '../../utils/print/receiptGenerator';
import { generateInvoiceHtml, type InvoiceData, type InvoiceItemDisplay } from '../../utils/print/invoiceHtmlGenerator';
import { useAuthStore } from '../../store/authStore';

const SAMPLE_ITEMS: ReceiptItem[] = [
  { name: 'Premium Basmati Rice', brand: 'India Gate', quantity: 2, unit_price: 125.00, total: 250.00, originalRate: 140.00, discountLabel: '₹15 off' },
  { name: 'Fresh Apples (Weight)', quantity: 0.5, unit_price: 180.00, total: 90.00, billing_type: 'WEIGHT', pieces_per_kg: 6 },
  { name: 'Organic Wheat Flour', quantity: 1, unit_price: 45.00, total: 45.00 },
  { name: 'Cold Pressed Coconut Oil', brand: 'Parachute', quantity: 3, unit_price: 85.00, total: 255.00 },
  { name: 'Honey (500g)', quantity: 1, unit_price: 120.00, total: 120.00 },
  { name: 'Green Tea (100packs)', brand: 'Tata', quantity: 2, unit_price: 95.00, total: 190.00, originalRate: 110.00, discountLabel: '10% off' },
];

const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((s, i) => s + i.total, 0);
const SAMPLE_CGST = 43.00;
const SAMPLE_SGST = 43.00;
const SAMPLE_DISCOUNT = 50.00;
const SAMPLE_GRAND_TOTAL = SAMPLE_SUBTOTAL + SAMPLE_CGST + SAMPLE_SGST - SAMPLE_DISCOUNT;

function createSampleReceiptData(
  showProductOffers = true,
  billSettings?: BillSettings,
  shopInfo?: { shopName?: string; shopAddress?: string; shopPhone?: string; shopGstin?: string; shopState?: string; bankName?: string; bankAccount?: string; bankIfsc?: string; bankBranch?: string }
): ReceiptData {
  const bs = billSettings || DEFAULT_BILL_SETTINGS;
  const resolvedShopName = (shopInfo?.shopName || useAuthStore.getState().shopName || 'My Shop').trim();
  return {
    shopName: bs.showShopName !== false ? (resolvedShopName || 'My Shop') : '',
    shopGstin: bs.showShopGstin !== false ? (shopInfo?.shopGstin || '32AAAAA1111A1Z1') : undefined,
    shopState: bs.showShopState !== false ? (shopInfo?.shopState || 'KL') : undefined,
    shopAddress: bs.showShopAddress !== false ? (shopInfo?.shopAddress || '123, Main Street, Kochi, Kerala - 682001') : undefined,
    shopPhone: bs.showPhone !== false ? (shopInfo?.shopPhone || '+91 98765 43210') : undefined,
    bankName: shopInfo?.bankName,
    bankAccount: shopInfo?.bankAccount,
    bankIfsc: shopInfo?.bankIfsc,
    bankBranch: shopInfo?.bankBranch,
    upiId: 'nafid@upi',
    showUpiQr: false,
    showProductOffers,
    invoiceNumber: 'INV-001',
    date: new Date().toLocaleDateString('en-IN'),
    billerName: bs.showBillerName !== false ? 'Admin' : undefined,
    items: SAMPLE_ITEMS,
    subtotal: SAMPLE_SUBTOTAL,
    tax: SAMPLE_CGST + SAMPLE_SGST,
    cgst: SAMPLE_CGST,
    sgst: SAMPLE_SGST,
    igst: 0,
    discount: SAMPLE_DISCOUNT,
    discountType: 'FIXED',
    discountValue: 50,
    grandTotal: SAMPLE_GRAND_TOTAL,
    oldBalance: bs.showCreditBalance !== false ? 250.00 : undefined,
    paymentMethod: 'CREDIT',
    receivedAmount: 950.00,
    balanceAmount: 250.00 + Math.max(0, SAMPLE_GRAND_TOTAL - 950.00),
    invoiceType: 'GST',
    customerName: bs.showCustomerName ? 'Cash' : undefined,
    customerPhone: bs.showCustomerPhone !== false ? '9876543210' : undefined,
    customerAddress: bs.showCustomerAddress !== false ? '123, Main Road' : undefined,
    customerGstin: bs.showCustomerGstin ? '32AAAAA1111A1Z1' : undefined,
    customerState: bs.showCustomerState !== false ? 'KL' : undefined,
    isB2B: true,
    billSettings: bs,
  };
}

function createSampleInvoiceData(
  showProductOffers = true,
  billSettings?: BillSettings,
  a5Orientation: 'horizontal' | 'vertical' = 'horizontal',
  shopInfo?: { shopName?: string; shopAddress?: string; shopPhone?: string; shopGstin?: string; shopState?: string; bankName?: string; bankAccount?: string; bankIfsc?: string; bankBranch?: string }
): InvoiceData {
  const bs = billSettings || DEFAULT_BILL_SETTINGS;
  const resolvedShopName = (shopInfo?.shopName || useAuthStore.getState().shopName || 'My Shop').trim();
  return {
    shopName: resolvedShopName || 'My Shop',
    shopGstin: shopInfo?.shopGstin || '32AAAAA1111A1Z1',
    shopState: shopInfo?.shopState || 'KL',
    shopAddress: shopInfo?.shopAddress || '123, Main Street, Kochi, Kerala - 682001',
    shopPhone: shopInfo?.shopPhone || '+91 98765 43210',
    bankName: shopInfo?.bankName,
    bankAccount: shopInfo?.bankAccount,
    bankIfsc: shopInfo?.bankIfsc,
    bankBranch: shopInfo?.bankBranch,
    upiId: 'nafid@upi',
    invoiceNumber: 'INV-001',
    date: new Date().toLocaleDateString('en-IN'),
    billerName: bs.showBillerName !== false ? 'Admin' : undefined,
    items: SAMPLE_ITEMS as InvoiceItemDisplay[],
    subtotal: SAMPLE_SUBTOTAL,
    tax: SAMPLE_CGST + SAMPLE_SGST,
    cgst: SAMPLE_CGST,
    sgst: SAMPLE_SGST,
    igst: 0,
    discount: SAMPLE_DISCOUNT,
    discountType: 'FIXED',
    discountValue: 50,
    grandTotal: SAMPLE_GRAND_TOTAL,
    oldBalance: bs.showCreditBalance !== false ? 250.00 : undefined,
    paymentMethod: 'CREDIT',
    receivedAmount: 950.00,
    balanceAmount: 250.00 + Math.max(0, SAMPLE_GRAND_TOTAL - 950.00),
    invoiceType: 'GST',
    customerName: bs.showCustomerName ? 'Rajesh Sharma' : undefined,
    customerPhone: bs.showCustomerPhone !== false ? '+91 98765 12345' : undefined,
    customerAddress: bs.showCustomerAddress !== false ? '123, Park Avenue, Kochi, Kerala' : undefined,
    customerGstin: bs.showCustomerGstin ? '32AAAAA2222A1Z1' : undefined,
    customerState: bs.showCustomerState !== false ? 'KL' : undefined,
    transporterName: bs.showTransporterDetails !== false ? 'VRL Logistics' : undefined,
    vehicleNumber: bs.showTransporterDetails !== false ? 'KA-01-EA-1234' : undefined,
    transporterDocNo: bs.showTransporterDetails !== false ? 'DOC-98765' : undefined,
    transporterDocDate: bs.showTransporterDetails !== false ? '14/9/2026' : undefined,
    ewayBillNo: bs.showTransporterDetails !== false ? '351009876543' : undefined,
    ewayBillDate: bs.showTransporterDetails !== false ? '14/9/2026' : undefined,
    showProductOffers,
    billSettings: bs,
    isB2B: Boolean(bs.showCustomerGstin && '32AAAAA2222A1Z1'),
    a5Orientation,
  };
}

const FONT_MAP: Record<string, string> = {
  courier: 'Consolas, "Courier New", monospace',
  consolas: 'Consolas, monospace',
  lucida: '"Lucida Console", monospace',
  'lucida-sans': '"Lucida Sans Typewriter", "Lucida Console", monospace',
  monospace: 'monospace',
};

type ReceiptRow =
  | { type: 'text'; value: string; lhMultiplier: number }
  | { type: 'qr'; payload: string }
  | { type: 'prominent'; value: string }
  | { type: 'barcode'; payload: string };

function parseReceiptToRows(input: string): ReceiptRow[] {
  const lines = input.split('\n');
  const rows: ReceiptRow[] = [];

  // Trim leading empty lines
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx].trim() === '') {
    startIdx++;
  }
  // Trim trailing empty lines
  let endIdx = lines.length - 1;
  while (endIdx >= startIdx && lines[endIdx].trim() === '') {
    endIdx--;
  }

  const activeLines = lines.slice(startIdx, endIdx + 1);

  activeLines.forEach((line) => {
    if (line.includes('[[QR:')) {
      const match = line.match(/\[\[QR:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'qr', payload: match[1] });
        return;
      }
    }

    if (line.includes('[[PROMINENT:')) {
      const match = line.match(/\[\[PROMINENT:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'prominent', value: match[1] });
        return;
      }
    }

    if (line.includes('[[BARCODE:')) {
      const match = line.match(/\[\[BARCODE:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'barcode', payload: match[1] });
        return;
      }
    }

    let lhMultiplier = 1.0;
    let cleanLine = line;
    if (line.startsWith('[[LH:')) {
      const match = line.match(/^\[\[LH:([^\]]+)\]\]/);
      if (match) {
        lhMultiplier = Number(match[1]) || 1.0;
        cleanLine = line.substring(match[0].length);
      }
    }

    rows.push({ type: 'text', value: cleanLine, lhMultiplier });
  });

  return rows;
}

interface PaperPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  format: 'thermal' | 'a4' | 'half-a4';
  thermalStyle: 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed';
  a4Style: 'standard' | 'boxed' | 'modern' | 'classic';
  paperWidth: number;
  showProductOffers: boolean;
  receiptFont?: string;
  billSettings?: BillSettings;
  a5Orientation?: 'horizontal' | 'vertical';
  onSelectStyle?: (style: string) => void;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopGstin?: string;
  shopState?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
}

export function PaperPreviewModal({
  isOpen,
  onClose,
  format,
  thermalStyle,
  a4Style,
  paperWidth,
  showProductOffers,
  receiptFont = 'courier',
  billSettings,
  a5Orientation = 'horizontal',
  onSelectStyle,
  shopName,
  shopAddress,
  shopPhone,
  shopGstin,
  shopState,
  bankName,
  bankAccount,
  bankIfsc,
  bankBranch,
}: PaperPreviewModalProps) {
  const [zoom, setZoom] = useState(1);

  const style = format === 'thermal' ? thermalStyle : a4Style;
  const shopInfo = useMemo(() => ({ shopName, shopAddress, shopPhone, shopGstin, shopState, bankName, bankAccount, bankIfsc, bankBranch }), [shopName, shopAddress, shopPhone, shopGstin, shopState, bankName, bankAccount, bankIfsc, bankBranch]);

  const content = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'thermal') {
      const data = createSampleReceiptData(showProductOffers, billSettings, shopInfo);
      return generateReceiptText(data, paperWidth, undefined, style);
    } else if (format === 'half-a4') {
      const data = createSampleInvoiceData(showProductOffers, billSettings, a5Orientation, shopInfo);
      return generateInvoiceHtml(data, 'half-a4');
    } else {
      const data = createSampleInvoiceData(showProductOffers, billSettings, undefined, shopInfo);
      return generateInvoiceHtml(data, style as 'standard' | 'boxed' | 'modern' | 'classic');
    }
  }, [isOpen, format, style, paperWidth, showProductOffers, billSettings, a5Orientation, shopInfo]);

  const rows = useMemo(() => {
    if (format !== 'thermal') return [];
    return parseReceiptToRows(content);
  }, [content, format]);

  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const qrPayloads = useMemo(() => {
    if (format !== 'thermal') return [];
    return Array.from(new Set(rows.filter(r => r.type === 'qr').map(r => (r as Extract<typeof r, { type: 'qr' }>).payload)));
  }, [rows, format]);

  useEffect(() => {
    if (qrPayloads.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- qrPayloads becoming empty clears stale rendered QR images immediately.
      setQrImages({});
      return;
    }

    Promise.all(
      qrPayloads.map(async (payload) => {
        const url = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
        return [payload, url] as const;
      })
    )
      .then((pairs) => {
        const map: Record<string, string> = {};
        pairs.forEach(([payload, url]) => {
          map[payload] = url;
        });
        setQrImages(map);
      })
      .catch(() => {
        setQrImages({});
      });
  }, [qrPayloads]);

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
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/70" onWheel={handleWheel}>
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
          {onSelectStyle && (
            <button
              onClick={() => { onSelectStyle(style); onClose(); }}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-all duration-200 active:scale-95 cursor-pointer shadow-lg shadow-primary/20 flex items-center gap-1.5"
              title="Select this style"
            >
              Select Style
            </button>
          )}
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
              <div
                style={{
                  margin: thermalStyle === 'boxed' ? '6px auto' : '4px auto',
                  padding: thermalStyle === 'boxed' ? '12px 8px' : '10px 8px',
                  background: '#fff',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  border: thermalStyle === 'boxed' ? '2px solid black' : 'none',
                  boxSizing: 'border-box',
                }}
              >
                {rows.map((row, index) => {
                  if (row.type === 'text') {
                    let displayValue = row.value.replace(/\r/g, '');
                    if (thermalStyle === 'boxed') {
                      const isTop = (str: string) => {
                        const s = str.trim();
                        if (s.length < 4) return false;
                        const f = s.charAt(0); const l = s.charAt(s.length - 1);
                        return (f === '┌' || f === '+' || f === '|') && (l === '┐' || l === '+' || l === '|') && (/^─+$/.test(s.substring(1, s.length - 1)) || /^-+$/.test(s.substring(1, s.length - 1)));
                      };
                      const isBottom = (str: string) => {
                        const s = str.trim();
                        if (s.length < 4) return false;
                        const f = s.charAt(0); const l = s.charAt(s.length - 1);
                        return (f === '└' || f === '+' || f === '|') && (l === '┘' || l === '+' || l === '|') && (/^─+$/.test(s.substring(1, s.length - 1)) || /^-+$/.test(s.substring(1, s.length - 1)));
                      };
                      const isDiv = (str: string) => {
                        const s = str.trim();
                        if (s.length < 4) return false;
                        const f = s.charAt(0); const l = s.charAt(s.length - 1);
                        return (f === '├' || f === '+' || f === '|' || f === '┌') && (l === '┤' || l === '+' || l === '|' || l === '┐') && (/^[─┼┬┴]+$/.test(s.substring(1, s.length - 1)) || /^[-+|]+$/.test(s.substring(1, s.length - 1)));
                      };

                      if (isTop(displayValue) && index === 0) {
                        return null;
                      }
                      if (isBottom(displayValue) && index >= rows.length - 2) {
                        return null;
                      }
                      if (isDiv(displayValue)) {
                        const hasVisibleAfter = rows.slice(index + 1).some(r => {
                          if (r.type === 'text') {
                            const val = r.value.replace(/\r/g, '');
                            if (isTop(val) || isBottom(val) || isDiv(val)) {
                              return false;
                            }
                            return val.trim().length > 0;
                          }
                          return true;
                        });
                        if (!hasVisibleAfter) {
                          return null;
                        }
                        return <hr key={`sep-${index}`} style={{ border: 'none', borderTop: '2px solid black', margin: '0 -8px', padding: 0 }} />;
                      }

                      if (displayValue.length >= 2) {
                        const f = displayValue.charAt(0);
                        const l = displayValue.charAt(displayValue.length - 1);
                        if ((f === '│' || f === '|') && (l === '│' || l === '|')) {
                          displayValue = displayValue.substring(1, displayValue.length - 1);
                        }
                      }
                    }
                    // Determine if this line is mathematically centered by checking for roughly equal leading and trailing space padding.
                    // Exclude lines containing internal column separators to protect table column alignment.
                    let isCentered = false;
                    let finalValue = displayValue;
                    const trimmed = displayValue.trim();
                    if (trimmed && !displayValue.includes('│') && !displayValue.includes('|')) {
                      const leadingSpaces = displayValue.length - displayValue.trimStart().length;
                      const trailingSpaces = displayValue.length - displayValue.trimEnd().length;
                      if (Math.abs(leadingSpaces - trailingSpaces) <= 2) {
                        isCentered = true;
                        finalValue = trimmed;
                      }
                    }

                    return (
                      <pre
                        key={`text-${index}`}
                        className="font-mono overflow-hidden select-text"
                        style={{
                          margin: '0 auto',
                          padding: 0,
                          fontSize: '12px',
                          fontFamily: FONT_MAP[receiptFont] || '"Courier New", monospace',
                          color: '#000',
                          fontWeight: 700,
                          lineHeight: thermalStyle === 'boxed' ? 0.98 * row.lhMultiplier : 1.3,
                          textAlign: isCentered ? 'center' : 'left',
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '0px',
                          whiteSpace: isCentered ? 'pre-wrap' : 'pre',
                          width: '100%',
                        }}
                      >
                        {finalValue}
                      </pre>
                    );
                  }

                  if (row.type === 'prominent') {
                    return (
                      <div key={`prominent-${index}`} style={{
                        width: '100%',
                        padding: '6px 0',
                        display: 'flex',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                        borderTop: '1px dashed black',
                        borderBottom: '1px dashed black',
                        margin: '4px 0',
                      }}>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 800,
                          fontFamily: FONT_MAP[receiptFont] || '"Courier New", monospace',
                          color: '#000',
                          textAlign: 'center',
                        }}>
                          {row.value}
                        </span>
                      </div>
                    );
                  }

                  if (row.type === 'barcode') {
                    return (
                      <div key={`bc-${index}`} style={{
                        width: '100%',
                        padding: '4px 0',
                        display: 'flex',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}>
                        <Barcode value={row.payload} format="CODE128" width={1.0} height={24} displayValue={false} margin={0} />
                      </div>
                    );
                  }

                  const qrSrc = qrImages[row.payload];
                  return qrSrc ? (
                    <div
                      key={`qr-${index}`}
                      style={{
                        width: '100%',
                        padding: '4px 0 6px',
                        textAlign: 'center',
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={qrSrc}
                        alt="UPI QR"
                        style={{
                          width: '92%',
                          maxWidth: '220px',
                          height: 'auto',
                          imageRendering: 'pixelated',
                          display: 'block',
                          margin: '0 auto',
                        }}
                      />
                    </div>
                  ) : (
                    <pre
                      key={`qr-fallback-${index}`}
                      className="font-mono whitespace-pre overflow-hidden select-text"
                      style={{
                        margin: '0 auto',
                        padding: 0,
                        fontSize: '12px',
                        fontFamily: FONT_MAP[receiptFont] || '"Courier New", monospace',
                        color: '#000',
                        fontWeight: 700,
                        lineHeight: thermalStyle === 'boxed' ? 1.05 : 1.3,
                        textAlign: 'left',
                      }}
                    >
                      [QR LOADING]
                    </pre>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="bg-white shadow-2xl overflow-hidden rounded-md border border-gray-300 transition-all duration-300"
              style={{
                width: format === 'half-a4' ? (a5Orientation === 'vertical' ? '520px' : '740px') : '820px',
                minHeight: format === 'half-a4' ? (a5Orientation === 'vertical' ? '740px' : '520px') : '1100px',
              }}
            >
              <div className="bg-gray-100 px-4 py-1.5 flex items-center justify-between border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  <span className="text-[11px] text-gray-600 font-mono font-bold ml-2 uppercase">
                    {format === 'half-a4' ? (a5Orientation === 'vertical' ? '📄 A5 PORTRAIT (148mm × 210mm)' : '📄 HALF-A4 CUT SHEET (210mm × 148.5mm)') : '📑 FULL A4 INVOICE (210mm × 297mm)'}
                  </span>
                </div>
              </div>
              <iframe
                srcDoc={content}
                title={format === 'half-a4' ? "A5 Preview" : "A4 Invoice Preview"}
                className="w-full border-0 transition-all duration-300"
                style={{
                  height: format === 'half-a4' ? (a5Orientation === 'vertical' ? '740px' : '520px') : '1100px',
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

