// 这是一个用于全局返回的http消息统一格式

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

/**
 * 全局 JSON 返回体
 */
export class ApiResBody<T = Record<string, unknown>> {
  // 业务状态码，根据业务自定义
  code: number;
  message?: string;
  // 数据负载，要求只返回和业务相关数据
  data?: T | null = null;
  // 其他详情，根据需要填充
  details?: any;
  // 请求记录，由中间件填写
  fullUrl?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

  private static readonly DEFAULT_CODE = 200;

  // of() / of(data)
  static of<T = any>(): ApiResBody<T>;
  static of<T = any>(data: T): ApiResBody<T>;
  static of<T = any>(data?: T): ApiResBody<T> {
    const body = new ApiResBody<T>();
    body.code = ApiResBody.DEFAULT_CODE;
    body.message = '请求完成';
    if (data !== undefined) body.data = data;
    return body;
  }

  // ofWith(code, message) / ofWith(code, message, data)
  static ofWith<T = any>(
    code: number,
    message: string,
    data?: T,
  ): ApiResBody<T> {
    const body = new ApiResBody<T>();
    body.code = code;
    body.message = message;
    if (data !== undefined) body.data = data;
    return body;
  }

  messageText(message: string): this {
    this.message = message;
    return this;
  }

  codeAs(code: number): this {
    this.code = code;
    return this;
  }

  setDetails(details: any): this {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.details = details;
    return this;
  }

  toJson(): string {
    try {
      return JSON.stringify(this);
    } catch (e) {
      return String((e as Error).message ?? e);
    }
  }
}

/**
 * 拦截器：在响应时填充 fullUrl 和 method
 */
@Injectable()
export class ApiResBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const fullUrl = request.url;

    return next.handle().pipe(
      map((data) => {
        if (data instanceof ApiResBody) {
          data.fullUrl = fullUrl;
          data.method = request.method as
            'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
        }
        return data as ApiResBody;
      }),
    );
  }
}
