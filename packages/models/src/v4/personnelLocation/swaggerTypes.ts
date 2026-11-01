// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** A GPS location for a point in time of a specificed person */
export interface PersonnelLocationInput {
  /** PersonId of the person that the location is for */
  UserId?: string | null;
  /** The timestamp of the location in UTC */
  Timestamp?: string | null;
  /** GPS Latitude of the Person */
  Latitude?: string | null;
  /** GPS Longitude of the Person */
  Longitude?: string | null;
  /** GPS Latitude\Longitude Accuracy of the Person */
  Accuracy?: string | null;
  /** GPS Altitude of the Person */
  Altitude?: string | null;
  /** GPS Altitude Accuracy of the Person */
  AltitudeAccuracy?: string | null;
  /** GPS Speed of the Person */
  Speed?: string | null;
  /** GPS Heading of the Person */
  Heading?: string | null;
}
