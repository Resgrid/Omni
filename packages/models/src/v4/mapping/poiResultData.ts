export class PoiResultData {
  public PoiId: number = 0;
  public PoiTypeId: number = 0;
  public PoiTypeName: string = '';
  public Name: string = '';
  public Address: string = '';
  public Note: string = '';
  public Latitude: number = 0;
  public Longitude: number = 0;
  public Color: string = '';
  public ImagePath: string = '';
  public Marker: string = '';
  public IsDestination: boolean = false;
  public PoiImage?: string;
  /** Absolute URL of the POI type's uploaded icon (128x128 transparent PNG, anonymous GET). Null when none; undefined from older servers. */
  public IconUrl?: string | null = null;
  /** Ids of the department capabilities the POI offers (`GetPoiCapabilities`), in the department's order. Absent from older servers. */
  public CapabilityIds?: string[];
  /** The names of `CapabilityIds`, same order (e.g. "Cath Lab"). Absent from older servers. */
  public Capabilities?: string[];
  /** PoiAvailabilityStatuses: 0 open, 1 limited, 2 diversion, 3 closed. Absent (open) from older servers. */
  public AvailabilityStatus?: number;
  /** Capability ids the destination cannot provide right now. */
  public UnavailableCapabilityIds?: string[];
  /** What the destination reported (e.g. "ED capacity overload"). */
  public AvailabilityNote?: string | null;
  /** When the current report was set (UTC ISO), or null when open. */
  public AvailabilitySetOnUtc?: string | null;
  /** When the current report lapses (UTC ISO); null when open or until changed. */
  public AvailabilityExpiresOnUtc?: string | null;
}
