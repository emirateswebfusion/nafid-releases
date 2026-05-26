import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Users, UserPlus, Mail, Shield, Key, Save, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface StaffMember {
  user_id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'CASHIER';
  created_at: string;
}

const CLOUD_API = import.meta.env.VITE_CLOUD_API || 'http://localhost:3001';

export function StaffManager({ onClose }: { onClose: () => void }) {
  const { token } = useAuthStore();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [view, setView] = useState<'list' | 'add'>('list');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER' as 'OWNER' | 'CASHIER',
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setFetching(true);
    try {
      const res = await fetch(`${CLOUD_API}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${CLOUD_API}/auth/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        await fetchStaff();
        setView('list');
        setFormData({ name: '', email: '', password: '', role: 'CASHIER' });
      } else {
        alert(data.error || 'Failed to add staff');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-2xl max-h-[80vh] flex flex-col"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Staff Management</h2>
            <p className="text-muted-foreground text-xs font-normal">Manage cashiers and shop owners</p>
          </div>
        </div>
      }
    >
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* List View */}
        {view === 'list' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="pb-4 border-b border-border flex justify-between items-center shrink-0">
              <span className="text-sm text-muted-foreground font-medium">{staff.length} staff members</span>
              <Button 
                onClick={() => setView('add')}
                className="flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Add New Staff
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {fetching ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Loading staff records...</span>
                </div>
              ) : staff.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                  <Users className="w-12 h-12 opacity-20 mb-2" />
                  <p className="text-sm">No staff members found</p>
                </div>
              ) : (
                staff.map((member) => (
                  <div key={member.user_id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-background hover:bg-muted/50 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                        member.role === 'OWNER' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {member.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={clsx(
                        "text-[10px] font-black px-2 py-0.5 rounded",
                        member.role === 'OWNER' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {member.role}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Add View */}
        {view === 'add' && (
          <form onSubmit={handleAddStaff} className="flex-1 flex flex-col h-full">
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 ml-1">Full Name</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. John Doe"
                      className="pl-10" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      required
                      type="email" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="staff@example.com"
                      className="pl-10" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 ml-1">Temporary Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      required
                      type="password" 
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder="••••••••"
                      className="pl-10" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 ml-1">Assigned Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'CASHIER'})}
                      className={clsx(
                        "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-xs transition-all",
                        formData.role === 'CASHIER' ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Users className="w-3.5 h-3.5" /> CASHIER
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'OWNER'})}
                      className={clsx(
                        "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-xs transition-all",
                        formData.role === 'OWNER' ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Shield className="w-3.5 h-3.5" /> OWNER
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border shrink-0">
              <Button 
                variant="outline"
                type="button" 
                onClick={() => setView('list')}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Create Staff Account
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
