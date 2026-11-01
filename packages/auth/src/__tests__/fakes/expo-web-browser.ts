// expo-web-browser fake: tests set the next auth-session result.
export interface FakeAuthSessionResult {
  type: string;
  url?: string;
}

let next: FakeAuthSessionResult | ((authorizeUrl: string, returnUrl: string) => FakeAuthSessionResult) = { type: 'cancel' };
export const calls: { authorizeUrl: string; returnUrl: string; options?: unknown }[] = [];
export const opened: string[] = [];

export function __setNextAuthSessionResult(result: FakeAuthSessionResult | ((authorizeUrl: string, returnUrl: string) => FakeAuthSessionResult)): void {
  next = result;
}

export function __resetWebBrowserFake(): void {
  next = { type: 'cancel' };
  calls.length = 0;
  opened.length = 0;
}

export async function openAuthSessionAsync(authorizeUrl: string, returnUrl: string, options?: unknown): Promise<FakeAuthSessionResult> {
  calls.push({ authorizeUrl, returnUrl, options });
  return typeof next === 'function' ? next(authorizeUrl, returnUrl) : next;
}

export async function openBrowserAsync(url: string): Promise<{ type: string }> {
  opened.push(url);
  return { type: 'opened' };
}

export function maybeCompleteAuthSession(): { type: string } {
  return { type: 'failed' };
}
