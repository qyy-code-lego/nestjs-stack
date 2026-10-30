import { Column, Index } from 'typeorm';
import { ObjectActiveStatus, WithId, WithTimeTrace } from './extendable';

class BaseAccountCredentialRoot {}

@Index(['identifier'])
export abstract class BaseAccountCredential extends WithTimeTrace(
  WithId(BaseAccountCredentialRoot),
) {
  @Column({ length: 32 })
  type: string;

  @Column({ length: 128 })
  identifier: string;

  @Column({ length: 255, nullable: true })
  secret?: string;

  @Column({ length: 64, nullable: true })
  salt?: string;

  @Column({ length: 64, nullable: true })
  provider?: string;

  @Column({ name: 'expire_at', type: 'timestamptz', nullable: true })
  expireAt?: Date;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ length: 16, type: 'varchar', default: ObjectActiveStatus.ACTIVE })
  status: ObjectActiveStatus;

  /** 密码最后修改时间。null = 从未改过（首登强制改密 / 重置后回退），非 null = 已改过 */
  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt?: Date | null;

  /**
   * 密码重置时间（L711 B' — 管理端重置密码后旧令牌失效）。
   * resetOpUserPassword 写 now()，changePassword 不写（它写 passwordChangedAt）。
   * Guard 比对 max(passwordChangedAt, passwordResetAt)，两者都 null → 不失效。
   */
  @Column({ name: 'password_reset_at', type: 'timestamptz', nullable: true })
  passwordResetAt?: Date | null;
}
