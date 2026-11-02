import './test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import type { VariantId } from '@resgrid/config';
import { useMapMarkersStore, useNavigationEtaStore } from '@resgrid/data';
import { act, renderHook } from '@testing-library/react-native';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { useLiveMapPins } from '../hooks/use-live-map-pins';

/** The department map keeps navigating units' ETAs live where the app shows them (MapLibre plan §9.4). */
describe('useLiveMapPins live ETAs', () => {
  const fetchActiveNavigations = jest.fn(async () => undefined);

  const mount = async (variant: VariantId, flag: boolean) => {
    activateVariant(variant);
    featureFlagsStore.setState({ flags: flag ? ({ 'Navigation.InApp': { enabled: true } } as never) : {}, isLoaded: true });
    return renderHook(() => useLiveMapPins(false));
  };

  beforeEach(() => {
    fetchActiveNavigations.mockClear();
    useMapMarkersStore.setState({ markers: [], loading: {}, errors: {}, fetchedAt: {}, fetchMarkers: jest.fn(async () => undefined) });
    useNavigationEtaStore.setState({ fetchActiveNavigations });
  });

  // Still mounted here (RNTL unmounts after): reset inside act.
  afterEach(async () => {
    await act(() => {
      featureFlagsStore.setState({ flags: {} });
      useNavigationEtaStore.setState(useNavigationEtaStore.getInitialState());
    });
  });

  it('loads the ETAs on Dispatch and Big Board with Navigation.InApp', async () => {
    const dispatch = await mount('dispatch', true);
    expect(fetchActiveNavigations).toHaveBeenCalledWith({ bypassCache: true });
    await dispatch.unmount();
    fetchActiveNavigations.mockClear();
    await mount('bigboard', true);
    expect(fetchActiveNavigations).toHaveBeenCalledTimes(1);
  });

  it('loads nothing on Unit or Responder, or without the flag', async () => {
    const unit = await mount('unit', true);
    await unit.unmount();
    const responder = await mount('responder', true);
    await responder.unmount();
    await mount('dispatch', false);
    expect(fetchActiveNavigations).not.toHaveBeenCalled();
  });
});
