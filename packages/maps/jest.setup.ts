// Package-local mocks shared by both projects. jest.mock factories may only reference `mock*` names.

jest.mock('react-native-safe-area-context', () => {
  const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children?: unknown }) => children,
    useSafeAreaInsets: () => mockInsets,
    initialWindowMetrics: { insets: mockInsets, frame: { x: 0, y: 0, width: 375, height: 667 } },
  };
});

jest.mock('lucide-react-native', () => {
  const mockIcon = (name: string) => {
    const Icon = () => null;
    Icon.displayName = name;
    return Icon;
  };
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : mockIcon(String(name))) });
});

// Keys come back as-is (no i18next instance under Jest); the maps package only uses useTranslation.
jest.mock('@resgrid/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
