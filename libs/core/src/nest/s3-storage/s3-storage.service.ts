import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import {
  OssAddressingStyle,
  OssProvider,
} from '@qyy-code-lego/nestjs/entities/core/sys/oss-s3-config.interface';
import { OssConfigService } from '../file-management/oss-config.service';
import {
  S3StorageAbortMultipartOptions,
  S3StorageCompleteMultipartOptions,
  S3StorageDeleteOptions,
  S3StorageSetAclOptions,
  S3StorageDownloadOptions,
  S3StorageHeadOptions,
  S3StorageListOptions,
  S3StorageListPartsOptions,
  S3StorageMultipartInitOptions,
  S3StorageSignOptions,
  S3StorageSignGetOptions,
  S3StorageSignPutOptions,
  S3StorageSignUploadPartOptions,
  S3StorageUploadOptions,
  S3StorageUploadPartOptions,
} from './s3-storage.types';

interface CachedS3ClientContext {
  fingerprint: string;
  /** Node.js 服务端对象操作客户端，可按配置走内网。 */
  client: S3Client;
  /** 对外预签名客户端，始终使用公网 endpoint。 */
  signingClient: S3Client;
  accessClient?: S3Client;
  accessDomain?: string;
  bucket: string;
  provider: OssProvider;
  endpoint?: string;
  domain?: string;
  signingExpiresIn?: number;
  addressingStyle: OssAddressingStyle;
}

@Injectable()
export class S3StorageService {
  private readonly clientCache = new Map<string, CachedS3ClientContext>();
  private readonly DEFAULT_MULTIPART_CHUNK_SIZE = 8 * 1024 * 1024;

  constructor(private readonly ossConfigService: OssConfigService) {}

  private resolveExpiresIn(
    requestedExpiresIn?: number,
    configDefaultExpiresIn?: number,
  ) {
    if (requestedExpiresIn != null && requestedExpiresIn > 0) {
      return requestedExpiresIn;
    }
    if (configDefaultExpiresIn != null && configDefaultExpiresIn > 0) {
      return configDefaultExpiresIn;
    }
    return 900;
  }

  async resolveMultipartChunkSize(
    ossConfigCode: string,
    requestedChunkSize?: number,
  ) {
    if (requestedChunkSize != null) {
      if (!Number.isInteger(requestedChunkSize) || requestedChunkSize <= 0) {
        throw new BizError('chunkSize 必须为正整数').codeAs(400);
      }
      return requestedChunkSize;
    }

    const ossConfig = await this.ossConfigService.findByCode(ossConfigCode);
    if (!ossConfig) {
      throw new BizError(`OSS 配置不存在: ${ossConfigCode}`).codeAs(404);
    }

    const configRecord = ossConfig.config as {
      multipartChunkSize?: unknown;
      chunkSize?: unknown;
    };
    const configChunkSize =
      configRecord.multipartChunkSize ?? configRecord.chunkSize;

    if (configChunkSize == null) {
      return this.DEFAULT_MULTIPART_CHUNK_SIZE;
    }

    const normalized = Number(configChunkSize);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new BizError(
        'OSS 配置中的 chunkSize/multipartChunkSize 非法',
      ).codeAs(400);
    }
    return normalized;
  }

  /**
   * 基于 OSS 配置 code 解析并缓存 S3 客户端上下文。
   * - 配置来源：`sys_oss_config.bucket`、`sys_oss_config.endpoint`、`sys_oss_config.config`
   * - `config` 使用统一结构：`OssS3Config`
   */
  private async getClientContext(ossConfigCode: string) {
    const ossConfig = await this.ossConfigService.findByCode(ossConfigCode);
    if (!ossConfig) {
      throw new BizError(`OSS 配置不存在: ${ossConfigCode}`).codeAs(404);
    }

    const freeConfig = ossConfig.config;
    const provider = freeConfig?.provider ?? OssProvider.S3;
    const accessKeyId = freeConfig?.accessKeyId;
    const secretAccessKey = freeConfig?.secretAccessKey;
    const sessionToken = freeConfig?.sessionToken;
    const region = freeConfig?.region || 'us-east-1';
    const endpoint = ossConfig.endpoint;
    const internalEndpoint = ossConfig.internalEndpoint ?? undefined;
    const useInternalEndpoint = ossConfig.useInternalEndpoint ?? false;
    if (useInternalEndpoint && !internalEndpoint) {
      throw new BizError(
        `OSS 配置已启用内网传输但缺少内网端点: ${ossConfigCode}`,
      ).codeAs(400);
    }
    const serverEndpoint = useInternalEndpoint ? internalEndpoint : endpoint;
    const addressingStyle =
      freeConfig?.addressingStyle ??
      (freeConfig?.forcePathStyle
        ? OssAddressingStyle.PATH
        : OssAddressingStyle.VIRTUAL_HOSTED);
    if (
      freeConfig?.provider === OssProvider.ALIYUN &&
      addressingStyle !== OssAddressingStyle.VIRTUAL_HOSTED
    ) {
      throw new BizError('阿里云 OSS 仅支持 virtual-hosted 寻址样式').codeAs(
        400,
      );
    }
    const forcePathStyle = addressingStyle === OssAddressingStyle.PATH;
    const domain = freeConfig?.domain;
    const signingExpiresIn = freeConfig?.signingExpiresIn;

    const fingerprint = JSON.stringify({
      provider,
      endpoint,
      internalEndpoint,
      useInternalEndpoint,
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      forcePathStyle,
      bucket: ossConfig.bucket,
      domain,
      signingExpiresIn,
      addressingStyle,
    });

    const cached = this.clientCache.get(ossConfigCode);
    if (cached && cached.fingerprint === fingerprint) {
      return cached;
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new BizError(
        `OSS 配置缺少凭证: ${ossConfigCode}，请在 config 中设置 accessKeyId / secretAccessKey`,
      ).codeAs(400);
    }

    const credentials = {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
    // AWS SDK v3 默认会给流式 PutObject 加上 aws-chunked checksum trailer。
    // 阿里云 OSS 的 S3 兼容接口不支持该编码，仅在服务端要求时再计算校验和。
    const checksumCompatibility =
      provider === OssProvider.ALIYUN
        ? ({
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
          } as const)
        : {};
    const client = new S3Client({
      region,
      endpoint: serverEndpoint,
      forcePathStyle,
      credentials,
      ...checksumCompatibility,
    });
    const signingClient = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials,
      ...checksumCompatibility,
    });
    const accessDomain =
      provider === OssProvider.ALIYUN && domain
        ? this.normalizeAccessDomain(domain)
        : undefined;
    const accessClient = accessDomain
      ? new S3Client({
          region,
          bucketEndpoint: true,
          credentials,
          ...checksumCompatibility,
        })
      : undefined;

    const context: CachedS3ClientContext = {
      fingerprint,
      client,
      signingClient,
      accessClient,
      accessDomain,
      bucket: ossConfig.bucket,
      provider,
      endpoint,
      domain,
      signingExpiresIn,
      addressingStyle,
    };
    this.clientCache.set(ossConfigCode, context);
    return context;
  }

  private normalizeAccessDomain(domain: string) {
    let url: URL;
    try {
      url = new URL(domain);
    } catch {
      throw new BizError('OSS 配置中的 domain 必须是完整 URL').codeAs(400);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BizError('OSS 配置中的 domain 仅支持 HTTP/HTTPS').codeAs(400);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new BizError('OSS 配置中的 domain 不能包含路径、查询或锚点').codeAs(
        400,
      );
    }
    return url.origin;
  }

  /**
   * 构建对象访问 URL。
   * 优先使用 `domain`（CDN/自定义域名），否则按配置的寻址样式生成 URL。
   */
  private buildObjectUrl(
    key: string,
    bucket: string,
    endpoint?: string,
    domain?: string,
    addressingStyle: OssAddressingStyle = OssAddressingStyle.VIRTUAL_HOSTED,
  ) {
    const encodedKey = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    if (domain) {
      return `${domain.replace(/\/$/, '')}/${encodedKey}`;
    }
    if (!endpoint) return undefined;
    const normalizedEndpoint = endpoint.replace(/\/$/, '');
    if (addressingStyle === OssAddressingStyle.PATH) {
      return `${normalizedEndpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
    }

    try {
      const url = new URL(normalizedEndpoint);
      if (!url.hostname.startsWith(`${bucket}.`)) {
        url.hostname = `${bucket}.${url.hostname}`;
      }
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodedKey}`;
      return url.toString();
    } catch {
      return `${normalizedEndpoint.replace('://', `://${bucket}.`)}/${encodedKey}`;
    }
  }

  /**
   * 上传对象（同 key 可覆盖更新）。
   */
  async uploadObject(options: S3StorageUploadOptions) {
    const { client, bucket, endpoint, domain, addressingStyle } =
      await this.getClientContext(options.ossConfigCode);
    const output = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        ContentDisposition: options.contentDisposition,
        Metadata: options.metadata,
        ACL: options.acl,
      }),
    );

    return {
      bucket,
      key: options.key,
      eTag: output.ETag,
      versionId: output.VersionId,
      fullUrl: this.buildObjectUrl(
        options.key,
        bucket,
        endpoint,
        domain,
        addressingStyle,
      ),
    };
  }

  /**
   * 下载对象内容。
   * 可通过 `range` 获取分段数据。
   */
  async downloadObject(options: S3StorageDownloadOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    return await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: options.key,
        Range: options.range,
      }),
    );
  }

  /**
   * 查询对象元数据（不返回文件内容）。
   */
  async getObjectMetadata(options: S3StorageHeadOptions) {
    const { client, bucket, endpoint, domain, addressingStyle } =
      await this.getClientContext(options.ossConfigCode);
    const output = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: options.key,
      }),
    );

    return {
      bucket,
      key: options.key,
      size: output.ContentLength,
      eTag: output.ETag,
      contentType: output.ContentType,
      cacheControl: output.CacheControl,
      lastModifiedAt: output.LastModified,
      metadata: output.Metadata,
      versionId: output.VersionId,
      fullUrl: this.buildObjectUrl(
        options.key,
        bucket,
        endpoint,
        domain,
        addressingStyle,
      ),
    };
  }

  /**
   * 列举对象列表，支持前缀、分页与目录分隔符。
   */
  async listObjects(options: S3StorageListOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    const output = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.prefix,
        Delimiter: options.delimiter,
        ContinuationToken: options.continuationToken,
        MaxKeys: options.maxKeys,
      }),
    );

    return {
      bucket,
      isTruncated: output.IsTruncated,
      nextContinuationToken: output.NextContinuationToken,
      items:
        output.Contents?.map((item) => ({
          key: item.Key,
          size: item.Size,
          eTag: item.ETag,
          lastModifiedAt: item.LastModified,
          storageClass: item.StorageClass,
        })) ?? [],
      prefixes:
        output.CommonPrefixes?.map((item) => item.Prefix).filter(
          (prefix): prefix is string => !!prefix,
        ) ?? [],
    };
  }

  /**
   * 生成对象预签名 URL。
   * 支持 `getObject` 与 `putObject` 两种操作。
   */
  async signObject(options: S3StorageSignOptions) {
    const { signingClient, bucket, signingExpiresIn } =
      await this.getClientContext(options.ossConfigCode);
    const expiresIn = this.resolveExpiresIn(
      options.expiresIn,
      signingExpiresIn,
    );

    const commandMap = {
      getObject: () =>
        new GetObjectCommand({
          Bucket: bucket,
          Key: options.key,
          ResponseContentType: options.responseContentType,
          ResponseContentDisposition: options.responseContentDisposition,
        }),
      putObject: () =>
        new PutObjectCommand({
          Bucket: bucket,
          Key: options.key,
          ContentType: options.contentType,
        }),
    };

    const command = commandMap[options.operation]();
    const url = await getSignedUrl(signingClient, command, { expiresIn });

    return {
      bucket,
      key: options.key,
      operation: options.operation,
      expiresIn,
      url,
    };
  }

  /**
   * 生成 PUT 直传预签名 URL，供客户端直接上传对象。
   */
  async generatePresignedPutUrl(options: S3StorageSignPutOptions) {
    const {
      signingClient,
      bucket,
      endpoint,
      domain,
      addressingStyle,
      signingExpiresIn,
    } = await this.getClientContext(options.ossConfigCode);
    const expiresIn = this.resolveExpiresIn(
      options.expiresIn,
      signingExpiresIn,
    );

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ContentType: options.contentType,
      CacheControl: options.cacheControl,
      ContentDisposition: options.contentDisposition,
      Metadata: options.metadata,
      ACL: options.acl,
      ContentLength: options.contentLength,
      ContentMD5: options.contentMd5,
    });

    const url = await getSignedUrl(signingClient, command, { expiresIn });

    return {
      bucket,
      key: options.key,
      operation: 'putObject' as const,
      expiresIn,
      url,
      fullUrl: this.buildObjectUrl(
        options.key,
        bucket,
        endpoint,
        domain,
        addressingStyle,
      ),
    };
  }

  /**
   * 生成 GET 访问预签名 URL。
   */
  async generatePresignedGetUrl(options: S3StorageSignGetOptions) {
    const {
      signingClient,
      accessClient,
      accessDomain,
      bucket,
      provider,
      signingExpiresIn,
    } = await this.getClientContext(options.ossConfigCode);
    const expiresIn = this.resolveExpiresIn(
      options.expiresIn,
      signingExpiresIn,
    );
    const command = new GetObjectCommand({
      // bucketEndpoint 模式要求 Bucket 传入完整自定义域名 URL。
      Bucket: accessDomain ?? bucket,
      Key: options.key,
      // 阿里云 OSS 明确禁止通过 GET 参数覆盖 Content-Type（0017-00000902）。
      ResponseContentType:
        provider === OssProvider.ALIYUN
          ? undefined
          : options.responseContentType,
      ResponseContentDisposition: options.responseContentDisposition,
    });
    const url = await getSignedUrl(accessClient ?? signingClient, command, {
      expiresIn,
    });
    return {
      bucket,
      key: options.key,
      operation: 'getObject' as const,
      expiresIn,
      url,
    };
  }

  /**
   * 生成 UploadPart 分片预签名 URL，供客户端分片直传。
   */
  async generatePresignedUploadPartUrl(
    options: S3StorageSignUploadPartOptions,
  ) {
    if (!options.uploadId) {
      throw new BizError('uploadId 不能为空').codeAs(400);
    }
    if (options.partNumber <= 0) {
      throw new BizError('partNumber 必须大于 0').codeAs(400);
    }

    const { signingClient, bucket, signingExpiresIn } =
      await this.getClientContext(options.ossConfigCode);
    const expiresIn = this.resolveExpiresIn(
      options.expiresIn,
      signingExpiresIn,
    );

    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: options.key,
      UploadId: options.uploadId,
      PartNumber: options.partNumber,
      ContentLength: options.contentLength,
      ContentMD5: options.contentMd5,
    });

    const url = await getSignedUrl(signingClient, command, { expiresIn });

    return {
      bucket,
      key: options.key,
      uploadId: options.uploadId,
      partNumber: options.partNumber,
      operation: 'uploadPart' as const,
      expiresIn,
      url,
    };
  }

  /**
   * 初始化分片上传，返回 `uploadId`。
   */
  async initMultipartUpload(options: S3StorageMultipartInitOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    const output = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: options.key,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        Metadata: options.metadata,
        ACL: options.acl,
      }),
    );

    if (!output.UploadId) {
      throw new BizError('初始化分片上传失败: 未返回 uploadId').codeAs(500);
    }

    return {
      bucket,
      key: options.key,
      uploadId: output.UploadId,
    };
  }

  /**
   * 上传单个分片。
   */
  async uploadPart(options: S3StorageUploadPartOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    const output = await client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: options.key,
        UploadId: options.uploadId,
        PartNumber: options.partNumber,
        Body: options.body,
        ContentLength: options.contentLength,
      }),
    );

    return {
      bucket,
      key: options.key,
      uploadId: options.uploadId,
      partNumber: options.partNumber,
      eTag: output.ETag,
    };
  }

  /**
   * 列举已上传分片，用于断点续传或校验分片状态。
   */
  async listUploadParts(options: S3StorageListPartsOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    const output = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: options.key,
        UploadId: options.uploadId,
        PartNumberMarker: options.partNumberMarker,
        MaxParts: options.maxParts,
      }),
    );

    return {
      bucket,
      key: options.key,
      uploadId: options.uploadId,
      nextPartNumberMarker:
        output.NextPartNumberMarker == null
          ? undefined
          : `${output.NextPartNumberMarker}`,
      isTruncated: output.IsTruncated,
      parts:
        output.Parts?.map((part) => ({
          partNumber: part.PartNumber,
          eTag: part.ETag,
          size: part.Size,
          lastModifiedAt: part.LastModified,
        })) ?? [],
    };
  }

  /**
   * 合并分片并完成上传。
   * 传入分片会按 `partNumber` 自动排序后提交。
   */
  async completeMultipartUpload(options: S3StorageCompleteMultipartOptions) {
    const { client, bucket, endpoint, domain, addressingStyle } =
      await this.getClientContext(options.ossConfigCode);
    if (!options.uploadId) {
      throw new BizError('uploadId 不能为空').codeAs(400);
    }
    const normalizedParts = [...options.parts]
      .filter((item) => !!item.eTag)
      .sort((left, right) => left.partNumber - right.partNumber)
      .map((item) => ({
        PartNumber: item.partNumber,
        ETag: item.eTag,
      }));

    if (normalizedParts.length === 0) {
      throw new BizError('分片列表不能为空').codeAs(400);
    }

    const output = await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: options.key,
        UploadId: options.uploadId,
        MultipartUpload: {
          Parts: normalizedParts,
        },
      }),
    );

    return {
      bucket,
      key: options.key,
      uploadId: options.uploadId,
      eTag: output.ETag,
      versionId: output.VersionId,
      location: output.Location,
      fullUrl: this.buildObjectUrl(
        options.key,
        bucket,
        endpoint,
        domain,
        addressingStyle,
      ),
    };
  }

  /**
   * 取消分片上传并清理服务端已上传分片。
   */
  async abortMultipartUpload(options: S3StorageAbortMultipartOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: options.key,
        UploadId: options.uploadId,
      }),
    );

    return {
      bucket,
      key: options.key,
      uploadId: options.uploadId,
      aborted: true,
    };
  }

  /**
   * 删除对象。S3 DeleteObject 对不存在的 key 也按成功处理，适合清理失败上传残留。
   */
  async deleteObject(options: S3StorageDeleteOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    const output = await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: options.key,
      }),
    );

    return {
      bucket,
      key: options.key,
      deleted: true,
      deleteMarker: output.DeleteMarker,
      versionId: output.VersionId,
    };
  }

  /**
   * 设置对象级 ACL。直传签名中的 ACL 会被提升为 URL 查询参数，部分 S3 兼容服务（如阿里云 OSS）
   * 不识别，因此直传完成后由服务端显式设置。
   */
  async setObjectAcl(options: S3StorageSetAclOptions) {
    const { client, bucket } = await this.getClientContext(
      options.ossConfigCode,
    );
    await client.send(
      new PutObjectAclCommand({
        Bucket: bucket,
        Key: options.key,
        ACL: options.acl,
      }),
    );
    return { bucket, key: options.key, acl: options.acl };
  }
}
