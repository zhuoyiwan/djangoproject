import { useEffect, useState } from "react";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { PaginatedResponse, RequestState } from "../types";

type UsePaginatedResourceOptions<TItem, TQuery> = {
  accessToken: string;
  query: TQuery;
  initialSummary: string;
  missingTokenSummary: string;
  loadingSummary: string;
  successSummary: (page: PaginatedResponse<TItem>) => string;
  fetcher: (token: string, query: TQuery) => Promise<PaginatedResponse<TItem>>;
};

export function usePaginatedResource<TItem, TQuery>({
  accessToken,
  query,
  initialSummary,
  missingTokenSummary,
  loadingSummary,
  successSummary,
  fetcher,
}: UsePaginatedResourceOptions<TItem, TQuery>) {
  const [page, setPage] = useState<PaginatedResponse<TItem> | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [summary, setSummary] = useState(initialSummary);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!accessToken) {
      setPage(null);
      setState("idle");
      setSummary(initialSummary);
      return;
    }
    void refresh(query);
  }, [accessToken, queryKey]);

  async function refresh(queryOverride?: TQuery) {
    if (!accessToken) {
      setState("error");
      setSummary(missingTokenSummary);
      return null;
    }

    setState("loading");
    setSummary(loadingSummary);
    try {
      const response = await fetcher(accessToken, queryOverride ?? query);
      setPage(response);
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
    page,
    setPage,
    state,
    summary,
    refresh,
  };
}
