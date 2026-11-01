/**
 * Indian GSTIN Validation and Place of Supply (POS) Engine.
 * Implements official Luhn Mod-36 checksum, state-code lookup (01-38, 97, 99),
 * and Place of Supply determination compliant with Section 10 of IGST Act.
 */

export interface StateInfo {
  code: string; // 2-digit TIN string e.g. "32"
  name: string; // Statutory State / UT Name
  abbr: string; // 2-letter abbreviation
}

export const INDIAN_STATES: Record<string, StateInfo> = {
  '01': { code: '01', name: 'Jammu and Kashmir', abbr: 'JK' },
  '02': { code: '02', name: 'Himachal Pradesh', abbr: 'HP' },
  '03': { code: '03', name: 'Punjab', abbr: 'PB' },
  '04': { code: '04', name: 'Chandigarh', abbr: 'CH' },
  '05': { code: '05', name: 'Uttarakhand', abbr: 'UK' },
  '06': { code: '06', name: 'Haryana', abbr: 'HR' },
  '07': { code: '07', name: 'Delhi', abbr: 'DL' },
  '08': { code: '08', name: 'Rajasthan', abbr: 'RJ' },
  '09': { code: '09', name: 'Uttar Pradesh', abbr: 'UP' },
  '10': { code: '10', name: 'Bihar', abbr: 'BR' },
  '11': { code: '11', name: 'Sikkim', abbr: 'SK' },
  '12': { code: '12', name: 'Arunachal Pradesh', abbr: 'AR' },
  '13': { code: '13', name: 'Nagaland', abbr: 'NL' },
  '14': { code: '14', name: 'Manipur', abbr: 'MN' },
  '15': { code: '15', name: 'Mizoram', abbr: 'MZ' },
  '16': { code: '16', name: 'Tripura', abbr: 'TR' },
  '17': { code: '17', name: 'Meghalaya', abbr: 'ML' },
  '18': { code: '18', name: 'Assam', abbr: 'AS' },
  '19': { code: '19', name: 'West Bengal', abbr: 'WB' },
  '20': { code: '20', name: 'Jharkhand', abbr: 'JH' },
  '21': { code: '21', name: 'Odisha', abbr: 'OR' },
  '22': { code: '22', name: 'Chhattisgarh', abbr: 'CT' },
  '23': { code: '23', name: 'Madhya Pradesh', abbr: 'MP' },
  '24': { code: '24', name: 'Gujarat', abbr: 'GJ' },
  '26': { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', abbr: 'DD' },
  '27': { code: '27', name: 'Maharashtra', abbr: 'MH' },
  '29': { code: '29', name: 'Karnataka', abbr: 'KA' },
  '30': { code: '30', name: 'Goa', abbr: 'GA' },
  '31': { code: '31', name: 'Lakshadweep', abbr: 'LD' },
  '32': { code: '32', name: 'Kerala', abbr: 'KL' },
  '33': { code: '33', name: 'Tamil Nadu', abbr: 'TN' },
  '34': { code: '34', name: 'Puducherry', abbr: 'PY' },
  '35': { code: '35', name: 'Andaman and Nicobar Islands', abbr: 'AN' },
  '36': { code: '36', name: 'Telangana', abbr: 'TS' },
  '37': { code: '37', name: 'Andhra Pradesh', abbr: 'AP' },
  '38': { code: '38', name: 'Ladakh', abbr: 'LA' },
  '97': { code: '97', name: 'Other Territory', abbr: 'OT' },
  '99': { code: '99', name: 'Centre Jurisdiction', abbr: 'CJ' },
};

const MOD36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates an Indian GSTIN against format, state code, PAN structure,
 * and the official GSTN Luhn Mod-36 check-digit algorithm.
 */
export function validateGSTIN(gstin: string | null | undefined): {
  isValid: boolean;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  error?: string;
} {
  if (!gstin || typeof gstin !== 'string') {
    return { isValid: false, error: 'GSTIN is empty' };
  }

  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return { isValid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  // Structure: 2 digits (state) + 5 letters + 4 digits + 1 letter (PAN) + 1 char (entity) + 'Z' + 1 char (check)
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(clean)) {
    return { isValid: false, error: 'Invalid GSTIN format or PAN structure' };
  }

  const stateCode = clean.substring(0, 2);
  const state = INDIAN_STATES[stateCode];
  if (!state) {
    return { isValid: false, error: `Invalid GST state code: ${stateCode}` };
  }

  // Luhn Mod-36 Check Digit verification
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = MOD36_CHARS.indexOf(clean[i]);
    const factor = (i % 2 === 0) ? 1 : 2;
    const prod = val * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkCode = (36 - (sum % 36)) % 36;
  const expectedCheckChar = MOD36_CHARS[checkCode];

  if (clean[14] !== expectedCheckChar) {
    return {
      isValid: false,
      stateCode,
      stateName: state.name,
      pan: clean.substring(2, 12),
      error: `Invalid check digit: expected ${expectedCheckChar}, found ${clean[14]}`,
    };
  }

  return {
    isValid: true,
    stateCode,
    stateName: state.name,
    pan: clean.substring(2, 12),
  };
}

/**
 * Normalizes any State input (code, name, abbreviation, slug) to statutory StateInfo.
 */
export function normalizeState(input: string | null | undefined): StateInfo | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!clean) return null;

  // Direct 2-digit code match
  if (clean.length === 2 && INDIAN_STATES[clean]) {
    return INDIAN_STATES[clean];
  }

  // Look for 2-digit prefix (e.g. "32KERALA")
  const prefix2 = clean.substring(0, 2);
  if (/^\d{2}$/.test(prefix2) && INDIAN_STATES[prefix2]) {
    return INDIAN_STATES[prefix2];
  }

  // Match by name or abbreviation
  for (const state of Object.values(INDIAN_STATES)) {
    const normName = state.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean === normName || clean === state.abbr) {
      return state;
    }
  }

  // Partial match fallback (e.g. "TAMILNADU" -> "Tamil Nadu")
  for (const state of Object.values(INDIAN_STATES)) {
    const normName = state.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.includes(normName) || normName.includes(clean)) {
      return state;
    }
  }

  return null;
}

export interface PlaceOfSupplyParams {
  shopState?: string | null;
  customerState?: string | null;
  customerGstin?: string | null;
  isInterStateOverride?: boolean;
}

/**
 * Resolves Place of Supply (POS) and whether transaction is INTRA or INTER state.
 * Implements Section 10 of IGST Act:
 * - B2B: Recipient State from GSTIN takes precedence unless explicit delivery state is given.
 * - B2C over-the-counter: Place of Supply is Supplier State (INTRA).
 * - B2C interstate delivery: Customer State is POS (INTER).
 */
export function resolvePlaceOfSupply(params: PlaceOfSupplyParams): {
  supplyType: 'INTRA' | 'INTER';
  posStateCode: string;
  posStateName: string;
} {
  const { shopState, customerState, customerGstin, isInterStateOverride } = params;

  const normShop = normalizeState(shopState) || { code: '32', name: 'Kerala', abbr: 'KL' };

  if (isInterStateOverride) {
    const custState = normalizeState(customerState) || { code: '97', name: 'Other Territory', abbr: 'OT' };
    return {
      supplyType: 'INTER',
      posStateCode: custState.code,
      posStateName: custState.name,
    };
  }

  // B2B: Check customer GSTIN
  if (customerGstin && customerGstin.trim()) {
    const gstinValidation = validateGSTIN(customerGstin);
    if (gstinValidation.stateCode && INDIAN_STATES[gstinValidation.stateCode]) {
      const gstinState = INDIAN_STATES[gstinValidation.stateCode];
      const isInter = gstinState.code !== normShop.code;
      return {
        supplyType: isInter ? 'INTER' : 'INTRA',
        posStateCode: gstinState.code,
        posStateName: gstinState.name,
      };
    }
  }

  // If customer state is provided, check if it's different from shop state
  const normCust = normalizeState(customerState);
  if (normCust) {
    const isInter = normCust.code !== normShop.code;
    return {
      supplyType: isInter ? 'INTER' : 'INTRA',
      posStateCode: normCust.code,
      posStateName: normCust.name,
    };
  }

  // Default for walk-in / B2C over the counter: POS is the store state
  return {
    supplyType: 'INTRA',
    posStateCode: normShop.code,
    posStateName: normShop.name,
  };
}
