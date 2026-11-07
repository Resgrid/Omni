import { BaseV4Request } from '../baseV4Request';

/** One menu or tab badge count (Core `Counts/GetBadgeCounts`). */
export class BadgeCountResultData {
  /** The count's key, as asked for (`calls`, `messages`, `chats`, `weather`, …). */
  public Key: string = '';
  public Count: number = 0;
  /** What the count is made of, when the parts mean something on their own (weather: `extreme`, `severe`). */
  public Breakdown?: Record<string, number> | null = null;
}

/**
 * The asked-for badge counts the caller can see, one entry each. A count that is missing (no permission, module or
 * feature flag off, a key this server does not know) shows no badge rather than 0.
 */
export class BadgeCountsResult extends BaseV4Request {
  public Data: BadgeCountResultData[] = [];
}
