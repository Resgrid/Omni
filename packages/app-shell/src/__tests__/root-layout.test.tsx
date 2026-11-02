import { initSentry, resetSentryForTests } from '@resgrid/core';
import * as Sentry from '@sentry/react-native';
import { render } from '@testing-library/react-native';
import React from 'react';

import { ErrorBoundary } from '../root-layout';

describe('root ErrorBoundary', () => {
  afterEach(() => {
    resetSentryForTests();
  });

  it('reports the error a route failed to render with to Sentry, once', async () => {
    initSentry({ dsn: 'https://key@sentry.example.com/1' });
    const error = new Error('Cannot read properties of undefined (reading "Name")');
    const retry = jest.fn(() => Promise.resolve());

    const view = await render(<ErrorBoundary error={error} retry={retry} />);
    await view.rerender(<ErrorBoundary error={error} retry={retry} />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, { mechanism: { type: 'auto.expo_router.error_boundary', handled: true } });
  });
});
