import { useEffect } from 'react';
import Barcode from 'react-barcode';

export function PrintBarcodeView({ barcode, price, sp, spType = 'SP', name, quantity = 1, columns = 1 }: { barcode: string; price?: number; sp?: number; spType?: 'SP' | 'OFF'; name?: string; quantity?: number; columns?: number }) {
  const formatPrice = (p: number) => {
    return p % 1 === 0 ? p.toString() : p.toFixed(2);
  };
  useEffect(() => {
    // Give react-barcode a tiny bit of time to render the SVG/Canvas
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [barcode, quantity, columns]);

  const pages = [];
  let currentQuantity = 0;

  while (currentQuantity < quantity) {
    const labelsInPage = Math.min(columns, quantity - currentQuantity);
    
    const pageLabels = Array.from({ length: columns }, (_, colIndex) => {
      const hasLabel = colIndex < labelsInPage;
      return (
        <div key={colIndex} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 0 0 0', boxSizing: 'border-box', overflow: 'hidden' }}>
          {hasLabel && (
            <>
              {price !== undefined && !isNaN(price) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginBottom: '2px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', color: 'black', whiteSpace: 'nowrap' }}>
                    MRP ₹{formatPrice(price)}
                    {sp !== undefined && !isNaN(sp) && (
                      <span style={{ marginLeft: '3ch' }}>{spType} ₹{formatPrice(sp)}</span>
                    )}
                  </div>
                </div>
              )}
              {/* 
                Width and height tweaked to prevent clipping on standard 50x25mm labels.
              */}
              <Barcode value={barcode} format="CODE128" width={1.3} height={30} displayValue={false} margin={0} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', marginTop: '2px', padding: '0 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ fontSize: '10px', color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {barcode}
                  {name && (
                    <span style={{ marginLeft: '3ch' }}>{name}</span>
                  )}
                </div>
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
