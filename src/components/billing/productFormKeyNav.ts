import type React from 'react';

/** Enter in the quick product-create form moves to the next field (opening select triggers); Enter on the last field
 * clicks the form's submit button. Only inside an element marked `data-enter-nav`. */
export function handleFormKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Enter') return;
  if (e.defaultPrevented) return;
  const target = e.target as HTMLElement;
  const container = target.closest('[data-enter-nav]');
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
  const idx = Array.from(focusable).indexOf(target as HTMLElement);
  if (idx === -1) return;
  e.preventDefault();
  if (idx < focusable.length - 1) {
    const nextEl = focusable[idx + 1];
    nextEl?.focus();
    if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
  } else {
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
  }
}
