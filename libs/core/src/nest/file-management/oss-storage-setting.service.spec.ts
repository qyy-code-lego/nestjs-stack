import type { DataSource, EntityManager } from 'typeorm';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import {
  RuntimeConfigValueType,
  SysRuntimeConfigEntity,
} from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';
import { SysOssConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-oss-config.entity';
import type { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { OssStorageSettingService } from './oss-storage-setting.service';

function fixture(initial: SysRuntimeConfigEntity | null = null) {
  let row = initial;
  const repo = {
    findOneBy: jest.fn(() => Promise.resolve(row)),
    create: (value: Partial<SysRuntimeConfigEntity>) =>
      Object.assign(new SysRuntimeConfigEntity(), value),
    save: jest.fn((value: SysRuntimeConfigEntity) => {
      row = value;
      return Promise.resolve(value);
    }),
  };
  const ossRepo = {
    findOne: jest.fn(() => Promise.resolve({ code: 'test-oss' })),
  };
  const manager = {
    query: jest.fn(() => Promise.resolve([])),
    getRepository: (entity: unknown) =>
      entity === SysOssConfigEntity ? ossRepo : repo,
  } as unknown as EntityManager;
  const ds = {
    transaction: (work: (manager: EntityManager) => unknown) => work(manager),
  } as unknown as DataSource;
  const invalidate = jest.fn(() => Promise.resolve());
  const runtime = {
    findByCode: jest.fn(() => Promise.resolve(row)),
    invalidate,
  } as unknown as RuntimeConfigService;
  return {
    service: new OssStorageSettingService(ds, runtime),
    repo,
    ossRepo,
    manager,
    runtime,
    invalidate,
  };
}

describe('OssStorageSettingService', () => {
  it('新工程开箱即用默认前缀，但没有选定 OSS 时禁止上传', async () => {
    const { service } = fixture();
    expect(await service.current()).toEqual({
      ossConfigCode: null,
      keyPrefix: '',
      version: 0,
    });
    await expect(service.target()).rejects.toThrow('请先在后台设置文件存储');
    expect(
      await service.set({ ossConfigCode: 'test-oss', version: 0 }),
    ).toEqual({ ossConfigCode: 'test-oss', keyPrefix: '', version: 1 });
  });

  it('省略前缀保留原业务路径，空串可以关闭已配置的前缀', async () => {
    const { service } = fixture();
    await service.set({ ossConfigCode: 'test-oss', version: 0 });
    expect((await service.resolvePath('avatars/id.png')).key).toBe(
      'avatars/id.png',
    );
    await service.set({
      ossConfigCode: 'test-oss',
      keyPrefix: 'app/dev',
      version: 1,
    });
    await service.set({ ossConfigCode: 'test-oss', keyPrefix: '', version: 2 });
    expect((await service.resolvePath('avatars/id.png')).key).toBe(
      'avatars/id.png',
    );
  });

  it('保存后业务路径使用最新前缀，历史返回值保持不变', async () => {
    const { service, invalidate } = fixture();
    await service.set({
      ossConfigCode: 'test-oss',
      keyPrefix: 'app/dev',
      version: 0,
    });
    const old = await service.resolvePath('avatar/202610/id.png');
    await service.set({
      ossConfigCode: 'next',
      keyPrefix: 'app/prod',
      version: 1,
    });
    expect((await service.resolvePath('avatar/202610/id2.png')).key).toBe(
      'app/prod/avatar/202610/id2.png',
    );
    expect(old).toEqual({
      ossConfigCode: 'test-oss',
      keyPrefix: 'app/dev',
      key: 'app/dev/avatar/202610/id.png',
    });
    expect(invalidate).toHaveBeenCalledWith('file.storage');
  });

  it('拒绝过期版本，未填写前缀的更新保留当前前缀，无变化不增版本', async () => {
    const { service } = fixture();
    await service.set({
      ossConfigCode: 'test-oss',
      keyPrefix: 'app/dev',
      version: 0,
    });
    await expect(
      service.set({ ossConfigCode: 'next', version: 0 }),
    ).rejects.toThrow('配置已变化');
    expect(
      (await service.set({ ossConfigCode: 'test-oss', version: 1 })).version,
    ).toBe(1);
    expect(
      await service.set({ ossConfigCode: 'next', version: 1 }),
    ).toMatchObject({ keyPrefix: 'app/dev', version: 2 });
  });

  it.each([
    '/escape',
    '../escape',
    'a/../escape',
    'a//b',
    'a/%2e%2e/b',
    'a\\b',
    'https://evil/key',
  ])('拒绝越界业务路径 %s', async (path) => {
    await expect(fixture().service.resolvePath(path)).rejects.toThrow(
      '业务文件路径不合法',
    );
  });

  it('不存在的 OSS 和不合法的根前缀不能写入', async () => {
    const { service, repo, ossRepo } = fixture();
    await expect(
      service.set({
        ossConfigCode: 'test-oss',
        keyPrefix: '../other',
        version: 0,
      }),
    ).rejects.toThrow('对象键前缀不合法');
    ossRepo.findOne.mockResolvedValueOnce(null as unknown as { code: string });
    await expect(
      service.set({ ossConfigCode: 'missing', version: 0 }),
    ).rejects.toThrow('OSS 配置不存在');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('停用配置禁止上传，重新保存才能启用，旧工程的配置 code 可原样复用', async () => {
    const row = Object.assign(new SysRuntimeConfigEntity(), {
      code: 'legacy-storage',
      value: { ossConfigCode: 'test-oss', keyPrefix: 'old/files' },
      version: 3,
      status: ObjectActiveStatus.DISABLED,
      valueType: RuntimeConfigValueType.OBJECT,
    });
    const { manager, runtime, invalidate } = fixture(row);
    const service = new OssStorageSettingService({} as DataSource, runtime, {
      configCode: 'legacy-storage',
    });
    await expect(service.target()).rejects.toThrow('请先在后台设置文件存储');
    expect(
      await service.set({ ossConfigCode: 'test-oss', version: 3 }, { manager }),
    ).toMatchObject({ keyPrefix: 'old/files', version: 4 });
    expect(invalidate).toHaveBeenCalledWith('legacy-storage');
  });
});
