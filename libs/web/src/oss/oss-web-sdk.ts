import { OssSdkError } from './errors';
import { FileUploadProcess } from './file-upload-process';
import { OssFetchClient } from './http-client';
import { S3MultipartUploadAdapter } from './s3-multipart-upload.adapter';
import { createContentMd5, createFileContentFingerprint } from './md5';
import type {
  FileRecord,
  FileUploadProcessOptions,
  OssWebSdkOptions,
} from './types';

export interface DirectUploadOptions {
  file: File;
  /**
   * 上传用途。服务端注册了上传策略（OssUploadPolicy）时只传它，
   * OSS 配置与对象键由服务端决定。
   */
  purpose?: string;
  /** @deprecated 仅服务端未注册上传策略的旧模式使用。 */
  key?: string;
  /** @deprecated 仅服务端未注册上传策略的旧模式使用。 */
  ossConfigCode?: string;
  hash?: string;
  meta?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AccessUrlOptions {
  fileId: string;
  expiresIn?: number;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export class OssWebSdk {
  readonly client: OssFetchClient;
  private readonly multipartThreshold?: number;

  constructor(options: OssWebSdkOptions = {}) {
    this.client = new OssFetchClient(options);
    this.multipartThreshold = options.multipartThreshold;
  }

  createUploadProcess(
    options: Omit<FileUploadProcessOptions, 'adapter'>,
  ): FileUploadProcess {
    const hashProvider = options.hashProvider ?? createFileContentFingerprint;
    const directUpload =
      options.directUpload ??
      (async (signal: AbortSignal) => {
        const hash = options.hash ?? (await hashProvider(options.file, signal));
        return await this.upload({
          file: options.file,
          purpose: options.purpose,
          key: options.key,
          ossConfigCode: options.ossConfigCode,
          hash,
          meta: options.meta,
          signal,
        });
      });
    return new FileUploadProcess({
      ...options,
      directUpload,
      multipartThreshold: options.multipartThreshold ?? this.multipartThreshold,
      hashProvider,
      partChecksumProvider:
        options.partChecksumProvider ??
        (async (body, signal) => ({
          algorithm: 'content-md5',
          value: await createContentMd5(body, signal),
        })),
      adapter: new S3MultipartUploadAdapter({ client: this.client }),
    });
  }

  async upload(options: DirectUploadOptions): Promise<FileRecord> {
    const contentMd5 = await createContentMd5(options.file, options.signal);
    const signed = await this.client.post<{
      url?: string;
      fullUrl?: string;
      file: FileRecord;
      completed: boolean;
    }>(
      this.client.endpoints.signPut,
      {
        purpose: options.purpose,
        ossConfigCode: options.ossConfigCode,
        key: options.key,
        filename: options.file.name,
        hash: options.hash ?? `md5:${contentMd5}`,
        size: `${options.file.size}`,
        contentMd5,
        meta: options.meta,
        contentType: options.file.type || undefined,
      },
      options.signal,
    );
    if (signed.completed) return signed.file;
    if (!signed.url) {
      throw new OssSdkError('OSS 直传签名响应缺少 URL');
    }
    const uploadResponse = await this.client.fetch(signed.url, {
      method: 'PUT',
      body: options.file,
      headers: {
        'content-md5': contentMd5,
        ...(options.file.type
          ? { 'content-type': options.file.type }
          : undefined),
      },
      signal: options.signal,
    });
    if (!uploadResponse.ok) {
      throw new OssSdkError(
        `OSS 文件上传失败: ${uploadResponse.status}`,
        uploadResponse.status,
      );
    }
    return await this.client.post<FileRecord>(
      this.client.endpoints.callback,
      {
        fileId: signed.file.id,
      },
      options.signal,
    );
  }

  async getAccessUrl(options: AccessUrlOptions): Promise<string> {
    const signed = await this.client.post<{ url: string }>(
      this.client.endpoints.signGet,
      options,
    );
    return signed.url;
  }
}
