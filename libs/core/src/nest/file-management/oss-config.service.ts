import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import {
  OssAddressingStyle,
  OssProvider,
  OssS3Config,
} from '@qyy-code-lego/nestjs/entities/core/sys/oss-s3-config.interface';
import { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import { SysOssConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-oss-config.entity';
import { Repository } from 'typeorm';
import { OssStorageSettingService } from './oss-storage-setting.service';
import { RedisService } from '../redis/redis.service';

const MIN_MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_SIGNING_EXPIRES_IN = 7 * 24 * 3600;

export interface OssConfigActor {
  identityId?: string;
}

export interface CreateOssConfigInput {
  name: string;
  code: string;
  remark?: string;
  bucket: string;
  endpoint: string;
  internalEndpoint?: string;
  useInternalEndpoint?: boolean;
  config: OssS3Config;
}

export interface UpdateOssConfigInput {
  name?: string;
  remark?: string;
  bucket?: string;
  endpoint?: string;
  internalEndpoint?: string;
  useInternalEndpoint?: boolean;
  config?: Partial<OssS3Config>;
}

export interface OssConfigPageQuery {
  code?: string;
  name?: string;
  provider?: OssProvider;
}

@Injectable()
export class OssConfigService {
  private readonly CACHE_PREFIX = 'oss_config:';
  private readonly CACHE_TTL = 3600;

  constructor(
    @InjectRepository(SysOssConfigEntity)
    private readonly ossConfigRepo: Repository<SysOssConfigEntity>,
    @InjectRepository(SysFileEntity)
    private readonly fileRepo: Repository<SysFileEntity>,
    private readonly redisService: RedisService,
    @Optional() private readonly storageSetting?: OssStorageSettingService,
  ) {}

  async create(
    input: CreateOssConfigInput,
    actor: OssConfigActor = {},
  ): Promise<SysOssConfigEntity> {
    this.assertCreateInput(input);
    const existing = await this.ossConfigRepo.findOne({
      where: { code: input.code },
    });
    if (existing) {
      throw new BizError('配置识别码已存在').codeAs(409).httpStatusAs(409);
    }

    const entity = this.ossConfigRepo.create({
      ...input,
      name: input.name.trim(),
      code: input.code.trim(),
      bucket: input.bucket.trim(),
      endpoint: this.normalizeEndpoint(input.endpoint),
      internalEndpoint: this.normalizeInternalEndpoint(
        input.internalEndpoint,
        input.useInternalEndpoint ?? false,
      ),
      useInternalEndpoint: input.useInternalEndpoint ?? false,
      remark: this.normalizeOptionalText(input.remark),
      config: this.normalizeCreateConfig(input.config),
      createdBy: actor.identityId,
      updatedBy: actor.identityId,
    });
    const saved = await this.ossConfigRepo.save(entity);
    await this.clearCache(saved.code);
    return saved;
  }

  async update(
    code: string,
    input: UpdateOssConfigInput,
    actor: OssConfigActor = {},
  ): Promise<SysOssConfigEntity> {
    const entity = await this.findEntity(code);
    if (input.name !== undefined) {
      this.assertNotBlank(input.name, '名称');
      entity.name = input.name.trim();
    }
    if (input.bucket !== undefined) {
      this.assertNotBlank(input.bucket, '存储桶');
      entity.bucket = input.bucket.trim();
    }
    if (input.endpoint !== undefined) {
      entity.endpoint = this.normalizeEndpoint(input.endpoint);
    }
    const nextUseInternalEndpoint =
      input.useInternalEndpoint ?? entity.useInternalEndpoint;
    const nextInternalEndpoint =
      input.internalEndpoint !== undefined
        ? input.internalEndpoint
        : entity.internalEndpoint;
    if (
      input.internalEndpoint !== undefined ||
      input.useInternalEndpoint !== undefined
    ) {
      entity.internalEndpoint = this.normalizeInternalEndpoint(
        nextInternalEndpoint ?? undefined,
        nextUseInternalEndpoint,
      );
      entity.useInternalEndpoint = nextUseInternalEndpoint;
    }
    if (input.remark !== undefined) {
      entity.remark = this.normalizeOptionalText(input.remark);
    }
    if (input.config !== undefined) {
      entity.config = this.mergeConfig(entity.config, input.config);
    }
    entity.updatedBy = actor.identityId;

    const saved = await this.ossConfigRepo.save(entity);
    await this.clearCache(saved.code);
    return saved;
  }

  async findPage(
    query: OssConfigPageQuery,
    page: number,
    pageSize: number,
  ): Promise<IPageData<SysOssConfigEntity>> {
    const qb = this.ossConfigRepo.createQueryBuilder('ossConfig');
    if (query.code) {
      qb.andWhere('ossConfig.code ILIKE :code', {
        code: `%${query.code}%`,
      });
    }
    if (query.name) {
      qb.andWhere('ossConfig.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }
    if (query.provider) {
      qb.andWhere("ossConfig.config ->> 'provider' = :provider", {
        provider: query.provider,
      });
    }
    const [rows, total] = await qb
      .orderBy('ossConfig.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { rows, total, page, pageSize };
  }

  async findOne(code: string): Promise<SysOssConfigEntity> {
    this.assertNotBlank(code, '配置识别码');
    const cacheKey = this.getCacheKey(code);
    const cached = await this.redisService.get<SysOssConfigEntity>(cacheKey);
    if (cached) return cached;

    const entity = await this.findEntity(code);
    await this.redisService.set(cacheKey, entity, this.CACHE_TTL);
    return entity;
  }

  async findByCode(code: string): Promise<SysOssConfigEntity | null> {
    if (!code) return null;
    const cacheKey = this.getCacheKey(code);
    const cached = await this.redisService.get<SysOssConfigEntity>(cacheKey);
    if (cached) return cached;

    const entity = await this.ossConfigRepo.findOne({ where: { code } });
    if (entity) {
      await this.redisService.set(cacheKey, entity, this.CACHE_TTL);
    }
    return entity;
  }

  async findAll(): Promise<SysOssConfigEntity[]> {
    return await this.ossConfigRepo.find({ order: { name: 'ASC' } });
  }

  async delete(code: string): Promise<boolean> {
    if (!this.storageSetting) {
      const entity = await this.findEntity(code);
      const fileCount = await this.fileRepo.count({
        where: { storageType: 'oss', ossConfigCode: code },
      });
      if (fileCount > 0)
        throw new BizError('该 OSS 配置仍被文件记录使用，不能删除')
          .codeAs(409)
          .httpStatusAs(409);
      await this.clearCache(entity.code);
      const result = await this.ossConfigRepo.delete(entity.code);
      return !!result.affected;
    }

    return this.ossConfigRepo.manager
      .transaction(async (manager) => {
        if (this.storageSetting) {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`oss-storage:${this.storageSetting.configCode}`],
          );
          if (
            (await this.storageSetting.current(manager)).ossConfigCode === code
          )
            throw new BizError('不能删除当前文件存储')
              .codeAs(409)
              .httpStatusAs(409);
        }
        const repo = manager.getRepository(SysOssConfigEntity);
        const entity = await repo.findOne({
          where: { code },
          lock: { mode: 'pessimistic_write' },
        });
        if (!entity)
          throw new BizError('配置不存在').codeAs(404).httpStatusAs(404);
        const fileCount = await manager.getRepository(SysFileEntity).count({
          where: { storageType: 'oss', ossConfigCode: code },
          withDeleted: true,
        });
        if (fileCount > 0) {
          throw new BizError('该 OSS 配置仍被文件记录使用，不能删除')
            .codeAs(409)
            .httpStatusAs(409);
        }
        const result = await repo.delete(entity.code);
        return !!result.affected;
      })
      .then(async (deleted) => {
        await this.clearCache(code);
        return deleted;
      });
  }

  private async findEntity(code: string) {
    this.assertNotBlank(code, '配置识别码');
    const entity = await this.ossConfigRepo.findOne({ where: { code } });
    if (!entity) {
      throw new BizError('配置不存在').codeAs(404).httpStatusAs(404);
    }
    return entity;
  }

  private assertCreateInput(input: CreateOssConfigInput) {
    this.assertNotBlank(input.name, '名称');
    this.assertNotBlank(input.code, '配置识别码');
    this.assertNotBlank(input.bucket, '存储桶');
    this.normalizeEndpoint(input.endpoint);
    this.normalizeInternalEndpoint(
      input.internalEndpoint,
      input.useInternalEndpoint ?? false,
    );
    this.normalizeCreateConfig(input.config);
  }

  private normalizeCreateConfig(config: OssS3Config): OssS3Config {
    if (!config) {
      throw new BizError('S3 协议配置不能为空').codeAs(400);
    }
    this.assertNotBlank(config.accessKeyId, 'AccessKey ID');
    this.assertNotBlank(config.secretAccessKey, 'AccessKey Secret');
    this.assertNotBlank(config.region, '区域');
    return this.normalizeAndValidateConfig({
      ...config,
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
      region: config.region.trim(),
    });
  }

  private mergeConfig(
    current: OssS3Config,
    update: Partial<OssS3Config>,
  ): OssS3Config {
    const next: OssS3Config = { ...current };
    for (const [key, value] of Object.entries(update) as Array<
      [keyof OssS3Config, OssS3Config[keyof OssS3Config]]
    >) {
      if (value !== undefined) {
        Object.assign(next, { [key]: value });
      }
    }

    if (update.accessKeyId === '') next.accessKeyId = current.accessKeyId;
    if (update.secretAccessKey === '') {
      next.secretAccessKey = current.secretAccessKey;
    }
    if (update.sessionToken === '') delete next.sessionToken;
    if (update.domain === '') delete next.domain;

    this.assertNotBlank(next.accessKeyId, 'AccessKey ID');
    this.assertNotBlank(next.secretAccessKey, 'AccessKey Secret');
    this.assertNotBlank(next.region, '区域');
    next.accessKeyId = next.accessKeyId.trim();
    next.secretAccessKey = next.secretAccessKey.trim();
    next.region = next.region.trim();
    return this.normalizeAndValidateConfig(next);
  }

  private normalizeAndValidateConfig(config: OssS3Config): OssS3Config {
    const provider = config.provider ?? OssProvider.S3;
    const addressingStyle =
      config.addressingStyle ??
      (config.forcePathStyle
        ? OssAddressingStyle.PATH
        : OssAddressingStyle.VIRTUAL_HOSTED);
    if (
      provider === OssProvider.ALIYUN &&
      addressingStyle !== OssAddressingStyle.VIRTUAL_HOSTED
    ) {
      throw new BizError('阿里云 OSS 仅支持 virtual-hosted 寻址样式').codeAs(
        400,
      );
    }
    if (
      config.addressingStyle &&
      config.forcePathStyle != null &&
      config.forcePathStyle !==
        (config.addressingStyle === OssAddressingStyle.PATH)
    ) {
      throw new BizError(
        'addressingStyle 与兼容字段 forcePathStyle 配置冲突',
      ).codeAs(400);
    }
    if (
      config.signingExpiresIn != null &&
      (!Number.isInteger(config.signingExpiresIn) ||
        config.signingExpiresIn < 1 ||
        config.signingExpiresIn > MAX_SIGNING_EXPIRES_IN)
    ) {
      throw new BizError('预签名过期时间必须是 1 秒到 7 天的整数').codeAs(400);
    }
    if (
      config.multipartChunkSize != null &&
      (!Number.isInteger(config.multipartChunkSize) ||
        config.multipartChunkSize < MIN_MULTIPART_CHUNK_SIZE)
    ) {
      throw new BizError('默认分片大小不能小于 5 MiB').codeAs(400);
    }

    const normalized: OssS3Config = {
      ...config,
      provider,
      addressingStyle,
      forcePathStyle: addressingStyle === OssAddressingStyle.PATH,
    };
    if (normalized.domain) {
      normalized.domain = this.normalizeDomain(normalized.domain);
    }
    return normalized;
  }

  private normalizeEndpoint(endpoint: string) {
    this.assertNotBlank(endpoint, '端点');
    let url: URL;
    try {
      url = new URL(endpoint.trim());
    } catch {
      throw new BizError('端点必须是完整的 HTTP/HTTPS URL').codeAs(400);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
      throw new BizError(
        '端点必须是完整的 HTTP/HTTPS URL，且不能包含查询或锚点',
      ).codeAs(400);
    }
    return url.toString().replace(/\/$/, '');
  }

  private normalizeInternalEndpoint(
    endpoint: string | undefined,
    useInternalEndpoint: boolean,
  ) {
    const normalized = endpoint?.trim();
    if (!normalized) {
      if (useInternalEndpoint) {
        throw new BizError('启用内网传输时，内网端点不能为空').codeAs(400);
      }
      return null;
    }
    return this.normalizeEndpoint(normalized);
  }

  private normalizeDomain(domain: string) {
    let url: URL;
    try {
      url = new URL(domain.trim());
    } catch {
      throw new BizError('自定义域名必须是完整的 HTTP/HTTPS URL').codeAs(400);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new BizError('自定义域名不能包含路径、查询或锚点').codeAs(400);
    }
    return url.origin;
  }

  private normalizeOptionalText(value?: string) {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private assertNotBlank(value: string | undefined, name: string) {
    if (!value?.trim()) {
      throw new BizError(`${name}不能为空`).codeAs(400);
    }
  }

  private getCacheKey(code: string) {
    return `${this.CACHE_PREFIX}code:${code}`;
  }

  private async clearCache(code: string) {
    await this.redisService.del(this.getCacheKey(code));
  }
}
