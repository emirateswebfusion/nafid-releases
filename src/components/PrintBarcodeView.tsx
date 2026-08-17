import { useEffect, useState } from 'react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { useAuthStore } from '../store/authStore';

const PX_PER_MM = 96 / 25.4;

function getUrlParams(): URLSearchParams {
  try {
    return new URLSearchParams((window.location.hash.split('?')[1] || '').toString());
  } catch {
    return new URLSearchParams();
  }
}

// CODE128 total module count for a given value (start + data + checksum + stop + quiet zones)
function code128Modules(value: string): number {
  return 11 * value.length + 55;
}

export function PrintBarcodeView({ barcode, price, sp, spType = 'SP', name, quantity = 1, columns = 1, codeType = DEFAULT_CODE_TYPE }: { barcode: string; price?: number; sp?: number; spType?: 'SP' | 'OFF'; name?: string; quantity?: number; columns?: number; codeType?: CodeType }) {
  const authShopName = useAuthStore((state: { shopName: string | null }) => state.shopName);
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopNameReady, setShopNameReady] = useState(false);
  const [showShopName, setShowShopName] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const params = getUrlParams();
  const labelWidthMm = parseInt(params.get('labelWidthMm') || '50', 10) || 50;
  const labelHeightMm = parseInt(params.get('labelHeightMm') || '25', 10) || 25;
  const labelWidthPx = Math.round(labelWidthMm * PX_PER_MM);
  const labelHeightPx = Math.round(labelHeightMm * PX_PER_MM);
  const colCount = Math.max(1, columns || 1);
  const labelContentWidthPx = Math.max(60, Math.floor(labelWidthPx / colCount) - 16);
  const barcodeModuleWidth = Math.min(1.6, Math.max(0.4, labelContentWidthPx / code128Modules(barcode)));

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

  const formatPrice = (p: number) => {
    return p % 1 === 0 ? p.toString() : p.toFixed(2);
  };

  useEffect(() => {
    if (codeType === 'qrcode') {
      QRCode.toDataURL(barcode, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [barcode, codeType]);

  const readyToPrint = shopNameReady && (codeType !== 'qrcode' || !!qrDataUrl);

  useEffect(() => {
    if (!readyToPrint) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [readyToPrint, barcode, quantity, columns, codeType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const pages: React.ReactNode[] = [];
  let currentQuantity = 0;

  while (currentQuantity < quantity) {
    const labelsInPage = Math.min(colCount, quantity - currentQuantity);

    const pageLabels = Array.from({ length: colCount }, (_, colIndex) => {
      const hasLabel = colIndex < labelsInPage;
      return (
        <div key={colIndex} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '3px 4px 0 4px', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && (
            <>
              {showShopName && shopName && (
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10.5px', fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.12em', color: '#000', textTransform: 'uppercase', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', padding: '0 2px', boxSizing: 'border-box', marginBottom: '1px' }}>
                  {shopName}
                </div>
              )}
              {price !== undefined && !isNaN(price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '2px', padding: '0 4px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', lineHeight: 1.1, color: 'black', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: sp !== undefined && !isNaN(sp) ? 'normal' : 'bold' }}>MRP ₹{formatPrice(price)}</span>
                    {sp !== undefined && !isNaN(sp) && (
                      <span style={{ marginLeft: '2ch', fontWeight: 'bold' }}>{spType} ₹{formatPrice(sp)}</span>
                    )}
                  </div>
                </div>
              )}
              {codeType === 'qrcode' ? (
                qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" style={{ width: '70px', height: '70px', imageRendering: 'pixelated' }} />
                ) : (
                  <div style={{ width: '70px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>Loading...</div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                  <Barcode value={barcode} format="CODE128" width={barcodeModuleWidth} height={30} displayValue={false} margin={0} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '2px', padding: '0 3px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontSize: '10px', lineHeight: 1.1, fontFamily: 'Courier New, Courier, monospace', fontWeight: 700, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', width: '100%', textAlign: 'center', letterSpacing: '0.04em' }}>
                  {barcode}
                </div>
                {name && (
                  <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px', fontWeight: 700, lineHeight: 1.25, color: '#000', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%', width: '100%', textAlign: 'center', marginTop: '2px' }}>
                    {name}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    });

    pages.push(
      <div key={currentQuantity} style={{ width: labelWidthPx, height: labelHeightPx, display: 'flex', flexDirection: 'row', backgroundColor: 'white', margin: 0, padding: 0, boxSizing: 'border-box', pageBreakAfter: 'always' }}>
        {pageLabels}
      </div>
    );

    currentQuantity += labelsInPage;
  }

  return (
    <div style={{ width: labelWidthPx, minHeight: labelHeightPx, backgroundColor: 'white' }}>
      {pages}
    </div>
  );
}
