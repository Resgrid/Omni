import { analyticsService } from '@resgrid/core';
import { renderHook } from '@testing-library/react-native';

import { mockNavigationState, resetMockNavigation } from '../../__tests__/mocks/expo-router';
import { screenNameFromSegments, useScreenViewTracking } from '../screen-views';

describe('screen view tracking', () => {
  beforeEach(() => {
    resetMockNavigation();
  });

  it('names a view by its route pattern, without route groups or ids', () => {
    expect(screenNameFromSegments(['(app)', 'calls', '[id]'])).toBe('/calls/[id]');
    expect(screenNameFromSegments(['(auth)', 'login'])).toBe('/login');
    expect(screenNameFromSegments(['(app)'])).toBe('/');
    expect(screenNameFromSegments([])).toBe('/');
  });

  it('records a view on every route change, and not again while the route stays', async () => {
    const trackView = jest.spyOn(analyticsService, 'trackView').mockImplementation(() => undefined);
    mockNavigationState.segments = ['(app)'];
    const hook = await renderHook(() => useScreenViewTracking());
    expect(trackView).toHaveBeenLastCalledWith('/');

    mockNavigationState.segments = ['(app)', 'calls', '[id]'];
    await hook.rerender(undefined);
    await hook.rerender(undefined);
    expect(trackView).toHaveBeenCalledTimes(2);
    expect(trackView).toHaveBeenLastCalledWith('/calls/[id]');
    trackView.mockRestore();
  });
});
