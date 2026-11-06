import { FloatToast } from '../../ui/FloatToast';

export interface BillingToastsProps {
  checkoutSuccess: false | "saved" | "printed";
  hardwareError: string | null;
  infoToast: string | null;
  quotationSuccess: string | null;
  returnSuccessToast: string | null;
  upiAccountToast: string | null;
}

/** Floating toasts at the bottom left of billing: hardware error, checkout / quotation / return success, info and UPI account messages. */
export function BillingToasts({ checkoutSuccess, hardwareError, infoToast, quotationSuccess, returnSuccessToast, upiAccountToast }: BillingToastsProps) {
  return (
    <div className="fixed bottom-5 left-5 z-[999999] flex flex-col items-start gap-2.5 w-full max-w-md pointer-events-none">
      <FloatToast message={hardwareError} type="error" title="HARDWARE & PRINT ALERT" stackItem />
      <FloatToast message={checkoutSuccess ? (checkoutSuccess === 'printed' ? 'Invoice completed & Receipt printed!' : 'Invoice saved successfully!') : null} title="CHECKOUT COMPLETE" stackItem />
      <FloatToast message={quotationSuccess} type="success" title="QUOTATION SAVED" stackItem />
      <FloatToast message={returnSuccessToast} title="RETURN PROCESSED" stackItem />
      <FloatToast message={infoToast} type="info" stackItem />
      <FloatToast message={upiAccountToast} type="info" title="UPI Account Selected" stackItem />
    </div>
  );
}
