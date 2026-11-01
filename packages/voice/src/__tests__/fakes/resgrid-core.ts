// @resgrid/core for voice tests: a jest-mock logger and platform helpers that read the (fake or jest-expo) Platform.
// The real core index also loads Sentry, Countly and expo-router, which voice tests do not need.
import { Platform } from 'react-native';

export const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

export const isWeb = (): boolean => Platform.OS === 'web';
export const isIOS = (): boolean => Platform.OS === 'ios';
export const isAndroid = (): boolean => Platform.OS === 'android';
export const isNative = (): boolean => isIOS() || isAndroid();
export const isElectron = (): boolean => false;
