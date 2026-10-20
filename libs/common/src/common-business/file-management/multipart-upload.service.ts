import { Injectable, Optional } from '@nestjs/common';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { FileService } from '@qyy-code-lego/nestjs/core/nest/file-management/file.service';
import { S3StorageService } from '@qyy-code-lego/nestjs/core/nest/s3-storage';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';
import { IdentityType } from '@qyy-code-lego/nestjs/entities/core/identity/constants';
import type { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import {
  OssUploadPolicy,
  UPLOAD_ACL_META_KEY,
  UPLOAD_PURPOSE_META_KEY,
} from './oss-upload-policy';

const MIN_S3_MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_S3_MULTIPART_PARTS = 10_000;

export interface MultipartUploadActor {
  identityType?: string;
  identityId?: string;
}

/** 由服务端上传策略决定、客户端不得传入的字段。 */
const POLICY_OWNED_FIELDS = ['ossConfigCode', 'key', 'acl', 'domain'] as const;

/**
 * 存储位置参数：注册了 OssUploadPolicy 时只用 `purpose`；
 * `ossConfigCode` / `key` / `acl` / `domain` 仅供未注册策略的旧模式（已废弃）。
 */
interface UploadLocationInput {
  purpose?: string;
  /** @deprecated 由 OssUploadPolicy 决定 */
  ossConfigCode?: string;
  /** @deprecated 由 OssUploadPolicy 决定 */
  key?: string;
  /** @deprecated 由 OssUploadPolicy 决定 */
  acl?: ObjectCannedACL;
  /** @deprecated 由 OssUploadPolicy 决定 */
  domain?: string;
}

interface UploadLocation {
  ossConfigCode: string;
  key: string;
  acl?: ObjectCannedACL;
  domain?: string;
  meta: Record<string, unknown>;
  /** 可复用的已有上传任务（旧模式按 key 查找，策略模式按续传条件查找）。 */
  existing: SysFileEntity | null;
}

export interface PrepareDirectUploadInput extends UploadLocationInput {
  filename: string;
  hash: string;
  size: string;
  contentMd5: string;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  meta?: Record<string, unknown>;
  expiresIn?: number;
}

export interface InitMultipartUploadInput extends UploadLocationInput {
  hash: string;
  filename: string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  mimeType?: string;
  suffix?: string;
  meta?: Record<string, unknown>;
  size: string;
  chunkSize?: number;
}

export interface SignMultipartPartInput {
  fileId: string;
  partNumber: number;
  contentLength: number;
  contentMd5: string;
  expiresIn?: number;
}

export interface CompleteObjectCallbackInput {
  fileId: string;
}

@Injectable()
export class MultipartUploadService {
  constructor(
    private readonly fileService: FileService,
    private readonly s3StorageService: S3StorageService,
    @Optional() private readonly uploadPolicy?: OssUploadPolicy,
  ) {}

  /** 是否由服务端上传策略决定存储位置。 */
  get policyMode() {
    return !!this.uploadPolicy;
  }

  async prepareDirectUpload(
    input: PrepareDirectUploadInput,
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    const expectedSize = this.parseFileSize(input.size, true);
    const location = await this.locate(input, actor, expectedSize);
    let file = location.existing;

    if (file) {
      this.assertUploadOwner(file.createdBy, actor);
      if (file.hash !== input.hash || file.size !== `${expectedSize}`) {
        throw new BizError('该 OSS key 已被另一个文件的上传任务占用')
          .codeAs(409)
          .httpStatusAs(409);
      }
      if (file.completed) {
        return { file, completed: true as const };
      }
      Object.assign(file, {
        filename: input.filename,
        mimeType: input.contentType,
        suffix: this.getFileSuffix(input.filename),
        meta: location.meta,
        size: `${expectedSize}`,
        updatedBy: actor.identityId,
      });
      file = await this.fileService.save(file);
    } else {
      try {
        file = await this.fileService.createOssUploadTask(
          {
            filename: input.filename,
            mimeType: input.contentType,
            suffix: this.getFileSuffix(input.filename),
            meta: location.meta,
            object: location.key,
            hash: input.hash,
            storageType: 'oss',
            ossConfigCode: location.ossConfigCode,
            size: `${expectedSize}`,
            completed: false,
          },
          actor.identityType,
          actor.identityId,
        );
      } catch (error) {
        this.rethrowOssKeyConflict(error);
      }
    }

    const signed = await this.s3StorageService.generatePresignedPutUrl({
      ossConfigCode: location.ossConfigCode,
      key: location.key,
      // 策略模式的 ACL 在直传完成后由服务端设置（见 applyUploadAcl），不放进预签名 URL。
      acl: this.uploadPolicy ? undefined : location.acl,
      contentType: input.contentType,
      cacheControl: input.cacheControl,
      contentDisposition: input.contentDisposition,
      metadata: input.metadata,
      contentMd5: input.contentMd5,
      expiresIn: input.expiresIn,
      contentLength: expectedSize,
    });
    return { ...signed, file, completed: false as const };
  }

  async signGet(
    input: {
      fileId: string;
      expiresIn?: number;
      responseContentType?: string;
      responseContentDisposition?: string;
    },
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    const file = await this.fileService.findById(input.fileId);
    this.assertUploadOwner(file.createdBy, actor);
    if (!file.completed || file.storageType !== 'oss' || !file.ossConfigCode) {
      throw new BizError('文件尚未完成 OSS 上传').codeAs(400);
    }
    return await this.s3StorageService.generatePresignedGetUrl({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      expiresIn: input.expiresIn,
      responseContentType: input.responseContentType,
      responseContentDisposition: input.responseContentDisposition,
    });
  }

  async initMultipart(
    input: InitMultipartUploadInput,
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    if (!input.hash) {
      throw new BizError('参数 hash 不能为空').codeAs(400);
    }

    const fileSize = this.parsePositiveFileSize(input.size);
    const location = await this.locate(input, actor, fileSize);
    let file = location.existing;
    if (file) {
      this.assertUploadOwner(file.createdBy, actor);
      if (file.hash !== input.hash) {
        throw new BizError('该 OSS key 已被另一个文件的上传任务占用')
          .codeAs(409)
          .httpStatusAs(409);
      }
      if (file.completed) {
        throw new BizError('该 OSS key 已有完成文件，请为新文件生成新 key')
          .codeAs(409)
          .httpStatusAs(409);
      }
      if (file.size !== `${fileSize}`) {
        throw new BizError('续传文件大小与原上传任务不一致').codeAs(409);
      }
    }

    const resolvedChunkSize =
      await this.s3StorageService.resolveMultipartChunkSize(
        location.ossConfigCode,
        input.chunkSize,
      );

    const isNew = !file;
    let uploadId = file?.uploadId ?? undefined;
    const shouldInitUpload = !uploadId || isNew;
    const effectiveChunkSize =
      !isNew && file?.chunkSize ? file.chunkSize : resolvedChunkSize;
    if (fileSize > effectiveChunkSize) {
      if (effectiveChunkSize < MIN_S3_MULTIPART_CHUNK_SIZE) {
        throw new BizError('S3 非末尾分片不能小于 5 MiB').codeAs(400);
      }
      if (Math.ceil(fileSize / effectiveChunkSize) > MAX_S3_MULTIPART_PARTS) {
        throw new BizError(
          `S3 分片数量不能超过 ${MAX_S3_MULTIPART_PARTS}`,
        ).codeAs(400);
      }
    }

    const baseUpdate = {
      filename: input.filename,
      mimeType: input.mimeType,
      suffix: input.suffix,
      meta: location.meta,
      object: location.key,
      hash: input.hash,
      domain: location.domain,
      storageType: 'oss' as const,
      ossConfigCode: location.ossConfigCode,
      size: `${fileSize}`,
      chunkSize: effectiveChunkSize,
      completed: false,
    };

    let initPayload: { key: string; uploadId?: string; bucket?: string } = {
      key: location.key,
      uploadId,
    };
    if (!file) {
      try {
        file = await this.fileService.createOssUploadTask(
          {
            ...baseUpdate,
            uploadId: undefined,
          },
          actor.identityType,
          actor.identityId,
        );
      } catch (error) {
        this.rethrowOssKeyConflict(error);
      }
    }

    if (shouldInitUpload) {
      initPayload = await this.s3StorageService.initMultipartUpload({
        ossConfigCode: location.ossConfigCode,
        key: location.key,
        acl: location.acl,
        contentType: input.contentType,
        cacheControl: input.cacheControl,
        metadata: input.metadata,
      });
      uploadId = initPayload.uploadId;
    }

    Object.assign(file, baseUpdate, {
      uploadId,
    });
    file.updatedBy = actor.identityId;

    file = await this.fileService.save(file);

    let parts: { partNumber?: number; eTag?: string }[] = [];
    if (!isNew && !shouldInitUpload && uploadId) {
      parts = await this.listAllUploadParts({
        ossConfigCode: location.ossConfigCode,
        key: location.key,
        uploadId,
      });
    }

    return {
      upload: { ...initPayload, ossConfigCode: location.ossConfigCode },
      file,
      chunkSize: effectiveChunkSize,
      parts,
    };
  }

  async signMultipartPart(
    input: SignMultipartPartInput,
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    const file = await this.fileService.findById(input.fileId);
    this.assertUploadOwner(file.createdBy, actor);
    if (
      file.completed ||
      file.storageType !== 'oss' ||
      !file.ossConfigCode ||
      !file.uploadId ||
      !file.chunkSize ||
      !file.size
    ) {
      throw new BizError('文件没有可上传的 OSS 分片任务').codeAs(400);
    }

    const fileSize = this.parsePositiveFileSize(file.size);
    const totalParts = Math.ceil(fileSize / file.chunkSize);
    if (input.partNumber > totalParts) {
      throw new BizError('partNumber 超出文件分片范围').codeAs(400);
    }
    const expectedLength = this.getExpectedPartSize(
      fileSize,
      file.chunkSize,
      input.partNumber,
    );
    if (input.contentLength !== expectedLength) {
      throw new BizError('分片大小与上传任务不一致').codeAs(400);
    }

    return await this.s3StorageService.generatePresignedUploadPartUrl({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      uploadId: file.uploadId,
      partNumber: input.partNumber,
      contentLength: input.contentLength,
      contentMd5: input.contentMd5,
      expiresIn: input.expiresIn,
    });
  }

  async recordCompletedObject(
    input: CompleteObjectCallbackInput,
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    const file = await this.fileService.findById(input.fileId);
    this.assertUploadOwner(file.createdBy, actor);
    if (file.completed) return file;
    if (file.storageType !== 'oss' || !file.ossConfigCode || !file.size) {
      throw new BizError('文件没有待完成的 OSS 直传任务').codeAs(400);
    }
    const objectMetadata = await this.s3StorageService.getObjectMetadata({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
    });
    const expectedSize = this.parseFileSize(file.size, true);
    if (objectMetadata.size !== expectedSize) {
      throw new BizError('OSS 对象大小与上传任务不一致').codeAs(400);
    }
    await this.applyUploadAcl(file);
    file.mimeType = objectMetadata.contentType;
    file.fullUrl = objectMetadata.fullUrl;
    file.size = `${objectMetadata.size}`;
    file.completed = true;
    file.updatedBy = actor.identityId;
    return await this.fileService.save(file);
  }

  async completeMultipart(
    input: { fileId: string },
    actor: MultipartUploadActor,
  ) {
    this.assertAuthenticatedActor(actor);
    if (!input.fileId) {
      throw new BizError('参数 fileId 不能为空').codeAs(400);
    }

    const file = await this.fileService.findById(input.fileId);
    this.assertUploadOwner(file.createdBy, actor);
    if (file.completed) return file;
    if (file.storageType !== 'oss') {
      throw new BizError('文件不是 OSS 存储类型').codeAs(400);
    }
    if (!file.ossConfigCode) {
      throw new BizError('文件缺少 ossConfigCode').codeAs(400);
    }
    if (!file.uploadId || !file.chunkSize || !file.size) {
      throw new BizError('文件缺少有效的分片上传信息').codeAs(400);
    }

    const parts = await this.listAllUploadParts({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      uploadId: file.uploadId,
    });

    const fileSize = this.parsePositiveFileSize(file.size);
    const expectedPartCount = Math.ceil(fileSize / file.chunkSize);
    const normalizedParts = this.validateCompletedParts(
      parts,
      fileSize,
      file.chunkSize,
      expectedPartCount,
    );

    const completeResult = await this.s3StorageService.completeMultipartUpload({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      uploadId: file.uploadId,
      parts: normalizedParts,
    });

    const objectMetadata = await this.s3StorageService.getObjectMetadata({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
    });
    if (objectMetadata.size !== fileSize) {
      throw new BizError('合并后的 OSS 对象大小与上传任务不一致').codeAs(400);
    }
    await this.applyUploadAcl(file);

    file.fullUrl = objectMetadata.fullUrl ?? completeResult.fullUrl;
    file.mimeType = objectMetadata.contentType ?? file.mimeType;
    file.size = `${objectMetadata.size}`;
    file.uploadId = null;
    file.completed = true;
    file.updatedBy = actor.identityId;

    return await this.fileService.save(file);
  }

  async abortMultipart(input: { fileId: string }, actor: MultipartUploadActor) {
    this.assertAuthenticatedActor(actor);
    const file = await this.fileService.findById(input.fileId);
    this.assertUploadOwner(file.createdBy, actor);
    if (file.completed) {
      throw new BizError('已完成的文件不能终止分片上传').codeAs(400);
    }
    if (!file.ossConfigCode || !file.uploadId) {
      throw new BizError('文件没有可终止的 OSS 分片上传').codeAs(400);
    }
    await this.s3StorageService.abortMultipartUpload({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      uploadId: file.uploadId,
    });
    file.uploadId = null;
    file.completed = false;
    file.updatedBy = actor.identityId;
    return await this.fileService.save(file);
  }

  /**
   * 决定上传位置。注册了 OssUploadPolicy 时由策略决定配置、对象键与 ACL，
   * 并按“同一上传人 + hash + 大小 + 用途”复用未完成任务以支持续传；
   * 否则沿用客户端传入的 ossConfigCode / key（已废弃）。
   */
  private async locate(
    input: UploadLocationInput & {
      filename: string;
      hash: string;
      contentType?: string;
      meta?: Record<string, unknown>;
    },
    actor: Required<MultipartUploadActor>,
    size: number,
  ): Promise<UploadLocation> {
    if (!this.uploadPolicy) return await this.locateLegacy(input);
    const owned = POLICY_OWNED_FIELDS.filter(
      (field) => input[field] !== undefined && input[field] !== '',
    );
    if (owned.length) {
      throw new BizError(
        `OSS 配置与对象键由服务端决定，请改传 purpose，不要传 ${owned.join('、')}`,
      ).codeAs(400);
    }
    const purpose = input.purpose?.trim() ?? '';
    const target = await this.uploadPolicy.resolve({
      purpose: purpose || undefined,
      filename: input.filename,
      size,
      contentType: input.contentType,
      hash: input.hash,
      actor,
    });
    const meta = {
      ...(input.meta ?? {}),
      ...(target.meta ?? {}),
      [UPLOAD_PURPOSE_META_KEY]: purpose,
      [UPLOAD_ACL_META_KEY]: target.acl ?? null,
    };
    const existing = await this.fileService.findPendingOssUpload({
      createdBy: actor.identityId,
      hash: input.hash,
      size: `${size}`,
      purpose,
    });
    return existing?.ossConfigCode
      ? {
          ossConfigCode: existing.ossConfigCode,
          key: existing.object,
          acl: target.acl,
          meta,
          existing,
        }
      : { ...target, meta, existing: null };
  }

  /** 策略模式：直传完成后按任务记录的 ACL 设置对象权限（部分 S3 兼容服务不识别预签名中的 ACL）。 */
  private async applyUploadAcl(file: SysFileEntity) {
    const acl = file.meta?.[UPLOAD_ACL_META_KEY] as ObjectCannedACL | undefined;
    if (!acl || !file.ossConfigCode) return;
    await this.s3StorageService.setObjectAcl({
      ossConfigCode: file.ossConfigCode,
      key: file.object,
      acl,
    });
  }

  private async locateLegacy(
    input: UploadLocationInput & { meta?: Record<string, unknown> },
  ): Promise<UploadLocation> {
    if (!input.ossConfigCode) {
      throw new BizError('参数 ossConfigCode 不能为空').codeAs(400);
    }
    if (!input.key) {
      throw new BizError('参数 key 不能为空').codeAs(400);
    }
    const existing = await this.fileService.findOssByObject(
      input.key,
      input.ossConfigCode,
    );
    return {
      ossConfigCode: input.ossConfigCode,
      key: input.key,
      acl: input.acl,
      domain: input.domain,
      meta: input.meta ?? existing?.meta ?? {},
      existing,
    };
  }

  private async listAllUploadParts(input: {
    ossConfigCode: string;
    key: string;
    uploadId: string;
  }) {
    const parts: { partNumber?: number; eTag?: string; size?: number }[] = [];
    let marker: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.s3StorageService.listUploadParts({
        ossConfigCode: input.ossConfigCode,
        key: input.key,
        uploadId: input.uploadId,
        partNumberMarker: marker,
      });

      if (result.parts.length > 0) {
        parts.push(...result.parts);
      }

      hasMore = !!result.isTruncated;
      marker = result.nextPartNumberMarker;
    }

    return parts;
  }

  private assertAuthenticatedActor(
    actor: MultipartUploadActor,
  ): asserts actor is Required<MultipartUploadActor> {
    if (!actor.identityId || !actor.identityType) {
      throw new BizError('没有身份信息，无法操作上传任务').codeAs(401);
    }
  }

  private assertUploadOwner(
    createdBy: string | undefined,
    actor: MultipartUploadActor,
  ) {
    if (
      actor.identityType !== IdentityType.OP_USER &&
      (!createdBy || createdBy !== actor.identityId)
    ) {
      throw new BizError('无权操作其他用户的上传任务').codeAs(403);
    }
  }

  private parsePositiveFileSize(size: string) {
    return this.parseFileSize(size, false);
  }

  private parseFileSize(size: string, allowZero: boolean) {
    const pattern = allowZero ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/;
    if (!pattern.test(size)) {
      throw new BizError(
        allowZero ? '文件大小必须为非负整数' : '文件大小必须为正整数',
      ).codeAs(400);
    }
    const parsed = Number(size);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      (!allowZero && parsed === 0)
    ) {
      throw new BizError('文件大小超出支持范围').codeAs(400);
    }
    return parsed;
  }

  private getExpectedPartSize(
    fileSize: number,
    chunkSize: number,
    partNumber: number,
  ) {
    const start = (partNumber - 1) * chunkSize;
    return Math.min(chunkSize, fileSize - start);
  }

  private validateCompletedParts(
    parts: { partNumber?: number; eTag?: string; size?: number }[],
    fileSize: number,
    chunkSize: number,
    expectedPartCount: number,
  ) {
    const normalized = parts
      .filter(
        (part): part is { partNumber: number; eTag: string; size: number } =>
          part.partNumber != null && !!part.eTag && part.size != null,
      )
      .sort((left, right) => left.partNumber - right.partNumber);
    if (normalized.length !== expectedPartCount) {
      throw new BizError(
        `分片数量不完整，预期 ${expectedPartCount} 个，实际 ${normalized.length} 个`,
      ).codeAs(400);
    }
    normalized.forEach((part, index) => {
      const expectedPartNumber = index + 1;
      const expectedSize = this.getExpectedPartSize(
        fileSize,
        chunkSize,
        expectedPartNumber,
      );
      if (
        part.partNumber !== expectedPartNumber ||
        part.size !== expectedSize
      ) {
        throw new BizError(`第 ${expectedPartNumber} 个分片不完整`).codeAs(400);
      }
    });
    return normalized;
  }

  private getFileSuffix(filename: string) {
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex > -1 ? filename.slice(dotIndex + 1) : undefined;
  }

  private rethrowOssKeyConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new BizError('该 OSS key 已被其他上传任务占用')
        .codeAs(409)
        .httpStatusAs(409);
    }
    throw error;
  }
}
