import { useEffect, useState } from 'react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { useAuthStore } from '../store/authStore';

export function PrintBarcodeView({ barcode, price, sp, spType = 'SP', name, quantity = 1, columns = 1, codeType = DEFAULT_CODE_TYPE }: { barcode: string; price?: number; sp?: number; spType?: 'SP' | 'OFF'; name?: string; quantity?: number; columns?: number; codeType?: CodeType }) {
  const shopName = useAuthStore((state: { shopName: string | null }) => state.shopName);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [barcode, quantity, columns, codeType, qrDataUrl]);

  const pages: React.ReactNode[] = [];
  let currentQuantity = 0;

  while (currentQuantity < quantity) {
    const labelsInPage = Math.min(columns, quantity - currentQuantity);
    
    const pageLabels = Array.from({ length: columns }, (_, colIndex) => {
      const hasLabel = colIndex < labelsInPage;
      return (
        <div key={colIndex} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 0 0 0', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && (
            <>
              {shopName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', marginBottom: (price !== undefined && !isNaN(price)) ? '0px' : '6px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
                  {shopName}
                </div>
              )}
              {price !== undefined && !isNaN(price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '1px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap' }}>
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
                <Barcode value={barcode} format="CODE128" width={1.1} height={30} displayValue={false} margin={0} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '2px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {barcode}
                </div>
                {name && (
                  <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0px' }}>
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
      <div key={currentQuantity} style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'row', backgroundColor: 'white', margin: 0, padding: 0, boxSizing: 'border-box', pageBreakAfter: 'always' }}>
        {pageLabels}
      </div>
    );

    currentQuantity += labelsInPage;
  }

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'white' }}>
      {pages}
    </div>
  );
}
