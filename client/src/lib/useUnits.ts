import { useQuery } from '@tanstack/react-query';
import { settingsApi } from './api';

const DEFAULT_UNITS = ['kg', 'g', 'tonne', 'L', 'mL', 'pcs', 'm', 'm²', 'm³', 'boîte', 'palette', 'sac'];

export function useUnits(): string[] {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const units: string[] = data?.data?.units ?? [];
  return units.length > 0 ? units : DEFAULT_UNITS;
}
