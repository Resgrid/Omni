export function parse(url: string): { queryParams: Record<string, string> } {
  const query = url.includes('?') ? url.substring(url.indexOf('?') + 1).split('#')[0] : '';
  const queryParams: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) queryParams[key] = value;
  return { queryParams };
}
