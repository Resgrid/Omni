// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.CallVideoFeeds.EditCallVideoFeedInput` (generated from Swagger v4). */
export interface EditCallVideoFeedInput {
  CallVideoFeedId: string;
  CallId: string;
  Name: string;
  Url: string;
  FeedType?: number | null;
  FeedFormat?: number | null;
  Description?: string | null;
  Status?: number;
  Latitude?: string | null;
  Longitude?: string | null;
  SortOrder?: number;
}

/** Core `v4.CallVideoFeeds.SaveCallVideoFeedInput` (generated from Swagger v4). */
export interface SaveCallVideoFeedInput {
  CallId: string;
  Name: string;
  Url: string;
  FeedType?: number | null;
  FeedFormat?: number | null;
  Description?: string | null;
  Latitude?: string | null;
  Longitude?: string | null;
  SortOrder?: number;
}
