import { useEffect } from 'react';
import { hasBridge } from '../../../data/client';
import { pricingTiersApi } from '../../../data/pricingTiers';
import type { UploadEntityType } from '../dataUploadTypes';
import type { DataUploadState } from './useDataUploadState';

export interface UseDataUploadEffectsContext {
  defaultEntity: UploadEntityType;
  du: DataUploadState;
  isOpen: boolean;
  setEntityType: (type: UploadEntityType) => void;
  tenantId: string | null;
}

/** Resets the modal and loads available pricing tiers whenever it opens. */
export function useDataUploadEffects(ctx: UseDataUploadEffectsContext) {
  const { defaultEntity, du, isOpen, setEntityType, tenantId } = ctx;
  const { setAvailableTiers, setFileName, setMessage, setParsedRows } = du;

  useEffect(() => {
    if (isOpen) {
      setEntityType(defaultEntity);
      setParsedRows([]);
      setFileName('');
      setMessage(null);

      if (hasBridge('dbGetPricingTiers')) {
        const tid = tenantId || 'global';
        pricingTiersApi.getPricingTiers(tid).then((res: any) => {
          if (Array.isArray(res)) {
            setAvailableTiers(res.filter((t: any) => !t.is_deleted));
          }
        }).catch((err: any) => console.warn('Failed to load pricing tiers for upload modal:', err));
      }
    }
  }, [isOpen, defaultEntity, tenantId, setAvailableTiers, setEntityType, setFileName, setMessage, setParsedRows]);
}
