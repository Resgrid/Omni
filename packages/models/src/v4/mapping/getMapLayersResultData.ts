import { type FeatureCollection } from 'geojson';

export class GetMapLayersResultData {
  public LayerJson: string = '';
  public Layers: GetMapLayersData[] = [];
}

export class GetMapLayersData {
  public Id: string = '';
  public DepartmentId: number = 0;
  public Name: string = '';
  public Type: number = 0;
  public Color: string = '';
  public IsSearchable: boolean = false;
  public IsOnByDefault: boolean = false;
  public AddedById: string = '';
  public AddedOn: string = '';
  public UpdatedById: string = '';
  public UpdatedOn: string = '';
  public Data: GetMapLayersDataInfo = new GetMapLayersDataInfo();
  /** What the layer is for; event layers carry the event's summary here (plain text). Absent from older servers. */
  public Description?: string | null = null;
  /** Event start (UTC, ISO 8601); null for a layer with no event dates. */
  public EventStartsOnUtc?: string | null = null;
  /** Event end (UTC, ISO 8601); null when open-ended or not an event layer. */
  public EventEndsOnUtc?: string | null = null;
  /** "none", "upcoming", "active" or "ended", relative to the request time. */
  public EventPhase?: string | null = null;
  public Organizer?: string | null = null;
  public ContactName?: string | null = null;
  public ContactPhone?: string | null = null;
  public ContactEmail?: string | null = null;
  /** The file the shapes were imported from (KML, KMZ or GeoJSON); blank for a drawn layer. */
  public SourceFileName?: string | null = null;
}

export class GetMapLayersDataInfo {
  public Type: string = '';
  /** Core serializes one GeoJSON FeatureCollection per layer. */
  public Features: FeatureCollection | null = null;
}
