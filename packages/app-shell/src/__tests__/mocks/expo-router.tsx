// expo-router stand-in: navigators render their children (Tabs also renders a button per visible screen) and record
// what they were given, so tests can assert the generated Tabs.Screen list. Paths and history are driven by tests.
import React, { type ReactElement, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export interface MockTabScreen {
  name: string;
  options: Record<string, unknown>;
}

export const mockNavigationState = {
  pathname: '/',
  segments: [] as string[],
  canGoBack: false,
  /** What the Slot renders (the current route's screen). */
  slot: null as ReactNode,
  tabs: null as null | { screens: MockTabScreen[]; screenOptions: unknown; screenListeners?: (props: { route: { name: string } }) => unknown },
};

export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => mockNavigationState.canGoBack),
};

export const useRouter = (): typeof router => router;
export const usePathname = (): string => mockNavigationState.pathname;
export const useSegments = (): string[] => mockNavigationState.segments;

const navigationRef = { isReady: jest.fn(() => true), current: null };
export const useNavigationContainerRef = (): typeof navigationRef => navigationRef;

export function Stack(): ReactElement {
  return <View testID="mock-stack" />;
}

export function Redirect({ href }: { href: string }): ReactElement {
  return <Text testID="mock-redirect">{href}</Text>;
}

export function Slot(): ReactElement {
  return <View testID="mock-slot">{mockNavigationState.slot}</View>;
}

function TabsScreen(): null {
  return null;
}

export function Tabs({ children, screenOptions, screenListeners }: { children?: ReactNode; screenOptions?: unknown; screenListeners?: (props: { route: { name: string } }) => unknown }): ReactElement {
  const screens: MockTabScreen[] = React.Children.toArray(children).map((child) => {
    const element = child as ReactElement<{ name: string; options?: Record<string, unknown> }>;
    return { name: element.props.name, options: element.props.options ?? {} };
  });
  mockNavigationState.tabs = { screens, screenOptions, screenListeners };
  screens.forEach((screen) => screenListeners?.({ route: { name: screen.name } }));
  return (
    <View testID="mock-tabs">
      {screens
        .filter((screen) => screen.options.href !== null && screen.options.tabBarButton === undefined)
        .map((screen) => (
          <Pressable key={screen.name} testID={String(screen.options.tabBarButtonTestID ?? screen.name)}>
            <Text>{String(screen.options.title ?? screen.name)}</Text>
          </Pressable>
        ))}
    </View>
  );
}
Tabs.Screen = TabsScreen;

export function ThemeProvider({ children }: { children?: ReactNode }): ReactElement {
  return <>{children}</>;
}

export const DarkTheme = { dark: true };
export const DefaultTheme = { dark: false };

export function ErrorBoundary(): null {
  return null;
}

export function resetMockNavigation(): void {
  mockNavigationState.pathname = '/';
  mockNavigationState.segments = [];
  mockNavigationState.canGoBack = false;
  mockNavigationState.slot = null;
  mockNavigationState.tabs = null;
  Object.values(router).forEach((fn) => fn.mockClear());
}
