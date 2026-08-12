import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResBody } from '@qyy-code-lego/nestjs/core/ApiResBody';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import {
  IPageData,
  PaginationDTO,
} from '@qyy-code-lego/nestjs/core/Pagination';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import {
  CreateOssConfigDto,
  OssConfigPageQueryDto,
  UpdateOssConfigDto,
} from '@qyy-code-lego/nestjs/core/nest/file-management/dto/oss-config.dto';
import { OssConfigService } from '@qyy-code-lego/nestjs/core/nest/file-management/oss-config.service';
import { S3StorageService } from '@qyy-code-lego/nestjs/core/nest/s3-storage';
import { IdentityType } from '@qyy-code-lego/nestjs/entities/core/identity/constants';
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import { PermissionRequired } from '../../shared/guards/permission/permission-required.decorator';
import { PermissionGuard } from '../../shared/guards/permission/permission.guard';
import { toOssConfigVO } from './oss-config.vo-transform';
import { OssConfigConnectionTestVO, OssConfigVO } from './vo/oss-config.types';

@IdentityRequired(IdentityType.OP_USER)
@UseGuards(PermissionGuard)
@Controller('oss-config')
export class OssConfigController {
  constructor(
    private readonly ossConfigService: OssConfigService,
    private readonly s3StorageService: S3StorageService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  @Get('page')
  @PermissionRequired('oss-config:list')
  async page(
    @Query() query: OssConfigPageQueryDto,
    @Query() pagination: PaginationDTO,
  ): Promise<ApiResBody<IPageData<OssConfigVO>>> {
    const result = await this.ossConfigService.findPage(
      query,
      pagination.page,
      pagination.pageSize,
    );
    return ApiResBody.of({
      ...result,
      rows: result.rows.map(toOssConfigVO),
    });
  }

  @Get('detail')
  @PermissionRequired('oss-config:list')
  async detail(@Query('code') code: string): Promise<ApiResBody<OssConfigVO>> {
    const entity = await this.ossConfigService.findOne(code);
    return ApiResBody.of(toOssConfigVO(entity));
  }

  @Post()
  @PermissionRequired('oss-config:create')
  async create(
    @Body() dto: CreateOssConfigDto,
  ): Promise<ApiResBody<OssConfigVO>> {
    const entity = await this.ossConfigService.create(dto, this.getActor());
    return ApiResBody.of(toOssConfigVO(entity));
  }

  @Patch()
  @PermissionRequired('oss-config:update')
  async update(
    @Query('code') code: string,
    @Body() dto: UpdateOssConfigDto,
  ): Promise<ApiResBody<OssConfigVO>> {
    const entity = await this.ossConfigService.update(
      code,
      dto,
      this.getActor(),
    );
    return ApiResBody.of(toOssConfigVO(entity));
  }

  @Delete()
  @PermissionRequired('oss-config:delete')
  async delete(@Query('code') code: string): Promise<ApiResBody<null>> {
    await this.ossConfigService.delete(code);
    return ApiResBody.of(null);
  }

  @Post('test')
  @PermissionRequired('oss-config:test')
  async test(
    @Query('code') code: string,
  ): Promise<ApiResBody<OssConfigConnectionTestVO>> {
    try {
      const result = await this.s3StorageService.listObjects({
        ossConfigCode: code,
        maxKeys: 1,
      });
      return ApiResBody.of(
        plainConnectionTestResult({ success: true, bucket: result.bucket }),
      );
    } catch {
      throw new BizError(
        'OSS 连接测试失败，请检查 Endpoint、Bucket、Region 和访问凭证',
      ).codeAs(400);
    }
  }

  private getActor() {
    return {
      identityId: this.threadLocal.getStore()?.identity?.id,
    };
  }
}

function plainConnectionTestResult(input: {
  success: boolean;
  bucket: string;
}): OssConfigConnectionTestVO {
  return Object.assign(new OssConfigConnectionTestVO(), input);
}
