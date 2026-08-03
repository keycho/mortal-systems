import type { ZodError } from "zod";
import type { ValidationIssue } from "./api.js";

/** flatten a zod error into the wire-format validation issues */
export function toValidationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}
