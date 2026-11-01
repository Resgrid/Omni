/** A map layer that is on-by-default, from Mapping/GetAllActiveLayers (RE1-T105). */
export class ActiveLayerResultData {
  public Id: string = '';
  public Name: string = '';
  /** "maplayer" (legacy vector layer) or "custommaplayer" (custom-map region layer). */
  public LayerSource: string = '';
  public Type: number = 0;
  public Color: string = '';
  public IsSearchable: boolean = false;
  public IsOnByDefault: boolean = false;
}
