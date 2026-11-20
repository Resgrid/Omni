import { type CallContactResultData } from './callSiteInfoResult';

/** Where a call came from (Core `CallSources`, `CallResultData.CallSource`; persisted, never renumbered). */
export enum CallSources {
  /** A person in a call form. */
  User = 1,
  EmailImport = 2,
  AudioImport = 3,
  Chatbot = 4,
  Imported = 5,
  /** An SMS, email, chat or webhook intake channel (saved pending; M0323). */
  Intake = 6,
  /** Enhanced AI voice intake on the department's dedicated number (saved pending; M0323). */
  VoiceIntake = 7,
}

/** Where an intake message arrived (Core `IntakeChannelTypes`, `CallResultData.IntakeChannelType`; persisted, never renumbered). */
export enum IntakeChannelTypes {
  Sms = 1,
  Email = 2,
  WhatsApp = 3,
  Slack = 4,
  Teams = 5,
  Telegram = 6,
  Discord = 7,
  GoogleChat = 8,
  /** A signed HTTPS webhook (CAD bridges, alarm panels, other systems). */
  Webhook = 9,
  /** A phone call to the department's dedicated number (Enhanced AI voice intake). */
  Voice = 10,
}

export class CallResultData {
  public CallId: string = '';
  public Priority: number = 0;
  public Name: string = '';
  public Nature: string = '';
  public Note: string = '';
  public Address: string = '';
  /** The POI (any type) the call location was picked from (Core M0322); null when none, undefined from older servers. */
  public LocationPoiId?: number | null;
  /** That POI's name; null when none, undefined from older servers. */
  public LocationPoiName?: string | null;
  public DestinationPoiId: number | null = null;
  public DestinationName: string = '';
  /**
   * The destination POI's address, or (Core M0322) the free destination's address when the call has no destination POI
   * (`DestinationPoiId` and `DestinationName` null).
   */
  public DestinationAddress: string = '';
  public DestinationTypeName: string = '';
  public DestinationPoiTypeId: number | null = null;
  /** The destination POI's position, or (Core M0322) the free destination's point when the call has no destination POI. */
  public DestinationLatitude: number | null = null;
  public DestinationLongitude: number | null = null;
  /** The free destination point, "lat,lon" (no destination POI); null when none, undefined from older servers. */
  public DestinationGeolocation?: string | null;
  /** The free destination's what3words; null when none, undefined from older servers. */
  public DestinationWhat3Words?: string | null;
  /** The pre-defined route (an Active route plan with a start and an end) the call runs; null when none, undefined from older servers. */
  public RoutePlanId?: string | null;
  /** That route's name: filled by GetCall and GetActiveCalls, may be null from other lists. */
  public RoutePlanName?: string | null;
  public Geolocation: string = '';
  public LoggedOn: string = '';
  /**
   * Core CallStates (int): 0 Active, 1 Closed, 2 Cancelled, 3 Unfounded, 4 Founded, 5 Minor, 6 Transferred,
   * 7 False Alarm, 8 Pending (saved, not dispatched). A scheduled call is Active with a future DispatchedOnUtc.
   */
  public State: number = 0;
  public Number: string = '';
  public NotesCount: number = 0;
  public AudioCount: number = 0;
  public ImgagesCount: number = 0;
  public FileCount: number = 0;
  public What3Words: string = '';
  public ContactName: string = '';
  public ContactInfo: string = '';
  public ReferenceId: string = '';
  /** The map book page for the call's location; blank when none was entered, undefined from older servers. */
  public MapPage?: string | null;
  public ExternalId: string = '';
  public IncidentId: string = '';
  public AudioFileId: string = '';
  public Type: string = 'No Type';
  /** Id of the department call type the call was logged with (survives a rename); null when it matches none, undefined from older servers. */
  public TypeId?: string | null;
  /** The department's uploaded icon for the call's type (absolute URL, anonymous GET, 128x128 PNG); null when none was uploaded or from older servers. */
  public TypeIconUrl?: string | null = null;
  /** The built-in map icon the call's type picked (lowercase MAP_ICONS key, e.g. "fire"); null when none or from older servers. */
  public TypeMapIcon?: string | null = null;
  /**
   * Current alarm level (1-based). Only moves above 1 when the call has been escalated through a
   * run card; the server normalises pre-run-card calls to 1.
   */
  public AlarmLevel: number = 1;
  /** The run card driving this call's dispatch, or null when no card matched. */
  public ActiveRunCardId: number | null = null;
  /** The recurring call schedule that created this call; null for other calls, undefined from older servers. */
  public RecurringCallId?: number | null;
  /** Where the call came from (`CallSources`); undefined from older servers. */
  public CallSource?: number;
  /**
   * The intake channel's name for calls with CallSource Intake or VoiceIntake (GetCall, GetActiveCalls, GetPendingCalls, GetCalls);
   * null when the channel has no name, was deleted or for other calls; undefined from older servers.
   */
  public IntakeChannelName?: string | null;
  /** The intake channel's type (`IntakeChannelTypes`) for calls with CallSource Intake or VoiceIntake; null otherwise, undefined from older servers. */
  public IntakeChannelType?: number | null;
  public LoggedOnUtc: string = '';
  /**
   * The user who logged the call; null when none did (an email or API import), undefined from older servers. Core lets a
   * department admin or this user edit the call, add resources, reschedule it or dispatch it now.
   */
  public ReportingUserId?: string | null;
  /** When the call was closed, in the department's time; null while it is open, undefined from older servers. */
  public ClosedOn?: string | null;
  /** When the call was closed, UTC; null while it is open, undefined from older servers. */
  public ClosedOnUtc?: string | null;
  /** Who closed the call; null while it is open, undefined from older servers. */
  public ClosedByUserId?: string | null;
  public DispatchedOn: string = '';
  public DispatchedOnUtc: string = '';
  public ScheduledOn: string = '';
  public ScheduledOnUtc: string = '';
  public Latitude: string = '';
  public Longitude: string = '';
  public Protocols: unknown[] = [];
  public UdfValues: unknown[] = [];
  public CheckInTimersEnabled: boolean = false;
  /**
   * Contacts linked to the call (primary first) with pre-plan / alert / hazard indicators. Populated by
   * GetCall and GetActiveCalls; absent on other list endpoints. GetCallSiteInfo carries the full site knowledge.
   */
  public Contacts?: CallContactResultData[];
  /**
   * Catalog field ids the server withheld from this response (ADP plan 7.2). Empty for a
   * department without the addon, and empty again once a grant reveals the record.
   *
   * Left undefined rather than defaulted to `[]`: a server that never sends the list must stay
   * distinguishable from one that sends an empty one, because isFieldRedacted() only falls back to
   * sentinel-sniffing for the former.
   */
  public RedactedFields?: string[];
  /** Advanced Data Protection: true when the server withheld protected fields; absent from older servers. */
  public IsProtected?: boolean;
  public ProtectedReason?: string | null;
  /** 42 CFR Part 2 consent flag (Core); absent from older servers. */
  public Part2ConsentOnFile?: boolean;
}
