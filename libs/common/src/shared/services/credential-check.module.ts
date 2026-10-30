import { Module } from '@nestjs/common';
import { CredentialCheckService } from './credential-check.service';
import { CREDENTIAL_CHECKER } from '@qyy-code-lego/nestjs/core';

/**
 * L711 B' — 凭证失效检查模块（轻量，三端各自装配）。
 *
 * 仅注册 CredentialCheckService + CREDENTIAL_CHECKER token，
 * 让 core 层 SessionGuard 的 @Optional() @Inject(CREDENTIAL_CHECKER) 能注入到实现。
 *
 * 三端必须各自 import 本模块，否则 SessionGuard 段②③凭证失效检查会被静默跳过
 * （@Optional() 注入 credentialChecker=undefined，不报错但等于没修）。
 *
 * 不依赖 SharedServicesModule / CommonBusinessModule，避免 resource/client 端
 * 引入不需要的 OpUserSharedService 等重量级服务。
 */
@Module({
  providers: [
    CredentialCheckService,
    { provide: CREDENTIAL_CHECKER, useExisting: CredentialCheckService },
  ],
  exports: [CREDENTIAL_CHECKER],
})
export class CredentialCheckModule {}
