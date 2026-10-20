import type { EntityManager, Repository } from 'typeorm';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import type { RedisService } from '@qyy-code-lego/nestjs/core/nest/redis/redis.service';
import {
  OssAddressingStyle,
  OssProvider,
} from '@qyy-code-lego/nestjs/entities/core/sys/oss-s3-config.interface';
import { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import { SysOssConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-oss-config.entity';
import { OssConfigService } from './oss-config.service';

describe('OssConfigService', () => {
  it('创建配置时规范化地址并记录操作人', async () => {
    const save = jest.fn((entity: SysOssConfigEntity) =>
      Promise.resolve(entity),
    );
    const repo = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((input: Partial<SysOssConfigEntity>) =>
        Object.assign(new SysOssConfigEntity(), input),
      ),
      save,
    } as unknown as Repository<SysOssConfigEntity>;
    const service = createService(repo);

    const saved = await service.create(
      {
        code: 'aliyun_dev',
        name: ' 阿里云开发环境 ',
        bucket: ' bucket-dev ',
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com/',
        internalEndpoint: 'https://oss-cn-hangzhou-internal.aliyuncs.com/',
        useInternalEndpoint: true,
        config: {
          accessKeyId: ' test-ak ',
          secretAccessKey: ' test-sk ',
          region: ' cn-hangzhou ',
          provider: OssProvider.ALIYUN,
          addressingStyle: OssAddressingStyle.VIRTUAL_HOSTED,
          domain: 'https://cdn.example.com/',
          multipartChunkSize: 8 * 1024 * 1024,
        },
      },
      { identityId: 'admin-1' },
    );

    expect(saved).toMatchObject({
      code: 'aliyun_dev',
      name: '阿里云开发环境',
      bucket: 'bucket-dev',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      internalEndpoint: 'https://oss-cn-hangzhou-internal.aliyuncs.com',
      useInternalEndpoint: true,
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
      config: {
        accessKeyId: 'test-ak',
        secretAccessKey: 'test-sk',
        region: 'cn-hangzhou',
        domain: 'https://cdn.example.com',
      },
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('启用内网传输但未配置内网端点时拒绝保存', async () => {
    const create = jest.fn();
    const repo = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create,
      save: jest.fn(),
    } as unknown as Repository<SysOssConfigEntity>;
    const service = createService(repo);

    await expect(
      service.create({
        code: 'aliyun_internal',
        name: '阿里云内网',
        bucket: 'bucket-dev',
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
        useInternalEndpoint: true,
        config: {
          accessKeyId: 'test-ak',
          secretAccessKey: 'test-sk',
          region: 'cn-hangzhou',
          provider: OssProvider.ALIYUN,
        },
      }),
    ).rejects.toBeInstanceOf(BizError);
    expect(create).not.toHaveBeenCalled();
  });

  it('更新时空凭证保持原值，并允许清除自定义域名和 SessionToken', async () => {
    const entity = createEntity();
    const repo = {
      findOne: jest.fn(() => Promise.resolve(entity)),
      save: jest.fn((input: SysOssConfigEntity) => Promise.resolve(input)),
    } as unknown as Repository<SysOssConfigEntity>;
    const service = createService(repo);

    const saved = await service.update(
      entity.code,
      {
        config: {
          accessKeyId: '',
          secretAccessKey: '',
          domain: '',
          sessionToken: '',
        },
      },
      { identityId: 'admin-2' },
    );

    expect(saved.config.accessKeyId).toBe('original-ak');
    expect(saved.config.secretAccessKey).toBe('original-sk');
    expect(saved.config.domain).toBeUndefined();
    expect(saved.config.sessionToken).toBeUndefined();
    expect(saved.updatedBy).toBe('admin-2');
  });

  it('配置仍被文件使用时拒绝删除', async () => {
    const entity = createEntity();
    const repo = {
      findOne: jest.fn(() => Promise.resolve(entity)),
      delete: jest.fn(),
    } as unknown as Repository<SysOssConfigEntity>;
    const fileRepo = {
      count: jest.fn(() => Promise.resolve(1)),
    } as unknown as Repository<SysFileEntity>;
    const service = createService(repo, fileRepo);

    await expect(service.delete(entity.code)).rejects.toBeInstanceOf(BizError);
    expect((repo.delete as jest.Mock).mock.calls).toHaveLength(0);
  });
});

function createEntity(): SysOssConfigEntity {
  return Object.assign(new SysOssConfigEntity(), {
    code: 'aliyun_dev',
    name: '阿里云开发环境',
    bucket: 'bucket-dev',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    internalEndpoint: 'https://oss-cn-hangzhou-internal.aliyuncs.com',
    useInternalEndpoint: true,
    config: {
      accessKeyId: 'original-ak',
      secretAccessKey: 'original-sk',
      sessionToken: 'original-token',
      region: 'cn-hangzhou',
      provider: OssProvider.ALIYUN,
      addressingStyle: OssAddressingStyle.VIRTUAL_HOSTED,
      domain: 'https://cdn.example.com',
    },
  });
}

function createService(
  repo: Repository<SysOssConfigEntity>,
  fileRepo = {
    count: jest.fn(() => Promise.resolve(0)),
  } as unknown as Repository<SysFileEntity>,
) {
  const redis = {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve('OK')),
    del: jest.fn(() => Promise.resolve(1)),
  } as unknown as RedisService;
  const manager = {
    getRepository: (entity: unknown) =>
      entity === SysOssConfigEntity ? repo : fileRepo,
  } as unknown as EntityManager;
  Object.assign(repo, {
    manager: {
      transaction: (work: (manager: EntityManager) => unknown) => work(manager),
    },
  });
  return new OssConfigService(repo, fileRepo, redis);
}
