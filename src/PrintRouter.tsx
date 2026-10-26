import { PrintA4View } from './components/print/PrintA4View';
import { PrintBarcodeView } from './components/print/PrintBarcodeView';
import { PrintBulkBarcodeView } from './components/print/PrintBulkBarcodeView';
import { PrintReceiptView } from './components/print/PrintReceiptView';
import { DEFAULT_CODE_TYPE, type CodeType } from './labelCodeTypes';

export function PrintRouter() {
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';

  if (hash.startsWith('#/print-a4')) {
    return <PrintA4View />;
  }

  if (hash.startsWith('#/print-receipt')) {
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const text = urlParams.get('text') || '';
    return <PrintReceiptView text={text} />;
  }

  if (hash.startsWith('#/print-bulk-barcode')) {
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const bulkCodeType = urlParams.get('codeType');
    const codeType = (bulkCodeType === 'barcode' || bulkCodeType === 'qrcode')
      ? bulkCodeType
      : DEFAULT_CODE_TYPE;
    return <PrintBulkBarcodeView codeType={codeType} />;
  }

  if (hash.startsWith('#/print-barcode')) {
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const barcode = urlParams.get('barcode') || '';
    const paramPrice = urlParams.get('price');
    const price = paramPrice !== null ? parseFloat(paramPrice) : (localStorage.getItem('printBarcodePrice') ? parseFloat(localStorage.getItem('printBarcodePrice')!) : undefined);
    const paramSp = urlParams.get('sp');
    const sp = paramSp !== null ? parseFloat(paramSp) : (localStorage.getItem('printBarcodeSp') ? parseFloat(localStorage.getItem('printBarcodeSp')!) : undefined);
    const paramSpType = urlParams.get('spType') as 'SP' | 'OFF' | null;
    const spType = paramSpType || (localStorage.getItem('printBarcodeSpType') as 'SP' | 'OFF') || undefined;
    const paramName = urlParams.get('name');
    const name = paramName !== null ? paramName : localStorage.getItem('printBarcodeName') || undefined;
    const paramQty = urlParams.get('quantity');
    const quantity = paramQty !== null ? parseInt(paramQty, 10) : 1;
    const paramCols = urlParams.get('columns');
    const columns = paramCols !== null ? parseInt(paramCols, 10) : 1;
    const paramCodeType = urlParams.get('codeType');
    const codeType: CodeType = (paramCodeType === 'barcode' || paramCodeType === 'qrcode') ? paramCodeType : DEFAULT_CODE_TYPE;

    return (
      <PrintBarcodeView
        barcode={barcode}
        price={price}
        sp={sp}
        spType={spType}
        name={name}
        quantity={quantity}
        columns={columns}
        codeType={codeType}
      />
    );
  }

  return null;
}
