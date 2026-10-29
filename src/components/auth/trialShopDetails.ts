// Onboarding suggestions only. These do not configure billing, tax or store time.
export const TRIAL_COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timeZone: 'Asia/Dubai', dialCode: '+971' },
  { code: 'IN', name: 'India', currency: 'INR', timeZone: 'Asia/Kolkata', dialCode: '+91' },
] as const;

export type TrialCountryCode = typeof TRIAL_COUNTRIES[number]['code'];
export interface TrialShopDetails {
  shopName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  country: TrialCountryCode;
}

export function validateTrialDetails(details: TrialShopDetails): Partial<Record<keyof TrialShopDetails, string>> {
  const errors: Partial<Record<keyof TrialShopDetails, string>> = {};
  if (!details.shopName.trim()) errors.shopName = 'Enter your shop name.';
  if (!details.ownerName.trim()) errors.ownerName = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) errors.email = 'Enter a valid email address.';
  const digits = details.phone.replace(/\D/g, '');
  if (!/^[+\d\s()-]+$/.test(details.phone.trim()) || digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number, including country code.';
  if (!details.city.trim()) errors.city = 'Enter your city or emirate.';
  if (!TRIAL_COUNTRIES.some(country => country.code === details.country)) errors.country = 'Choose a supported country.';
  return errors;
}
