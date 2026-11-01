// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Checklists.ChecklistStartInput` (generated from Swagger v4). */
export interface ChecklistStartInput {
  OccurrenceId?: string | null;
  DefinitionId?: string | null;
  VersionId?: string | null;
  TargetId?: string | null;
  CompletionId?: string | null;
}

/** Core `v4.Checklists.ChecklistWitnessInput` (generated from Swagger v4). */
export interface ChecklistWitnessInput {
  Id?: string | null;
  SubmissionHash?: string | null;
  Attestation?: string | null;
}
