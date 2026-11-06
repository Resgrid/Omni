export class CallProtocolsResultData {
  public Id: string = '';
  public DepartmentId: string = '';
  public Name: string = '';
  public Code: string = '';
  public Description: string = '';
  public ProtocolText: string = '';
  public CreatedOn: string = '';
  public CreatedByUserId: string = '';
  public IsDisabled: boolean = false;
  public UpdatedOn: string = '';
  public UpdatedByUserId: string = '';
  public MinimumWeight: number = 0;
  public State: number = 0;
  public Triggers: ProtocolTriggerResultData[] = [];
  public Attachments: ProtocolTriggerAttachmentResultData[] = [];
  public Questions: ProtocolTriggerQuestionResultData[] = [];
}

export class ProtocolTriggerResultData {
  public Id: string = '';
  public Type: number = 0;
  public StartsOn: string = '';
  public EndsOn: string = '';
  public Priority: number = 0;
  public CallType: string = '';
  public Geofence: string = '';
}

export class ProtocolTriggerAttachmentResultData {
  public Id: string = '';
  public FileName: string = '';
  public FileType: string = '';
}

export class ProtocolTriggerQuestionResultData {
  public Id: string = '';
  public Question: string = '';
  public Answers: ProtocolQuestionAnswerResultData[] = [];
}

export class ProtocolQuestionAnswerResultData {
  public Id: string = '';
  public Answer: string = '';
  public Weight: number = 0;
}

/**
 * A department protocol as the `Protocols` controller sends it (Core `Models/v4/Protocols/GetAllProtocolsResult.cs`,
 * `ProtocolResultData`). Not the same shape as `CallProtocolsResultData` (the `CallProtocols` controller and a call's
 * extra data): the id is `ProtocolId`, `DepartmentId` is a number and the nested ids carry their own names.
 * `@resgrid/data`'s protocols store converts it to `CallProtocolsResultData`, the one protocol shape the screens use.
 */
export class ProtocolResultData {
  public ProtocolId: string = '';
  public DepartmentId: number = 0;
  public Name: string = '';
  public Code: string = '';
  public IsDisabled: boolean = false;
  public Description: string = '';
  public ProtocolText: string = '';
  public CreatedOn: string = '';
  public CreatedByUserId: string = '';
  public UpdatedOn: string | null = null;
  public MinimumWeight: number = 0;
  public UpdatedByUserId: string = '';
  public Triggers: ProtocolTriggerResult[] = [];
  public Attachments: ProtocolTriggerAttachmentResult[] = [];
  public Questions: ProtocolTriggerQuestionResult[] = [];
  public State: number = 0;
}

export class ProtocolTriggerResult {
  public ProtocolTriggerId: string = '';
  public Type: number = 0;
  public StartsOn: string | null = null;
  public EndsOn: string | null = null;
  public Priority: number | null = null;
  public CallType: string = '';
  public Geofence: string = '';
}

export class ProtocolTriggerAttachmentResult {
  public ProtocolTriggerAttachmentId: string = '';
  public FileName: string = '';
  public FileType: string = '';
}

export class ProtocolTriggerQuestionResult {
  public ProtocolTriggerQuestionId: string = '';
  public Question: string = '';
  public Answers: ProtocolQuestionAnswerResult[] = [];
}

export class ProtocolQuestionAnswerResult {
  public ProtocolQuestionAnswerId: string = '';
  public Answer: string = '';
  public Weight: number = 0;
}
