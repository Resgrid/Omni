import { getActiveVariant } from '@resgrid/config';
import { type Href, router } from 'expo-router';

/** The variant's home route (`shell.homeRoute`: `/home` for the drawer apps, `/` for Unit and IC). */
export const homeHref = (): string => {
  try {
    return getActiveVariant().shell.homeRoute;
  } catch {
    return '/';
  }
};

/** `replace`, never `push`, after a sign-in: pushing left the login form on the stack and Android back returned to it (Responder). */
export const replaceRoute = (href: string): void => {
  router.replace(href as Href);
};

export const pushRoute = (href: string): void => {
  router.push(href as Href);
};

/** Back when there is somewhere to go back to (a pushed screen), else replace with the fallback (a deep link or the web). */
export const goBackOr = (fallback: string): void => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as Href);
  }
};
