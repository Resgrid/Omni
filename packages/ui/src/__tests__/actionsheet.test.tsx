import { act, render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

// Unit's actionsheet guard, tested against a stand-in for gluestack's creator that records the props it receives.
const mockUIActionsheet = jest.fn();

jest.mock('@gluestack-ui/core/actionsheet/creator', () => ({
  createActionsheet: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted jest.mock factory
    const mockReact = require('react');

    const Root = (props: { children?: React.ReactNode }) => {
      mockUIActionsheet(props);
      return mockReact.createElement(mockReact.Fragment, null, props.children);
    };

    const passthrough = (props: { children?: React.ReactNode }) => mockReact.createElement(mockReact.Fragment, null, props.children);

    Object.assign(Root, {
      Content: passthrough,
      Item: passthrough,
      ItemText: passthrough,
      DragIndicator: passthrough,
      DragIndicatorWrapper: passthrough,
      Backdrop: passthrough,
      ScrollView: passthrough,
      VirtualizedList: passthrough,
      FlatList: passthrough,
      SectionList: passthrough,
      SectionHeaderText: passthrough,
      Icon: passthrough,
    });

    return Root;
  },
}));

// eslint-disable-next-line import/first
import { Actionsheet } from '../actionsheet';

const lastProps = () => mockUIActionsheet.mock.calls[mockUIActionsheet.mock.calls.length - 1][0] as { closeOnOverlayClick: boolean; useRNModal?: boolean };

describe('Actionsheet backdrop guard (Unit)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUIActionsheet.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The backdrop mounts full-screen the instant isOpen flips, so the tap that opened the
  // sheet could land on it and close the sheet again.
  it('keeps overlay-click dismissal disabled immediately after opening', () => {
    render(
      <Actionsheet isOpen={true}>
        <Text>content</Text>
      </Actionsheet>
    );

    expect(lastProps().closeOnOverlayClick).toBe(false);
  });

  it('arms overlay-click dismissal once the open animation window has passed', () => {
    render(
      <Actionsheet isOpen={true}>
        <Text>content</Text>
      </Actionsheet>
    );

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(lastProps().closeOnOverlayClick).toBe(true);
  });

  it('re-disarms when the sheet closes so the next open is guarded again', () => {
    const sheet = (isOpen: boolean) => (
      <Actionsheet isOpen={isOpen}>
        <Text>content</Text>
      </Actionsheet>
    );
    const { rerender } = render(sheet(true));

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(lastProps().closeOnOverlayClick).toBe(true);

    rerender(sheet(false));
    expect(lastProps().closeOnOverlayClick).toBe(false);

    rerender(sheet(true));
    expect(lastProps().closeOnOverlayClick).toBe(false);
  });

  it('never arms overlay-click dismissal when the caller opted out', () => {
    render(
      <Actionsheet isOpen={true} closeOnOverlayClick={false}>
        <Text>content</Text>
      </Actionsheet>
    );

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(lastProps().closeOnOverlayClick).toBe(false);
  });

  it('leaves uncontrolled sheets armed since they have no isOpen to gate on', () => {
    render(
      <Actionsheet defaultIsOpen={true}>
        <Text>content</Text>
      </Actionsheet>
    );

    expect(lastProps().closeOnOverlayClick).toBe(true);
  });

  it('portals to the app root by default; a native Modal is opt-in (useRNModal)', () => {
    const { rerender } = render(
      <Actionsheet isOpen={true}>
        <Text>content</Text>
      </Actionsheet>
    );
    expect(lastProps().useRNModal).toBeUndefined();

    rerender(
      <Actionsheet isOpen={true} useRNModal>
        <Text>content</Text>
      </Actionsheet>
    );
    expect(lastProps().useRNModal).toBe(true);
  });
});
