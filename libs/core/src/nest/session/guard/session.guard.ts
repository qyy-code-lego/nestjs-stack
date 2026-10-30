import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionService } from '../session.service';
import { IS_PUBLIC_KEY } from '../../jwt-auth/decorator/public.decorator';
import { JwtPayload } from '../../jwt-auth/types/jwt-payload.type';
import { BizError } from '../../../BizError';
import { SESSION_BIZ_CODE } from '../session.constants';

/**
 * 凭证失效检查接口（L711 B' — 改密/重置/停用后旧令牌失效）。
 *
 * core 层 SessionGuard 通过此接口做凭证时间比对，不直接依赖具体 entity。
 * common 层提供实现（CredentialCheckService），注入 OpAccountCredential / OpAccount 仓库。
 * 三端共享同一处 SessionGuard，改一处三端生效。
 */
export interface CredentialChecker {
  /**
   * 返回该 accountId 对应的凭证变更时间（passwordChangedAt / passwordResetAt 中较大者，毫秒级）。
   * 若该账号不存在或无密码凭证，返回 null（不做比对，放行到后续 guard）。
   * @param accountId JWT payload.accountId（admin/resource = op_account.id，client = student.id）
   * @param system JWT payload.system（t4s-admin / t4s-resource / t4s-main-client）
   */
  getCredentialChangedAt(accountId: string, system: string): Promise<number | null>;

  /**
   * 返回该 accountId 对应的账号 status。
   * admin/resource: op_account.status；client: student.status
   * 若不存在或非该体系，返回 null（不做停用比对）。
   * @param accountId JWT payload.accountId
   * @param system JWT payload.system
   */
  getAccountStatus(accountId: string, system: string): Promise<string | null>;
}

/** DI token — common 层提供实现，core 层只依赖接口 */
export const CREDENTIAL_CHECKER = Symbol('CREDENTIAL_CHECKER');

/**
 * Session 会话守卫
 *
 * 用于校验当前 JWT 令牌对应的会话是否在 Redis 中仍然有效。
 * ⚠️ 注意：该 Guard 必须在 JwtAuthGuard 之后执行，因为它依赖于 request.user 中的 jti。
 * 通常通过 GlobalGuardsModule.connect 按固定顺序注册。
 *
 * L711 B' — 在会话有效性检查之后，额外做两段凭证比对（guard 内三段顺序固定）：
 * ① kickedOut / jti 已删 → 401（validateSession 内已有）
 * ② token.iat < max(passwordChangedAt, passwordResetAt) → 401「凭证已变更，请重新登录」
 * ③ op_account / op_user status ≠ ACTIVE → 401「账号已被停用，请联系管理员」(PRD L728 原文)
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private static readonly logger = new Logger(SessionGuard.name);
  private static credentialCheckerWarned = false;
  private cachedCredentialChecker: CredentialChecker | null | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * 懒查 CREDENTIAL_CHECKER token（跨模块）。
   *
   * SessionGuard 由 JwtAuthModule（@Global）实例化，但 CredentialCheckModule
   * 只在各 app 的根 Module 里 import。构造期 @Optional() @Inject(CREDENTIAL_CHECKER)
   * 在 JwtAuthModule 的 DI 作用域内不可见 → 注入 undefined。
   *
   * 改用 ModuleRef.get(CREDENTIAL_CHECKER, { strict: false }) 在首次调用时
   * 从整个应用 DI 容器懒查，绕过模块作用域限制。
   */
  private getCredentialChecker(): CredentialChecker | null | undefined {
    if (this.cachedCredentialChecker !== undefined) {
      return this.cachedCredentialChecker;
    }
    try {
      this.cachedCredentialChecker = this.moduleRef.get(CREDENTIAL_CHECKER, { strict: false });
    } catch {
      this.cachedCredentialChecker = null;
    }
    return this.cachedCredentialChecker;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 检查是否是公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;

    // 2. 检查 JWT 是否已解析 (jti 是否存在)
    if (!user || !user.jti) {
      return true; // 如果没有 JWT，交给 JwtAuthGuard 处理或允许通过（取决于业务逻辑，通常 JwtAuthGuard 会先拦截）
    }

    // 3. 验证会话 (内部处理超时检查) — 段① kickedOut / jti 已删
    await this.sessionService.validateSession(
      user.accountId,
      user.system,
      user.jti,
    );

    // 4. L711 B' — 段② 凭证时间比对 + 段③ 账号状态检查
    const credentialChecker = this.getCredentialChecker();
    if (credentialChecker) {
      // 段②：改密 / 重置后旧令牌失效
      const credentialChangedAt = await credentialChecker.getCredentialChangedAt(user.accountId, user.system);
      if (credentialChangedAt !== null) {
        // JWT iat 是秒级，credentialChangedAt 是毫秒级（timestamptz）
        // 统一截断到秒再比；用 <= 而非 <：
        //   改密后旧令牌 iat 可能与 credentialChangedSec 同秒（DB timestamptz 截断到秒），
        //   用 < 则同秒改密的旧令牌不失效（S13 自验发现的时序漏洞）；用 <= 则旧令牌被失效。
        //   新令牌在改密之后签发，iat 必然 > credentialChangedSec，不受影响。
        const credentialChangedSec = Math.floor(credentialChangedAt / 1000);
        if (user.iat <= credentialChangedSec) {
          throw new BizError('凭证已变更，请重新登录')
            .codeAs(SESSION_BIZ_CODE.INVALID)
            .httpStatusAs(401);
        }
      }

      // 段③：账号停用 → 401（PRD L728 原文）
      const accountStatus = await credentialChecker.getAccountStatus(user.accountId, user.system);
      if (accountStatus !== null && accountStatus !== 'active') {
        throw new BizError('账号已被停用，请联系管理员')
          .codeAs(SESSION_BIZ_CODE.INVALID)
          .httpStatusAs(401);
      }
    } else {
      // boot 时如果 credentialChecker 未注入，打 ERROR 日志
      // @Optional() 注入意味着某端没注册 common 层实现时 credentialChecker=undefined
      // 此时段②③整体静默跳过——不报错但等于没修
      if (!SessionGuard.credentialCheckerWarned) {
        SessionGuard.logger.error(
          `[SessionGuard] CREDENTIAL_CHECKER 未注入 — 凭证失效检查（段②③）被静默跳过。` +
          `请确保该端模块图注册了 CredentialCheckService（common 层）。` +
          `system=${user.system}`,
        );
        SessionGuard.credentialCheckerWarned = true;
      }
    }

    // 5. 更新活跃时间 (异步去抖，尽力而为)
    // Redis 抖动/超时（commandTimeout）会让该命令 reject，必须 catch，
    // 否则 fire-and-forget 会变成未处理的 Promise rejection。
    void this.sessionService
      .updateLastActivity(user.accountId, user.system, user.jti)
      .catch(() => {
        /* 活跃时间更新失败不影响请求，忽略 */
      });

    return true;
  }
}
