import { Module } from '@nestjs/common';
import { QyyCodeLegoAppController } from './qyy-code-lego-app.controller';
import { QyyCodeLegoAppService } from './qyy-code-lego-app.service';
import {
  AccountDeserializeModule,
  applyTypeOrmDs,
  configModuleImport,
  CoreEntityFeatureModule,
  IdentityRequiredModule,
  PermissionModule,
} from '@qyy-code-lego/nestjs/common';
import { datasourceConfig } from './config/datasourceConfig';
import { mqConfig } from './config/mqConfig';
import {
  GlobalModule,
  HealthModule,
  JwtAuthModule,
  RedisModule,
} from '@qyy-code-lego/nestjs/core';

@Module({
  imports: [
    configModuleImport({
      configs: [datasourceConfig, mqConfig],
      envName: 'qyy-code-lego-app',
    }),
    ...applyTypeOrmDs({
      configKey: 'datasource',
      datasourceNameList: ['default'],
    }),
    GlobalModule,
    // 进程健康监测：自动暴露 GET /health(liveness) 与 /health/ready(readiness)
    HealthModule.forRoot(),
    CoreEntityFeatureModule,
    // account信息挂载
    AccountDeserializeModule,
    // 身份验证拦截
    IdentityRequiredModule,
    // 权限拦截
    PermissionModule,
    // 使用redis
    RedisModule,
    JwtAuthModule.forRoot(),
  ],
  controllers: [QyyCodeLegoAppController],
  providers: [QyyCodeLegoAppService],
})
export class QyyCodeLegoAppModule {}
