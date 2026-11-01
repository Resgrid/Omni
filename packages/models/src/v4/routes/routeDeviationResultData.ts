/** Mirrors Core `RouteDeviationResultData`. */
export interface RouteDeviationResultData {
  RouteDeviationId: string;
  RouteInstanceId: string;
  DetectedOn: string;
  Latitude: number;
  Longitude: number;
  DeviationDistanceMeters: number;
  DeviationType: number;
  IsAcknowledged: boolean;
  AcknowledgedByUserId: string | null;
  AcknowledgedOn: string | null;
  Notes: string | null;
}
