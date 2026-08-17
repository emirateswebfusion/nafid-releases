import { useEffect, useState } from 'react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';

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
  const [items, setItems] = useState<any[]>([]);
  const [columns, setColumns] = useState(1);
  const [labelWidthPx, setLabelWidthPx] = useState(189);
  const [labelHeightPx, setLabelHeightPx] = useState(94);
  const [loaded, setLoaded] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  // Load the shop name from the persisted auth config so the label always
  // prints it, even if the app's async checkAuth hasn't resolved yet.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let name = authShopName || null;
      if (window.electronAPI && window.electronAPI.authGetToken) {
        try {
          const stored = await window.electronAPI.authGetToken();
          if (stored && stored.shop_name) name = stored.shop_name;
        } catch {
          // fall back to the store value
        }
      }
      if (!cancelled) {
        setShopName(name);
        setShopNameReady(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authShopName]);

  useEffect(() => {
    const { tenantId } = useAuthStore.getState();
    if (window.electronAPI && window.electronAPI.settingsGet) {
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'label_show_shop_name' }).then((v: unknown) => {
        if (v !== null && v !== undefined) setShowShopName(Boolean(v));
      });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const cols = parseInt(params.get('columns') || '1', 10);
    setColumns(cols || 1);
    const wMm = parseInt(params.get('labelWidthMm') || '50', 10) || 50;
    const hMm = parseInt(params.get('labelHeightMm') || '25', 10) || 25;
    setLabelWidthPx(Math.round(wMm * PX_PER_MM));
    setLabelHeightPx(Math.round(hMm * PX_PER_MM));

    if (window.electronAPI && window.electronAPI.getBulkPrintItems) {
      window.electronAPI.getBulkPrintItems().then((data) => {
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
  const readyToPrint = loaded && shopNameReady && (codeType !== 'qrcode' || qrReady);

  useEffect(() => {
    if (!readyToPrint) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [readyToPrint, items, columns, codeType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
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

  const pages: any[] = [];

  const flatItems: any[] = [];
  items.forEach(item => {
    for (let i = 0; i < (item.quantity || 1); i++) {
      flatItems.push(item);
    }
  });

  let currentIndex = 0;

  while (currentIndex < flatItems.length) {
    const pageLabels = Array.from({ length: colCount }, (_, colIndex) => {
      const hasLabel = currentIndex + colIndex < flatItems.length;
      const item = hasLabel ? flatItems[currentIndex + colIndex] : null;
      const barcodeModuleWidth = item
        ? Math.min(1.6, Math.max(0.4, labelContentWidthPx / code128Modules(String(item.barcode || ''))))
        : 1;

      return (
        <div key={colIndex} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '3px 4px 0 4px', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && item && (
            <>
              {showShopName && shopName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1.15, color: 'black', textTransform: 'uppercase', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', padding: '0 2px', boxSizing: 'border-box', marginBottom: '2px' }}>
                  {shopName}
                </div>
              )}
              {item.price !== undefined && !isNaN(item.price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '2px', padding: '0 4px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', lineHeight: 1.1, color: 'black', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: item.sp !== undefined && !isNaN(item.sp) ? 'normal' : 'bold' }}>MRP ₹{formatPrice(item.price)}</span>
                    {item.sp !== undefined && !isNaN(item.sp) && (
                      <span style={{ marginLeft: '2ch', fontWeight: 'bold' }}>{item.spType || 'SP'} ₹{formatPrice(item.sp)}</span>
                    )}
                  </div>
                </div>
              )}
              {codeType === 'qrcode' ? (
                qrDataUrls[item.barcode] ? (
                  <img src={qrDataUrls[item.barcode]} alt="QR Code" style={{ width: '70px', height: '70px', imageRendering: 'pixelated' }} />
                ) : (
                  <div style={{ width: '70px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>Loading...</div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                  <Barcode value={item.barcode} format="CODE128" width={barcodeModuleWidth} height={30} displayValue={false} margin={0} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '3px', padding: '0 4px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontSize: '11px', lineHeight: 1.1, fontFamily: 'monospace', fontWeight: 600, color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', width: '100%', textAlign: 'center' }}>
                  {item.barcode}
                </div>
                {item.name && (
                  <div style={{ fontSize: '10px', lineHeight: 1.2, color: 'black', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', marginTop: '1px' }}>
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
