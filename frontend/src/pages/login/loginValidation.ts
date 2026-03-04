import type { AxiosError } from "axios";

/** Simple email format check (matches backend expectation). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/** Client-side validation. Returns field errors or null if valid. */
export function validateLoginFields(email: string, password: string): LoginFieldErrors | null {
  const trimmedEmail = email.trim();
  const errors: LoginFieldErrors = {};

  if (!trimmedEmail) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = "Please enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Backend validation (Zod) returns: { message: "Validation error", errors: { body?: { email?: string[], password?: string[] } } }.
 * AppError returns: { message: string }.
 */
interface ApiErrorBody {
  message?: string;
  errors?: {
    body?: { email?: string[]; password?: string[] };
    email?: string[];
    password?: string[];
  };
}

/** Extract a user-friendly message and optional field errors from a failed login API call. */
export function getLoginError(err: unknown): { message: string; fieldErrors?: LoginFieldErrors } {
  const axiosErr = err as AxiosError<ApiErrorBody>;
  const data = axiosErr.response?.data;
  const status = axiosErr.response?.status;

  // No response: network or request failure
  if (!axiosErr.response) {
    const isNetwork = axiosErr.code === "ERR_NETWORK" || axiosErr.message?.toLowerCase().includes("network");
    return {
      message: isNetwork
        ? "Could not reach server. Check your connection and try again."
        : "Something went wrong. Please try again.",
    };
  }

  const message = data?.message ?? "Login failed";
  const fieldErrors: LoginFieldErrors = {};

  // Backend Zod validation: errors may be under body (our schema validates req.body)
  if (status === 400 && data?.errors) {
    const bodyErrors = data.errors.body ?? data.errors;
    const firstEmail = Array.isArray(bodyErrors.email) ? bodyErrors.email[0] : undefined;
    const firstPassword = Array.isArray(bodyErrors.password) ? bodyErrors.password[0] : undefined;
    if (firstEmail) fieldErrors.email = firstEmail;
    if (firstPassword) fieldErrors.password = firstPassword;
  }

  return Object.keys(fieldErrors).length > 0 ? { message, fieldErrors } : { message };
}
