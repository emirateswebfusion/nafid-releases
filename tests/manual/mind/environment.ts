import { getStoreProfile, setStoreCountry } from '../../../src/utils/localization/storeProfile';
import { setStoreTimezone } from '../../../src/utils/time/timezoneHelper';

// Evaluate before the fixture transport chooses its shop calendar date.
setStoreCountry('AE');
setStoreTimezone(getStoreProfile('AE').timezone);
