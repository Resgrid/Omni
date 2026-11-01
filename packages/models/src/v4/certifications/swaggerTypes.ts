// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Certifications.AddCertificationCreditInput` (generated from Swagger v4). */
export interface AddCertificationCreditInput {
  CertificationId?: number;
  CreditDate?: string | null;
  Hours?: number;
  Category?: string | null;
  Description?: string | null;
  FileData?: string | null;
  FileName?: string | null;
  FileType?: string | null;
}

/** Core `v4.Certifications.RenewCertificationInput` (generated from Swagger v4). */
export interface RenewCertificationInput {
  Id?: number;
  ExpiresOn?: string | null;
  Number?: string | null;
}
