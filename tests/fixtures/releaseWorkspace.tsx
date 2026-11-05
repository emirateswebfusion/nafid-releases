/* eslint-disable react-refresh/only-export-components */
/** Isolated UI acceptance workspace; no native data, credentials or outgoing messages. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { QuickPinLogin } from '../../src/components/auth/QuickPinLogin';
import { PricingSection, type PricingSectionProps } from '../../src/components/inventory/views/form/PricingSection';
import { useStaffManagerState } from '../../src/components/staff/hooks/useStaffManagerState';
import { StaffSalaryTab } from '../../src/components/staff/views/StaffSalaryTab';
import { StaffAttendanceTab } from '../../src/components/staff/views/StaffAttendanceTab';
import { StaffLedgerTab } from '../../src/components/staff/views/StaffLedgerTab';
import { StaffTransactionModal } from '../../src/components/staff/views/StaffTransactionModal';
import type { StaffMember } from '../../src/components/staff/staffTypes';
import { useFeatureFlagsStore, DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';
useFeatureFlagsStore.getState().setFlags({...DEFAULT_FEATURE_FLAGS,pricing_tiers:true});
const staff = { staff_id:'qa',tenant_id:'qa',name:'Test employee',staff_code:'QA1',monthly_salary:6500,current_balance:5000,status:'ACTIVE' } as StaffMember;
function Workspace() {
  const [tab,setTab]=useState('PIN');
  const [tiers,setTiers]=useState<PricingSectionProps['activePricingTiers']>([]);
  const [prices,setPrices]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState('');
  const sm=useStaffManagerState();
  const selected={...sm,staffList:[staff],selectedStaffId:'qa'};
  return <main className="min-h-screen bg-background text-foreground p-8"><h1 className="text-xl font-bold">v2.2.44 — isolated test shop</h1><nav className="flex gap-4 py-6">{['PIN','Pricing','Salary','Attendance','Ledger'].map(t=><button className="border rounded px-4 py-2" key={t} onClick={()=>setTab(t)}>{t}</button>)}</nav>
  {notice && <p role="status">{notice}</p>}
  {tab==='PIN' && <QuickPinLogin shopName="Shop Two" userName="Mohammed" role="ADMIN" onSwitchToEmail={()=>setNotice('Email sign-in selected')}/>}
  {tab==='Pricing' && <PricingSection activePricingTiers={tiers} tierPrices={prices} setTierPrices={setPrices} enableRealPaperStock={false} formData={{uom:'Pcs',domain_attributes:{},base_price:100} as PricingSectionProps['formData']} handleInputChange={()=>{}} handleDomainAttrChange={()=>{}} onAddPricingTier={async name=>{const id=`tier-${tiers.length}`;setTiers([...tiers,{pricing_tier_id:id,name,is_active:1,tenant_id:'qa',sort_order:0}]);return {success:true,pricing_tier_id:id};}}/>}
  {tab==='Salary' && <StaffSalaryTab selectedStaff={staff} sm={selected}/>}
  {tab==='Attendance' && <StaffAttendanceTab selectedStaff={staff} sm={selected} handleMarkAttendance={async (_id,date,status)=>sm.setAttendanceRecords([...sm.attendanceRecords.filter(a=>a.date!==date),{attendance_id:date,date,status,tenant_id:'qa',staff_id:'qa'} as typeof sm.attendanceRecords[number]])}/>}
  {tab==='Ledger' && <StaffLedgerTab selectedStaff={staff} ledgerEntries={sm.ledgerEntries}/>}
  {sm.showTxnModal && <StaffTransactionModal sm={selected} handleAddTransaction={async()=>{const debit=['SALARY_ACCRUAL','BONUS'].includes(sm.txnData.type);sm.setLedgerEntries([...sm.ledgerEntries,{ledger_id:String(Date.now()),transaction_date:new Date().toISOString(),reference_type:sm.txnData.type,debit_amount:debit?sm.txnData.amount:0,credit_amount:debit?0:sm.txnData.amount,running_balance:sm.txnData.amount,description:sm.txnData.type} as typeof sm.ledgerEntries[number]]);sm.setShowTxnModal(false);}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Workspace/>);
