import { Module } from '@nestjs/common';
import { OssStorageSettingModule } from '@qyy-code-lego/nestjs/core/nest/file-management/oss-storage-setting.module';
import { PermissionModule } from '../../shared/guards/permission/permission.module';
import { SharedServicesModule } from '../../shared/services/shared-services.module';
import { OssStorageSettingController } from './oss-storage-setting.controller';

@Module({
  imports: [OssStorageSettingModule, PermissionModule, SharedServicesModule],
  controllers: [OssStorageSettingController],
  exports: [OssStorageSettingModule],
})
export class OssStorageAdminModule {}
