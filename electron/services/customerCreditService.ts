import type { CreditInvoice, CustomerCreditRow, EnrichedCreditInvoice, LedgerRow, ServiceDb } from './typesB.js';
import * as partyLedgerSql from '../db/statements/partyLedger.js';
import { CHECKOUT_PAYMENT_SUFFIXES, invoiceCreditTerms } from './partyLedgerService.js';

/** Customer credit status: limits, overdue invoices and restriction decisions used by checkout and the customer screens. */

export function computeCustomerCreditStatusSync(db: ServiceDb, tenantId: string, customerId: string, invoices: CreditInvoice[]) {
  // 1. Fetch customer credit configuration
  const customer: Partial<CustomerCreditRow> = partyLedgerSql.findOneCustomerByPhoneAndCustomerId(db).get(customerId, tenantId) as CustomerCreditRow || {};

  const partyBalance = Number(customer.party_balance ?? 0);
  const creditPeriodEnabled = Boolean(customer.credit_period_enabled ?? customer.party_credit_period_enabled ?? false);
  const creditPeriodDays = Number(customer.credit_period_days ?? customer.party_credit_period_days ?? 30) || 30;
  const now = new Date();

  // If party balance is <= 0, customer owes nothing (all settled)
  const isSettled = partyBalance <= 0;

  // 2. Payments from the party's ledger rows (the rows its balance is made of). A credit bill owes its credit
  //    portion (same rule as the ledger) less later payments whose reference is the bill number, and less whatever its
  //    own checkout rows (<bill>-PAY / -CASH / -UPI / -CARD / -BANK / -CHEQUE) record beyond the payment the bill
  //    itself shows. Other payments and return credits, and any bill's overpayment, go to the oldest open bills first;
  //    a used return credit (-ADJ-) or a refund (-REFUND) cancels the return credit it belongs to.
  //    nafid-server src/db/repositories/customerCredit.ts is a cross-app copy of this rule.
  let ledgerRows: LedgerRow[] = [];
  if (customer.party_id) {
    ledgerRows = partyLedgerSql.findPartyLedgerByPartyId5(db).all(customer.party_id, tenantId) as LedgerRow[];
  }

  // 3. Credit bills, oldest first for FIFO allocation
  const creditInvoices = invoices
    .map((inv: CreditInvoice) => ({ inv, terms: invoiceCreditTerms(inv) }))
    .filter(({ terms }) => terms.isCredit)
    .sort((a, b) => new Date(a.inv.created_at).getTime() - new Date(b.inv.created_at).getTime());

  const billNumbers = new Set(creditInvoices.map(({ inv }) => (inv.invoice_number || '').trim()).filter(Boolean));
  const checkoutRefOwner = new Map<string, string>();
  for (const no of billNumbers) for (const suffix of CHECKOUT_PAYMENT_SUFFIXES) checkoutRefOwner.set(`${no}-${suffix}`, no);

  const checkoutPaid = new Map<string, number>();
  const laterPaid = new Map<string, number>();
  let pool = 0;
  for (const row of ledgerRows) {
    const ref = (row.reference_number || '').trim();
    const debit = Number(row.debit_amount) || 0;
    const credit = Number(row.credit_amount) || 0;
    if (debit > 0) {
      const owner = checkoutRefOwner.get(ref);
      if (owner) checkoutPaid.set(owner, (checkoutPaid.get(owner) || 0) + debit);
      else if (billNumbers.has(ref)) laterPaid.set(ref, (laterPaid.get(ref) || 0) + debit);
      else if (ref !== 'OPENING-BALANCE') pool += debit;
    }
    if (credit > 0 && (/-REFUND$/i.test(ref) || /-ADJ-/i.test(ref))) pool -= credit;
  }
  let unallocatedPool = Math.max(0, pool);
  const directPayment = (invNum: string, terms: ReturnType<typeof invoiceCreditTerms>) =>
    (laterPaid.get(invNum) || 0) + Math.max(0, (checkoutPaid.get(invNum) || 0) - terms.paid);
  // A bill paid beyond its credit: the excess pays the other open bills, oldest first.
  for (const { inv, terms } of creditInvoices) {
    unallocatedPool += Math.max(0, directPayment((inv.invoice_number || '').trim(), terms) - terms.creditPortion);
  }

  const billAllocations = new Map<string, { outstanding: number; dueDate: Date | null; isOverdue: boolean; overdueDays: number; remainingDays: number; status: string }>();

  for (const { inv, terms } of creditInvoices) {
    const invNum = (inv.invoice_number || '').trim();
    const billCreditTotal = terms.creditPortion;

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

    const directPay = directPayment(invNum, terms);
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
    let status: string;

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

  return invoices.map((inv: CreditInvoice) => {
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

export function checkCustomerOverdueSync(db: ServiceDb, tenantId: string, customerId?: string, custPhone?: string, custName?: string) {
  let cust: CustomerCreditRow | null | undefined = null;
  if (customerId) {
    cust = partyLedgerSql.findCustomersByCustomerId(db).get(customerId, tenantId) as CustomerCreditRow | null | undefined;
  }
  if (!cust && custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      cust = partyLedgerSql.findCustomersByPhone(db).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`) as CustomerCreditRow | null | undefined;
    } else {
      cust = partyLedgerSql.findCustomersByPhone2(db).get(tenantId, custPhone) as CustomerCreditRow | null | undefined;
    }
  }
  if (!cust && custName) {
    cust = partyLedgerSql.findCustomers(db).get(tenantId, custName.trim().toLowerCase()) as CustomerCreditRow | null | undefined;
  }

  let party: CustomerCreditRow | null | undefined = null;
  if (custPhone) {
    const cleanDigits = custPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      party = partyLedgerSql.findOnePartyByPhone(db).get(tenantId, custPhone, `%${cleanDigits.slice(-10)}`) as CustomerCreditRow | null | undefined;
    } else {
      party = partyLedgerSql.findOnePartyByPhone2(db).get(tenantId, custPhone) as CustomerCreditRow | null | undefined;
    }
  }
  if (!party && custName) {
    party = partyLedgerSql.findOneParty(db).get(tenantId, custName.trim().toLowerCase()) as CustomerCreditRow | null | undefined;
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
  ) as CreditInvoice[];

  const enriched = computeCustomerCreditStatusSync(db, tenantId, cId || pId, invs);
  const overdues = enriched.filter((i: EnrichedCreditInvoice) => i.is_overdue);

  return {
    isOverdue: overdues.length > 0,
    overdueCount: overdues.length,
    overdueAmount: overdues.reduce((acc: number, curr: EnrichedCreditInvoice) => acc + (Number(curr.outstanding_amount) || 0), 0),
    oldestOverdueDays: overdues.length > 0 ? Math.max(...overdues.map((o: EnrichedCreditInvoice) => o.overdue_days || 0)) : 0,
    restrictOnExpiry,
    creditPeriodEnabled: periodEnabled,
    creditPeriodDays,
    customerName: cust?.name || party?.name || custName || 'Customer'
  };
}
