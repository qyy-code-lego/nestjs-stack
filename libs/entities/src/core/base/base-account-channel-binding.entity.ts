import { Column, Index } from 'typeorm';
import { WithId, WithTimeTrace } from './extendable';

class BaseAccountChannelBindingRoot {}

@Index(['channel', 'externalUserId'], {
  unique: true,
})
export abstract class BaseAccountChannelBinding extends WithTimeTrace(
  WithId(BaseAccountChannelBindingRoot),
) {
  @Column({ length: 64 })
  channel: string;

  @Column({ name: 'external_user_id', length: 128 })
  externalUserId: string;

  @Column({ name: 'external_union_id', length: 128, nullable: true })
  externalUnionId?: string;

  @Column({ name: 'access_token', length: 512, nullable: true })
  accessToken?: string;

  @Column({ name: 'refresh_token', length: 512, nullable: true })
  refreshToken?: string;

  @Column({ name: 'avatar_url', length: 512, nullable: true })
  avatarUrl?: string;

  @Column({ length: 128, nullable: true })
  nickname?: string;

  @Column({ name: 'binding_status', type: 'smallint', default: 1 })
  bindingStatus: number;

  @Column({ name: 'authorized_scopes', length: 512, nullable: true })
  authorizedScopes?: string;

  @Column({ name: 'last_authorized_at', type: 'timestamptz', nullable: true })
  lastAuthorizedAt?: Date;
}
