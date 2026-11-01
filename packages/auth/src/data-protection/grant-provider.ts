/**
 * Where the HTTP client finds the current Protected Data Grant header (Dispatch/Unit `grant-provider`, identical). A leaf
 * module: the grant store registers itself here and the header provider reads it, so neither imports the other.
 */
type GrantHeaderProvider = () => Record<string, string>;

let provider: GrantHeaderProvider | null = null;

/** Registered by the data-protection grant store at module load. */
export const setProtectedGrantProvider = (next: GrantHeaderProvider | null): void => {
  provider = next;
};

/**
 * The grant header, or an empty object when no grant is held or the provider throws. Never throws: a request must still
 * go out, it simply comes back with protected values redacted.
 */
export const readProtectedGrantHeaders = (): Record<string, string> => {
  if (!provider) {
    return {};
  }
  try {
    return provider();
  } catch {
    return {};
  }
};
