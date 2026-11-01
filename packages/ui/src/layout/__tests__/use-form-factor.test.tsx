import { render, renderHook, screen } from '@testing-library/react-native';
import React from 'react';
import { Platform, Text, useWindowDimensions } from 'react-native';

import { pickResponsive, Responsive } from '../responsive';
import { computeFormFactor, FormFactorProvider, useFormFactor } from '../use-form-factor';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));

const mockDimensions = useWindowDimensions as unknown as jest.Mock;
const setWindow = (width: number, height: number) => mockDimensions.mockReturnValue({ width, height, scale: 2, fontScale: 1 });

const native = (width: number, height: number) => computeFormFactor({ width, height, platform: 'ios', isElectron: false });
const web = (width: number, height: number) => computeFormFactor({ width, height, platform: 'web', isElectron: false });

describe('computeFormFactor (omni-plan §5.4)', () => {
  it('is a phone below a 600 shortest side, in either orientation', () => {
    expect(native(390, 844).formFactor).toBe('phone');
    expect(native(844, 390).formFactor).toBe('phone');
    expect(native(599, 1200).formFactor).toBe('phone');
  });

  it('is a tablet at a 600+ shortest side', () => {
    expect(native(600, 960).formFactor).toBe('tablet');
    expect(native(1366, 1024).formFactor).toBe('tablet');
  });

  it('flags a landscape tablet as a landscape board, but never a phone', () => {
    expect(native(1180, 820)).toMatchObject({ formFactor: 'tablet', isLandscape: true, isLandscapeBoard: true });
    expect(native(820, 1180).isLandscapeBoard).toBe(false);
    expect(native(844, 390)).toMatchObject({ isLandscape: true, isLandscapeBoard: false });
  });

  it('is a desktop on web/Electron at 1024+ width only', () => {
    expect(web(1024, 700)).toMatchObject({ formFactor: 'desktop', isDesktop: true });
    expect(web(1023, 700).formFactor).toBe('tablet');
    expect(web(800, 500).formFactor).toBe('phone');
    expect(computeFormFactor({ width: 1280, height: 800, platform: 'web', isElectron: true })).toMatchObject({ formFactor: 'desktop', isElectron: true, isDesktop: true });
    // A large native tablet is not a desktop.
    expect(native(1366, 1024)).toMatchObject({ formFactor: 'tablet', isDesktop: false });
  });

  it('is a wall board above 1920 wide or in kiosk mode', () => {
    expect(web(1921, 1080)).toMatchObject({ formFactor: 'wall', isWall: true, isDesktop: true });
    expect(web(1920, 1080).formFactor).toBe('desktop');
    expect(computeFormFactor({ width: 1280, height: 720, platform: 'android', isElectron: false, kiosk: true })).toMatchObject({ formFactor: 'wall', isDesktop: false });
  });
});

describe('useFormFactor', () => {
  afterEach(() => {
    setWindow(390, 844);
  });

  it('recomputes on resize/rotation', () => {
    setWindow(390, 844);
    const { result, rerender } = renderHook(() => useFormFactor());
    expect(result.current.formFactor).toBe('phone');

    setWindow(1194, 834);
    rerender({});
    expect(result.current).toMatchObject({ formFactor: 'tablet', isLandscapeBoard: true });
  });

  it('takes kiosk mode from a FormFactorProvider', () => {
    setWindow(1280, 720);
    const wrapper = ({ children }: { children: React.ReactNode }) => <FormFactorProvider kiosk>{children}</FormFactorProvider>;

    const { result } = renderHook(() => useFormFactor(), { wrapper });

    expect(result.current.formFactor).toBe('wall');
  });

  it('is never Electron on native', () => {
    expect(Platform.OS).not.toBe('web');
    const { result } = renderHook(() => useFormFactor());

    expect(result.current.isElectron).toBe(false);
  });
});

describe('Responsive', () => {
  it('falls back to the next smaller form factor', () => {
    expect(pickResponsive('wall', { phone: 1, tablet: 2 })).toBe(2);
    expect(pickResponsive('desktop', { phone: 1, desktop: 3 })).toBe(3);
    expect(pickResponsive('tablet', { phone: 1, desktop: 3 })).toBe(1);
  });

  it('renders the branch for the current form factor', () => {
    setWindow(820, 1180);
    render(<Responsive phone={<Text>list</Text>} tablet={<Text>split</Text>} />);

    expect(screen.getByText('split')).toBeTruthy();
    expect(screen.queryByText('list')).toBeNull();
  });
});
