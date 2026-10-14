import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { getMetadataStorage, validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export interface ValidationErrors {
  errors: string[];
}

/**
 * 参数校验异常
 * 包含详细的校验错误信息
 */
export class ValidationException extends BadRequestException {
  validationErrors: ValidationErrors;
  constructor(validationErrors: ValidationErrors, message?: string) {
    super(message ?? '参数校验失败');
    this.validationErrors = validationErrors;
  }
}

@Injectable()
export class ValidationPipeWithTransform implements PipeTransform<unknown> {
  async transform(
    value: unknown,
    { metatype }: ArgumentMetadata,
  ): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // 如果 value 为空，且需要校验（由 metatype 决定），则认为校验失败
    if (value === null || value === undefined) {
      throw new ValidationException({ errors: ['请求数据不能为空'] });
    }

    // 转换并校验
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const object = plainToInstance(metatype, value, {
      enableImplicitConversion: false,
    });

    // 检查类是否有任何 class-validator 装饰器
    if (!this.hasValidationMetadata(metatype)) {
      return object; // 没有装饰器，直接返回转换后的对象
    }

    // 获取类的元数据，检查是否有装饰器
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const errors = await validate(object, {
      skipMissingProperties: false, // 不跳过缺失属性
      whitelist: true, // 自动删除未装饰的属性 (白名单功能)
      forbidNonWhitelisted: false, // 剔除未装饰的属性，且不报错
    });

    if (errors.length > 0) {
      const errorMessages = this.extractErrorMessages(errors);
      throw new ValidationException({ errors: errorMessages });
    }

    return object;
  }

  /**
   * 检查类或其父类是否有 class-validator 的验证装饰器
   */
  private hasValidationMetadata(metatype: any): boolean {
    if (!metatype) {
      return false;
    }

    const storage = getMetadataStorage();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let target = metatype;

    while (target && target !== Object) {
      const metas = storage.getTargetValidationMetadatas(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        target, // target
        '', // schema
        false, // always
        false, // strictGroups
      );

      if (metas.length > 0) {
        return true;
      }

      // 检查父类
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      target = Object.getPrototypeOf(target);
    }

    return false;
  }

  private toValidate(metatype: unknown): boolean {
    const types: unknown[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private extractErrorMessages(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    errors.forEach((error) => {
      if (error.constraints) {
        for (const [key, val] of Object.entries(error.constraints)) {
          messages.push(this.classifyMessage(key, error.property, String(val)));
        }
      }

      if (error.children && error.children.length > 0) {
        messages.push(...this.extractErrorMessages(error.children));
      }
    });

    return messages;
  }

  /**
   * 校验文案分类（DEFECT-R6B28-04 / rG6721，PRD 必填/格式/长度三类中文文案）。
   * DTO 已设中文自定义 message（@IsNotEmpty({message:'学校机构全称不能为空'})）→ 原样保留；
   * 未设 message 的 class-validator 默认英文文案（"<prop> must be a string" 等）→ 按 constraint key
   * 归类为「<prop>不能为空」(必填) / 「<prop>长度不符」(长度) / 「<prop>格式不正确」(格式)。
   */
  private classifyMessage(key: string, prop: string, orig: string): string {
    // 含中文即视为 DTO 已设友好文案，保留
    if (/[一-龥]/.test(orig)) return orig;
    const label = prop || '该字段';
    const k = key.toLowerCase();
    if (/notempty|^isdefined$|isdefined/.test(k)) return `${label}不能为空`;
    if (/^minlength$|^maxlength$|^length$|^min$|^max$/.test(k)) return `${label}长度不符`;
    // 其余（isString/isNumber/isInt/isBoolean/isEnum/isEmail/isMobilePhone/isUUID/isDateString/matches 等）→ 格式
    return `${label}格式不正确`;
  }
}
