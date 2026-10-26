export type CodeType = 'barcode' | 'qrcode';

export interface CodeTypeConfig {
  id: CodeType;
  label: string;
  description: string;
}

export const CODE_TYPE_CONFIGS: Record<CodeType, CodeTypeConfig> = {
  barcode: { id: 'barcode', label: 'Barcode', description: 'CODE128 linear barcode' },
  qrcode: { id: 'qrcode', label: 'QR Code', description: '2D matrix QR code' },
};

export const CODE_TYPES: CodeTypeConfig[] = Object.values(CODE_TYPE_CONFIGS);

export const DEFAULT_CODE_TYPE: CodeType = 'barcode';
