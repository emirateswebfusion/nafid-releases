import { describe, it, expect } from 'vitest';
import {
  parsePartyRoles,
  hasPartyRole,
  isAllowedInBilling,
  isAllowedInPurchase,
  formatPartyRoles,
} from '../../src/data/partyRoles';
import {
  buildPartyCustomers,
  filterCustomerSuggestions,
  findMatchingParty,
} from '../../src/components/billing/customerDirectory';

describe('Party Roles System', () => {
  describe('parsePartyRoles', () => {
    it('defaults to CUSTOMER when empty or null', () => {
      expect(parsePartyRoles(null)).toEqual(['CUSTOMER']);
      expect(parsePartyRoles(undefined)).toEqual(['CUSTOMER']);
      expect(parsePartyRoles('')).toEqual(['CUSTOMER']);
      expect(parsePartyRoles('   ')).toEqual(['CUSTOMER']);
    });

    it('parses single role case-insensitively', () => {
      expect(parsePartyRoles('customer')).toEqual(['CUSTOMER']);
      expect(parsePartyRoles('SUPPLIER')).toEqual(['SUPPLIER']);
      expect(parsePartyRoles('staff')).toEqual(['STAFF']);
      expect(parsePartyRoles('custom')).toEqual(['CUSTOM']);
    });

    it('parses multi-roles separated by commas', () => {
      expect(parsePartyRoles('SUPPLIER,CUSTOMER')).toEqual(['SUPPLIER', 'CUSTOMER']);
      expect(parsePartyRoles('customer, supplier')).toEqual(['CUSTOMER', 'SUPPLIER']);
      expect(parsePartyRoles('CUSTOM, CUSTOMER, STAFF')).toEqual(['CUSTOM', 'CUSTOMER', 'STAFF']);
    });
  });

  describe('hasPartyRole', () => {
    it('accurately identifies roles for single and multi-role parties', () => {
      expect(hasPartyRole('CUSTOMER', 'CUSTOMER')).toBe(true);
      expect(hasPartyRole('CUSTOMER', 'SUPPLIER')).toBe(false);

      expect(hasPartyRole('SUPPLIER', 'SUPPLIER')).toBe(true);
      expect(hasPartyRole('SUPPLIER', 'CUSTOMER')).toBe(false);

      expect(hasPartyRole('SUPPLIER,CUSTOMER', 'SUPPLIER')).toBe(true);
      expect(hasPartyRole('SUPPLIER,CUSTOMER', 'CUSTOMER')).toBe(true);
      expect(hasPartyRole('SUPPLIER,CUSTOMER', 'STAFF')).toBe(false);
    });
  });

  describe('isAllowedInBilling', () => {
    it('strictly hides pure suppliers from POS billing', () => {
      expect(isAllowedInBilling('SUPPLIER')).toBe(false);
    });

    it('allows a supplier who is also a customer into POS billing', () => {
      expect(isAllowedInBilling('SUPPLIER,CUSTOMER')).toBe(true);
      expect(isAllowedInBilling('CUSTOMER,SUPPLIER')).toBe(true);
    });

    it('allows standard customers and other non-pure-suppliers', () => {
      expect(isAllowedInBilling('CUSTOMER')).toBe(true);
      expect(isAllowedInBilling(null)).toBe(true);
      expect(isAllowedInBilling('CUSTOM,CUSTOMER')).toBe(true);
      expect(isAllowedInBilling('CUSTOM')).toBe(true);
    });

    it('handles staff billing permission correctly', () => {
      expect(isAllowedInBilling('STAFF', false)).toBe(false);
      expect(isAllowedInBilling('STAFF', true)).toBe(true);
      // If marked as customer as well, always allowed
      expect(isAllowedInBilling('STAFF,CUSTOMER', false)).toBe(true);
    });
  });

  describe('isAllowedInPurchase', () => {
    it('allows pure suppliers and dual-role suppliers in purchase bills', () => {
      expect(isAllowedInPurchase('SUPPLIER')).toBe(true);
      expect(isAllowedInPurchase('SUPPLIER,CUSTOMER')).toBe(true);
      expect(isAllowedInPurchase('CUSTOMER,SUPPLIER')).toBe(true);
    });

    it('hides pure customers and non-suppliers from purchase bills', () => {
      expect(isAllowedInPurchase('CUSTOMER')).toBe(false);
      expect(isAllowedInPurchase('STAFF')).toBe(false);
      expect(isAllowedInPurchase('CUSTOM')).toBe(false);
      expect(isAllowedInPurchase(null)).toBe(false);
    });
  });

  describe('formatPartyRoles', () => {
    it('formats arrays into unique, trimmed, uppercase comma-separated strings', () => {
      expect(formatPartyRoles(['CUSTOMER'])).toBe('CUSTOMER');
      expect(formatPartyRoles(['supplier', 'customer'])).toBe('SUPPLIER,CUSTOMER');
      expect(formatPartyRoles(['CUSTOMER', 'CUSTOMER'])).toBe('CUSTOMER');
    });
  });

  describe('Billing Customer Directory Integration with Multi-Role Parties', () => {
    const pureSupplier = {
      party_id: 'p1',
      name: 'Kerala Agro Supplies',
      phone: '9847000001',
      party_type: 'SUPPLIER',
      balance: -5000,
    };

    const dualRoleSupplier = {
      party_id: 'p2',
      name: 'Modern Bakeries & Supplies',
      phone: '9847000002',
      party_type: 'SUPPLIER,CUSTOMER',
      balance: -2000,
    };

    const regularCustomer = {
      party_id: 'p3',
      name: 'Anil Kumar',
      phone: '9847000003',
      party_type: 'CUSTOMER',
      balance: 100,
    };

    it('buildPartyCustomers excludes pure supplier and includes dual role supplier', () => {
      const result = buildPartyCustomers([pureSupplier, dualRoleSupplier, regularCustomer], [], false);
      const names = result.map((r) => r.name);
      expect(names).not.toContain('Kerala Agro Supplies');
      expect(names).toContain('Modern Bakeries & Supplies');
      expect(names).toContain('Anil Kumar');
    });

    it('filterCustomerSuggestions only suggests dual-role supplier and customer, never pure supplier', () => {
      const partyCustomers = buildPartyCustomers([pureSupplier, dualRoleSupplier, regularCustomer], [], false);
      const partyMap = new Map();
      partyMap.set('modern bakeries & supplies', dualRoleSupplier);
      partyMap.set('kerala agro supplies', pureSupplier);
      partyMap.set('anil kumar', regularCustomer);

      const suggestions = filterCustomerSuggestions(
        { name: 'supplies', phone: '' },
        {
          staff: [],
          searchResults: [],
          customers: [],
          staffEnabled: false,
        },
        partyCustomers,
        partyMap
      );

      const suggestionNames = suggestions.map((s) => s.name);
      expect(suggestionNames).toContain('Modern Bakeries & Supplies');
      expect(suggestionNames).not.toContain('Kerala Agro Supplies');
    });

    it('findMatchingParty matches dual role supplier when typed, but never pure supplier', () => {
      const lists = {
        parties: [pureSupplier, dualRoleSupplier, regularCustomer],
        customers: [],
        searchResults: [],
        staffEnabled: false,
      };

      const matchSupplier = findMatchingParty(lists, 'Kerala Agro Supplies', '9847000001');
      expect(matchSupplier).toBeNull();

      const matchDualRole = findMatchingParty(lists, 'Modern Bakeries & Supplies', '9847000002');
      expect(matchDualRole).not.toBeNull();
      expect(matchDualRole?.name).toBe('Modern Bakeries & Supplies');
    });
  });
});
