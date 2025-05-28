import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const componentEntitiesFetcherFn = async () => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const fetchComponentEntitiesResponse = await fetch(`${url}/api/v/1/collection/${systemKey}/ai_components_entities`, {
    method: 'GET',
    headers: {
      'Clearblade-UserToken': userToken,
    },
  });

  if (!fetchComponentEntitiesResponse.ok) {
    throw new Error(`Failed to fetch component entities: ${fetchComponentEntitiesResponse.statusText}`);
  }

  const data = (await fetchComponentEntitiesResponse.json()) as { DATA: {id: string; entities: Record<string, any>}[] };
  return data.DATA || [];
}

export function useFetchComponentEntities() {
  const fetchResult = useQuery(['componentEntities'], componentEntitiesFetcherFn, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
