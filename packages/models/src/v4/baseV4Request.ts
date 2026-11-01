/**
 * Fields every Core v4 response envelope carries (`StandardApiResponseV4Base`). `Status` is a string
 * (`success | failure | not_found | created | updated | deleted | queued`) and `not_found` arrives with HTTP 200,
 * so callers must check `Status`, not just the HTTP code. Result classes extend this and add `Data`.
 */
export class BaseV4Request {
  public PageSize: number = 0;
  /** Page number for paged lists; absent from older servers. */
  public Page?: number;
  public Timestamp: string = '';
  public Version: string = '';
  public Node: string = '';
  public RequestId: string = '';
  public Status: string = '';
  public Environment: string = '';
  public PreviousPageUrl?: string | null;
  public NextPageUrl?: string | null;
}
