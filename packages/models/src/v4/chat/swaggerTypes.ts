// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** A command-board question for the incident assistant. Answered synchronously so the board can show the reply in place instead of waiting on the chat channel round-trip. */
export interface AskIncidentAssistantInput {
  /** The commander's question, in their own words ("PAR", "who's in Division A", "what am I missing") */
  Question: string;
  /** Call id of the incident the question is about (the board the caller has open) */
  CallId?: number;
}

/** Core `Resgrid.Web.Services.Controllers.v4.ChatbotChatMessageRequest` (generated from Swagger v4). */
export interface ChatbotChatMessageRequest {
  Text?: string | null;
  ClientMessageId?: string | null;
  /** Optional: the incident (call id) the sender has open on a command board, so incident questions resolve against that board instead of guessing. 0 or absent for general chat. */
  CallId?: number;
}
