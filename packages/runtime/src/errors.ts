import { ERROR_CODES, type Enforcement, type ErrorCode, type ValidationIssue } from "@liminal/schema";

export class RuntimeError extends Error {
  readonly code: ErrorCode;
  readonly issues?: ValidationIssue[];
  readonly enforcement?: Enforcement;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { issues?: ValidationIssue[]; enforcement?: Enforcement }
  ) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.issues = opts?.issues;
    this.enforcement = opts?.enforcement;
  }
}

export const errors = {
  notFound: (what: string, id: string) =>
    new RuntimeError(ERROR_CODES.NOT_FOUND, `${what} "${id}" not found`),
  invalidState: (message: string) => new RuntimeError(ERROR_CODES.INVALID_STATE, message),
  validation: (message: string, issues?: ValidationIssue[]) =>
    new RuntimeError(ERROR_CODES.VALIDATION_FAILED, message, { issues }),
  conflict: (message: string) => new RuntimeError(ERROR_CODES.CONFLICT, message),
  unauthorized: (message = "missing or invalid bearer token") =>
    new RuntimeError(ERROR_CODES.UNAUTHORIZED, message),
  forbidden: (message = "token is not valid for this resource") =>
    new RuntimeError(ERROR_CODES.FORBIDDEN, message),
  notImplemented: (message: string) =>
    new RuntimeError(ERROR_CODES.NOT_IMPLEMENTED, message, { enforcement: "roadmap" }),
  payloadTooLarge: (limit: number) =>
    new RuntimeError(ERROR_CODES.PAYLOAD_TOO_LARGE, `request body exceeds ${limit} bytes`),
  browserNotFound: (message: string) =>
    new RuntimeError(ERROR_CODES.BROWSER_NOT_FOUND, message),
  internal: (message: string) => new RuntimeError(ERROR_CODES.INTERNAL, message),
};
