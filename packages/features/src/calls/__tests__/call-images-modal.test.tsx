import './test-setup';

import { type CallDetailRecord, useCallDetailStore } from '@resgrid/data';
import { CallFileResultData } from '@resgrid/models';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { CallImagesModal } from '../components/call-media-modals';
import { activateVariant, hidden } from './test-utils';

const callImage = (fields: Partial<CallFileResultData>): CallFileResultData => Object.assign(new CallFileResultData(), { CallId: '5', Type: 2, ...fields });

const IMAGES = [callImage({ Id: 'i1', Name: 'Front of house', Url: 'https://files.test/i1.jpg' }), callImage({ Id: 'i2', Name: '', Data: 'AAAA', Mime: 'image/png' }), callImage({ Id: 'i3', Name: 'Withheld' })];

const RECORD: CallDetailRecord = { call: null, extraData: null, notes: [], images: IMAGES, files: null, audio: null, fetchedAt: 0 };

beforeEach(() => {
  activateVariant('responder');
  useCallDetailStore.setState({ details: { '5': RECORD }, queuedFiles: {}, fetchCallImages: jest.fn(async () => undefined) });
});

describe('CallImagesModal', () => {
  it('opens a tapped thumbnail full screen, with its name, and closes back to the list', async () => {
    await render(<CallImagesModal isOpen onClose={jest.fn()} callId="5" />);

    expect(screen.queryByTestId('call-image-viewer-image', hidden)).toBeNull();

    await fireEvent.press(screen.getByTestId('call-image-i1-open', hidden));

    expect(screen.getByTestId('call-image-viewer-image', hidden).props.source).toEqual({ uri: 'https://files.test/i1.jpg' });
    expect(screen.getByTestId('call-image-viewer-caption', hidden)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('call-image-viewer-close', hidden));

    expect(screen.queryByTestId('call-image-viewer-image', hidden)).toBeNull();
    expect(screen.getByTestId('call-images-modal', hidden)).toBeTruthy();
  });

  it('opens an image the server sent inline, and a nameless one without a caption', async () => {
    await render(<CallImagesModal isOpen onClose={jest.fn()} callId="5" />);

    await fireEvent.press(screen.getByTestId('call-image-i2-open', hidden));

    expect(screen.getByTestId('call-image-viewer-image', hidden).props.source).toEqual({ uri: 'data:image/png;base64,AAAA' });
    expect(screen.getByTestId('call-image-viewer-image', hidden).props.accessibilityLabel).toBe('callImages.image_alt');
    expect(screen.queryByTestId('call-image-viewer-caption', hidden)).toBeNull();
  });

  it('has nothing to open for an image without a picture', async () => {
    await render(<CallImagesModal isOpen onClose={jest.fn()} callId="5" />);

    expect(screen.getByTestId('call-image-i3', hidden)).toBeTruthy();
    expect(screen.queryByTestId('call-image-i3-open', hidden)).toBeNull();
  });

  it('puts the camera and gallery buttons one under the other, so neither label wraps', async () => {
    await render(<CallImagesModal isOpen onClose={jest.fn()} callId="5" />);

    const actions = screen.getByTestId('call-images-actions', hidden);

    expect(StyleSheet.flatten(actions.props.style).flexDirection).toBeUndefined();
    expect(within(actions).getByTestId('call-images-camera', hidden)).toBeTruthy();
    expect(within(actions).getByTestId('call-images-gallery', hidden)).toBeTruthy();
  });
});
