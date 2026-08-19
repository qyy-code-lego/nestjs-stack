import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysRuntimeConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';
import { RuntimeConfigService } from './runtime-config.service';

/**
 * 运行时业务配置能力（读写 + 缓存）。
 *
 * 只提供 Service，不带任何 HTTP 端点；后台维护接口见
 * `@qyy-code-lego/nestjs/common` 的 `RuntimeConfigAdminModule`。
 */
@Module({
  imports: [TypeOrmModule.forFeature([SysRuntimeConfigEntity])],
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
