import { Loader2, Trash } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import type { SettingsGradesState } from '../hooks/useSettingsGradesState';

export interface ConfirmDeleteCategoryModalProps {
  handleDeleteCategory: (category: string) => Promise<void>;
  sg: SettingsGradesState;
}

/** Confirmation dialog for deleting a whole category and its grades. */
export function ConfirmDeleteCategoryModal({ handleDeleteCategory, sg }: ConfirmDeleteCategoryModalProps) {
  const { confirmDeleteCategory, grades, operating, setConfirmDeleteCategory } = sg;
  return (
    <Modal
      isOpen={confirmDeleteCategory !== null}
      onClose={() => !operating && setConfirmDeleteCategory(null)}
      closeButton={null}
      title={
        <div className="flex items-center gap-2 text-destructive select-none">
          <Trash className="w-5 h-5" />
          <span className="font-black text-sm uppercase tracking-widest">Delete Category</span>
        </div>
      }
      className="max-w-sm"
    >
      <div className="space-y-4">
        <div className="p-4 bg-destructive/[0.03] rounded-2xl border border-destructive/20 text-xs leading-relaxed text-muted-foreground">
          <p className="text-sm text-foreground font-bold leading-normal">
            Are you sure you want to delete <span className="font-black text-destructive">"{confirmDeleteCategory}"</span>?
          </p>
          <p className="mt-2 text-muted-foreground/80 font-medium">
            This will permanently delete all{' '}
            <span className="font-black text-destructive">
              {grades.filter(g => g.category === confirmDeleteCategory).length} grade(s)
            </span>{' '}
            associated with this category. This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2.5 pt-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => confirmDeleteCategory && handleDeleteCategory(confirmDeleteCategory)}
            disabled={operating}
            className="px-5 rounded-xl shadow-md font-bold flex items-center gap-1.5 py-2.5 cursor-pointer"
          >
            {operating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash className="w-4 h-4" />
            )}
            Delete Grades
          </Button>
        </div>
      </div>
    </Modal>
  );
}
