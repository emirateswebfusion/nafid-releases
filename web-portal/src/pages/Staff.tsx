import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Trash, UserPlus, Shield, User, Loader2 } from 'lucide-react';

export default function Staff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create staff state
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loadStaff = async () => {
    setIsLoading(true);
    try {
      const data = await fetchApi('/auth/staff');
      setStaff(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await fetchApi('/auth/staff', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role: 'BILLER' })
      });
      setName(''); setEmail(''); setPassword('');
      loadStaff();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;
    try {
      await fetchApi(`/auth/staff/${id}`, { method: 'DELETE' });
      setStaff(prev => prev.filter(s => s.user_id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-xl font-bold mb-1">Staff Administration</h1>
        <p className="text-sm text-muted-foreground">Manage billers for your shop.</p>
      </div>

      <form onSubmit={handleCreate} className="bg-card p-4 rounded-xl border border-border space-y-4">
        <h2 className="font-semibold">Add New Biller</h2>
        <div className="space-y-3">
          <input required type="text" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          <input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          <input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          <button disabled={isCreating} type="submit" className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-sm disabled:opacity-50">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>Add Staff</span>
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold px-1">Current Staff</h2>
        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          staff.map(s => (
            <div key={s.user_id} className="p-4 bg-card border border-border rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  {s.role === 'OWNER' ? <Shield className="w-5 h-5 text-primary" /> : <User className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.email}</div>
                </div>
              </div>
              {s.role !== 'OWNER' && (
                <button onClick={() => handleDelete(s.user_id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                  <Trash className="w-5 h-5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
