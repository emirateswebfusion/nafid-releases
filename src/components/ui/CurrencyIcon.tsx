import { Banknote, IndianRupee, type LucideProps } from 'lucide-react';
import { isUaeStore } from '../../utils/localization/storeProfile';

/** Money icon for the active shop currency: the rupee glyph in India, a neutral banknote elsewhere. */
export function CurrencyIcon(props: LucideProps) {
  return isUaeStore() ? <Banknote {...props} /> : <IndianRupee {...props} />;
}
