import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ApiResBody } from '@qyy-code-lego/nestjs/core/ApiResBody';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { SetOssStorageDto } from '@qyy-code-lego/nestjs/core/nest/file-management/dto/oss-storage-setting.dto';
import { OssStorageSettingService } from '@qyy-code-lego/nestjs/core/nest/file-management/oss-storage-setting.service';
import { IdentityType } from '@qyy-code-lego/nestjs/entities/core/identity/constants';
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import { PermissionRequired } from '../../shared/guards/permission/permission-required.decorator';
import { PermissionGuard } from '../../shared/guards/permission/permission.guard';

export class OssStorageSettingVO {
  ossConfigCode: string | null;
  keyPrefix: string;
  version: number;
}

@IdentityRequired(IdentityType.OP_USER)
@UseGuards(PermissionGuard)
@Controller('file-storage')
export class OssStorageSettingController {
  constructor(
    private readonly settings: OssStorageSettingService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  @Get()
  @PermissionRequired('oss-config:list')
  async current(): Promise<ApiResBody<OssStorageSettingVO>> {
    return ApiResBody.of(
      plainToInstance(OssStorageSettingVO, await this.settings.current()),
    );
  }

  @Put()
  @PermissionRequired('oss-config:update')
  async set(
    @Body() dto: SetOssStorageDto,
  ): Promise<ApiResBody<OssStorageSettingVO>> {
    const result = await this.settings.set(dto, {
      actor: { identityId: this.threadLocal.getStore()?.identity?.id },
    });
    return ApiResBody.of(plainToInstance(OssStorageSettingVO, result));
  }
}
