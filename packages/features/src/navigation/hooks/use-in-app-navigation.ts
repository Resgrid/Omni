import { FeatureFlagKeys, useFeatureFlag } from '@resgrid/auth';
import { useMapRouting } from '@resgrid/maps/provider/context';

/**
 * In-app turn-by-turn may be offered (MapLibre plan §8.1, D26): the variant has `maps.navigationInApp`, the server says
 * its routing provider can navigate (Valhalla or Mapbox, navigation enabled — config `NavigationAvailable`) and the
 * department's `Navigation.InApp` flag is on. Older servers send nothing, so it stays off and Directions keep opening
 * the crew's navigation app.
 */
export const useInAppNavigationAvailable = (): boolean => {
  const routing = useMapRouting();
  const flag = useFeatureFlag(FeatureFlagKeys.NavigationInApp);
  return routing.navigationAvailable && flag;
};
