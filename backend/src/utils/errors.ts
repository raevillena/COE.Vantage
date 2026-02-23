/** Custom app error with status code for HTTP layer */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function unauthorized(message = "Unauthorized") {
  return new AppError(message, 401);
}

export function forbidden(message = "Forbidden") {
  return new AppError(message, 403);
}

export function badRequest(message = "Bad request") {
  return new AppError(message, 400);
}

export function notFound(message = "Not found") {
  return new AppError(message, 404);
}
