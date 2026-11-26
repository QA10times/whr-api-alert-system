import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Error body shared by every route: {statusCode, error, message, fields?}. */
export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}

/** 400 with per-field messages, so forms can show them inline. */
export class FieldsException extends BadRequestException {
  constructor(fields: Record<string, string>, message = 'Some fields need attention.') {
    super({ statusCode: 400, error: 'Bad Request', message, fields } satisfies ErrorBody);
  }
}

/** 409 with the message under the given field (the name field by default). */
export class ConflictFieldException extends HttpException {
  constructor(message: string, field = 'name') {
    super({ statusCode: 409, error: 'Conflict', message, fields: { [field]: message } } satisfies ErrorBody, 409);
  }
}

/**
 * Field keys follow the dashboard form paths: nested credentials (auth.config.token)
 * are reported as auth.token.
 */
export function fieldKey(path: string): string {
  return path.replace(/^auth\.config\./, 'auth.');
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      const first = Object.values(e.constraints)[0];
      const key = fieldKey(path);
      if (first && !out[key]) out[key] = first;
    }
    if (e.children?.length) Object.assign(out, flattenValidationErrors(e.children, path));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]): FieldsException {
  const fields = flattenValidationErrors(errors);
  const first = Object.values(fields)[0];
  return new FieldsException(fields, first ?? 'Some fields need attention.');
}

const REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) this.log.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const error = REASON[status] ?? 'Error';
      if (typeof r === 'string') return { statusCode: status, error, message: r };
      const o = r as Partial<ErrorBody> & { message?: string | string[] };
      const message = Array.isArray(o.message) ? o.message.join('; ') : (o.message ?? exception.message);
      const body: ErrorBody = { statusCode: status, error: (o.error as string) ?? error, message };
      if (o.fields) body.fields = o.fields;
      if (status === 429) body.message = typeof o.message === 'string' && o.message !== 'ThrottlerException: Too Many Requests' ? o.message : 'Too many attempts. Wait a minute and try again.';
      return body;
    }
    if (exception instanceof QueryFailedError) {
      const code = (exception as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
      if (code === '23505') return { statusCode: 409, error: 'Conflict', message: 'That name is already in use.', fields: { name: 'That name is already in use.' } };
      if (code === '23503') return { statusCode: 400, error: 'Bad Request', message: 'A referenced record does not exist.' };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Internal Server Error', message: 'Something went wrong on the server.' };
  }
}
