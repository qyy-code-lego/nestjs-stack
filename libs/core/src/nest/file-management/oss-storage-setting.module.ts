import { TypeOrmModule } from '@nestjs/typeorm';
import { SysOssConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-oss-config.entity';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import {
  OSS_STORAGE_SETTING_OPTIONS,
  OssStorageSettingService,
} from './oss-storage-setting.service';
import type { OssStorageSettingOptions } from './oss-storage-setting.service';

/** 显式导入才启用；全 app 共享一个默认目标，不影响未导入的旧工程。 */
@Global()
@Module({
  imports: [
    RuntimeConfigModule,
    TypeOrmModule.forFeature([SysOssConfigEntity]),
  ],
  providers: [OssStorageSettingService],
  exports: [OssStorageSettingService],
})
export class OssStorageSettingModule {
  static forRoot(options: OssStorageSettingOptions): DynamicModule {
    return {
      module: OssStorageSettingModule,
      providers: [{ provide: OSS_STORAGE_SETTING_OPTIONS, useValue: options }],
    };
  }
}
