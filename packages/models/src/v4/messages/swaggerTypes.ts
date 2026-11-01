// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { MessageRecipientInput } from './messageRecipientInput';

/** New message input */
export interface NewMessageInput {
  /** The title/subject of the message */
  Title?: string | null;
  /** The body/content of the message */
  Body?: string | null;
  /** Type type of the message (0 = Normal\Message, 1 = Callback, 2 = Poll) */
  Type?: number;
  /** Who to send the message to */
  Recipients?: MessageRecipientInput[] | null;
}

/** Input to respond to a message */
export interface RespondToMessageInput {
  /** Id of the message */
  Id?: number;
  /** Type of response (1 = Yes, 2 = Maybe, 3 = No) */
  Type?: number;
  /** Note for the response */
  Note?: string | null;
}
