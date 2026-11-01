import type { AxiosError } from 'axios';
import { Dimensions, Platform } from 'react-native';

import { showToast } from '../toast/store';
import { translate } from './i18n';

export const IS_IOS = Platform.OS === 'ios';
const { width, height } = Dimensions.get('screen');

export const WIDTH = width;
export const HEIGHT = height;

const ERROR_TOAST_DURATION_MS = 4000;

const fallbackMessage = (): string => translate('common.something_went_wrong', 'Something went wrong');

/**
 * Shows an API error as a toast. Never logs the raw response body: it can contain PII, and console
 * output is captured as Sentry breadcrumbs. The toast already surfaces what the user needs.
 */
export const showError = (error: Pick<AxiosError, 'response'> | null | undefined): string => {
  const description = extractError(error?.response?.data).trimEnd() || fallbackMessage();
  return showToast('error', description, translate('common.error', 'Error'), { duration: ERROR_TOAST_DURATION_MS });
};

export const showErrorMessage = (message?: string): string => {
  return showToast('error', message && message.trim().length > 0 ? message : fallbackMessage(), undefined, { duration: ERROR_TOAST_DURATION_MS });
};

export const extractError = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    const messages = data.map((item) => {
      return `  ${extractError(item)}`;
    });

    return `${messages.join('')}`;
  }

  if (typeof data === 'object' && data !== null) {
    const messages = Object.entries(data).map((item) => {
      const [key, value] = item;
      const separator = Array.isArray(value) ? ':\n ' : ': ';

      return `- ${key}${separator}${extractError(value)} \n `;
    });
    return `${messages.join('')} `;
  }
  return fallbackMessage();
};
