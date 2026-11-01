// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Geocoding.ForwardGeocodeData` (generated from Swagger v4). */
export interface ForwardGeocodeData {
  /** Latitude of the geocoded location, or null if not found. */
  Latitude?: number | null;
  /** Longitude of the geocoded location, or null if not found. */
  Longitude?: number | null;
  /** Normalised address for the resolved point when the provider supplies one. Clients that show the resolved address fall back to the text the user typed when this is empty. */
  Address?: string | null;
  /** True when the lookup ran successfully and simply matched nothing, false when the lookup itself failed. Clients need the difference to say "address not found" instead of "try again". */
  LookupSucceeded?: boolean;
}

/** Result of a forward geocode (address → coordinates) request. */
export interface ForwardGeocodeResult {
  Data?: ForwardGeocodeData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.Geocoding.ReverseGeocodeData` (generated from Swagger v4). */
export interface ReverseGeocodeData {
  /** Human-readable address for the supplied coordinates, or empty if not found. */
  Address?: string | null;
  /** True when the lookup ran successfully and simply matched nothing, false when the lookup itself failed. Clients need the difference to say "address not found" instead of "try again". */
  LookupSucceeded?: boolean;
}

/** Result of a reverse geocode (coordinates → address) request. */
export interface ReverseGeocodeResult {
  Data?: ReverseGeocodeData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}
