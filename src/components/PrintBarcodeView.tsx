import { useEffect } from 'react';
import Barcode from 'react-barcode';

export function PrintBarcodeView({ barcode }: { barcode: string }) {
  useEffect(() => {
    // Give react-barcode a tiny bit of time to render the SVG/Canvas
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [barcode]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', margin: 0, padding: 0 }}>
      {/* 
        Width and height might need tweaking based on exact label size (e.g. 2x1 inches). 
        The react-barcode defaults usually work for standard labels.
      */}
      <Barcode value={barcode} format="CODE128" width={2} height={50} displayValue={true} />
    </div>
  );
}
