import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CredentialChecker } from '@qyy-code-lego/nestjs/core';

/**
 * L711 B' — 凭证失效检查服务（common 层实现）。
 *
 * 实现 CredentialChecker 接口，由 core 层 SessionGuard 通过 @Optional() @Inject(CREDENTIAL_CHECKER) 注入。
 *
 * 三端共用：
 * - admin (t4s-admin) / resource (t4s-resource): accountId = op_account.id
 *   → 查 op_account_credential.password_changed_at / password_reset_at + op_account.status
 * - client (t4s-main-client): accountId = student.id
 *   → 查 student.password_changed_at / password_reset_at + student.status
 *
 * 返回 max(passwordChangedAt, passwordResetAt) 的毫秒时间戳（两者都 null → null 不比对）。
 */
@Injectable()
export class CredentialCheckService implements CredentialChecker, OnModuleInit {
  private readonly logger = new Logger(CredentialCheckService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.logger.log('CredentialCheckService 已注入 — SessionGuard 段②③凭证失效检查已激活');
  }

  /**
   * 返回 max(passwordChangedAt, passwordResetAt) 毫秒时间戳，两者都 null → null。
   */
  async getCredentialChangedAt(accountId: string, system: string): Promise<number | null> {
    if (!accountId) return null;

    try {
      if (system === 't4s-main-client') {
        // 学员端: accountId = student.id
        const row = await this.dataSource.query(
          `SELECT
             EXTRACT(EPOCH FROM password_changed_at) * 1000 AS changed_ms,
             EXTRACT(EPOCH FROM password_reset_at) * 1000 AS reset_ms
           FROM student
           WHERE id = $1
           LIMIT 1`,
          [accountId],
        );
        if (!row || row.length === 0) return null;
        const changedMs = row[0].changed_ms ? Number(row[0].changed_ms) : null;
        const resetMs = row[0].reset_ms ? Number(row[0].reset_ms) : null;
        return this.maxOrNull(changedMs, resetMs);
      } else {
        // admin / resource: accountId = op_account.id
        const row = await this.dataSource.query(
          `SELECT
             EXTRACT(EPOCH FROM c.password_changed_at) * 1000 AS changed_ms,
             EXTRACT(EPOCH FROM c.password_reset_at) * 1000 AS reset_ms
           FROM op_account_credential c
           WHERE c.op_account_id = $1 AND c.type = 'password' AND c.is_primary = true
           LIMIT 1`,
          [accountId],
        );
        if (!row || row.length === 0) return null;
        const changedMs = row[0].changed_ms ? Number(row[0].changed_ms) : null;
        const resetMs = row[0].reset_ms ? Number(row[0].reset_ms) : null;
        return this.maxOrNull(changedMs, resetMs);
      }
    } catch (err) {
      this.logger.error(
        `getCredentialChangedAt 查询失败 accountId=${accountId} system=${system}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null; // 查询失败不放行到 401，交给后续 guard 处理
    }
  }

  /**
   * 返回账号 status（active / disabled / ...），不存在 → null。
   */
  async getAccountStatus(accountId: string, system: string): Promise<string | null> {
    if (!accountId) return null;

    try {
      if (system === 't4s-main-client') {
        // 学员端: accountId = student.id
        const row = await this.dataSource.query(
          `SELECT status FROM student WHERE id = $1 LIMIT 1`,
          [accountId],
        );
        if (!row || row.length === 0) return null;
        return row[0].status;
      } else {
        // admin / resource: accountId = op_account.id
        const row = await this.dataSource.query(
          `SELECT status FROM op_account WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
          [accountId],
        );
        if (!row || row.length === 0) return null;
        return row[0].status;
      }
    } catch (err) {
      this.logger.error(
        `getAccountStatus 查询失败 accountId=${accountId} system=${system}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * 两个时间戳取最大值，都 null → null。
   * JS Math.max(null, null) = 0（不是 null），所以手动处理。
   */
  private maxOrNull(a: number | null, b: number | null): number | null {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return Math.max(a, b);
  }
}
