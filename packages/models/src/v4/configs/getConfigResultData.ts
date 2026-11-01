export class GetConfigResultData {
  public W3WKey: string = '';
  public GoogleMapsKey: string = '';
  public EventingUrl: string = '';
  public LoggingKey: string = '';
  public MapUrl: string = '';
  public MapAttribution: string = '';
  public OpenWeatherApiKey: string = '';
  public DirectionsMapKey: string = '';
  public PersonnelLocationStaleSeconds: number = 300;
  public UnitLocationStaleSeconds: number = 300;
  public PersonnelLocationMinMeters: number = 15;
  public UnitLocationMinMeters: number = 15;
  public NovuBackendApiUrl: string = '';
  public NovuSocketUrl: string = '';
  public NovuApplicationId: string = '';
  public AnalyticsApiKey: string = '';
  public AnalyticsHost: string = '';
  /** Firebase web app for browser and desktop push; absent or empty while Core has web push off. */
  public WebPushApiKey?: string;
  public WebPushAuthDomain?: string;
  public WebPushProjectId?: string;
  public WebPushMessagingSenderId?: string;
  public WebPushAppId?: string;
  public WebPushVapidKey?: string;
  /** Department default map center latitude — every map opens here when it has nothing better. */
  public MapCenterLatitude: number = 0;
  /** Department default map center longitude. */
  public MapCenterLongitude: number = 0;
  /** Zoom level for department-wide maps. */
  public MapCenterZoomLevel: number = 9;
  /** Department base map style (mapbox:// url) for the light theme. */
  public MapDayStyleUrl: string = '';
  /** Department base map style (mapbox:// url) for the dark theme. */
  public MapNightStyleUrl: string = '';
  /** Server-supplied public Mapbox token for this app ('' = keep the built-in token). */
  public AppMapboxAccessToken: string = '';
  /** True when the department's own Mapbox account (token and custom style) is in effect; its style then waits for that token. */
  public IsDepartmentMapOverride: boolean = false;
  // MapLibre plan §5.4 (additive; absent on servers before MapLibre P1 — clients then derive a style from MapDayStyleUrl).
  /** "maplibre" on servers that serve MapLibre-ready styles. */
  public MapRenderer?: string;
  /** Signed GetStyle URL for the light theme. */
  public MapLibreStyleUrlDay?: string;
  /** Signed GetStyle URL for the dark theme. */
  public MapLibreStyleUrlNight?: string;
  /** Raster XYZ tile URL for fallback/static rendering. */
  public MapRasterTileUrl?: string;
  /** Signed static map URL template. */
  public StaticMapUrlTemplate?: string;
  /** Live traffic overlay availability and tile URL. */
  public TrafficAvailable?: boolean;
  public TrafficTileUrl?: string;
  public TrafficRefreshSeconds?: number;
  /** In-app navigation availability (Navigation.InApp flag + provider support). */
  public NavigationAvailable?: boolean;
  // MapLibre plan §19 offline maps (additive).
  public OfflineMapsAvailable?: boolean;
  /** Signed URL of Mapping/GetOfflineManifest. */
  public OfflineManifestUrl?: string;
  public AmbientCacheMaxBytes?: number;
  /**
   * Time-in-status thresholds keyed by the status's canonical base type. Empty means the department
   * has configured none and nothing on the board is flagged.
   */
  public UnitStatusThresholds: UnitStatusThresholdData[] = [];
  /**
   * When acknowledging or muting a status timer alert needs a reason (UnitStatusAlertNoteRequirement): 0 optional,
   * 1 required at the alert level, 2 required for warnings and alerts. Missing on servers that predate it.
   */
  public UnitStatusAlertNoteRequirement?: number = 0;
  /** Department sets statuses with a two-second press and hold instead of tap + Next/Submit. */
  public StatusHoldToConfirm?: boolean = false;
  /** Map provider/style overrides (Core GetConfigResultData); absent from older servers. */
  public NavigationMapKey?: string;
  public MapProvider?: string;
  public MapStyleUrl?: string;
  public MapAccessToken?: string;
  public NovuEnvironmentId?: string;
  /** Run-card dispatch recommendations (Dispatch). Absent from older servers. */
  public DispatchRunCardsEnabled?: boolean;
  /** DispatchRecommendationModes. */
  public DispatchRecommendationMode?: number;
  public DispatchRecommendationAutoDispatch?: boolean;
  /** Always true on current servers; Omni ships only the modern sound set. */
  public EnableModernApplicationSounds?: boolean;
}

/** Time-in-status threshold for one unit status base type (Core UnitStatusThresholdData). */
export class UnitStatusThresholdData {
  public BaseType: number = 0;
  public WarnSeconds: number = 0;
  public AlertSeconds: number = 0;
}
