// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Input to attach a note to call */
export interface SaveCallNoteInput {
  /** Id of the Call */
  CallId: string;
  /** UserId of the user adding the note */
  UserId: string;
  /** Note text to add */
  Note: string;
  /** Latitude of when the note was taken */
  Latitude?: string | null;
  /** Longitude of when the note was taken */
  Longitude?: string | null;
}
