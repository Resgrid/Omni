/** A configured weather-alert source (feed/provider) for the department. */
export class WeatherAlertSourceResultData {
  public WeatherAlertSourceId: string = '';
  public DepartmentId: number = 0;
  public Name: string = '';
  public SourceType: number = 0;
  public AreaFilter: string = '';
  public HasApiKey: boolean = false;
  public CustomEndpoint: string = '';
  public PollIntervalMinutes: number = 0;
  public Active: boolean = false;
  public LastPollUtc: string = '';
  public LastSuccessUtc: string = '';
  public IsFailure: boolean = false;
  public IsPermanentFailure: boolean = false;
  public ErrorMessage: string = '';
}
