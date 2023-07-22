import { QueryCache, QueryClient } from "@tanstack/query-core";

const queryCache = new QueryCache({});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      cacheTime: 1000 * 20,
    },
  },
});
