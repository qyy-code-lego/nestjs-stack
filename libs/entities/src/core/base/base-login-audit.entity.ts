import { Column, CreateDateColumn, Index } from 'typeorm';
import { WithId } from './extendable';

class BaseLoginAuditRoot {}

@Index(['success'])
@Index(['accountId', 'createdAt'])
@Index(['identityId', 'createdAt'])
export abstract class BaseLoginAudit extends WithId(BaseLoginAuditRoot) {
  @Column({ name: 'account_id' })
  accountId: string;

  @Column({ name: 'identity_id', nullable: true })
  identityId?: string;
  @Column({ length: 32, nullable: true })
  channel?: string;

  @Column({ length: 45, nullable: true })
  ip?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'boolean' })
  success: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
