import { useEffect, useState } from 'react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';

export function PrintBulkBarcodeView({ codeType = DEFAULT_CODE_TYPE }: { codeType?: CodeType }) {
  const shopName = useAuthStore((state: { shopName: string | null }) => state.shopName);
  const [items, setItems] = useState<any[]>([]);
  const [columns, setColumns] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const cols = parseInt(params.get('columns') || '1', 10);
    setColumns(cols);

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

  useEffect(() => {
    if (loaded) {
      const timer = setTimeout(() => {
        if (window.electronAPI && window.electronAPI.printReady) {
          window.electronAPI.printReady();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loaded, items, columns, codeType, qrDataUrls]);

  const formatPrice = (p: number) => {
    return p % 1 === 0 ? p.toString() : p.toFixed(2);
  };

  if (!loaded) return <div style={{ padding: '20px' }}>Loading print data...</div>;

  const pages: any[] = [];
  
  const flatItems: any[] = [];
  items.forEach(item => {
    for (let i = 0; i < (item.quantity || 1); i++) {
      flatItems.push(item);
    }
  });

  let currentIndex = 0;

  while (currentIndex < flatItems.length) {
    const pageLabels = Array.from({ length: columns }, (_, colIndex) => {
      const hasLabel = currentIndex + colIndex < flatItems.length;
      const item = hasLabel ? flatItems[currentIndex + colIndex] : null;

      return (
        <div key={colIndex} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 0 0 0', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && item && (
            <>
              {shopName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', marginBottom: (item.price !== undefined && !isNaN(item.price)) ? '0px' : '6px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
                  {shopName}
                </div>
              )}
              {item.price !== undefined && !isNaN(item.price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '1px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap' }}>
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
                <Barcode value={item.barcode} format="CODE128" width={1.1} height={30} displayValue={false} margin={0} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '2px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.barcode}
                </div>
                {item.name && (
                  <div style={{ fontSize: '10px', lineHeight: 1, color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0px' }}>
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
      <div key={currentIndex} style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'row', backgroundColor: 'white', margin: 0, padding: 0, boxSizing: 'border-box', pageBreakAfter: 'always' }}>
        {pageLabels}
      </div>
    );

    currentIndex += columns;
  }

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'white' }}>
      {pages}
    </div>
  );
}
