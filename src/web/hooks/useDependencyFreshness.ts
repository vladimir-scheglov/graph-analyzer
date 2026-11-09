import { useEffect } from "react";
import { useModelIndex } from "./useModelIndex";
import { useOutdatedDomains } from "./useOutdatedDomains";
import { useGraphStore } from "../state/useGraphStore";
import { readRemoteInfo } from "../state/initial";
import { computeFreshness } from "../lib/model/dependency-freshness";

/**
 * Заполняет store.freshnessMap:
 *   domainId → сколько его ссылок указывают на домены,
 *              которые обновились на сервере (кэш устарел).
 *
 * Требует: загруженный ModelIndex + remote-режим + useOutdatedDomains.
 * В local/hybrid-режиме outdated.size === 0 → карта пустая, бейджи не показываются.
 */
export function useDependencyFreshness(): void {
  const { index } = useModelIndex();
  const remoteInfo = readRemoteInfo();
  const { outdated } = useOutdatedDomains(remoteInfo);
  const setFreshness = useGraphStore((s) => s.setFreshnessMap);

  useEffect(() => {
    if (!index || outdated.size === 0) {
      setFreshness(new Map());
      return;
    }

    const map = new Map<string, number>();

    outdated.forEach((info: any, changedDomainId: string) => {
      // computeFreshness: для домена C возвращает [{ domainId: D, refs: [...] }],
      // где D ссылается на C. То есть у D есть stale-ссылки, потому что C обновился.
      const report = computeFreshness(
        index,
        changedDomainId,
        info?.serverVersion || "",
      );
      for (const { domainId: staleDomain, refs } of report.staleDomains) {
        map.set(staleDomain, (map.get(staleDomain) || 0) + refs.length);
      }
    });

    setFreshness(map);
  }, [index, outdated, setFreshness]);
}
