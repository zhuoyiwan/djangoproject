import { useEffect, useState } from "react";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { RequestState } from "../types";

type UseResourceDetailOptions<TItem> = {
  accessToken: string;
  resourceId?: number | null;
  initialSummary: string;
  missingTokenSummary: string;
  loadingSummary: (resourceId: number) => string;
  successSummary: (item: TItem) => string;
  fetcher: (token: string, resourceId: number) => Promise<TItem>;
};

export function useResourceDetail<TItem>({
  accessToken,
  resourceId,
  initialSummary,
  missingTokenSummary,
  loadingSummary,
  successSummary,
  fetcher,
}: UseResourceDetailOptions<TItem>) {
  const [item, setItem] = useState<TItem | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [summary, setSummary] = useState(initialSummary);

  useEffect(() => {
    if (!accessToken || resourceId === undefined || resourceId === null) {
      return;
    }
    void refresh(resourceId);
  }, [accessToken, resourceId]);

  async function refresh(idOverride?: number) {
    const activeId = idOverride ?? resourceId;
    if (!accessToken) {
      setState("error");
      setSummary(missingTokenSummary);
      return null;
    }
    if (activeId === undefined || activeId === null) {
      setItem(null);
      setState("idle");
      setSummary(initialSummary);
      return null;
    }

    setState("loading");
    setSummary(loadingSummary(activeId));
    try {
      const response = await fetcher(accessToken, activeId);
      setItem(response);
      setState("success");
      setSummary(successSummary(response));
      return response;
    } catch (error) {
      setState("error");
      setSummary(getUserFacingErrorMessage(error));
      return null;
    }
  }

  return {
    item,
    setItem,
    state,
    setState,
    summary,
    setSummary,
    refresh,
  };
}
