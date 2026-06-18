import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'errors.internal_server_error';
    let field: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const r = exceptionResponse as Record<string, unknown>;
        message = (r.message as string) ?? message;
        field = r.field as string | undefined;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      const pgError = exception as Error & { code?: string };
      if (pgError.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'errors.duplicate_entry';
      } else if (pgError.code === '23503') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        message = 'errors.foreign_key_violation';
      }
      this.logger.error(exception.message, exception.stack);
    }

    void request; // used for future request logging

    const body: Record<string, unknown> = { statusCode: status, message };
    if (field) body.field = field;

    response.status(status).json(body);
  }
}
