// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Input to attach a file to a call */
export interface SaveCallFileInput {
  /** Id of the Call */
  CallId: string;
  /** User Id of the user attaching the file */
  UserId: string;
  /** Type of the file (Audio = 1, Image = 2, File = 3, Video = 4) */
  Type?: number;
  /** Name of the file */
  Name: string;
  /** Base64 encoded string of the file being uploaded */
  Data: string;
  Latitude?: string | null;
  Longitude?: string | null;
  Note?: string | null;
  /** Department Id for the call file. Only used in System API Key (hosted multi-department) mode. When provided, overrides the department derived from the auth token. */
  DepartmentId?: string | null;
}
