import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import {
  RuntimeConfigValue,
  RuntimeConfigValueType,
  SysRuntimeConfigEntity,
} from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';

const CODE_PATTERN = /^[A-Za-z0-9_.-]+$/;

const CACHE_PREFIX = 'runtime_config:';
const CACHE_TTL = 300;

/**
 * 把数据源片段收敛成键安全的形态。
 *
 * 冒号是本方案里的结构分隔符，而 IPv6 主机名天生带冒号；不归一化会让键的层级被撑乱。
 */
function sanitizeKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export interface RuntimeConfigActor {
  identityId?: string;
}

export interface CreateRuntimeConfigInput {
  code: string;
  name: string;
  group?: string;
  remark?: string;
  value: RuntimeConfigValue;
  valueType?: RuntimeConfigValueType;
  valueSchema?: Record<string, unknown>;
  status?: ObjectActiveStatus;
  builtin?: boolean;
}

export interface UpdateRuntimeConfigInput {
  name?: string;
  group?: string | null;
  remark?: string | null;
  value?: RuntimeConfigValue;
  valueType?: RuntimeConfigValueType;
  valueSchema?: Record<string, unknown> | null;
  status?: ObjectActiveStatus;
  /** 传入时做乐观锁校验，与库中 version 不一致则拒绝写入。 */
  expectedVersion?: number;
}

export interface RuntimeConfigPageQuery {
  code?: string;
  name?: string;
  group?: string;
  status?: ObjectActiveStatus;
}

/** 代码侧声明的内置配置项，用于 `ensure` 幂等补齐。 */
export interface RuntimeConfigDefinition {
  code: string;
  name: string;
  group?: string;
  remark?: string;
  defaultValue: RuntimeConfigValue;
  valueType?: RuntimeConfigValueType;
  valueSchema?: Record<string, unknown>;
}

/**
 * 运行时业务配置读写服务。
 *
 * **与进程配置（`ConfigService<AllConfig>`）是两套东西，访问方式不同，不要混用：**
 * - 进程配置来自 env / yaml，启动期加载、同步读取，改动需要重启；
 * - 运行时配置存在 `sys_runtime_config` 表，异步读取（Redis 缓存），后台改完即时生效。
 *
 * 业务侧读取一律用 {@link getValue} / {@link getValues}，不要直接注入 Repository。
 */
@Injectable()
export class RuntimeConfigService {
  private readonly logger = new Logger(RuntimeConfigService.name);
  /** 数据源标识惰性缓存；连接参数在进程生命周期内不变。 */
  private datasourceTag?: string;

  constructor(
    @InjectRepository(SysRuntimeConfigEntity)
    private readonly repo: Repository<SysRuntimeConfigEntity>,
    private readonly redisService: RedisService,
  ) {}

  // ==========================================================================
  // 业务侧读取
  // ==========================================================================

  /**
   * 读取配置值。配置不存在或已停用时返回 `fallback`。
   *
   * 泛型只做调用侧的类型断言，不做运行时校验——库里的 JSON 由后台维护，
   * 调用侧对结构有强要求时应自行兜底。
   */
  async getValue<T = RuntimeConfigValue>(
    code: string,
    fallback?: T,
  ): Promise<T | undefined> {
    const entity = await this.findByCode(code);
    if (!entity || entity.status !== ObjectActiveStatus.ACTIVE) return fallback;
    return entity.value as T;
  }

  /** 读取配置值，配置不存在或已停用时抛 BizError。 */
  async getValueOrThrow<T = RuntimeConfigValue>(code: string): Promise<T> {
    const value = await this.getValue<T>(code);
    if (value === undefined) {
      throw new BizError(`运行时配置 ${code} 不存在或已停用`).codeAs(500);
    }
    return value;
  }

  /** 批量读取，返回 code -> value 的映射；不存在或停用的 code 不出现在结果里。 */
  async getValues(
    codes: string[],
  ): Promise<Record<string, RuntimeConfigValue>> {
    const unique = [...new Set(codes.filter(Boolean))];
    if (unique.length === 0) return {};

    const cacheKeys = unique.map((code) => this.getCacheKey(code));
    const cached = await this.cache().mget<SysRuntimeConfigEntity>(cacheKeys);

    const result: Record<string, RuntimeConfigValue> = {};
    const missing: string[] = [];
    unique.forEach((code, index) => {
      const hit = cached[index];
      if (!hit) {
        missing.push(code);
        return;
      }
      if (hit.status === ObjectActiveStatus.ACTIVE) result[code] = hit.value;
    });

    if (missing.length === 0) return result;

    const rows = await this.repo.find({
      where: missing.map((code) => ({ code })),
    });
    await Promise.all(rows.map((row) => this.writeCache(row)));
    for (const row of rows) {
      if (row.status === ObjectActiveStatus.ACTIVE)
        result[row.code] = row.value;
    }
    return result;
  }

  /** 按 code 取实体，带缓存；不存在返回 null。 */
  async findByCode(code: string): Promise<SysRuntimeConfigEntity | null> {
    if (!code) return null;
    const cached = await this.cache().get<SysRuntimeConfigEntity>(
      this.getCacheKey(code),
    );
    if (cached) return cached;

    const entity = await this.repo.findOne({ where: { code } });
    if (entity) await this.writeCache(entity);
    return entity;
  }

  // ==========================================================================
  // 声明式补齐
  // ==========================================================================

  /**
   * 幂等补齐内置配置项：不存在则按 `defaultValue` 建，已存在则**不覆盖 value**，
   * 只同步展示信息（名称/分组/备注/schema）。用于应用启动时声明代码依赖的配置项。
   */
  async ensure(
    definitions: RuntimeConfigDefinition[],
  ): Promise<SysRuntimeConfigEntity[]> {
    const saved: SysRuntimeConfigEntity[] = [];
    for (const definition of definitions) {
      this.assertCode(definition.code);
      const existing = await this.repo.findOne({
        where: { code: definition.code },
      });

      const entity =
        existing ??
        this.repo.create({
          code: definition.code.trim(),
          value: definition.defaultValue,
          valueType:
            definition.valueType ?? inferValueType(definition.defaultValue),
          status: ObjectActiveStatus.ACTIVE,
          version: 1,
        });
      entity.builtin = true;
      entity.name = definition.name;
      entity.group = definition.group ?? entity.group ?? null;
      entity.remark = definition.remark ?? entity.remark ?? null;
      if (definition.valueSchema) entity.valueSchema = definition.valueSchema;

      saved.push(await this.repo.save(entity));
      await this.clearCache(definition.code);
    }
    this.logger.log(`运行时配置内置项已补齐：${saved.length} 项`);
    return saved;
  }

  // ==========================================================================
  // 后台维护
  // ==========================================================================

  async create(
    input: CreateRuntimeConfigInput,
    actor: RuntimeConfigActor = {},
  ): Promise<SysRuntimeConfigEntity> {
    this.assertCode(input.code);
    this.assertNotBlank(input.name, '配置名称');
    if (input.value === undefined) {
      throw new BizError('配置值不能为空').codeAs(400);
    }

    const existing = await this.repo.findOne({ where: { code: input.code } });
    if (existing) {
      throw new BizError('配置识别码已存在').codeAs(409).httpStatusAs(409);
    }

    const entity = this.repo.create({
      code: input.code.trim(),
      name: input.name.trim(),
      group: this.normalizeOptionalText(input.group),
      remark: this.normalizeOptionalText(input.remark),
      value: input.value,
      valueType: input.valueType ?? inferValueType(input.value),
      valueSchema: input.valueSchema ?? null,
      status: input.status ?? ObjectActiveStatus.ACTIVE,
      builtin: input.builtin ?? false,
      version: 1,
      createdBy: actor.identityId,
      updatedBy: actor.identityId,
    });
    const saved = await this.repo.save(entity);
    await this.clearCache(saved.code);
    return saved;
  }

  async update(
    code: string,
    input: UpdateRuntimeConfigInput,
    actor: RuntimeConfigActor = {},
  ): Promise<SysRuntimeConfigEntity> {
    const entity = await this.findEntity(code);
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== entity.version
    ) {
      throw new BizError('配置已被他人修改，请刷新后重试')
        .codeAs(409)
        .httpStatusAs(409);
    }

    if (input.name !== undefined) {
      this.assertNotBlank(input.name, '配置名称');
      entity.name = input.name.trim();
    }
    if (input.group !== undefined) {
      entity.group = this.normalizeOptionalText(input.group);
    }
    if (input.remark !== undefined) {
      entity.remark = this.normalizeOptionalText(input.remark);
    }
    if (input.valueSchema !== undefined) {
      entity.valueSchema = input.valueSchema ?? null;
    }
    if (input.status !== undefined) entity.status = input.status;
    if (input.value !== undefined) {
      entity.value = input.value;
      entity.valueType = input.valueType ?? inferValueType(input.value);
      entity.version = entity.version + 1;
    } else if (input.valueType !== undefined) {
      entity.valueType = input.valueType;
    }
    entity.updatedBy = actor.identityId;

    const saved = await this.repo.save(entity);
    await this.clearCache(saved.code);
    return saved;
  }

  /** 只改值的快捷入口，后台 JSON 编辑器保存时使用。 */
  async updateValue(
    code: string,
    value: RuntimeConfigValue,
    options: { expectedVersion?: number } = {},
    actor: RuntimeConfigActor = {},
  ): Promise<SysRuntimeConfigEntity> {
    return await this.update(
      code,
      { value, expectedVersion: options.expectedVersion },
      actor,
    );
  }

  async findPage(
    query: RuntimeConfigPageQuery,
    page: number,
    pageSize: number,
  ): Promise<IPageData<SysRuntimeConfigEntity>> {
    const qb = this.repo.createQueryBuilder('runtimeConfig');
    if (query.code) {
      qb.andWhere('runtimeConfig.code ILIKE :code', {
        code: `%${query.code}%`,
      });
    }
    if (query.name) {
      qb.andWhere('runtimeConfig.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }
    if (query.group) {
      qb.andWhere('runtimeConfig.group = :group', { group: query.group });
    }
    if (query.status) {
      qb.andWhere('runtimeConfig.status = :status', { status: query.status });
    }
    const [rows, total] = await qb
      .orderBy('runtimeConfig.group', 'ASC')
      .addOrderBy('runtimeConfig.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { rows, total, page, pageSize };
  }

  /** 已有分组列表，供后台筛选下拉。 */
  async findGroups(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('runtimeConfig')
      // 原始 select 不做属性名映射，这里必须写真实列名 group_code
      .select('DISTINCT runtimeConfig.group_code', 'group')
      .where('runtimeConfig.group_code IS NOT NULL')
      .orderBy('"group"', 'ASC')
      .getRawMany<{ group: string }>();
    return rows.map((row) => row.group).filter(Boolean);
  }

  async findOne(code: string): Promise<SysRuntimeConfigEntity> {
    return await this.findEntity(code);
  }

  async delete(code: string): Promise<boolean> {
    const entity = await this.findEntity(code);
    if (entity.builtin) {
      throw new BizError('内置配置项不允许删除，可改为停用')
        .codeAs(409)
        .httpStatusAs(409);
    }
    await this.clearCache(entity.code);
    const result = await this.repo.delete(entity.code);
    return !!result.affected;
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  private async findEntity(code: string): Promise<SysRuntimeConfigEntity> {
    this.assertNotBlank(code, '配置识别码');
    const entity = await this.repo.findOne({ where: { code } });
    if (!entity) {
      throw new BizError('配置不存在').codeAs(404).httpStatusAs(404);
    }
    return entity;
  }

  private assertCode(code: string) {
    this.assertNotBlank(code, '配置识别码');
    if (!CODE_PATTERN.test(code.trim())) {
      throw new BizError(
        '配置识别码只能包含字母、数字、点、下划线和中划线',
      ).codeAs(400);
    }
  }

  private assertNotBlank(value: string | undefined, name: string) {
    if (!value?.trim()) {
      throw new BizError(`${name}不能为空`).codeAs(400);
    }
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  /**
   * 缓存键，形如 `runtime_config:db.internal_5432_appdb:code:xxx`。
   *
   * **不带 app 的 `REDIS_KEY_PREFIX`**：运行时配置是跨 app 共享的同一份事实
   * （同一张表、同一个 code），按 app 分命名空间缓存会让「改完即时生效」失效——
   * 改配置的 app 只清得掉自己前缀下的键，其余 app 继续读各自的旧副本直到 TTL 到期。
   *
   * 代价是失去了 app 前缀带来的天然隔离，因此键里必须自带**数据源标识**：
   * 同一个 Redis 被两套指向不同数据库的部署共用时（把 `DATABASE_*` 从 dev 指到
   * test、或指到本地 postgres），两边的配置缓存不能互相污染。
   *
   * 标识只取 `host_port_database`，有两条刻意的取舍：
   *
   * - **不含机器名与操作系统**：缓存要和「数据从哪来」对齐，而不是和「谁在读」对齐。
   *   掺进机器标识会让同一个库、跑在不同机器上的 app 又各自成一个命名空间，
   *   等于把这里要修的问题原样重造一遍。
   * - **明文而非 hash**：运维在 `KEYS runtime_config:*` 里要能直接看出哪个键属于哪个库。
   *   一串十六进制指纹等于什么都没说，排查时还得先反推。至于"暴露库地址"，
   *   能在这台 Redis 上跑 `KEYS` 的人本来就能读到缓存值本身，隐藏 key 没有意义。
   *
   * 不含 username：同一个库换个连接用户读到的还是同一份配置，加进来只会让键更长、
   * 还平白把凭据信息摊进 key。
   */
  private getCacheKey(code: string) {
    return `${CACHE_PREFIX}${this.getDatasourceTag()}:code:${code}`;
  }

  /**
   * 数据源标识，取自 Repository 自身的连接参数。
   *
   * 刻意不读 `ConfigService`：这里要表达的是「这份缓存对应哪个库」，而 Repository
   * 的连接就是本服务实际读写的那个库，两者不可能漂移。
   */
  private getDatasourceTag(): string {
    if (this.datasourceTag) return this.datasourceTag;

    const options = this.repo.manager.connection.options as {
      host?: string;
      port?: number;
      database?: unknown;
    };
    const database =
      typeof options.database === 'string' ? options.database : '';

    this.datasourceTag = [options.host ?? '', options.port ?? '', database]
      .map((part) => sanitizeKeySegment(String(part)))
      .join('_');
    return this.datasourceTag;
  }

  private async writeCache(entity: SysRuntimeConfigEntity) {
    await this.cache().set(this.getCacheKey(entity.code), entity, CACHE_TTL);
  }

  private async clearCache(code: string) {
    await this.cache().del(this.getCacheKey(code));
  }

  /** 运行时配置的缓存一律走无 app 前缀的共享客户端，理由见 {@link getCacheKey}。 */
  private cache() {
    return this.redisService.getGlobalHelper();
  }
}

/** 按 JS 运行时类型推断 valueType，仅作为后台编辑器形态提示。 */
export function inferValueType(
  value: RuntimeConfigValue,
): RuntimeConfigValueType {
  if (Array.isArray(value)) return RuntimeConfigValueType.ARRAY;
  const typeMap: Record<string, RuntimeConfigValueType> = {
    string: RuntimeConfigValueType.STRING,
    number: RuntimeConfigValueType.NUMBER,
    boolean: RuntimeConfigValueType.BOOLEAN,
  };
  return typeMap[typeof value] ?? RuntimeConfigValueType.OBJECT;
}
