import { describe, it, expect } from 'vitest';
import {
  buildPartyCustomers,
  buildPartyMap,
  filterCustomerSuggestions,
  findMatchingParty,
} from '../../src/components/billing/customerDirectory';

const parties = [
  { party_id: 'p1', name: 'Anas Traders', phone: '9995544789', balance: 120, party_type: 'CUSTOMER', gstin: '32ABC' },
  { party_id: 'p2', name: 'Steel Supplier', phone: '9000000001', balance: -50, party_type: 'SUPPLIER' },
  { party_id: 'p3', name: 'Ravi (staff)', phone: '9000000002', balance: 10, party_type: 'STAFF' },
  { party_id: 'p4', name: '..Baby', phone: '', balance: 0, party_type: 'CUSTOMER' },
];
const customers = [
  { customer_id: 'c1', name: 'anas traders', phone: '9995544789', current_points_balance: '42' },
  { customer_id: 'c2', name: 'Ansi', phone: '7994403980', current_points_balance: 0, balance: 59.73 },
];
const staff = [{ staff_id: 's1', name: 'Anil', phone: '9111111111', staff_code: 'ST1', role_designation: 'Cashier', current_balance: -25 }];

describe('party map', () => {
  it('indexes by name, phone and name|phone, never suppliers, staff only when enabled', () => {
    const off = buildPartyMap(parties, false);
    expect(off.get('anas traders')?.party_id).toBe('p1');
    expect(off.get('9995544789')?.party_id).toBe('p1');
    expect(off.get('anas traders|9995544789')?.party_id).toBe('p1');
    expect(off.get('steel supplier')).toBeUndefined();
    expect(off.get('ravi (staff)')).toBeUndefined();
    expect(buildPartyMap(parties, true).get('ravi (staff)')?.party_id).toBe('p3');
  });
});

describe('party customers', () => {
  it('copies the matching customer id and points onto the party row', () => {
    const rows = buildPartyCustomers(parties, customers, false);
    expect(rows.map(r => r.party_id)).toEqual(['p1', 'p4']);
    expect(rows[0]).toMatchObject({ customer_id: 'c1', current_points_balance: 42, customer_gstin: '32ABC', is_staff: false });
    expect(rows[1].current_points_balance).toBeUndefined();
  });
});

describe('customer suggestions', () => {
  const lists = (staffEnabled: boolean) => ({ staff, searchResults: [], customers, staffEnabled });
  const suggest = (name: string, phone: string, staffEnabled = false) => {
    const pc = buildPartyCustomers(parties, customers, staffEnabled);
    return filterCustomerSuggestions({ name, phone }, lists(staffEnabled), pc, buildPartyMap(parties, staffEnabled));
  };

  it('is empty when nothing is typed', () => {
    expect(suggest('  ', '')).toEqual([]);
  });
  it('matches name substrings case-insensitively and de-duplicates name|phone', () => {
    const names = suggest('an', '').map(s => s.name);
    expect(names).toEqual(['Anas Traders', 'Ansi']);
  });
  it('includes staff first only when staff credit billing is on', () => {
    expect(suggest('ani', '').map(s => s.name)).toEqual([]);
    const on = suggest('ani', '', true);
    expect(on[0]).toMatchObject({ name: 'Anil', is_staff: true, staff_code: 'ST1', balance: -25 });
  });
  it('matches phone substrings and keeps the row balance', () => {
    expect(suggest('', '79944')).toEqual([expect.objectContaining({ customer_id: 'c2', balance: 59.73 })]);
  });
  it('never suggests suppliers', () => {
    expect(suggest('steel', '')).toEqual([]);
  });
  it('stops at 15 suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ customer_id: `m${i}`, name: `Mani ${i}`, phone: `80000000${i}` }));
    const out = filterCustomerSuggestions({ name: 'mani', phone: '' }, { staff: [], searchResults: [], customers: many, staffEnabled: false }, [], new Map());
    expect(out).toHaveLength(15);
  });
});

describe('findMatchingParty', () => {
  const lists = { parties, customers, searchResults: [], staffEnabled: false };
  it('returns null when nothing is typed', () => {
    expect(findMatchingParty(lists, '', '')).toBeNull();
  });
  it('matches an exact phone and adds the customer id and points', () => {
    expect(findMatchingParty(lists, '', '9995544789')).toMatchObject({ party_id: 'p1', customer_id: 'c1', current_points_balance: 42 });
  });
  it('matches a name ignoring leading dots and spaces', () => {
    expect(findMatchingParty(lists, 'Baby')).toMatchObject({ party_id: 'p4' });
  });
  it('does not match partial names, suppliers, or staff when disabled', () => {
    expect(findMatchingParty(lists, 'anas')).toBeNull();
    expect(findMatchingParty(lists, 'Steel Supplier')).toBeNull();
    expect(findMatchingParty(lists, 'Ravi (staff)')).toBeNull();
    expect(findMatchingParty({ ...lists, staffEnabled: true }, 'Ravi (staff)')).toMatchObject({ party_id: 'p3' });
  });
  it('falls back to customers when no party matches', () => {
    expect(findMatchingParty(lists, 'ansi')).toMatchObject({ customer_id: 'c2' });
  });
});
