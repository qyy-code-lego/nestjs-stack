import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import { RuntimeConfigValueType } from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';

export class CreateRuntimeConfigDto {
  @IsNotEmpty({ message: '配置识别码不能为空' })
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: '配置识别码只能包含字母、数字、点、下划线和中划线',
  })
  code: string;

  @IsNotEmpty({ message: '配置名称不能为空' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  group?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /**
   * 任意合法 JSON。这里刻意只用 @IsDefined 而不加结构约束——
   * 校验管道的 whitelist 只作用于有装饰器元数据的类，普通对象内部键不会被剔除。
   */
  @IsDefined({ message: '配置值不能为空' })
  value: unknown;

  @IsOptional()
  @IsEnum(RuntimeConfigValueType)
  valueType?: RuntimeConfigValueType;

  @IsOptional()
  @IsObject()
  valueSchema?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ObjectActiveStatus)
  status?: ObjectActiveStatus;

  @IsOptional()
  @IsBoolean()
  builtin?: boolean;
}

export class UpdateRuntimeConfigDto extends PartialType(
  OmitType(CreateRuntimeConfigDto, ['code', 'builtin'] as const),
) {
  /** 传入时做乐观锁校验，与库中 version 不一致则拒绝写入。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class UpdateRuntimeConfigValueDto {
  @IsDefined({ message: '配置值不能为空' })
  value: unknown;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class RuntimeConfigPageQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsEnum(ObjectActiveStatus)
  status?: ObjectActiveStatus;
}
