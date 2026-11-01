// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Deployments.NewTimeReportInput` (generated from Swagger v4). */
export interface NewTimeReportInput {
  DeploymentId?: string | null;
  ReportDate?: string;
  /** Crew time report for this deployment unit (the unit, its crew and equipment). */
  DeploymentUnitId?: string | null;
  /** Individual time report for this roster row. */
  DeploymentPersonnelId?: string | null;
}

/** Core `v4.Deployments.SaveExpenseInput` (generated from Swagger v4). */
export interface SaveExpenseInput {
  Id?: string | null;
  DeploymentId?: string | null;
  TimeReportId?: string | null;
  ExpenseDate?: string | null;
  ExpenseType?: number;
  MealCode?: string | null;
  City?: string | null;
  Description?: string | null;
  Amount?: number;
  Currency?: string | null;
  PreApproved?: boolean;
  Billable?: boolean;
  /** Receipt bytes, base64. */
  ReceiptData?: string | null;
  ReceiptFileName?: string | null;
  ReceiptContentType?: string | null;
}

/** Core `v4.Deployments.SaveTimeEntriesInput` (generated from Swagger v4). */
export interface SaveTimeEntriesInput {
  TimeReportId?: string | null;
  Entries?: TimeEntryData[] | null;
}

/** Core `v4.Deployments.SignTimeReportInput` (generated from Swagger v4). */
export interface SignTimeReportInput {
  Id?: string | null;
  ContractorSigned?: boolean;
  CustomerSignerName?: string | null;
}

/** Core `v4.Deployments.TimeEntryData` (generated from Swagger v4). */
export interface TimeEntryData {
  Id?: string | null;
  /** DeploymentTimeSubjectTypes value. */
  SubjectType?: number;
  DeploymentPersonnelId?: string | null;
  DeploymentUnitId?: string | null;
  DeploymentEquipmentId?: string | null;
  /** DeploymentTimeEntryTypes value. */
  EntryType?: number;
  /** UTC instant ("Z"). */
  StartTime?: string;
  /** UTC instant ("Z"). */
  EndTime?: string;
  /** Department-local wall clock "yyyy-MM-ddTHH:mm" — what the crew writes on a paper time report. On save a non-empty value wins over Resgrid.Web.Services.Models.v4.Deployments.TimeEntryData.StartTime and is converted in the department's zone, so a field app never does zone math. */
  StartLocal?: string | null;
  /** Department-local wall clock end; see Resgrid.Web.Services.Models.v4.Deployments.TimeEntryData.StartLocal. */
  EndLocal?: string | null;
  PaidBreakMinutes?: number;
  UnpaidBreakMinutes?: number;
  CrewSizeSnapshot?: number | null;
  CertificationCode?: string | null;
  MileageKm?: number | null;
  FuelDeductionLitres?: number | null;
  AgencySuppliedMeals?: boolean;
  AgencySuppliedAccommodation?: boolean;
  Notes?: string | null;
  SortOrder?: number;
  Hours?: number;
}

/** Core `v4.Deployments.TimeReportActionInput` (generated from Swagger v4). */
export interface TimeReportActionInput {
  Id?: string | null;
  Reason?: string | null;
}
