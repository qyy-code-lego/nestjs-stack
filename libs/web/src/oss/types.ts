export type FileUploadState =
  | 'idle'
  | 'initializing'
  | 'uploading'
  | 'paused'
  | 'completing'
  | 'completed'
  | 'stopped'
  | 'failed';

export type FileUploadMode = 'direct' | 'multipart';
export type FileUploadStrategy = 'auto' | FileUploadMode;

export interface FileUploadProgress {
  state: FileUploadState;
  loaded: number;
  total: number;
  percent: number;
  completedParts: number;
  totalParts: number;
}

export interface UploadedPart {
  partNumber: number;
  eTag?: string;
  size?: number;
}

export interface UploadPartChecksum {
  algorithm: 'content-md5';
  value: string;
}

export interface MultipartUploadSession {
  fileId: string;
  uploadId: string;
  /** 服务端返回的对象键。 */
  key: string;
  /** 服务端返回的 OSS 配置 code。 */
  ossConfigCode?: string;
  chunkSize: number;
  uploadedParts: UploadedPart[];
}

export interface MultipartInitializeInput {
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
  hash: string;
  chunkSize?: number;
  metadata?: Record<string, string>;
  meta?: Record<string, unknown>;
  signal: AbortSignal;
}

export interface MultipartUploadPartInput {
  session: MultipartUploadSession;
  file: File;
  partNumber: number;
  body: Blob;
  signal: AbortSignal;
  checksum?: UploadPartChecksum;
}

export interface MultipartCompleteResult {
  id: string;
  object: string;
  fullUrl?: string;
  [key: string]: unknown;
}

export interface MultipartUploadAdapter {
  initialize(input: MultipartInitializeInput): Promise<MultipartUploadSession>;
  uploadPart(input: MultipartUploadPartInput): Promise<UploadedPart>;
  complete(session: MultipartUploadSession): Promise<MultipartCompleteResult>;
  abort(session: MultipartUploadSession): Promise<void>;
}

export interface FileUploadProcessOptions {
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
  adapter: MultipartUploadAdapter;
  directUpload?: (signal: AbortSignal) => Promise<MultipartCompleteResult>;
  uploadMode?: FileUploadStrategy;
  multipartThreshold?: number;
  hash?: string;
  hashProvider?: (file: File, signal: AbortSignal) => Promise<string>;
  partChecksumProvider?: (
    body: Blob,
    signal: AbortSignal,
  ) => Promise<UploadPartChecksum>;
  chunkSize?: number;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  metadata?: Record<string, string>;
  meta?: Record<string, unknown>;
  onProgress?: (progress: FileUploadProgress) => void;
  onStateChange?: (state: FileUploadState) => void;
  onError?: (error: unknown) => void;
}

export interface ApiResBody<T> {
  code: number;
  message?: string;
  data: T;
}

export type RequestHeadersFactory = () => HeadersInit | Promise<HeadersInit>;

export interface OssWebSdkEndpoints {
  signPut: string;
  signGet: string;
  callback: string;
  multipartInit: string;
  multipartSignPart: string;
  multipartComplete: string;
  multipartAbort: string;
}

export interface OssWebSdkOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit | RequestHeadersFactory;
  endpoints?: Partial<OssWebSdkEndpoints>;
  multipartThreshold?: number;
}

export interface LocalWebSdkEndpoints {
  directUpload: string;
  multipartInit: string;
  multipartPart: string;
  multipartComplete: string;
  multipartAbort: string;
}

export interface LocalWebSdkOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit | RequestHeadersFactory;
  endpoints?: Partial<LocalWebSdkEndpoints>;
  multipartThreshold?: number;
}

export interface FileRecord extends MultipartCompleteResult {
  filename: string;
  mimeType?: string;
  suffix?: string;
  hash?: string;
  storageType: 'local' | 'oss';
  ossConfigCode?: string;
  size?: string;
  completed: boolean;
}
