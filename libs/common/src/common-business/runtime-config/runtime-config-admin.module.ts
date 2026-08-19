import { Module } from '@nestjs/common';
import { RuntimeConfigModule } from '@qyy-code-lego/nestjs/core/nest/runtime-config/runtime-config.module';
import { PermissionModule } from '../../shared/guards/permission/permission.module';
import { RuntimeConfigController } from './runtime-config.controller';

/**
 * 运行时业务配置的后台维护端点。
 *
 * 只需 import 本模块即可获得 `/runtime-config/**` 全套接口；
 * 业务侧读取配置请注入 `RuntimeConfigService`（由 `RuntimeConfigModule` 导出）。
 */
@Module({
  imports: [RuntimeConfigModule, PermissionModule],
  controllers: [RuntimeConfigController],
  exports: [RuntimeConfigModule],
})
export class RuntimeConfigAdminModule {}
