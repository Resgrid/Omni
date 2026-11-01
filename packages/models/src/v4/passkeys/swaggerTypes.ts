// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** A started WebAuthn ceremony (workbook section 7.1): the request id to send back and the options for the platform. */
export interface PasskeyCeremonyResult {
  Data?: PasskeyCeremonyResultData;
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

/** Core `v4.Passkeys.PasskeyCeremonyResultData` (generated from Swagger v4). */
export interface PasskeyCeremonyResultData {
  RequestId?: string | null;
  /** WebAuthn PublicKeyCredentialCreationOptions (registration) or PublicKeyCredentialRequestOptions (assertion) JSON. */
  Options?: unknown;
}
