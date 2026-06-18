import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user && request.body) {
      const method = request.method as string;
      if (method === 'POST') request.body.createdBy = user.sub;
      if (['POST', 'PUT', 'PATCH'].includes(method)) request.body.updatedBy = user.sub;
    }
    return next.handle();
  }
}
