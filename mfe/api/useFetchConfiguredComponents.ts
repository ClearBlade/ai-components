import { AssetType } from "@clearblade/ia-mfe-core";
import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const configuredComponentsFetcherFn = async () => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const fetchConfiguredComponentsResponse = await fetch(`${url}/api/v/1/code/${systemKey}/fetchTableItems?id=components.read`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'components.read',
      body: {
        query: {
          filters: {
            id: "AnomalyDetection"
          }
        }
      }
    }),
  });

  if (!fetchConfiguredComponentsResponse.ok) {
    throw new Error(`Failed to fetch configured components: ${fetchConfiguredComponentsResponse.statusText}`);
  }

  const data = (await fetchConfiguredComponentsResponse.json()) as { results: { DATA: Record<string, any>[] } };
  return data.results.DATA || [];
}

export function useFetchConfiguredComponents() {
  const fetchResult = useQuery(['configuredComponents'], configuredComponentsFetcherFn, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
