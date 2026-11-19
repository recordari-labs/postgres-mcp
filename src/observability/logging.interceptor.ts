import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const handler = context.getHandler().name;
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${handler} completed in ${Date.now() - started}ms`);
        },
        error: () => {
          this.logger.warn(`${handler} failed in ${Date.now() - started}ms`);
        },
      }),
    );
  }
}
