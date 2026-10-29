import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { SessionData } from './types/session.type';
import {
  getSessionDataKey,
  getSessionLookupKey,
  getSessionLockKey,
  SESSION_BIZ_CODE,
} from './session.constants';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private getSessionAppName(): string {
    return this.configService.get<string>('app.name', 'nestjs-app');
  }

  /**
   * 创建会话并执行踢出策略
   */
  async createSession(data: Omit<SessionData, 'createdAt' | 'lastActivityAt'>) {
    const helper = this.redisService.getHelper('session');
    const appName = this.getSessionAppName();
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      ...data,
      createdAt: now,
      lastActivityAt: now,
    };

    const maxTime = this.configService.get<number>(
      'session.maxTime',
      43200, // 默认 12 小时
    );
    const sessionKickOutEnable = this.configService.get<boolean>(
      'session.kickOutEnable',
      true,
    );

    const lookupKey = getSessionLookupKey(appName, data.system, data.accountId);
    if (sessionKickOutEnable) {
      // 1. 踢出同系统旧会话
      const oldJti = await helper.get<string>(lookupKey);
      if (oldJti) {
        // 软踢出：不是直接删除，而是标记为 kickedOut，以便下次访问时给出明确提示
        const oldSessionKey = getSessionDataKey(
          appName,
          data.system,
          data.accountId,
          oldJti,
        );
        const oldSession = await helper.get<SessionData>(oldSessionKey);
        if (oldSession) {
          oldSession.kickedOut = true;
          // 延长一点有效期，确保用户能看到提示
          await helper.set(oldSessionKey, oldSession, 86400); // 暂定保留 24 小时
        }
        this.logger.log(
          `Soft kicked out old session: ${oldJti} for account: ${data.accountId}`,
        );
      }
    }

    // 2. 存储新会话
    const sessionKey = getSessionDataKey(
      appName,
      data.system,
      data.accountId,
      data.jti,
    );
    // Redis 过期时间稍微长一点，以便能在代码中判断出是超时还是被其他设备踢出
    const redisTtl = maxTime + 3600;
    await helper.set(sessionKey, sessionData, redisTtl);
    if (sessionKickOutEnable) {
      await helper.set(lookupKey, data.jti, redisTtl);
    }

    return sessionData;
  }

  /**
   * 获取会话数据
   */
  async getSession(
    accountId: string | number,
    system: string,
    jti: string,
  ): Promise<SessionData | null> {
    const helper = this.redisService.getHelper('session');
    const appName = this.getSessionAppName();
    return await helper.get<SessionData>(
      getSessionDataKey(appName, system, accountId, jti),
    );
  }

  /**
   * 更新最后活跃时间（去抖动）
   */
  async updateLastActivity(
    accountId: string | number,
    system: string,
    jti: string,
  ) {
    const helper = this.redisService.getHelper('session');
    const appName = this.getSessionAppName();
    const lockKey = getSessionLockKey(appName, system, accountId, jti);
    const debounceTime = this.configService.get<number>(
      'session.debounceTime',
      60,
    );

    // 检查锁
    const hasLock = await helper.exists(lockKey);
    if (hasLock) return;

    // 加锁并更新
    await helper.set(lockKey, '1', debounceTime);

    const sessionKey = getSessionDataKey(appName, system, accountId, jti);
    const session = await helper.get<SessionData>(sessionKey);
    if (session) {
      session.lastActivityAt = Math.floor(Date.now() / 1000);
      const maxTime = this.configService.get<number>('session.maxTime', 43200);
      const redisTtl = maxTime + 3600;
      await helper.set(sessionKey, session, redisTtl);
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(accountId: string | number, system: string, jti: string) {
    const helper = this.redisService.getHelper('session');
    const appName = this.getSessionAppName();
    const session = await this.getSession(accountId, system, jti);
    if (session) {
      const lookupKey = getSessionLookupKey(
        appName,
        session.system,
        session.accountId,
      );
      const currentLookupJti = await helper.get<string>(lookupKey);
      if (currentLookupJti === jti) {
        await helper.del(
          getSessionDataKey(appName, system, accountId, jti),
          lookupKey,
        );
        return;
      }
      await helper.del(getSessionDataKey(appName, system, accountId, jti));
    }
  }

  /**
   * 验证会话（包含超时检查）
   */
  async validateSession(
    accountId: string | number,
    system: string,
    jti: string,
  ): Promise<SessionData> {
    const session = await this.getSession(accountId, system, jti);
    if (!session) {
      throw new BizError('登录已过期，请重新登录')
        .codeAs(SESSION_BIZ_CODE.INVALID)
        .httpStatusAs(401);
    }

    // 检查是否被踢出
    if (session.kickedOut) {
      // 提示后彻底删除
      await this.deleteSession(accountId, system, jti);
      throw new BizError('您的账号在另一台设备登录，您已被强制下线')
        .codeAs(SESSION_BIZ_CODE.INVALID)
        .httpStatusAs(401);
    }

    const maxTime = this.configService.get<number>('session.maxTime', 43200);
    const now = Math.floor(Date.now() / 1000);

    if (now - session.lastActivityAt > maxTime) {
      // 发现超时，删除会话
      await this.deleteSession(accountId, system, jti);
      throw new BizError('会话已超时，请重新登录')
        .codeAs(SESSION_BIZ_CODE.TIMEOUT)
        .httpStatusAs(401);
    }

    return session;
  }
}
