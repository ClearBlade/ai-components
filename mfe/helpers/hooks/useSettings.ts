import { useQuery } from "react-query";

const fetchSettings = async (id: string): Promise<Record<string, unknown>> => {
  const ids = id.split('_');
  const url = `https://raw.githubusercontent.com/ClearBlade/ai-components/main/mfe/ai_components_${ids[0]}/settings.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch settings');
  }
  const settings = await res.json();
  if (typeof settings !== 'object') {
    throw new Error(`Invalid settings format: Expected an object but received ${typeof settings}`);
  }
  return settings;
}

export function useSettings(id: string) {
  return useQuery({
    queryKey: ['settings', id],
    queryFn: () => fetchSettings(id),
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  })
}