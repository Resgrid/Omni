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
  /** Capability keys of the POI (Dispatch; Core branch `poi-capabilities`, not yet on develop). Absent from current servers. */
  public Capabilities?: string[];
}
