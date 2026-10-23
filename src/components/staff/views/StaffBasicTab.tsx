import { User, Award, Phone, Mail, Calendar, UserCheck, UserX } from 'lucide-react';
import clsx from 'clsx';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffBasicTabProps {
  sm: StaffManagerState;
}

/** Staff form, basic tab: name, contact, role, joining date and photo. */
export function StaffBasicTab({
  sm,
}: StaffBasicTabProps) {
  const { formData, setFormData } = sm;
  return (
    <div className="space-y-5 animate-in fade-in duration-200">

      <div>
        <h3 className="text-base font-extrabold text-foreground">Basic Profile</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Personal details, contact info & employment record</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <User className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="e.g. Suhaib Mohamed"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-bold text-foreground transition-all"
              autoFocus
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Designation
          </label>
          <div className="relative">
            <Award className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="e.g. Store Manager"
              value={formData.role_designation}
              onChange={e => setFormData({ ...formData, role_designation: e.target.value })}
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all font-semibold"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['Store Manager', 'Cashier', 'Sales Associate', 'Accountant', 'Supervisor', 'Inventory Clerk'].map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => setFormData({ ...formData, role_designation: chip })}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer',
              formData.role_designation === chip
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="border-t border-border/50" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Phone</label>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              placeholder="staff@example.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Joining Date</label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="date"
              value={formData.joining_date}
              onChange={e => setFormData({ ...formData, joining_date: e.target.value })}
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all font-medium"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Status</label>
          <div className="flex items-center gap-1.5 p-1 bg-muted/30 border border-border rounded-xl" style={{ height: '42px' }}>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, status: 'ACTIVE' })}
              className={clsx(
                'flex-1 h-full text-[11px] font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1',
                formData.status === 'ACTIVE' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserCheck className="w-3 h-3" /> Active
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, status: 'INACTIVE' })}
              className={clsx(
                'flex-1 h-full text-[11px] font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1',
                formData.status === 'INACTIVE' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserX className="w-3 h-3" /> Inactive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
