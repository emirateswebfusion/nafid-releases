import type React from 'react';
import type { InvoiceType } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';
import type { CustomerSuggestion, DirectoryRow } from '../customerDirectory';
import type { CustomerFieldState } from './useCustomerFieldState';

export interface CustomerFieldHandlersContext {
  fields: CustomerFieldState;
  filteredCustomerSuggestions: CustomerSuggestion[];
  invoiceType: InvoiceType;
  searchRef: React.RefObject<HTMLInputElement | null>;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
  applyPartyTier: (name: string, phone: string) => void;
  setLoyaltyCustomerData: React.Dispatch<React.SetStateAction<{ customerId: string | null; pointsBalance: number }>>;
  setCustomerSearchResults: React.Dispatch<React.SetStateAction<DirectoryRow[]>>;
}

/**
 * Picking a customer suggestion and keyboard navigation between the customer inputs
 * (name -> phone -> address -> GSTIN -> product search, arrows to move back).
 * Rebuilt every render; uses no React state of its own.
 */
export function useCustomerFieldHandlers(ctx: CustomerFieldHandlersContext) {
  const { filteredCustomerSuggestions, invoiceType, searchRef, updateActiveTab, applyPartyTier, setLoyaltyCustomerData, setCustomerSearchResults } = ctx;
  const {
    showCustomerDropdown, setShowCustomerDropdown, selectedCustomerIndex, setSelectedCustomerIndex,
    customerNameInputRef, customerPhoneInputRef, customerAddressInputRef, customerGstinInputRef,
    skipCustomerDropdownOnFocusRef, focusInputWithoutDropdown,
  } = ctx.fields;

  const selectCustomerSuggestion = (c: CustomerSuggestion) => {
    skipCustomerDropdownOnFocusRef.current = true;
    const cleanName = (c.name || '').trim().replace(/\s+/g, ' ');
    const cleanPhone = (c.phone || '').trim();
    const cleanAddress = (c.address || '').trim();

    updateActiveTab({
      customerId: c.customer_id || '',
      isStaffCustomer: Boolean(c.is_staff),
      // Rows may carry null ids; passed through unchanged as before.
      staffId: c.is_staff ? ((c.staff_id || c.customer_id) as string | undefined) : undefined,
      customerName: cleanName,
      customerPhone: cleanPhone,
      customerAddress: cleanAddress,
      customerGstin: c.gstin || c.customer_gstin || '',
    });
    applyPartyTier(cleanName, cleanPhone);
    if (c.customer_id) {
      setLoyaltyCustomerData({
        customerId: c.customer_id,
        pointsBalance: Number(c.current_points_balance) || 0,
      });
    }
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
    setTimeout(() => {
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    }, 40);
  };

  const handleCustomerNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCustomerDropdown && filteredCustomerSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev + 1) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev - 1 + filteredCustomerSuggestions.length) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCustomerSuggestions[selectedCustomerIndex]) {
          selectCustomerSuggestion(filteredCustomerSuggestions[selectedCustomerIndex]);
        } else {
          setShowCustomerDropdown(false);
          focusInputWithoutDropdown(customerPhoneInputRef.current);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCustomerDropdown(false);
        return;
      }
    }

    // Dropdown not showing or no suggestions
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        focusInputWithoutDropdown(customerPhoneInputRef.current);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  };

  const handleCustomerPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCustomerDropdown && filteredCustomerSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev + 1) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev - 1 + filteredCustomerSuggestions.length) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCustomerSuggestions[selectedCustomerIndex]) {
          selectCustomerSuggestion(filteredCustomerSuggestions[selectedCustomerIndex]);
        } else {
          setShowCustomerDropdown(false);
          customerAddressInputRef.current?.focus();
          customerAddressInputRef.current?.select();
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCustomerDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      customerAddressInputRef.current?.focus();
      customerAddressInputRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      focusInputWithoutDropdown(customerNameInputRef.current);
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        focusInputWithoutDropdown(customerNameInputRef.current);
      }
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        customerAddressInputRef.current?.focus();
        customerAddressInputRef.current?.select();
      }
    }
  };

  const handleCustomerAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (invoiceType === 'GST' && customerGstinInputRef.current) {
        customerGstinInputRef.current.focus();
        customerGstinInputRef.current.select();
      } else {
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        focusInputWithoutDropdown(customerPhoneInputRef.current);
      }
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        if (invoiceType === 'GST' && customerGstinInputRef.current) {
          customerGstinInputRef.current.focus();
          customerGstinInputRef.current.select();
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }
    }
  };

  const handleCustomerGstinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      customerAddressInputRef.current?.focus();
      customerAddressInputRef.current?.select();
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        customerAddressInputRef.current?.focus();
        customerAddressInputRef.current?.select();
      }
    }
  };

  return { selectCustomerSuggestion, handleCustomerNameKeyDown, handleCustomerPhoneKeyDown, handleCustomerAddressKeyDown, handleCustomerGstinKeyDown };
}

export type CustomerFieldHandlers = ReturnType<typeof useCustomerFieldHandlers>;
