import { useEffect, useState, type ReactNode } from 'react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { authApi } from '../data/auth';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { printingApi } from '../data/printing';
import type { BulkPrintItem } from '../data/printing';
import { settingsApi } from '../data/settings';

const PX_PER_MM = 96 / 25.4;

// CODE128 total module count for a given value (start + data + checksum + stop + quiet zones)
function code128Modules(value: string): number {
  return 11 * value.length + 55;
}

export function PrintBulkBarcodeView({ codeType = DEFAULT_CODE_TYPE }: { codeType?: CodeType }) {
  const authShopName = useAuthStore((state: { shopName: string | null }) => state.shopName);
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopNameReady, setShopNameReady] = useState(false);
  const [showShopName, setShowShopName] = useState(true);
  const [showShopNameReady, setShowShopNameReady] = useState(false);
  const [items, setItems] = useState<BulkPrintItem[]>([]);
  const [columns, setColumns] = useState(1);
  const [labelWidthPx, setLabelWidthPx] = useState(189);
  const [labelHeightPx, setLabelHeightPx] = useState(94);
  const [loaded, setLoaded] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  // Load shop name & label show shop name setting from persisted auth config & settings DB
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let name = authShopName || null;
      let tid = useAuthStore.getState().tenantId;
      if (isDesktopRuntime() && hasBridge('authGetToken')) {
        try {
          const stored = await authApi.getToken();
          if (stored) {
            if (stored.shop_name) name = stored.shop_name;
            if (stored.tenant_id) tid = stored.tenant_id;
          }
        } catch {
          // fall back to store value
        }
      }
      if (!cancelled) {
        setShopName(name);
        setShopNameReady(true);
      }

      if (isDesktopRuntime() && hasBridge('settingsGet')) {
        try {
          let v = await settingsApi.get({ tenant_id: tid || 'global', key: 'label_show_shop_name' });
          if ((v === null || v === undefined) && tid && tid !== 'global') {
            v = await settingsApi.get({ tenant_id: 'global', key: 'label_show_shop_name' });
          }
          if (v !== null && v !== undefined) {
            setShowShopName(Boolean(v));
          }
        } catch {
          // fallback keeps default
        }
      }
      if (!cancelled) {
        setShowShopNameReady(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authShopName]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const cols = parseInt(params.get('columns') || '1', 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location.hash supplies the one-time print layout after the route mounts.
    setColumns(cols || 1);
    const wMm = parseInt(params.get('labelWidthMm') || '50', 10) || 50;
    const hMm = parseInt(params.get('labelHeightMm') || '25', 10) || 25;
    setLabelWidthPx(Math.round(wMm * PX_PER_MM));
    setLabelHeightPx(Math.round(hMm * PX_PER_MM));

    if (isDesktopRuntime() && hasBridge('getBulkPrintItems')) {
      printingApi.getBulkPrintItems().then((data) => {
        setItems(data || []);
        setLoaded(true);
      });
    } else {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (codeType === 'qrcode' && items.length > 0) {
      Promise.all(
        items.map(item =>
          QRCode.toDataURL(item.barcode, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
            .then(url => ({ barcode: item.barcode, url }))
            .catch(() => ({ barcode: item.barcode, url: '' }))
        )
      ).then(results => {
        const map: Record<string, string> = {};
        results.forEach(r => { map[r.barcode] = r.url; });
        setQrDataUrls(map);
      });
    }
  }, [codeType, items]);

  const qrReady = items.length === 0 || items.every(item => qrDataUrls[item.barcode] !== undefined);
  const readyToPrint = loaded && shopNameReady && showShopNameReady && (codeType !== 'qrcode' || qrReady);

  useEffect(() => {
    if (!readyToPrint) return;
    const timer = setTimeout(() => {
      if (isDesktopRuntime() && hasBridge('printReady')) {
        printingApi.printReady();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [readyToPrint, items, columns, codeType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDesktopRuntime() && hasBridge('printReady')) {
        printingApi.printReady();
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const formatPrice = (p: number) => {
    return p % 1 === 0 ? p.toString() : p.toFixed(2);
  };

  if (!loaded) return <div style={{ padding: '20px' }}>Loading print data...</div>;

  const colCount = Math.max(1, columns || 1);
  const labelContentWidthPx = Math.max(60, Math.floor(labelWidthPx / colCount) - 16);

  const pages: ReactNode[] = [];

  const flatItems: BulkPrintItem[] = [];
  items.forEach(item => {
    for (let i = 0; i < (item.quantity || 1); i++) {
      flatItems.push(item);
    }
  });

  let currentIndex = 0;

  while (currentIndex < flatItems.length) {
    const pageLabels = Array.from({ length: colCount }, (_, colIndex) => {
      const hasLabel = currentIndex + colIndex < flatItems.length;
      const item = hasLabel ? flatItems[currentIndex + colIndex] as BulkPrintItem & { sp?: number; spType?: string } : null;
      const barcodeModuleWidth = item
        ? Math.min(1.6, Math.max(0.4, labelContentWidthPx / code128Modules(String(item.barcode || ''))))
        : 1;

      return (
        <div key={colIndex} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px 3px', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && item && (
            <>
              {showShopName && shopName && (
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', fontWeight: 800, lineHeight: 1.1, letterSpacing: '0.12em', color: '#000', textTransform: 'uppercase', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', padding: '0 2px', boxSizing: 'border-box', marginBottom: '1px' }}>
                  {shopName}
                </div>
              )}
              {item.price !== undefined && !isNaN(item.price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '1px', padding: '0 3px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', fontWeight: 700, lineHeight: 1.1, color: '#000', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: item.sp !== undefined && !isNaN(item.sp) ? 600 : 800 }}>MRP ₹{formatPrice(item.price)}</span>
                    {item.sp !== undefined && !isNaN(item.sp) && (
                      <span style={{ marginLeft: '1.5ch', fontWeight: 800 }}>{item.spType || 'SP'} ₹{formatPrice(item.sp)}</span>
                    )}
                  </div>
                </div>
              )}
              {codeType === 'qrcode' ? (
                qrDataUrls[item.barcode] ? (
                  <img src={qrDataUrls[item.barcode]} alt="QR Code" style={{ width: '64px', height: '64px', imageRendering: 'pixelated' }} />
                ) : (
                  <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#999' }}>Loading...</div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                  <Barcode value={item.barcode} format="CODE128" width={barcodeModuleWidth} height={26} displayValue={false} margin={0} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '1px', padding: '0 3px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontFamily: 'Courier New, Courier, monospace', fontSize: '11px', fontWeight: 700, lineHeight: 1.1, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', width: '100%', textAlign: 'center', letterSpacing: '0.05em' }}>
                  {item.barcode}
                </div>
                {item.name && (
                  <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', fontWeight: 700, lineHeight: 1.25, color: '#000', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', marginTop: '2px' }}>
                    {item.name}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    });

    pages.push(
      <div key={currentIndex} style={{ width: labelWidthPx, height: labelHeightPx, display: 'flex', flexDirection: 'row', backgroundColor: 'white', margin: 0, padding: 0, boxSizing: 'border-box', pageBreakAfter: 'always' }}>
        {pageLabels}
      </div>
    );

    currentIndex += colCount;
  }

  return (
    <div style={{ width: labelWidthPx, minHeight: labelHeightPx, backgroundColor: 'white' }}>
      {pages}
    </div>
  );
}
