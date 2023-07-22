import { queryClient } from "~/lib/query-client";
import { apiClient } from "./api-client";

export const getMxSpaceAggregateData = async () => {
  const data = await queryClient.fetchQuery({
    queryKey: ["mx-aggregate"],
    queryFn: async () => {
      return apiClient.aggregate.getAggregateData();
    },
    cacheTime: Infinity,

    staleTime: 1000 * 5,
  });

  return data;
};
