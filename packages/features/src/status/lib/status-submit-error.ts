/** Thrown by a status submit handler to show its own (translated) message, e.g. "location unavailable" for a GPS status. */
export class StatusSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusSubmitError';
  }
}
