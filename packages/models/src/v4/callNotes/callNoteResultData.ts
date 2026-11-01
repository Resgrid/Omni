export class CallNoteResultData {
  public CallId: string = '';
  public CallNoteId: string = '';
  public UserId: string = '';
  public Source: number = 0;
  public TimestampFormatted: string = '';
  public Timestamp: string = '';
  public TimestampUtc: string = '';
  public Note: string = '';
  public Latitude: number | null = null;
  public Longitude: number | null = null;
  public FullName: string = '';
  /** Advanced Data Protection: true when the server withheld protected fields; absent from older servers. */
  public IsProtected?: boolean;
  public ProtectedReason?: string | null;
}
