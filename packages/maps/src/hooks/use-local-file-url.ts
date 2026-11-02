/** iOS/Android: a downloaded pack file (`file://…`) loads as it is. The web resolves `opfs://` files (use-local-file-url.web.ts). */
export const useLocalFileUrl = (uri: string | null): string | null => uri;
