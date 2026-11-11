import { isVatStore, localizeTaxText } from '../../utils/localization/storeProfile';

/** Tax terminology follows the saved country profile in either response language. */
export function formatAiTaxLabels(content: string): string {
  const localized = localizeTaxText(content);
  return isVatStore() ? localized.replace(/ജിഎസ്ടി/g, 'വാറ്റ്') : localized;
}
