export class CallFileResultData {
  public Id: string = '';
  public CallId: string = '';
  public Type: number = 0;
  public FileName: string = '';
  public Data: string = '';
  public Name: string = '';
  public Size: number = 0;
  public Url: string = '';
  public UserId: string = '';
  public Timestamp: string = '';
  public Mime: string = '';
  /** Advanced Data Protection: true when the server withheld protected fields; absent from older servers. */
  public IsProtected?: boolean;
  public ProtectedReason?: string | null;
}
