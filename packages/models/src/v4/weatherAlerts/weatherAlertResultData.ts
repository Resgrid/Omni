export class WeatherAlertResultData {
  public WeatherAlertId: string = '';
  public DepartmentId: number = 0;
  public WeatherAlertSourceId: string = '';
  public ExternalId: string = '';
  public Sender: string = '';
  public Event: string = '';
  public AlertCategory: number = 0;
  public Severity: number = 0;
  public Urgency: number = 0;
  public Certainty: number = 0;
  public Status: number = 0;
  public Headline: string = '';
  public Description: string = '';
  public Instruction: string = '';
  public AreaDescription: string = '';
  public Polygon: string = '';
  public Geocodes: string = '';
  public CenterGeoLocation: string = '';
  public OnsetUtc: string | null = null;
  public ExpiresUtc: string | null = null;
  public EffectiveUtc: string = '';
  public SentUtc: string | null = null;
  public FirstSeenUtc: string = '';
  public LastUpdatedUtc: string = '';
  public ReferencesExternalId: string = '';
  public NotificationSent: boolean = false;
  public SystemMessageId: number | null = null;
  /** UTC instants for date math (Core); the *Utc strings above are display values. Absent from older servers. */
  public EffectiveOnUtc?: string;
  public ExpiresOnUtc?: string | null;
  public OnsetOnUtc?: string | null;
  public SentOnUtc?: string | null;
}
