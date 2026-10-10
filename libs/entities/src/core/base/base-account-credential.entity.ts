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
}
