export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, details);
  }

  public static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(message, 401);
  }

  public static forbidden(message: string = 'Access denied'): AppError {
    return new AppError(message, 403);
  }

  public static notFound(message: string = 'Resource not found'): AppError {
    return new AppError(message, 404);
  }

  public static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, details);
  }

  public static tooManyRequests(message: string = 'Too many requests'): AppError {
    return new AppError(message, 429);
  }

  public static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, undefined, false);
  }
}
