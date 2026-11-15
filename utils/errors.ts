export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}
export const notFound = (what: string) =>
  new AppError(404, `${what} not found`, "NOT_FOUND");
export const conflict = (msg: string) => new AppError(409, msg, "CONFLICT");

// Provider failures. Transient ones are retried by BullMQ; permanent ones are not.
export class TransientProviderError extends Error {}
export class PermanentProviderError extends Error {}
