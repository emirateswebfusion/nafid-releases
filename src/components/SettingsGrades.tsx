import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuthStore } from '../store/authStore';

export function SettingsGrades() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: '', grade_name: '', rate: 0 });
  const [newForm, setNewForm] = useState({ category: '', grade_name: '', rate: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGrades();
  }, []);

  const loadGrades = async () => {
    if (window.electronAPI) {
      setLoading(true);
      const { tenantId } = useAuthStore.getState();
      const res = await window.electronAPI.dbGetGrades(tenantId || '');
      if (Array.isArray(res)) {
        setGrades(res);
      }
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newForm.category || !newForm.grade_name || newForm.rate <= 0) {
      setError('Please fill all fields and ensure rate is > 0');
      return;
    }
    setError(null);
    const { tenantId } = useAuthStore.getState();
    const grade = {
      grade_id: crypto.randomUUID(),
      tenant_id: tenantId,
      ...newForm
    };
    const res = await window.electronAPI.dbAddGrade(grade);
    if (res.success) {
      setIsAdding(false);
      setNewForm({ category: '', grade_name: '', rate: 0 });
      loadGrades();
    } else {
      setError(res.error || 'Failed to add grade');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.category || !editForm.grade_name || editForm.rate <= 0) {
      setError('Please fill all fields and ensure rate is > 0');
      return;
    }
    setError(null);
    const res = await window.electronAPI.dbUpdateGrade({
      grade_id: id,
      ...editForm
    });
    if (res.success) {
      setEditingId(null);
      loadGrades();
    } else {
      setError(res.error || 'Failed to update grade');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this grade?')) return;
    const res = await window.electronAPI.dbDeleteGrade(id);
    if (res.success) {
      loadGrades();
    } else {
      setError(res.error || 'Failed to delete grade');
    }
  };

  const startEdit = (grade: any) => {
    setEditingId(grade.grade_id);
    setEditForm({ category: grade.category, grade_name: grade.grade_name, rate: grade.rate });
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  // Group by category
  const categories = Array.from(new Set(grades.map(g => g.category)));

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">{error}</div>}
      
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Define Categories and their respective Grades with base rates.</p>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Grade
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-4 animate-in fade-in slide-in-from-top-2">
          <h4 className="font-bold text-sm">New Category / Grade</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Category</label>
              <Input placeholder="e.g. Steel" value={newForm.category} onChange={e => setNewForm({...newForm, category: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Grade Name</label>
              <Input placeholder="e.g. Grade A" value={newForm.grade_name} onChange={e => setNewForm({...newForm, grade_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rate (₹)</label>
              <Input type="number" value={newForm.rate} onChange={e => setNewForm({...newForm, rate: parseFloat(e.target.value) || 0})} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd}>Save</Button>
          </div>
        </div>
      )}

      {categories.map(category => {
        const catGrades = grades.filter(g => g.category === category);
        return (
          <div key={category} className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b border-border font-bold">
              {category}
            </div>
            <div className="divide-y divide-border">
              {catGrades.map(g => (
                <div key={g.grade_id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  {editingId === g.grade_id ? (
                    <div className="flex-1 grid grid-cols-3 gap-4 items-center mr-4">
                      <Input value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} />
                      <Input value={editForm.grade_name} onChange={e => setEditForm({...editForm, grade_name: e.target.value})} />
                      <Input type="number" value={editForm.rate} onChange={e => setEditForm({...editForm, rate: parseFloat(e.target.value) || 0})} />
                    </div>
                  ) : (
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div className="text-muted-foreground text-sm flex items-center">{g.category}</div>
                      <div className="font-medium flex items-center">{g.grade_name}</div>
                      <div className="font-bold text-primary flex items-center">₹{g.rate.toFixed(2)}</div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    {editingId === g.grade_id ? (
                      <>
                        <button onClick={() => setEditingId(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
                        <button onClick={() => handleUpdate(g.grade_id)} className="p-2 hover:bg-primary/20 rounded-lg text-primary"><Check className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(g)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(g.grade_id)} className="p-2 hover:bg-destructive/20 rounded-lg text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      
      {grades.length === 0 && !isAdding && (
        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          No grades configured.
        </div>
      )}
    </div>
  );
}
