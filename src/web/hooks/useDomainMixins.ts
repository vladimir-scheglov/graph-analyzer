import { useMemo } from "react";
import { useModelIndex } from "./useModelIndex";
import {
  computeDomainMixins,
  DomainMixinsResult,
} from "../lib/model/domain-mixins";

export interface UseDomainMixinsResult {
  data: DomainMixinsResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Карта миксинов для конкретного домена.
 * Использует уже закэшированный ModelIndex.
 */
export function useDomainMixins(
  domainId: string | null,
): UseDomainMixinsResult {
  const { index, loading, error } = useModelIndex();

  const data = useMemo(() => {
    if (!index || !domainId) return null;
    return computeDomainMixins(domainId, index);
  }, [index, domainId]);

  return { data, loading, error };
}
