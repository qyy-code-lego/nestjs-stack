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
import {
  IPageData,
  PaginationDTO,
} from '@qyy-code-lego/nestjs/core/Pagination';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import {
  CreateRuntimeConfigDto,
  RuntimeConfigPageQueryDto,
  UpdateRuntimeConfigDto,
  UpdateRuntimeConfigValueDto,
} from '@qyy-code-lego/nestjs/core/nest/runtime-config/dto/runtime-config.dto';
import { RuntimeConfigService } from '@qyy-code-lego/nestjs/core/nest/runtime-config/runtime-config.service';
import { IdentityType } from '@qyy-code-lego/nestjs/entities/core/identity/constants';
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import { PermissionRequired } from '../../shared/guards/permission/permission-required.decorator';
import { PermissionGuard } from '../../shared/guards/permission/permission.guard';
import { toRuntimeConfigVO } from './runtime-config.vo-transform';
import { RuntimeConfigVO } from './vo/runtime-config.types';

/**
 * 运行时业务配置的通用后台维护接口。
 *
 * 消费工程只要 import `RuntimeConfigAdminModule`（或 `CommonBusinessModule`）
 * 即可直接得到这套接口，无需再写 Controller。权限码前缀 `runtime-config:`。
 */
@IdentityRequired(IdentityType.OP_USER)
@UseGuards(PermissionGuard)
@Controller('runtime-config')
export class RuntimeConfigController {
  constructor(
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  @Get('page')
  @PermissionRequired('runtime-config:list')
  async page(
    @Query() query: RuntimeConfigPageQueryDto,
    @Query() pagination: PaginationDTO,
  ): Promise<ApiResBody<IPageData<RuntimeConfigVO>>> {
    const result = await this.runtimeConfigService.findPage(
      query,
      pagination.page,
      pagination.pageSize,
    );
    return ApiResBody.of({
      ...result,
      rows: result.rows.map(toRuntimeConfigVO),
    });
  }

  @Get('detail')
  @PermissionRequired('runtime-config:list')
  async detail(
    @Query('code') code: string,
  ): Promise<ApiResBody<RuntimeConfigVO>> {
    const entity = await this.runtimeConfigService.findOne(code);
    return ApiResBody.of(toRuntimeConfigVO(entity));
  }

  /** 已有分组，供后台筛选下拉。 */
  @Get('groups')
  @PermissionRequired('runtime-config:list')
  async groups(): Promise<ApiResBody<string[]>> {
    return ApiResBody.of(await this.runtimeConfigService.findGroups());
  }

  @Post()
  @PermissionRequired('runtime-config:create')
  async create(
    @Body() dto: CreateRuntimeConfigDto,
  ): Promise<ApiResBody<RuntimeConfigVO>> {
    const entity = await this.runtimeConfigService.create(dto, this.getActor());
    return ApiResBody.of(toRuntimeConfigVO(entity));
  }

  @Patch()
  @PermissionRequired('runtime-config:update')
  async update(
    @Query('code') code: string,
    @Body() dto: UpdateRuntimeConfigDto,
  ): Promise<ApiResBody<RuntimeConfigVO>> {
    const entity = await this.runtimeConfigService.update(
      code,
      dto,
      this.getActor(),
    );
    return ApiResBody.of(toRuntimeConfigVO(entity));
  }

  /** 只改值：后台 JSON 编辑器保存走这个端点，带 expectedVersion 做乐观锁。 */
  @Patch('value')
  @PermissionRequired('runtime-config:update')
  async updateValue(
    @Query('code') code: string,
    @Body() dto: UpdateRuntimeConfigValueDto,
  ): Promise<ApiResBody<RuntimeConfigVO>> {
    const entity = await this.runtimeConfigService.updateValue(
      code,
      dto.value,
      { expectedVersion: dto.expectedVersion },
      this.getActor(),
    );
    return ApiResBody.of(toRuntimeConfigVO(entity));
  }

  @Delete()
  @PermissionRequired('runtime-config:delete')
  async delete(@Query('code') code: string): Promise<ApiResBody<null>> {
    await this.runtimeConfigService.delete(code);
    return ApiResBody.of(null);
  }

  private getActor() {
    return {
      identityId: this.threadLocal.getStore()?.identity?.id,
    };
  }
}
