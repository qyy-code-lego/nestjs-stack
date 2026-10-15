import { OssSdkError, UploadStoppedError } from './errors';
import type {
  FileUploadProcessOptions,
  FileUploadProgress,
  FileUploadMode,
  FileUploadState,
  MultipartCompleteResult,
  MultipartUploadSession,
  UploadPartChecksum,
} from './types';

export const DEFAULT_MULTIPART_THRESHOLD = 10 * 1024 * 1024;
const UPLOAD_PAUSE_REASON = new OssSdkError('上传已暂停');

export class FileUploadProcess {
  private stateValue: FileUploadState = 'idle';
  private session?: MultipartUploadSession;
  private runPromise?: Promise<MultipartCompleteResult>;
  private pausePromise?: Promise<void>;
  private resolvePause?: () => void;
  private stopped = false;
  private stopReason?: unknown;
  private readonly activeControllers = new Set<AbortController>();
  private readonly completedPartNumbers = new Set<number>();
  private readonly concurrency: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  readonly mode: FileUploadMode;

  constructor(private readonly options: FileUploadProcessOptions) {
    const multipartThreshold = toPositiveInteger(
      options.multipartThreshold ?? DEFAULT_MULTIPART_THRESHOLD,
      'multipartThreshold',
    );
    const uploadMode = options.uploadMode ?? 'auto';
    if (uploadMode === 'direct' && !options.directUpload) {
      throw new OssSdkError('direct 模式必须提供 directUpload');
    }
    this.mode =
      !options.directUpload || uploadMode === 'multipart'
        ? 'multipart'
        : uploadMode === 'direct' || options.file.size < multipartThreshold
          ? 'direct'
          : 'multipart';
    if (this.mode === 'multipart' && options.file.size === 0) {
      throw new OssSdkError('空文件不应使用分片上传，请改用 direct 模式');
    }
    this.concurrency = toPositiveInteger(
      options.concurrency ?? 4,
      'concurrency',
    );
    this.retries = toNonNegativeInteger(options.retries ?? 2, 'retries');
    this.retryDelayMs = toNonNegativeInteger(
      options.retryDelayMs ?? 500,
      'retryDelayMs',
    );
    if (options.signal) {
      if (options.signal.aborted) {
        this.stopped = true;
        this.stopReason = options.signal.reason;
      } else {
        options.signal.addEventListener(
          'abort',
          () => void this.stop(options.signal?.reason),
          { once: true },
        );
      }
    }
  }

  get state(): FileUploadState {
    return this.stateValue;
  }

  start(): Promise<MultipartCompleteResult> {
    if (this.stateValue === 'completed') {
      throw new OssSdkError('上传流程已经完成');
    }
    if (this.stopped) {
      throw new UploadStoppedError(this.stopReason);
    }
    if (this.stateValue === 'paused') {
      return this.resume();
    }
    if (!this.runPromise) {
      this.runPromise = this.run().finally(() => {
        this.runPromise = undefined;
      });
    }
    return this.runPromise;
  }

  pause(): void {
    if (this.stateValue !== 'uploading') return;
    this.pausePromise = new Promise<void>((resolve) => {
      this.resolvePause = resolve;
    });
    this.setState('paused');
    this.abortActiveRequests(UPLOAD_PAUSE_REASON);
  }

  resume(): Promise<MultipartCompleteResult> {
    if (this.stateValue !== 'paused' || !this.runPromise) {
      throw new OssSdkError('当前上传流程不处于暂停状态');
    }
    this.setState('uploading');
    this.resolvePause?.();
    this.resolvePause = undefined;
    this.pausePromise = undefined;
    return this.runPromise;
  }

  async stop(reason?: unknown): Promise<void> {
    if (this.stopped || this.stateValue === 'completed') return;
    this.stopped = true;
    this.stopReason = reason;
    this.setState('stopped');
    this.resolvePause?.();
    this.abortActiveRequests(reason);
    if (this.session) {
      await this.options.adapter.abort(this.session);
    }
  }

  private async run(): Promise<MultipartCompleteResult> {
    try {
      this.throwIfStopped();
      if (this.mode === 'direct') {
        return await this.runDirectUpload();
      }
      this.setState('initializing');
      const hash =
        this.options.hash ??
        (this.options.hashProvider
          ? await this.withController((signal) =>
              this.options.hashProvider!(this.options.file, signal),
            )
          : createFileFingerprint(this.options.file));
      this.throwIfStopped();
      this.session = await this.runPausable(() =>
        this.withController((signal) =>
          this.options.adapter.initialize({
            file: this.options.file,
            purpose: this.options.purpose,
            key: this.options.key,
            hash,
            ossConfigCode: this.options.ossConfigCode,
            chunkSize: this.options.chunkSize,
            metadata: this.options.metadata,
            meta: this.options.meta,
            signal,
          }),
        ),
      );
      if (this.stopped) {
        await this.options.adapter.abort(this.session);
        this.throwIfStopped();
      }
      if (
        !Number.isInteger(this.session.chunkSize) ||
        this.session.chunkSize <= 0
      ) {
        throw new OssSdkError('上传适配器返回了非法 chunkSize');
      }
      const session = this.session;
      const totalParts = Math.ceil(this.options.file.size / session.chunkSize);
      this.completedPartNumbers.clear();
      session.uploadedParts.forEach((part) => {
        if (
          Number.isInteger(part.partNumber) &&
          part.partNumber >= 1 &&
          part.partNumber <= totalParts &&
          part.size ===
            Math.min(
              session.chunkSize,
              this.options.file.size -
                (part.partNumber - 1) * session.chunkSize,
            )
        ) {
          this.completedPartNumbers.add(part.partNumber);
        }
      });
      this.setState('uploading');
      this.emitProgress(totalParts);
      const pendingParts = Array.from(
        { length: totalParts },
        (_, index) => index + 1,
      ).filter((partNumber) => !this.completedPartNumbers.has(partNumber));
      let cursor = 0;
      const worker = async () => {
        while (cursor < pendingParts.length) {
          const partNumber = pendingParts[cursor++];
          await this.uploadPart(partNumber, totalParts);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(this.concurrency, pendingParts.length) },
          worker,
        ),
      );
      this.throwIfStopped();
      this.setState('completing');
      const result = await this.options.adapter.complete(this.session);
      this.setState('completed');
      this.emitProgress(totalParts);
      return result;
    } catch (error) {
      this.abortActiveRequests(error);
      if (this.stopped) throw new UploadStoppedError(this.stopReason ?? error);
      this.setState('failed');
      this.options.onError?.(error);
      throw error;
    }
  }

  private async runDirectUpload(): Promise<MultipartCompleteResult> {
    this.setState('initializing');
    this.emitProgress(1);
    this.setState('uploading');
    this.emitProgress(1);
    const result = await this.runPausable(() =>
      this.withController((signal) => this.options.directUpload!(signal)),
    );
    this.throwIfStopped();
    this.setState('completing');
    this.setState('completed');
    this.emitProgress(1);
    return result;
  }

  private async uploadPart(
    partNumber: number,
    totalParts: number,
  ): Promise<void> {
    const session = this.session!;
    const start = (partNumber - 1) * session.chunkSize;
    const body = this.options.file.slice(
      start,
      Math.min(start + session.chunkSize, this.options.file.size),
    );
    let checksum: UploadPartChecksum | undefined;
    while (!checksum && this.options.partChecksumProvider) {
      await this.waitWhilePaused();
      this.throwIfStopped();
      try {
        checksum = await this.withController((signal) =>
          this.options.partChecksumProvider!(body, signal),
        );
      } catch (error) {
        if (this.stateValue === 'paused' || error === UPLOAD_PAUSE_REASON) {
          continue;
        }
        throw error;
      }
    }
    let attempt = 0;
    while (true) {
      await this.waitWhilePaused();
      this.throwIfStopped();
      try {
        const uploadedPart = await this.withController((signal) =>
          this.options.adapter.uploadPart({
            session,
            file: this.options.file,
            partNumber,
            body,
            signal,
            checksum,
          }),
        );
        session.uploadedParts = session.uploadedParts
          .filter((part) => part.partNumber !== partNumber)
          .concat(uploadedPart);
        this.completedPartNumbers.add(partNumber);
        this.emitProgress(totalParts);
        return;
      } catch (error) {
        if (this.stateValue === 'paused' || error === UPLOAD_PAUSE_REASON) {
          continue;
        }
        this.throwIfStopped();
        if (attempt++ >= this.retries) throw error;
        await delay(this.retryDelayMs * attempt);
      }
    }
  }

  private async waitWhilePaused(): Promise<void> {
    if (this.stateValue === 'paused' && this.pausePromise) {
      await this.pausePromise;
    }
  }

  private async runPausable<T>(operation: () => Promise<T>): Promise<T> {
    while (true) {
      await this.waitWhilePaused();
      this.throwIfStopped();
      try {
        return await operation();
      } catch (error) {
        if (this.stateValue !== 'paused' && error !== UPLOAD_PAUSE_REASON) {
          throw error;
        }
      }
    }
  }

  private async withController<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    this.activeControllers.add(controller);
    try {
      return await operation(controller.signal);
    } finally {
      this.activeControllers.delete(controller);
    }
  }

  private abortActiveRequests(reason?: unknown): void {
    this.activeControllers.forEach((controller) => controller.abort(reason));
    this.activeControllers.clear();
  }

  private throwIfStopped(): void {
    if (this.stopped) throw new UploadStoppedError(this.stopReason);
  }

  private setState(state: FileUploadState): void {
    this.stateValue = state;
    this.options.onStateChange?.(state);
  }

  private emitProgress(totalParts: number): void {
    if (this.mode === 'direct') {
      const completed = this.stateValue === 'completed';
      this.options.onProgress?.({
        state: this.stateValue,
        loaded: completed ? this.options.file.size : 0,
        total: this.options.file.size,
        percent: completed ? 100 : 0,
        completedParts: completed ? 1 : 0,
        totalParts: 1,
      });
      return;
    }
    const chunkSize = this.session?.chunkSize ?? this.options.chunkSize ?? 0;
    const loaded = Math.min(
      this.options.file.size,
      [...this.completedPartNumbers].reduce((sum, partNumber) => {
        const start = (partNumber - 1) * chunkSize;
        return sum + Math.min(chunkSize, this.options.file.size - start);
      }, 0),
    );
    const progress: FileUploadProgress = {
      state: this.stateValue,
      loaded,
      total: this.options.file.size,
      percent:
        this.options.file.size === 0
          ? 100
          : Math.round((loaded / this.options.file.size) * 10_000) / 100,
      completedParts: this.completedPartNumbers.size,
      totalParts,
    };
    this.options.onProgress?.(progress);
  }
}

function createFileFingerprint(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join(':');
}

function toPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OssSdkError(`${name} 必须为正整数`);
  }
  return value;
}

function toNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new OssSdkError(`${name} 必须为非负整数`);
  }
  return value;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
