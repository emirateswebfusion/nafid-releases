import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
export function QRCodePreview({ barcode }: { barcode: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(barcode, { width: 120, margin: 1 })
      .then(u => setUrl(u))
      .catch(() => setUrl(null));
  }, [barcode]);
  if (!url) return <div style={{ width: '100px', height: '50px', background: '#f0f0f0' }} />;
  return <img src={url} alt="QR" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} />;
}

export function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}
