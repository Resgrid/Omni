import { handleSamlCallbackUrl } from '@resgrid/auth';
import { getSentryNavigationIntegration, isSentryInitialized, logger, registerNavigationReadyCheck } from '@resgrid/core';
import * as Linking from 'expo-linking';
import { useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';

type NavigationRef = ReturnType<typeof useNavigationContainerRef>;

let navigationRef: NavigationRef | null = null;
let sentryRegisteredFor: NavigationRef | null = null;

/** Registers the root navigation container with Sentry once Sentry is up (called again by the Sentry init step). */
export function registerNavigationWithSentry(): void {
  if (!navigationRef || sentryRegisteredFor === navigationRef || !isSentryInitialized()) {
    return;
  }
  try {
    getSentryNavigationIntegration().registerNavigationContainer(navigationRef);
    sentryRegisteredFor = navigationRef;
  } catch (error) {
    logger.warn({ message: 'Could not register navigation with Sentry', context: { error } });
  }
}

/**
 * Publishes the root navigation container's readiness (`routerPushWithRetry` waits on it): a push before the root
 * layout mounts is silently dropped by expo-router, which is how cold-start notification taps used to land on the
 * home screen. Mount once, in the root layout.
 */
export function useNavigationReadyRegistration(): void {
  const ref = useNavigationContainerRef();
  useEffect(() => {
    navigationRef = ref;
    registerNavigationReadyCheck(() => {
      try {
        return ref?.isReady?.() ?? false;
      } catch {
        return false;
      }
    });
    registerNavigationWithSentry();
    return () => {
      registerNavigationReadyCheck(null);
      if (navigationRef === ref) {
        navigationRef = null;
      }
    };
  }, [ref]);
}

const isSamlCallback = (url: string | null | undefined): url is string => typeof url === 'string' && url.includes('saml_response');

/** SAML SSO returns by deep link (cold and warm start), Responder's root-layout handling. */
export function useSamlDeepLinks(): void {
  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL()
      .then((url) => {
        if (!cancelled && isSamlCallback(url)) {
          return handleSamlCallbackUrl(url);
        }
        return undefined;
      })
      .catch((error: unknown) => logger.error({ message: 'SAML cold-start deep link failed', context: { error } }));
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isSamlCallback(url)) {
        handleSamlCallbackUrl(url).catch((error: unknown) => logger.error({ message: 'SAML deep link failed', context: { error } }));
      }
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}

/** Test helper. Not for app code. */
export function resetNavigationRegistrationForTests(): void {
  navigationRef = null;
  sentryRegisteredFor = null;
  registerNavigationReadyCheck(null);
}
