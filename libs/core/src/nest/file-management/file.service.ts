import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import { CreateFileDto, FileQueryDto } from './dto/file.dto';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class FileService {
  constructor(
    @InjectRepository(SysFileEntity)
    private readonly fileRepo: Repository<SysFileEntity>,
    private readonly threadLocal: ThreadLocal,
    private readonly redisService: RedisService,
  ) {}

  private readonly REDIS_CACHE_KEY = 'file:translate:map';

  /**
   * 翻译文件 ID 列表，返回文件实体数组
   * @param ids ID 数组
   * @returns SysFileEntity[]
   */
  async translateIds(ids: string[]): Promise<SysFileEntity[]> {
    const cleanIds = Array.from(new Set(ids.filter((id) => !!id)));
    if (cleanIds.length === 0) return [];

    // 1. 从 Redis Hash 批量获取
    const cachedData = await this.redisService.hmget<SysFileEntity>(
      this.REDIS_CACHE_KEY,
      cleanIds,
    );

    const resultMap: Record<string, SysFileEntity> = {};
    const missingIds: string[] = [];

    cleanIds.forEach((id, index) => {
      if (cachedData[index]) {
        resultMap[id] = cachedData[index]!;
      } else {
        missingIds.push(id);
      }
    });

    // 2. 如果有缺失，从数据库查询
    if (missingIds.length > 0) {
      const dbFiles = await this.fileRepo.findBy({
        id: In(missingIds),
      });
      if (dbFiles.length > 0) {
        const updateMap: Record<string, SysFileEntity> = {};
        dbFiles.forEach((file) => {
          resultMap[file.id] = file;
          updateMap[file.id] = file;
        });
        // 3. 回填 Redis 缓存
        await this.redisService.hmset(this.REDIS_CACHE_KEY, updateMap);
      }
    }

    // 4. 按照 cleanIds 的顺序构造返回数组，并过滤掉空值
    return cleanIds.map((id) => resultMap[id]).filter((f) => !!f);
  }

  /**
   * 记录一个文件映射
   * @param dto
   * @param authorType
   * @param createdBy
   * @returns
   */
  async create(dto: CreateFileDto, authorType?: string, createdBy?: string) {
    let file: SysFileEntity | null = null;

    if (dto.storageType === 'local') {
      file = await this.fileRepo.findOne({
        where: { object: dto.object, storageType: 'local' },
        withDeleted: true,
      });
    }

    if (dto.storageType === 'oss') {
      const where: Record<string, any> = {
        object: dto.object,
        storageType: 'oss',
        ossConfigCode: dto.ossConfigCode,
      };
      if (dto.hash) {
        where.hash = dto.hash;
      }
      file = await this.fileRepo.findOne({
        where,
        withDeleted: true,
      });
    }

    if (file) {
      // 相同的变为更新
      const updatePayload = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      );
      Object.assign(file, updatePayload);
      file.createdAt = new Date();
      file.updatedAt = new Date();
      // 如果被软删除了，则恢复。在 TypeORM save 中必须设为 null 才能恢复
      file.deletedAt = null;
    } else {
      file = this.fileRepo.create(dto);
    }

    file.authorType = authorType;
    if (createdBy) {
      // 重新更新审计字段 (根据要求，更新时也要刷新 createdBy)
      file.createdBy = createdBy;
      file.updatedBy = createdBy;
    }
    const saved = await this.fileRepo.save(file);
    // 同步更新缓存 (使用 RedisService.hset 自动处理序列化)
    await this.redisService.hset(this.REDIS_CACHE_KEY, saved.id, saved);
    return saved;
  }

  async createOssUploadTask(
    dto: CreateFileDto,
    authorType: string,
    createdBy: string,
  ) {
    if (dto.storageType !== 'oss' || !dto.ossConfigCode) {
      throw new BizError('OSS 上传任务缺少存储配置').codeAs(400);
    }
    const file = this.fileRepo.create({
      ...dto,
      authorType,
      createdBy,
      updatedBy: createdBy,
    });
    const saved = await this.fileRepo.save(file);
    await this.redisService.hset(this.REDIS_CACHE_KEY, saved.id, saved);
    return saved;
  }

  async createLocalUploadTask(
    dto: CreateFileDto,
    authorType: string,
    createdBy: string,
  ) {
    if (dto.storageType !== 'local') {
      throw new BizError('本地上传任务的存储类型必须为 local').codeAs(400);
    }
    const file = this.fileRepo.create({
      ...dto,
      authorType,
      createdBy,
      updatedBy: createdBy,
    });
    const saved = await this.fileRepo.save(file);
    await this.redisService.hset(this.REDIS_CACHE_KEY, saved.id, saved);
    return saved;
  }

  async save(file: SysFileEntity) {
    const saved = await this.fileRepo.save(file);
    await this.redisService.hset(this.REDIS_CACHE_KEY, saved.id, saved);
    return saved;
  }

  async findByObjectHash(
    object: string,
    hash: string,
    options?: {
      ossConfigCode?: string;
      withDeleted?: boolean;
    },
  ) {
    const where: Record<string, any> = {
      object,
      hash,
    };

    if (options?.ossConfigCode) {
      where.ossConfigCode = options.ossConfigCode;
      where.storageType = 'oss';
    }

    return await this.fileRepo.findOne({
      where,
      withDeleted: options?.withDeleted ?? false,
    });
  }

  async findOssByObject(
    object: string,
    ossConfigCode: string,
    options?: { withDeleted?: boolean },
  ) {
    return await this.fileRepo.findOne({
      where: {
        object,
        ossConfigCode,
        storageType: 'oss',
      },
      withDeleted: options?.withDeleted ?? false,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 服务端决定对象键（OssUploadPolicy）时的续传查找：同一上传人、同一内容摘要与大小、
   * 同一用途（`meta.uploadPurpose`）的最近一个未完成 OSS 上传任务。
   */
  async findPendingOssUpload(input: {
    createdBy: string;
    hash: string;
    size: string;
    purpose: string;
  }) {
    return await this.fileRepo
      .createQueryBuilder('file')
      .where('file.storageType = :storageType', { storageType: 'oss' })
      .andWhere('file.completed = false')
      .andWhere('file.createdBy = :createdBy', { createdBy: input.createdBy })
      .andWhere('file.hash = :hash', { hash: input.hash })
      .andWhere('file.size = :size', { size: input.size })
      .andWhere(`file.meta ->> 'uploadPurpose' = :purpose`, {
        purpose: input.purpose,
      })
      .orderBy('file.createdAt', 'DESC')
      .getOne();
  }

  async findLocalByObject(object: string, options?: { withDeleted?: boolean }) {
    return await this.fileRepo.findOne({
      where: { object, storageType: 'local' },
      withDeleted: options?.withDeleted ?? false,
      order: { createdAt: 'DESC' },
    });
  }

  async findPage(
    query: FileQueryDto,
    page: number,
    pageSize: number,
  ): Promise<IPageData<SysFileEntity>> {
    const { filename, storageType } = query;
    const where: Record<string, any> = {};
    if (filename) where.filename = Like(`%${filename}%`);
    if (storageType) where.storageType = storageType;

    const [rows, total] = await this.fileRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    return { rows, total, page, pageSize };
  }

  async findById(id: string) {
    const file = await this.fileRepo.findOne({ where: { id } });
    if (!file) {
      throw new BizError('文件不存在').codeAs(404);
    }
    return file;
  }

  async findByIds(ids: string[]) {
    return await this.fileRepo.findBy({
      id: In(ids),
    });
  }

  async softDelete(id: string) {
    const file = await this.findById(id);
    const store = this.threadLocal.getStore();
    if (store?.identity) {
      file.updatedBy = store.identity.id;
      await this.fileRepo.save(file);
    }
    const result = await this.fileRepo.softDelete(id);
    if (result.affected && result.affected > 0) {
      // 删除成功后移除缓存 (使用 RedisService.hdel)
      await this.redisService.hdel(this.REDIS_CACHE_KEY, id);
    }
    return !!result.affected && result.affected > 0;
  }
}
