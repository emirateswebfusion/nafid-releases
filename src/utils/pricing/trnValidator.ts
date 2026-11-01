/**
 * UAE Tax Registration Number (TRN) Validation Engine for Renderer process.
 * Compliant with UAE Federal Tax Authority (FTA) specifications.
 */

export interface TrnValidationResult {
  isValid: boolean;
  trn?: string;
  error?: string;
}

export const UAE_EMIRATES_LIST = [
  { code: 'ABU_DHABI', name: 'Abu Dhabi', boxKey: 'abuDhabi' as const },
  { code: 'DUBAI', name: 'Dubai', boxKey: 'dubai' as const },
  { code: 'SHARJAH', name: 'Sharjah', boxKey: 'sharjah' as const },
  { code: 'AJMAN', name: 'Ajman', boxKey: 'ajman' as const },
  { code: 'UMM_AL_QUWAIN', name: 'Umm Al Quwain', boxKey: 'ummAlQuwain' as const },
  { code: 'RAS_AL_KHAIMAH', name: 'Ras Al Khaimah', boxKey: 'rasAlKhaimah' as const },
  { code: 'FUJAIRAH', name: 'Fujairah', boxKey: 'fujairah' as const },
] as const;

export type UaeEmirateCode = typeof UAE_EMIRATES_LIST[number]['code'];

export function validateTRN(trn: string | null | undefined): TrnValidationResult {
  if (!trn || typeof trn !== 'string') {
    return { isValid: false, error: 'TRN is empty' };
  }

  const clean = trn.trim();
  if (clean.length === 0) {
    return { isValid: false, error: 'TRN is empty' };
  }

  if (!/^\d+$/.test(clean)) {
    return { isValid: false, error: 'TRN must contain digits only' };
  }

  if (clean.length !== 15) {
    return { isValid: false, error: `TRN must be exactly 15 digits (got ${clean.length})` };
  }

  if (!clean.startsWith('100')) {
    return {
      isValid: false,
      error: 'UAE FTA VAT TRN must begin with 100',
    };
  }

  return {
    isValid: true,
    trn: clean,
  };
}

export function normalizeEmirate(raw: string | null | undefined): UaeEmirateCode {
  if (!raw || typeof raw !== 'string') return 'DUBAI';
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const found = UAE_EMIRATES_LIST.find(e => e.code === upper || e.name.toUpperCase().replace(/\s+/g, '_') === upper);
  return found ? found.code : 'DUBAI';
}
