import { useEffect } from 'react';
import Barcode from 'react-barcode';

export function PrintBarcodeView({ barcode, price, name, quantity = 1 }: { barcode: string; price?: number; name?: string; quantity?: number }) {
  useEffect(() => {
    // Give react-barcode a tiny bit of time to render the SVG/Canvas
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [barcode, quantity]);

  const labels = Array.from({ length: quantity }, (_, i) => (
    <div key={i} style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'white', margin: 0, padding: '4px 0 0 0', boxSizing: 'border-box', pageBreakAfter: 'always' }}>
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
        Width and height might need tweaking based on exact label size (e.g. 2x1 inches). 
        The react-barcode defaults usually work for standard labels.
      */}
      <Barcode value={barcode} format="CODE128" width={1.8} height={40} displayValue={true} fontSize={12} margin={0} />
    </div>
  ));

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'white' }}>
      {labels}
    </div>
  );
}
