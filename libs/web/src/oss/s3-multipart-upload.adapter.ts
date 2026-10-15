import { OssSdkError } from './errors';
import { OssFetchClient } from './http-client';
import { createContentMd5 } from './md5';
import type {
  FileRecord,
  MultipartCompleteResult,
  MultipartInitializeInput,
  MultipartUploadAdapter,
  MultipartUploadPartInput,
  MultipartUploadSession,
  UploadedPart,
} from './types';

const MIN_S3_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_S3_PARTS = 10_000;

interface MultipartInitResponse {
  upload: { uploadId: string; key: string; ossConfigCode?: string };
  file: FileRecord & { uploadId: string };
  chunkSize: number;
  parts: UploadedPart[];
}

interface SignPartResponse {
  url: string;
}

export interface S3MultipartUploadAdapterOptions {
  client: OssFetchClient;
  uploadHeaders?: HeadersInit | ((partNumber: number) => HeadersInit);
}

export class S3MultipartUploadAdapter implements MultipartUploadAdapter {
  constructor(private readonly options: S3MultipartUploadAdapterOptions) {}

  async initialize(
    input: MultipartInitializeInput,
  ): Promise<MultipartUploadSession> {
    if (
      input.chunkSize &&
      input.file.size > input.chunkSize &&
      input.chunkSize < MIN_S3_CHUNK_SIZE
    ) {
      throw new OssSdkError('S3 非末尾分片不能小于 5 MiB');
    }
    const result = await this.options.client.post<MultipartInitResponse>(
      this.options.client.endpoints.multipartInit,
      {
        purpose: input.purpose,
        ossConfigCode: input.ossConfigCode,
        key: input.key,
        hash: input.hash,
        filename: input.file.name,
        contentType: input.file.type || undefined,
        mimeType: input.file.type || undefined,
        suffix: getFileSuffix(input.file.name),
        size: `${input.file.size}`,
        chunkSize: input.chunkSize,
        metadata: input.metadata,
        meta: input.meta,
      },
      input.signal,
    );
    const totalParts = Math.ceil(input.file.size / result.chunkSize);
    if (totalParts > 1 && result.chunkSize < MIN_S3_CHUNK_SIZE) {
      throw new OssSdkError('S3 非末尾分片不能小于 5 MiB');
    }
    if (totalParts > MAX_S3_PARTS) {
      throw new OssSdkError(`S3 分片数量不能超过 ${MAX_S3_PARTS}`);
    }
    return {
      fileId: result.file.id,
      uploadId: result.upload.uploadId,
      key: result.upload.key,
      ossConfigCode:
        result.upload.ossConfigCode ??
        result.file.ossConfigCode ??
        input.ossConfigCode,
      chunkSize: result.chunkSize,
      uploadedParts: result.parts,
    };
  }

  async uploadPart(input: MultipartUploadPartInput): Promise<UploadedPart> {
    const checksum = input.checksum ?? {
      algorithm: 'content-md5' as const,
      value: await createContentMd5(input.body, input.signal),
    };
    const signed = await this.options.client.post<SignPartResponse>(
      this.options.client.endpoints.multipartSignPart,
      {
        fileId: input.session.fileId,
        partNumber: input.partNumber,
        contentLength: input.body.size,
        contentMd5: checksum.value,
      },
      input.signal,
    );
    const configuredHeaders =
      typeof this.options.uploadHeaders === 'function'
        ? this.options.uploadHeaders(input.partNumber)
        : this.options.uploadHeaders;
    const uploadHeaders = new Headers(configuredHeaders);
    if (checksum.algorithm === 'content-md5') {
      uploadHeaders.set('content-md5', checksum.value);
    }
    const response = await this.options.client.fetch(signed.url, {
      method: 'PUT',
      headers: uploadHeaders,
      body: input.body,
      signal: input.signal,
    });
    if (!response.ok) {
      throw new OssSdkError(
        `OSS 分片上传失败: ${response.status}`,
        response.status,
      );
    }
    return {
      partNumber: input.partNumber,
      eTag: response.headers.get('etag') ?? undefined,
      size: input.body.size,
    };
  }

  async complete(
    session: MultipartUploadSession,
  ): Promise<MultipartCompleteResult> {
    return await this.options.client.post<MultipartCompleteResult>(
      this.options.client.endpoints.multipartComplete,
      { fileId: session.fileId },
    );
  }

  async abort(session: MultipartUploadSession): Promise<void> {
    await this.options.client.post<FileRecord>(
      this.options.client.endpoints.multipartAbort,
      { fileId: session.fileId },
    );
  }
}

function getFileSuffix(filename: string): string | undefined {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > -1 ? filename.slice(dotIndex + 1) : undefined;
}
