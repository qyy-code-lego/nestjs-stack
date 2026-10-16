import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BizError } from '../../BizError';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import { SysOssConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-oss-config.entity';
import {
  RuntimeConfigValueType,
  SysRuntimeConfigEntity,
} from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import type { RuntimeConfigActor } from '../runtime-config/runtime-config.service';

export const OSS_STORAGE_SETTING_OPTIONS = Symbol(
  'OSS_STORAGE_SETTING_OPTIONS',
);
export const OSS_STORAGE_SETTING_CODE = 'file.storage';
export const DEFAULT_OSS_KEY_PREFIX = '';
// 空前缀表示不启用根目录拼接，兼容原业务路径。
export const OSS_KEY_PREFIX_PATTERN =
  /^(?:[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9_-]+)*)?$/;

export interface OssStorageSettingOptions {
  /** 仅供兼容已有配置项；新工程沿用标准 code，无需配置。 */
  configCode?: string;
}
export interface OssStorageTarget {
  ossConfigCode: string;
  keyPrefix: string;
}
export interface OssStorageSetting {
  ossConfigCode: string | null;
  keyPrefix: string;
  version: number;
}
export interface SetOssStorageInput {
  ossConfigCode: string;
  /** 首次省略时不加根前缀；已有配置省略时保留原前缀，空串显式清除。 */
  keyPrefix?: string;
  version: number;
}
export interface OssStorageWriteOptions {
  actor?: RuntimeConfigActor;
  /** 消费工程可把权限检查、审计与配置写入放在同一事务。 */
  manager?: EntityManager;
}

function fail(status: number, message: string): never {
  throw new BizError(message).codeAs(status).httpStatusAs(status);
}

/** 默认 OSS 与根前缀的唯一事实源；不读取 env，不决定业务用途和 ACL。 */
@Injectable()
export class OssStorageSettingService {
  readonly configCode: string;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly runtime: RuntimeConfigService,
    @Optional()
    @Inject(OSS_STORAGE_SETTING_OPTIONS)
    options?: OssStorageSettingOptions,
  ) {
    this.configCode = options?.configCode ?? OSS_STORAGE_SETTING_CODE;
  }

  async current(manager?: EntityManager): Promise<OssStorageSetting> {
    const row = manager
      ? await manager
          .getRepository(SysRuntimeConfigEntity)
          .findOneBy({ code: this.configCode })
      : await this.runtime.findByCode(this.configCode);
    if (!row)
      return {
        ossConfigCode: null,
        keyPrefix: DEFAULT_OSS_KEY_PREFIX,
        version: 0,
      };
    if (row.status !== ObjectActiveStatus.ACTIVE)
      return {
        ossConfigCode: null,
        keyPrefix: DEFAULT_OSS_KEY_PREFIX,
        version: row.version,
      };
    const value = row.value as Partial<OssStorageTarget> | null;
    const keyPrefix = value?.keyPrefix ?? DEFAULT_OSS_KEY_PREFIX;
    this.assertPrefix(keyPrefix);
    if (
      typeof value?.ossConfigCode !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(value.ossConfigCode)
    )
      fail(503, '文件存储配置不合法，请在后台重新设置');
    return {
      ossConfigCode: value.ossConfigCode,
      keyPrefix,
      version: row.version,
    };
  }

  async target(): Promise<OssStorageTarget> {
    const current = await this.current();
    if (!current.ossConfigCode) fail(503, '请先在后台设置文件存储');
    return {
      ossConfigCode: current.ossConfigCode,
      keyPrefix: current.keyPrefix,
    };
  }

  /** businessPath 只能由服务端业务策略生成，禁止直接传入客户端路径。 */
  async resolvePath(
    businessPath: string,
  ): Promise<OssStorageTarget & { key: string }> {
    if (
      typeof businessPath !== 'string' ||
      !businessPath ||
      businessPath.length > 900 ||
      businessPath
        .split('/')
        .some(
          (segment) =>
            !/^[A-Za-z0-9_.-]+$/.test(segment) ||
            segment === '.' ||
            segment === '..',
        )
    )
      fail(400, '业务文件路径不合法');
    const target = await this.target();
    return {
      ...target,
      key: target.keyPrefix
        ? `${target.keyPrefix}/${businessPath}`
        : businessPath,
    };
  }

  assertPrefix(prefix: string): void {
    if (
      typeof prefix !== 'string' ||
      prefix.length > 64 ||
      !OSS_KEY_PREFIX_PATTERN.test(prefix)
    )
      fail(400, '对象键前缀不合法');
  }

  async set(
    input: SetOssStorageInput,
    options: OssStorageWriteOptions = {},
  ): Promise<OssStorageSetting> {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(input.ossConfigCode) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0
    )
      fail(400, '文件存储参数不合法');
    const save = async (manager: EntityManager) => {
      // PG 事务锁覆盖首次创建和后续更新；同一版本的并发请求只能有一个成功。
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`oss-storage:${this.configCode}`],
      );
      const repo = manager.getRepository(SysRuntimeConfigEntity);
      const before = await repo.findOneBy({ code: this.configCode });
      if ((before?.version ?? 0) !== input.version)
        fail(409, '配置已变化，请刷新后重试');
      if (
        !(await manager.getRepository(SysOssConfigEntity).findOne({
          where: { code: input.ossConfigCode },
          lock: { mode: 'pessimistic_read' },
        }))
      )
        fail(404, 'OSS 配置不存在');
      const old = before?.value as Partial<OssStorageTarget> | undefined;
      const value = {
        ossConfigCode: input.ossConfigCode,
        keyPrefix: input.keyPrefix ?? old?.keyPrefix ?? DEFAULT_OSS_KEY_PREFIX,
      };
      this.assertPrefix(value.keyPrefix);
      if (
        before?.status === ObjectActiveStatus.ACTIVE &&
        old?.ossConfigCode === value.ossConfigCode &&
        old.keyPrefix === value.keyPrefix
      )
        return { ...value, version: before.version };
      const row =
        before ??
        repo.create({
          code: this.configCode,
          name: '文件存储',
          group: 'file-storage',
          builtin: true,
          valueType: RuntimeConfigValueType.OBJECT,
          version: 0,
          createdBy: options.actor?.identityId,
        });
      row.value = value;
      row.status = ObjectActiveStatus.ACTIVE;
      row.version += 1;
      row.updatedBy = options.actor?.identityId;
      await repo.save(row);
      return { ...value, version: row.version };
    };
    const result = options.manager
      ? await save(options.manager)
      : await this.ds.transaction(save);
    // 外部事务的调用方必须在提交后再次 invalidate，避免读方回填旧快照。
    await this.invalidate();
    return result;
  }

  async invalidate(): Promise<void> {
    await this.runtime.invalidate(this.configCode);
  }
}
