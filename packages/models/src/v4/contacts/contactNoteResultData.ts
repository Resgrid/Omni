export interface ContactNoteResultData {
  ContactNoteId: string;
  ContactId: string;
  ContactNoteTypeId: string;
  Note: string;
  NoteType: string;
  ShouldAlert: boolean;
  Visibility: number; // 0 Internal, 1 Visible to Client
  ExpiresOnUtc: string | null;
  ExpiresOn: string;
  IsDeleted: boolean;
  AddedOnUtc: string;
  AddedOn: string;
  AddedByUserId: string;
  AddedByName: string;
  EditedOnUtc: string | null;
  EditedOn: string;
  EditedByUserId: string;
  EditedByName: string;
  IsProtected?: boolean;
  ProtectedReason?: string | null;
}
