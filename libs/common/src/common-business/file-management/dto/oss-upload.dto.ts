import { ObjectCannedACL } from '@aws-sdk/client-s3';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OssPutSignDto {
  /** 上传用途；注册了 OssUploadPolicy 时由策略据此决定存储位置。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  purpose?: string;

  /** @deprecated 仅未注册 OssUploadPolicy 的旧模式使用；策略模式下传入会被拒绝。 */
  @IsOptional()
  @IsString()
  ossConfigCode?: string;

  /** @deprecated 仅未注册 OssUploadPolicy 的旧模式使用；策略模式下传入会被拒绝。 */
  @IsOptional()
  @IsString()
  key?: string;

  @IsNotEmpty()
  @IsString()
  filename: string;

  @IsNotEmpty()
  @IsString()
  hash: string;

  @IsString()
  @Matches(/^(0|[1-9]\d*)$/, { message: 'size 必须为非负整数字符串' })
  size: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{22}==$/, { message: 'contentMd5 格式不正确' })
  contentMd5: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  cacheControl?: string;

  @IsOptional()
  @IsString()
  contentDisposition?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  /** @deprecated 仅旧模式使用；策略模式下由策略决定。 */
  @IsOptional()
  @IsString()
  acl?: ObjectCannedACL;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 3600)
  expiresIn?: number;
}

export class OssUploadCallbackDto {
  @IsNotEmpty()
  @IsString()
  fileId: string;
}

export class OssGetSignDto {
  @IsNotEmpty()
  @IsString()
  fileId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 3600)
  expiresIn?: number;

  @IsOptional()
  @IsString()
  responseContentType?: string;

  @IsOptional()
  @IsString()
  responseContentDisposition?: string;
}

export class OssMultipartInitDto {
  /** 上传用途；注册了 OssUploadPolicy 时由策略据此决定存储位置。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  purpose?: string;

  /** @deprecated 仅未注册 OssUploadPolicy 的旧模式使用；策略模式下传入会被拒绝。 */
  @IsOptional()
  @IsString()
  ossConfigCode?: string;

  /** @deprecated 仅未注册 OssUploadPolicy 的旧模式使用；策略模式下传入会被拒绝。 */
  @IsOptional()
  @IsString()
  key?: string;

  @IsNotEmpty()
  @IsString()
  hash: string;

  @IsNotEmpty()
  @IsString()
  filename: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  cacheControl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  /** @deprecated 仅旧模式使用；策略模式下由策略决定。 */
  @IsOptional()
  @IsString()
  acl?: ObjectCannedACL;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  suffix?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  /** @deprecated 仅旧模式使用。 */
  @IsOptional()
  @IsString()
  domain?: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'size 必须为正整数字符串' })
  size: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chunkSize?: number;
}

export class OssMultipartSignPartDto {
  @IsNotEmpty()
  @IsString()
  fileId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentLength: number;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{22}==$/, { message: 'contentMd5 格式不正确' })
  contentMd5: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 3600)
  expiresIn?: number;
}

export class OssMultipartCompleteDto {
  @IsNotEmpty()
  @IsString()
  fileId: string;
}

export class OssMultipartAbortDto {
  @IsNotEmpty()
  @IsString()
  fileId: string;
}
