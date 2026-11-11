import { Banknote, IndianRupee, type LucideProps } from 'lucide-react';
import { isVatStore } from '../../utils/localization/storeProfile';

/** Money icon for the active shop currency: the rupee glyph in India, a neutral banknote elsewhere. */
export function CurrencyIcon(props: LucideProps) {
  return isVatStore() ? <Banknote {...props} /> : <IndianRupee {...props} />;
}
