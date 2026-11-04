import { Banknote, IndianRupee, type LucideIcon } from 'lucide-react';
import { isUaeStore } from '../../utils/localization/storeProfile';

/** Icon component for props that take a Lucide icon type; renders the same choice as `CurrencyIcon`. */
export function getCurrencyIcon(): LucideIcon {
  return isUaeStore() ? Banknote : IndianRupee;
}
