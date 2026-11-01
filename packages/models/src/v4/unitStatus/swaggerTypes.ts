// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Object inputs for setting a users Status/Action. If this object is used in an operation that sets a status for the current user the UserId value in this object will be ignored. */
export interface UnitStatusInput {
  /** UnitId of the apparatus that the state is being set for */
  Id: string;
  /** The UnitStateType of the Unit */
  Type: string;
  /** The Call/Station the unit is responding to */
  RespondingTo?: string | null;
  /** Destination type for RespondingTo (Station = 1, Call = 2, POI = 3). */
  RespondingToType?: number | null;
  /** The timestamp of the status event in UTC */
  TimestampUtc?: string | null;
  /** The timestamp of the status event in the local time of the device */
  Timestamp?: string | null;
  /** User provided note for this event */
  Note?: string | null;
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
  /** The event id used for queuing on mobile applications */
  EventId?: string | null;
  /** The accountability roles filed for this event */
  Roles?: UnitStatusRoleInput[] | null;
}

/** Role filled by a User on a Unit for an event */
export interface UnitStatusRoleInput {
  /** Id of the locally stored event */
  Id?: string | null;
  /** Local Event Id */
  EventId?: string | null;
  /** UserId of the user filling the role */
  UserId?: string | null;
  /** RoleId of the role being filled */
  RoleId?: string | null;
  /** The name of the Role */
  Name?: string | null;
}
