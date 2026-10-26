import * as partyLedgerSql from '../db/statements/partyLedger.js';

/** Customer credit status: limits, overdue invoices and restriction decisions used by checkout and the customer screens. */

export function computeCustomerCreditStatusSync(db: any, tenantId: string, customerId: string, invoices: any[]) {
  // 1. Fetch customer credit configuration
  const customer: any = partyLedgerSql.findOneCustomerByPhoneAndCustomerId(db).get(customerId, tenantId) || {};

  const partyBalance = Number(customer.party_balance ?? 0);
  const creditPeriodEnabled = Boolean(customer.credit_period_enabled ?? customer.party_credit_period_enabled ?? false);
  const creditPeriodDays = Number(customer.credit_period_days ?? customer.party_credit_period_days ?? 30) || 30;
  const now = new Date();

  // If party balance is <= 0, customer owes nothing (all settled)
  const isSettled = partyBalance <= 0;

  // 2. Fetch all debits (payments) from party_ledger if a party exists
  let ledgerDebits: any[] = [];
  if (customer.party_id) {
    ledgerDebits = partyLedgerSql.findPartyLedgerByPartyId5(db).all(customer.party_id, tenantId) as any[];
  }

  // Map explicit payments by invoice reference
  const explicitPayments = new Map<string, number>();
  let totalExplicitDebits = 0;
  let totalDebits = 0;

  for (const d of ledgerDebits) {
    const amt = Number(d.debit_amount) || 0;
    totalDebits += amt;
    const ref = (d.reference_number || '').trim();
    if (ref) {
      const cleanRef = ref.replace(/-PAY$/i, '');
      explicitPayments.set(cleanRef, (explicitPayments.get(cleanRef) || 0) + amt);
      totalExplicitDebits += amt;
    }
  }

  let unallocatedPool = Math.max(0, totalDebits - totalExplicitDebits);

  // 3. Sort credit bills oldest to newest for FIFO allocation
  const creditInvoices = invoices.filter((inv: any) => {
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch { /* ignore */ }
    }
    return pm === 'CREDIT' || splitCredit > 0 || (Number(inv.balance_amount) > 0 && pm !== 'CASH');
  }).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const billAllocations = new Map<string, { outstanding: number; dueDate: Date | null; isOverdue: boolean; overdueDays: number; remainingDays: number; status: string }>();

  for (const inv of creditInvoices) {
    const invNum = (inv.invoice_number || '').trim();
    const pm = (inv.payment_method || '').toUpperCase();
    let splitCredit = 0;
    if (inv.split_details) {
      try {
        const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        splitCredit = Number(s?.credit) || 0;
      } catch { /* ignore */ }
    }

    const billCreditTotal = pm === 'SPLIT' && splitCredit > 0
      ? splitCredit
      : Math.max(0, Number(inv.grand_total) - (Number(inv.received_amount) || 0));

    if (isSettled) {
      billAllocations.set(inv.invoice_id, {
        outstanding: 0,
        dueDate: inv.due_date ? new Date(inv.due_date) : null,
        isOverdue: false,
        overdueDays: 0,
        remainingDays: 0,
        status: 'PAID'
      });
      continue;
    }

    const directPay = explicitPayments.get(invNum) || 0;
    let rem = Math.max(0, billCreditTotal - directPay);

    if (rem > 0 && unallocatedPool > 0) {
      const take = Math.min(rem, unallocatedPool);
      rem -= take;
      unallocatedPool -= take;
    }

    // Determine due date
    let dueDate: Date | null = null;
    if (inv.due_date) {
      dueDate = new Date(inv.due_date);
    } else if (creditPeriodEnabled && creditPeriodDays > 0 && inv.created_at) {
      dueDate = new Date(new Date(inv.created_at).getTime() + creditPeriodDays * 24 * 60 * 60 * 1000);
    }

    let isOverdue = false;
    let overdueDays = 0;
    let remainingDays = 0;
    let status = 'PAID';

    if (rem > 0.005) {
      if (dueDate) {
        const diffMs = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        if (diffDays < 0) {
          isOverdue = true;
          overdueDays = Math.abs(diffDays);
          status = 'OVERDUE';
        } else {
          remainingDays = diffDays;
          status = diffDays <= 3 ? 'DUE_SOON' : 'ACTIVE';
        }
      } else {
        status = 'ACTIVE';
      }
    } else {
      rem = 0;
      status = 'PAID';
    }

    billAllocations.set(inv.invoice_id, {
      outstanding: Math.round(rem * 100) / 100,
      dueDate,
      isOverdue,
      overdueDays,
      remainingDays,
      status
    });
  }

  return invoices.map((inv: any) => {
    const alloc = billAllocations.get(inv.invoice_id);
    if (alloc) {
      return {
        ...inv,
        is_credit_bill: true,
        due_date: alloc.dueDate ? alloc.dueDate.toISOString() : null,
        outstanding_amount: alloc.outstanding,
        is_overdue: alloc.isOverdue,
        overdue_days: alloc.overdueDays,
        remaining_days: alloc.remainingDays,
        credit_status: alloc.status
      };
    }
    return {
      ...inv,
      is_credit_bill: false,
      outstanding_amount: 0,
      is_overdue: false,
      overdue_days: 0,
      remaining_days: 0,
      credit_status: 'NON_CREDIT'
    };
  });
}

export function checkCustomerOverdueSync(db: any, tenantId: string, customerId?: string, custPhone?: string, custName?: string) {
  let cust: any = null;
  if (customerId) {
    cust = partyLedgerSql.findCustomersByCustomerId(db).get(customerId, tenantId);
  }
  if (!cust && custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      cust = partyLedgerSql.findCustomersByPhone(db).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      cust = partyLedgerSql.findCustomersByPhone2(db).get(tenantId, custPhone);
    }
  }
  if (!cust && custName) {
    cust = partyLedgerSql.findCustomers(db).get(tenantId, custName.trim().toLowerCase());
  }

  let party: any = null;
  if (custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      party = partyLedgerSql.findOnePartyByPhone(db).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`);
    } else {
      party = partyLedgerSql.findOnePartyByPhone2(db).get(tenantId, custPhone);
    }
  }
  if (!party && custName) {
    party = partyLedgerSql.findOneParty(db).get(tenantId, custName.trim().toLowerCase());
  }

  const periodEnabled = Boolean(cust?.credit_period_enabled ?? party?.credit_period_enabled ?? false);
  const restrictOnExpiry = (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== 0 && (cust?.restrict_on_credit_expiry ?? party?.restrict_on_credit_expiry) !== false;
  const creditPeriodDays = Number(cust?.credit_period_days ?? party?.credit_period_days ?? 30) || 30;
  const partyBal = Number(party?.balance ?? cust?.party_balance ?? 0);

  if (!periodEnabled || partyBal <= 0) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cId = cust?.customer_id || '';
  const pId = party?.party_id || '';
  if (!cId && !pId) {
    return {
      isOverdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      restrictOnExpiry,
      creditPeriodEnabled: periodEnabled,
      creditPeriodDays,
      customerName: cust?.name || party?.name || custName || 'Customer'
    };
  }

  const cleanPh = (cust?.phone || party?.phone || custPhone || '').replace(/\D/g, '');
  const last10Ph = cleanPh.length >= 7 ? cleanPh.slice(-10) : '';
  const cleanNm = (cust?.name || party?.name || custName || '').trim().toLowerCase();

  const invs = partyLedgerSql.findInvoicesByCustomerId(db).all(
    tenantId,
    cId, cId,
    pId, pId,
    last10Ph ? `%${last10Ph}` : '', last10Ph ? `%${last10Ph}` : '',
    cleanNm, cleanNm, last10Ph
  ) as any[];

  const enriched = computeCustomerCreditStatusSync(db, tenantId, cId || pId, invs);
  const overdues = enriched.filter((i: any) => i.is_overdue);

  return {
    isOverdue: overdues.length > 0,
    overdueCount: overdues.length,
    overdueAmount: overdues.reduce((acc: number, curr: any) => acc + (Number(curr.outstanding_amount) || 0), 0),
    oldestOverdueDays: overdues.length > 0 ? Math.max(...overdues.map((o: any) => o.overdue_days || 0)) : 0,
    restrictOnExpiry,
    creditPeriodEnabled: periodEnabled,
    creditPeriodDays,
    customerName: cust?.name || party?.name || custName || 'Customer'
  };
}
