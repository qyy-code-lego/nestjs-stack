import { FileUploadProcess } from './file-upload-process';
import { OssFetchClient } from './http-client';
import { LocalMultipartUploadAdapter } from './local-multipart-upload.adapter';
import { createContentMd5, createFileContentFingerprint } from './md5';
import type {
  FileRecord,
  FileUploadProcessOptions,
  LocalWebSdkEndpoints,
  LocalWebSdkOptions,
} from './types';

export const DEFAULT_LOCAL_ENDPOINTS: LocalWebSdkEndpoints = {
  directUpload: '/files/upload/local',
  multipartInit: '/files/local/multipart/init',
  multipartPart: '/files/local/multipart/part',
  multipartComplete: '/files/local/multipart/complete',
  multipartAbort: '/files/local/multipart/abort',
};

export class LocalWebSdk {
  readonly client: OssFetchClient;
  readonly endpoints: LocalWebSdkEndpoints;
  private readonly multipartThreshold?: number;

  constructor(options: LocalWebSdkOptions = {}) {
    this.client = new OssFetchClient({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      headers: options.headers,
    });
    this.endpoints = { ...DEFAULT_LOCAL_ENDPOINTS, ...options.endpoints };
    this.multipartThreshold = options.multipartThreshold;
  }

  /** 本地存储的对象路径由调用方指定，`key` 必填。 */
  createUploadProcess(
    options: Omit<FileUploadProcessOptions, 'adapter' | 'ossConfigCode'> & {
      key: string;
    },
  ): FileUploadProcess {
    const hashProvider = options.hashProvider ?? createFileContentFingerprint;
    const directUpload =
      options.directUpload ??
      (async (signal: AbortSignal) =>
        await this.upload({
          file: options.file,
          key: options.key,
          signal,
        }));
    return new FileUploadProcess({
      ...options,
      ossConfigCode: 'local',
      directUpload,
      multipartThreshold: options.multipartThreshold ?? this.multipartThreshold,
      hashProvider,
      partChecksumProvider:
        options.partChecksumProvider ??
        (async (body, signal) => ({
          algorithm: 'content-md5',
          value: await createContentMd5(body, signal),
        })),
      adapter: new LocalMultipartUploadAdapter(this.client, this.endpoints),
    });
  }

  async upload(options: {
    file: File;
    key: string;
    signal?: AbortSignal;
  }): Promise<FileRecord> {
    const body = new FormData();
    body.append('file', options.file);
    body.append('object', options.key);
    return await this.client.postForm<FileRecord>(
      this.endpoints.directUpload,
      body,
      options.signal,
    );
  }
}
