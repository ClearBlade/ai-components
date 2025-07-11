import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const componentSettingsFetcherFn = async (assetTypeId: string) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const query = {"PAGESIZE":25,"PAGENUM":1,"SORT":[{"ASC":"item_id"}],"FILTERS":[[{"EQ":[{"asset_type_id":assetTypeId}]}]]} 
  const queryParams = new URLSearchParams(query as unknown as Record<string, string>);

  const fetchComponentSettingsResponse = await fetch(`${url}/api/v/1/collection/${systemKey}/ai_components_ml_pipelines?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Clearblade-UserToken': userToken,
    },
  });

  if (!fetchComponentSettingsResponse.ok) {
    throw new Error(`Failed to fetch component settings: ${fetchComponentSettingsResponse.statusText}`);
  }

  const data = (await fetchComponentSettingsResponse.json()) as { DATA: {asset_type_id: string; feature_attributes: string[]; data_threshold: number, run_frequency: string, entities: Record<string, any>}[] };
  return data.DATA || [];
}

export function useFetchComponentSettings(assetTypeId: string) {
  const fetchResult = useQuery(['componentSettings'], () => componentSettingsFetcherFn(assetTypeId), {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
