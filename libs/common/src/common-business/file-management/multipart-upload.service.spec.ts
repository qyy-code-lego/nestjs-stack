import { FileService } from '@qyy-code-lego/nestjs/core/nest/file-management/file.service';
import { S3StorageService } from '@qyy-code-lego/nestjs/core/nest/s3-storage';
import { IdentityType } from '@qyy-code-lego/nestjs/entities/core/identity/constants';
import { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import { MultipartUploadService } from './multipart-upload.service';
import { OssUploadPolicy } from './oss-upload-policy';

describe('MultipartUploadService', () => {
  const actor = {
    identityType: IdentityType.User,
    identityId: 'user-1',
  };
  let fileService: {
    findOssByObject: jest.Mock;
    findPendingOssUpload: jest.Mock;
    findById: jest.Mock;
    createOssUploadTask: jest.Mock;
    save: jest.Mock;
  };
  let storageService: {
    resolveMultipartChunkSize: jest.Mock;
    initMultipartUpload: jest.Mock;
    generatePresignedPutUrl: jest.Mock;
    generatePresignedUploadPartUrl: jest.Mock;
    listUploadParts: jest.Mock;
    completeMultipartUpload: jest.Mock;
    getObjectMetadata: jest.Mock;
    abortMultipartUpload: jest.Mock;
    setObjectAcl?: jest.Mock;
  };
  let service: MultipartUploadService;

  beforeEach(() => {
    fileService = {
      findOssByObject: jest.fn(),
      findPendingOssUpload: jest.fn(),
      findById: jest.fn(),
      createOssUploadTask: jest.fn(),
      save: jest.fn((file: SysFileEntity) => Promise.resolve(file)),
    };
    storageService = {
      resolveMultipartChunkSize: jest.fn(),
      initMultipartUpload: jest.fn(),
      generatePresignedPutUrl: jest.fn(),
      generatePresignedUploadPartUrl: jest.fn(),
      listUploadParts: jest.fn(),
      completeMultipartUpload: jest.fn(),
      getObjectMetadata: jest.fn(),
      abortMultipartUpload: jest.fn(),
    };
    service = new MultipartUploadService(
      fileService as unknown as FileService,
      storageService as unknown as S3StorageService,
    );
  });

  it('拒绝用相同 OSS key 初始化另一个文件', async () => {
    fileService.findOssByObject.mockResolvedValue(
      createFile({ hash: 'old-hash', completed: false }),
    );

    await expect(
      service.initMultipart(
        {
          ossConfigCode: 'oss',
          key: 'videos/same.mp4',
          hash: 'new-hash',
          filename: 'same.mp4',
          size: '10485760',
        },
        actor,
      ),
    ).rejects.toThrow('该 OSS key 已被另一个文件的上传任务占用');
  });

  it('同一普通直传任务已完成时幂等返回文件记录', async () => {
    const file = createFile({
      hash: 'md5:hash',
      size: '10',
      completed: true,
    });
    fileService.findOssByObject.mockResolvedValue(file);

    await expect(
      service.prepareDirectUpload(
        {
          ossConfigCode: 'oss',
          key: file.object,
          filename: file.filename,
          hash: 'md5:hash',
          size: '10',
          contentMd5: '1B2M2Y8AsgTpgAmY7PhCfg==',
        },
        actor,
      ),
    ).resolves.toEqual({ file, completed: true });
    expect(storageService.generatePresignedPutUrl).not.toHaveBeenCalled();
  });

  describe('注册了上传策略', () => {
    const policy = {
      resolve: jest.fn(() =>
        Promise.resolve({
          ossConfigCode: 'policy-oss',
          key: 'app/upload/202610/uuid.png',
          acl: 'public-read' as const,
        }),
      ),
    };
    let policyService: MultipartUploadService;
    const directInput = {
      purpose: 'file',
      filename: 'a.png',
      hash: 'md5:hash',
      size: '10',
      contentMd5: '1B2M2Y8AsgTpgAmY7PhCfg==',
      contentType: 'image/png',
    };

    beforeEach(() => {
      policy.resolve.mockClear();
      policyService = new MultipartUploadService(
        fileService as unknown as FileService,
        storageService as unknown as S3StorageService,
        policy as unknown as OssUploadPolicy,
      );
    });

    it('拒绝客户端指定 ossConfigCode / key', async () => {
      await expect(
        policyService.prepareDirectUpload(
          { ...directInput, ossConfigCode: 'oss', key: 'x/y.png' },
          actor,
        ),
      ).rejects.toThrow('OSS 配置与对象键由服务端决定');
      expect(policy.resolve).not.toHaveBeenCalled();
    });

    it('按策略决定配置、对象键与 ACL，并记录用途', async () => {
      fileService.findPendingOssUpload.mockResolvedValue(null);
      fileService.createOssUploadTask.mockImplementation(
        (dto: Partial<SysFileEntity>) =>
          Promise.resolve(createFile({ ...dto, id: 'file-new' })),
      );
      storageService.generatePresignedPutUrl.mockResolvedValue({ url: 'u' });

      await policyService.prepareDirectUpload(directInput, actor);

      expect(policy.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'file', size: 10, actor }),
      );
      expect(fileService.createOssUploadTask).toHaveBeenCalledWith(
        expect.objectContaining({
          ossConfigCode: 'policy-oss',
          object: 'app/upload/202610/uuid.png',
          meta: { uploadPurpose: 'file', uploadAcl: 'public-read' },
        }),
        actor.identityType,
        actor.identityId,
      );
      expect(storageService.generatePresignedPutUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          ossConfigCode: 'policy-oss',
          key: 'app/upload/202610/uuid.png',
          acl: undefined,
        }),
      );
    });

    it('直传完成后按任务记录的 ACL 设置对象权限', async () => {
      const file = createFile({
        size: '10',
        meta: { uploadPurpose: 'file', uploadAcl: 'public-read' },
      });
      fileService.findById.mockResolvedValue(file);
      storageService.getObjectMetadata.mockResolvedValue({
        size: 10,
        contentType: 'image/png',
        fullUrl: 'https://x/app.png',
      });
      storageService.setObjectAcl = jest.fn();

      await policyService.recordCompletedObject({ fileId: file.id }, actor);

      expect(storageService.setObjectAcl).toHaveBeenCalledWith({
        ossConfigCode: 'oss',
        key: file.object,
        acl: 'public-read',
      });
    });

    it('续传复用同一上传人、内容与用途的未完成任务', async () => {
      const pending = createFile({
        id: 'file-pending',
        object: 'app/upload/202609/old.png',
        ossConfigCode: 'old-oss',
        hash: 'md5:hash',
        size: '10',
        completed: false,
      });
      fileService.findPendingOssUpload.mockResolvedValue(pending);
      storageService.generatePresignedPutUrl.mockResolvedValue({ url: 'u' });

      const result = await policyService.prepareDirectUpload(
        directInput,
        actor,
      );

      expect(fileService.findPendingOssUpload).toHaveBeenCalledWith({
        createdBy: actor.identityId,
        hash: 'md5:hash',
        size: '10',
        purpose: 'file',
      });
      expect(fileService.createOssUploadTask).not.toHaveBeenCalled();
      expect(storageService.generatePresignedPutUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          ossConfigCode: 'old-oss',
          key: 'app/upload/202609/old.png',
        }),
      );
      expect(result.file.id).toBe('file-pending');
    });
  });

  it('分片签名只使用 fileId 对应的服务端任务信息', async () => {
    const file = createFile({
      size: '6291456',
      chunkSize: 5 * 1024 * 1024,
    });
    fileService.findById.mockResolvedValue(file);
    storageService.generatePresignedUploadPartUrl.mockResolvedValue({
      url: 'signed-url',
    });

    await service.signMultipartPart(
      {
        fileId: file.id,
        partNumber: 2,
        contentLength: 1024 * 1024,
        contentMd5: '1B2M2Y8AsgTpgAmY7PhCfg==',
      },
      actor,
    );

    expect(storageService.generatePresignedUploadPartUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        ossConfigCode: 'oss',
        key: 'videos/file.mp4',
        uploadId: 'upload-1',
        partNumber: 2,
        contentLength: 1024 * 1024,
      }),
    );
  });

  it('分片不完整时拒绝完成上传', async () => {
    const file = createFile({
      size: `${10 * 1024 * 1024}`,
      chunkSize: 5 * 1024 * 1024,
    });
    fileService.findById.mockResolvedValue(file);
    storageService.listUploadParts.mockResolvedValue({
      parts: [
        {
          partNumber: 1,
          eTag: 'etag-1',
          size: 5 * 1024 * 1024,
        },
      ],
      isTruncated: false,
    });

    await expect(
      service.completeMultipart({ fileId: file.id }, actor),
    ).rejects.toThrow('分片数量不完整');
    expect(storageService.completeMultipartUpload).not.toHaveBeenCalled();
  });
});

function createFile(overrides: Partial<SysFileEntity>): SysFileEntity {
  return Object.assign(new SysFileEntity(), {
    id: 'file-1',
    filename: 'file.mp4',
    object: 'videos/file.mp4',
    hash: 'hash-1',
    meta: {},
    storageType: 'oss',
    ossConfigCode: 'oss',
    uploadId: 'upload-1',
    chunkSize: 5 * 1024 * 1024,
    completed: false,
    size: '6291456',
    createdBy: 'user-1',
    ...overrides,
  });
}
