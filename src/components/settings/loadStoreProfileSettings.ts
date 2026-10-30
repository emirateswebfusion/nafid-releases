import { normalizeStoreCountry, setStoreCountry, setStoreVatInclusive } from '../../utils/localization/storeProfile';
import { normalizeStoreTimezone, setStoreTimezone } from '../../utils/time/timezoneHelper';
import type { LoadedSettings } from './loadedSettingsTypes';
import type { SettingsFormState } from './hooks/useSettingsFormState';

/** Settings form state and active profile are initialized together from persisted values. */
export function loadStoreProfileSettings(settings: LoadedSettings, form: SettingsFormState) {
  const storeCountry = normalizeStoreCountry(settings.store_country);
  const vatPriceInclusive = settings.vat_price_inclusive === true || settings.vat_price_inclusive === 'true';
  setStoreCountry(storeCountry);
  setStoreVatInclusive(vatPriceInclusive);
  const storeTimezone = normalizeStoreTimezone(settings.store_timezone);
  form.setStoreCountryState(storeCountry);
  form.setVatPriceInclusive(vatPriceInclusive);
  form.setStoreTimezoneState(storeTimezone);
  setStoreTimezone(storeTimezone);
  return { storeCountry, vatPriceInclusive, storeTimezone };
}
