import { act, render, screen } from '@testing-library/react-native';
import React, { createContext, type ReactNode, useContext } from 'react';
import { Text } from 'react-native';

import { RegisteredBanners } from '../../shell/overlays';
import { RegisteredProviders } from '../../shell/registered-providers';
import { getShellProviders, registerShellBanner, registerShellProvider, resetShellSlotsForTests } from '../slots';

const Trail = createContext<readonly string[]>([]);

/** A provider that appends its name to the trail, so the test can read the nesting order from the innermost child. */
const providerNamed = (name: string) =>
  function NamedProvider({ children }: { children?: ReactNode }) {
    const outer = useContext(Trail);
    return <Trail.Provider value={[...outer, name]}>{children}</Trail.Provider>;
  };

function TrailProbe() {
  return <Text testID="trail">{useContext(Trail).join('>')}</Text>;
}

describe('registerShellProvider', () => {
  beforeEach(() => resetShellSlotsForTests());

  it('nests providers outermost first by order, then registration order', () => {
    registerShellProvider('status', providerNamed('status'));
    registerShellProvider('maps', providerNamed('maps'), { order: -10 });
    registerShellProvider('chat', providerNamed('chat'));

    render(
      <RegisteredProviders>
        <TrailProbe />
      </RegisteredProviders>
    );
    expect(screen.getByTestId('trail')).toHaveTextContent('maps>status>chat');
  });

  it('replaces a provider registered under the same id, keeping one entry', () => {
    registerShellProvider('status', providerNamed('default-status'));
    registerShellProvider('status', providerNamed('unit-status'));

    expect(getShellProviders().map((entry) => entry.id)).toEqual(['status']);
    render(
      <RegisteredProviders>
        <TrailProbe />
      </RegisteredProviders>
    );
    expect(screen.getByTestId('trail')).toHaveTextContent('unit-status');
  });

  it('the disposer removes exactly its own registration', () => {
    const removeFirst = registerShellProvider('status', providerNamed('first'));
    registerShellProvider('status', providerNamed('second'));
    removeFirst();
    expect(getShellProviders()).toHaveLength(1);

    const removeMaps = registerShellProvider('maps', providerNamed('maps'));
    removeMaps();
    expect(getShellProviders().map((entry) => entry.id)).toEqual(['status']);
  });

  it('renders its children unchanged when nothing is registered', () => {
    render(
      <RegisteredProviders>
        <TrailProbe />
      </RegisteredProviders>
    );
    expect(screen.getByTestId('trail')).toHaveTextContent('');
  });
});

describe('registerShellBanner', () => {
  beforeEach(() => resetShellSlotsForTests());

  it('stacks registered banners under the app bar, replacing by id; the disposer removes exactly its own', () => {
    const First = () => <Text testID="banner">first</Text>;
    const Second = () => <Text testID="banner">second</Text>;
    const Replacement = () => <Text testID="banner">replacement</Text>;
    registerShellBanner('a', First);
    const removeB = registerShellBanner('b', Second);
    registerShellBanner('a', Replacement);

    const view = render(<RegisteredBanners />);
    expect(screen.getAllByTestId('banner').map((node) => node.props.children)).toEqual(['second', 'replacement']);

    act(() => removeB());
    view.rerender(<RegisteredBanners />);
    expect(screen.getAllByTestId('banner').map((node) => node.props.children)).toEqual(['replacement']);
  });
});
