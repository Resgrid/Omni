// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** New note input */
export interface NewNoteInput {
  /** The title/subject of the note */
  Title?: string | null;
  /** The body/content of the note */
  Body?: string | null;
  /** Note Category */
  Category?: string | null;
  /** Is the note only visible to admins */
  IsAdminOnly?: boolean;
  /** When the note expires on (optional) */
  ExpiresOn?: string | null;
}
