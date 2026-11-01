// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** A GPS location for a point in time of a specificed unit */
export interface UnitLocationInput {
  /** UnitId of the apparatus that the location is for */
  UnitId?: string | null;
  /** The timestamp of the location in UTC */
  Timestamp?: string | null;
  /** GPS Latitude of the Unit */
  Latitude?: string | null;
  /** GPS Longitude of the Unit */
  Longitude?: string | null;
  /** GPS Latitude\Longitude Accuracy of the Unit */
  Accuracy?: string | null;
  /** GPS Altitude of the Unit */
  Altitude?: string | null;
  /** GPS Altitude Accuracy of the Unit */
  AltitudeAccuracy?: string | null;
  /** GPS Speed of the Unit */
  Speed?: string | null;
  /** GPS Heading of the Unit */
  Heading?: string | null;
}
