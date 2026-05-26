import { useEffect } from 'react';
import Barcode from 'react-barcode';

export function PrintBarcodeView({ barcode, price, name, quantity = 1, columns = 1 }: { barcode: string; price?: number; name?: string; quantity?: number; columns?: number }) {
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
                    MRP ₹{price.toFixed(2)}
                  </div>
                  {name && (
                    <div style={{ fontSize: '12px', color: 'black', marginLeft: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto' }}>
                      {name}
                    </div>
                  )}
                </div>
              )}
              {/* 
                Width and height tweaked to prevent clipping on standard 50x25mm labels.
              */}
              <Barcode value={barcode} format="CODE128" width={1.3} height={30} displayValue={true} fontSize={10} margin={0} />
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
