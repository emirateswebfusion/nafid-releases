import { useEffect, useRef, useState } from 'react';

/**
 * Customer name/phone/address/GSTIN fields of the billing screen: the suggestion dropdown state, the input refs,
 * click-outside dismissal and keeping the highlighted suggestion scrolled into view.
 */
export function useCustomerFieldState() {
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(0);
  const customerNameContainerRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const customerPhoneInputRef = useRef<HTMLInputElement>(null);
  const customerAddressInputRef = useRef<HTMLInputElement>(null);
  const customerGstinInputRef = useRef<HTMLInputElement>(null);
  const skipCustomerDropdownOnFocusRef = useRef(false);
  const customerListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (customerListRef.current && showCustomerDropdown && selectedCustomerIndex >= 0) {
      const container = customerListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-customer-index="${selectedCustomerIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedCustomerIndex, showCustomerDropdown]);

  // Click outside to dismiss customer suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerNameContainerRef.current && !customerNameContainerRef.current.contains(e.target as Node) &&
        customerPhoneInputRef.current && !customerPhoneInputRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus a customer input without re-opening the suggestion dropdown.
  const focusInputWithoutDropdown = (inputEl: HTMLInputElement | null, selectAll = true) => {
    if (!inputEl) return;
    skipCustomerDropdownOnFocusRef.current = true;
    inputEl.focus();
    if (selectAll) inputEl.select();
    setTimeout(() => {
      skipCustomerDropdownOnFocusRef.current = false;
    }, 150);
  };

  return {
    showCustomerDropdown, setShowCustomerDropdown, selectedCustomerIndex, setSelectedCustomerIndex,
    customerNameContainerRef, customerDropdownRef, customerNameInputRef, customerPhoneInputRef,
    customerAddressInputRef, customerGstinInputRef, skipCustomerDropdownOnFocusRef, customerListRef, focusInputWithoutDropdown,
  };
}

export type CustomerFieldState = ReturnType<typeof useCustomerFieldState>;
