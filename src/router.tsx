import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data doesn't need a network round-trip on every remount/tab switch -
        // treat it as fresh for a short window so navigating around the CRM
        // (leads <-> pipeline <-> properties, tab switches, etc.) reuses the
        // cache instead of re-fetching identical data. Individual hooks can
        // still override this with a longer/shorter staleTime where useful.
        staleTime: 20_000,
        // Keep cached data around for a while after a query stops being used
        // (e.g. leaving a lead's page) so navigating back is instant.
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
