import './test-setup';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Phone, Route } from 'lucide-react-native';
import React from 'react';

import { hidden } from '../../calls/__tests__/test-utils';
import { MapHighlights } from '../components/map-highlights';
import { MapPinDetails, MapPinPanel } from '../components/map-pin-details';
import { pin } from './fixtures';

const CALL = pin('c12', 0, { Title: 'Structure fire', InfoWindowContent: 'Smoke showing', Address: '12 Main St', Note: 'Gate code 1234', Latitude: 39.123456789, Longitude: -119.5 });

describe('MapPinDetails', () => {
  it('shows the pin as plain text with its kind, badges, rows and coordinates', () => {
    render(<MapPinDetails pin={CALL} kindLabel="Call" badges={['Current call']} actions={[]} onClose={jest.fn()} />);
    expect(screen.getByTestId('map-pin-kind')).toHaveTextContent('Call');
    expect(screen.getByTestId('map-pin-title')).toHaveTextContent('Structure fire');
    expect(screen.getByTestId('map-pin-badge')).toHaveTextContent('Current call');
    expect(screen.getByTestId('map-pin-info')).toHaveTextContent('Smoke showing');
    expect(screen.getByTestId('map-pin-note')).toHaveTextContent('map.pin_noteGate code 1234');
    expect(screen.getByTestId('map-pin-coordinates')).toHaveTextContent('39.123457, -119.500000');
    expect(screen.queryByTestId('map-pin-poi-type')).toBeNull();
  });

  it('runs the actions it is given and closes', () => {
    const onClose = jest.fn();
    const view = jest.fn();
    const route = jest.fn();
    render(
      <MapPinDetails
        pin={CALL}
        kindLabel="Call"
        actions={[
          { id: 'view-call', label: 'View', icon: Phone, onPress: view, primary: true },
          { id: 'directions', label: 'Route', icon: Route, onPress: route },
        ]}
        onClose={onClose}
      />
    );
    fireEvent.press(screen.getByTestId('map-pin-action-view-call'));
    fireEvent.press(screen.getByTestId('map-pin-action-directions'));
    fireEvent.press(screen.getByTestId('map-pin-close'));
    expect(view).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MapPinPanel', () => {
  it('is a bottom sheet on phones', () => {
    render(<MapPinPanel isOpen presentation="sheet" pin={CALL} kindLabel="Call" actions={[]} onClose={jest.fn()} />);
    expect(screen.getByTestId('map-pin-sheet', hidden)).toBeTruthy();
    expect(screen.getByTestId('map-pin-title', hidden)).toHaveTextContent('Structure fire');
    expect(screen.queryByTestId('map-pin-docked')).toBeNull();
  });

  it('is a docked card on wide layouts, and nothing when closed', () => {
    const { rerender } = render(<MapPinPanel isOpen presentation="docked" pin={CALL} kindLabel="Call" actions={[]} onClose={jest.fn()} />);
    expect(screen.getByTestId('map-pin-docked')).toBeTruthy();
    rerender(<MapPinPanel isOpen={false} presentation="docked" pin={CALL} kindLabel="Call" actions={[]} onClose={jest.fn()} />);
    expect(screen.queryByTestId('map-pin-docked')).toBeNull();
  });
});

describe('MapHighlights', () => {
  const colors = { activeCall: '#dc2626', activeUnit: '#3b82f6' };

  it('draws one halo per target and nothing without targets', () => {
    const { rerender } = render(<MapHighlights targets={[]} colors={colors} />);
    expect(screen.queryByTestId('mock-source-map-screen-highlights-source')).toBeNull();
    rerender(
      <MapHighlights
        targets={[
          { role: 'activeCall', pin: CALL },
          { role: 'activeUnit', pin: pin('u7', 1) },
        ]}
        colors={colors}
      />
    );
    expect(screen.getByTestId('mock-source-map-screen-highlights-source').props.accessibilityLabel).toBe('2');
  });
});
