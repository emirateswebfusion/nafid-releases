import type { Grade as GradeRow } from '../../data/grades';

/** Settings grades screen: a grade row, the add / edit form shape, and the category colour palette. */
export type Grade = GradeRow;

export interface GradeForm {
  category: string;
  grade_name: string;
  rate: number;
  purchase_price: number;
  offer_price: number | null;
}

export const categoryColor = (index: number) => {
  const colors = [
    'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/30',
    'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/30',
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30',
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30',
    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30',
    'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200/50 dark:border-cyan-800/30',
    'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200/50 dark:border-orange-800/30',
    'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200/50 dark:border-teal-800/30',
  ];
  return colors[index % colors.length];
};
