import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { X, Users, UserPlus, Trash2, Mail, Shield, Key, Save, Loader2 } from 'lucide-react';
import clsx from 'clsx';

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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Staff Management</h2>
              <p className="text-neutral-500 text-xs">Manage cashiers and shop owners</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* List View */}
        {view === 'list' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <span className="text-sm text-neutral-400 font-medium">{staff.length} staff members</span>
              <button 
                onClick={() => setView('add')}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add New Staff
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {fetching ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  <span className="text-xs">Loading staff records...</span>
                </div>
              ) : staff.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-neutral-600">
                  <Users className="w-12 h-12 opacity-20 mb-2" />
                  <p className="text-sm">No staff members found</p>
                </div>
              ) : (
                staff.map((member) => (
                  <div key={member.user_id} className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-800/50 group transition-all">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                        member.role === 'OWNER' ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                      )}>
                        {member.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-200">{member.name}</p>
                        <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" /> {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={clsx(
                        "text-[10px] font-black px-2 py-0.5 rounded",
                        member.role === 'OWNER' ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                      )}>
                        {member.role}
                      </span>
                      {/* Delete button (disabled for now or only for non-owners) */}
                      {/* <button className="p-2 text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button> */}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Add View */}
        {view === 'add' && (
          <form onSubmit={handleAddStaff} className="flex-1 p-8 space-y-6 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Full Name</label>
                <div className="relative">
                  <Users className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. John Doe"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:border-purple-500 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                  <input 
                    required
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="staff@example.com"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:border-purple-500 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Temporary Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                  <input 
                    required
                    type="password" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:border-purple-500 outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Assigned Role</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'CASHIER'})}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-xs transition-all",
                      formData.role === 'CASHIER' ? "bg-blue-600 border-blue-500 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                    )}
                  >
                    <Users className="w-3.5 h-3.5" /> CASHIER
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'OWNER'})}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-xs transition-all",
                      formData.role === 'OWNER' ? "bg-purple-600 border-purple-500 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                    )}
                  >
                    <Shield className="w-3.5 h-3.5" /> OWNER
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setView('list')}
                className="flex-1 py-3 text-neutral-500 font-bold text-xs hover:text-white transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Create Staff Account
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
