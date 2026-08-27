import {
  WithTimeTrace,
  WithId,
  WithStatus,
} from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { Identity } from '../identity/identity.entity';
import { OpRolePermission } from './op-role-permission.entity';
import { OpUserRole } from './op-user-role.entity';

class OpRoleRoot {}

@Entity({ name: 'op_role' })
@Index('uq_op_role_name', ['name'], { unique: true })
export class OpRole extends WithStatus(WithTimeTrace(WithId(OpRoleRoot))) {
  @Column({ name: 'code', length: 64 })
  code: string;

  @Column({ length: 64 })
  name: string;

  @Column({ name: 'created_admin_id', nullable: true })
  createdAdminId: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'bucket_id', type: 'bigint', nullable: true })
  bucketId?: string | null;

  @ManyToOne(() => Identity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'created_admin_id' })
  creator?: Identity;

  @OneToMany(() => OpRolePermission, (rolePermission) => rolePermission.role)
  permissions: OpRolePermission[];

  @OneToMany(() => OpUserRole, (userRole) => userRole.role)
  userBindings: OpUserRole[];

  userCount?: number;
}
