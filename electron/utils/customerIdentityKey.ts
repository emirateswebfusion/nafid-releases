export const customerNameKey = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const customerPhoneKey = (value: string | null | undefined) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : digits;
};
