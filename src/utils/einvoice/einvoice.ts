/**
 * UAE e-invoicing rules on the terminal: seller setting keys (read by nafid-server `einvoiceService.SELLER_SETTING_KEYS`),
 * buyer profile parsing/validation for the customer form, and status labels for Sales History.
 * The PINT AE document itself is built on the server (docs/architecture/uae-einvoicing-design.md).
 */
import type { BuyerEinvoiceProfile, EinvoiceStatus } from '../../data/einvoice';
import { validateTRN, UAE_EMIRATES_LIST } from '../pricing/trnValidator';

/** Synced settings keys describing the seller. TRN = `shop_gstin`, emirate = `shop_state` (existing keys). */
export const SELLER_SETTING_KEYS = {
  legalName: 'uae_legal_name',
  tin: 'uae_tin',
  tradeLicenseNo: 'uae_trade_license_no',
  tradeLicenseAuthority: 'uae_trade_license_authority',
  street: 'uae_address_street',
  city: 'uae_address_city',
} as const;

export const LEGAL_ID_TYPES: { value: NonNullable<BuyerEinvoiceProfile['legalIdType']>; label: string }[] = [
  { value: 'TL', label: 'Trade licence' },
  { value: 'EID', label: 'Emirates ID' },
  { value: 'PAS', label: 'Passport' },
  { value: 'CD', label: 'Cabinet decision' },
];

export const EMIRATE_OPTIONS = UAE_EMIRATES_LIST.map(e => ({ value: e.code, label: e.name }));

export function parseBuyerProfile(raw: string | null | undefined): BuyerEinvoiceProfile {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as BuyerEinvoiceProfile : {};
  } catch {
    return {};
  }
}

/** Problems that would stop the server from issuing an e-invoice to this buyer (mirrors PINT AE ibr-135/144-ae). */
export function buyerProfileIssues(profile: BuyerEinvoiceProfile): string[] {
  if (!profile.isBusiness) return [];
  const issues: string[] = [];
  const isExport = !!profile.countryCode && profile.countryCode !== 'AE';
  if (profile.trn && !isExport) {
    const trn = validateTRN(profile.trn);
    if (!trn.isValid) issues.push(trn.error ?? 'Invalid TRN');
  }
  if (!isExport && !profile.trn && !profile.legalId && !profile.peppolId) issues.push('Enter the buyer TRN, or a trade licence / Emirates ID / passport number');
  if (profile.legalId && profile.legalIdType === 'TL' && !profile.legalIdAuthority) issues.push('Enter the trade licence issuing authority');
  if (profile.legalId && profile.legalIdType === 'PAS' && !/^[A-Z]{2}$/.test(profile.passportCountry ?? '')) issues.push('Enter the passport issuing country (2-letter code)');
  if (!profile.street || !profile.city || !profile.emirate) issues.push('Street, city and emirate are required on e-invoices');
  if (profile.peppolId && !/^(0235:)?\d{10}$/.test(profile.peppolId)) issues.push('Peppol ID is 0235 followed by the 10-digit TIN');
  return issues;
}

/** Removes empty fields so the stored JSON stays small and stable. */
export function compactProfile(profile: BuyerEinvoiceProfile): BuyerEinvoiceProfile {
  return Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as BuyerEinvoiceProfile;
}

export type StatusTone = 'neutral' | 'pending' | 'success' | 'warning' | 'error';

const STATUS_LABELS: Record<EinvoiceStatus, { label: string; tone: StatusTone }> = {
  NOT_REQUIRED: { label: 'Not required', tone: 'neutral' },
  QUEUED: { label: 'Queued', tone: 'pending' },
  SUBMITTED: { label: 'Submitted', tone: 'pending' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REPORTED: { label: 'Reported to FTA', tone: 'success' },
  VALIDATION_FAILED: { label: 'Data missing', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'error' },
  FAILED: { label: 'Send failed', tone: 'error' },
};

export function einvoiceStatusLabel(status: EinvoiceStatus | null | undefined): { label: string; tone: StatusTone } {
  return status ? STATUS_LABELS[status] ?? { label: status, tone: 'neutral' } : { label: 'Not synced', tone: 'neutral' };
}

/** The buyer is not on Peppol yet: a normal (paper / PDF) tax invoice must also be given. */
export const needsPaperCopy = (buyerEndpoint: string | null | undefined) => buyerEndpoint === '9900000098' || buyerEndpoint === '9900000099';

/** `errors` JSON → readable lines for a tooltip. */
export function einvoiceErrorLines(errors: string | null | undefined): string[] {
  if (!errors) return [];
  try {
    const list = JSON.parse(errors) as unknown;
    if (!Array.isArray(list)) return [];
    return list.map(e => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)));
  } catch {
    return [];
  }
}
