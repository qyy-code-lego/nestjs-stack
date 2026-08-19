import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities/core/base/extendable';
import { RuntimeConfigValueType } from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';

export class RuntimeConfigVO {
  code: string;
  name: string;
  group?: string;
  remark?: string;
  value: unknown;
  valueType: RuntimeConfigValueType;
  valueSchema?: Record<string, unknown>;
  status: ObjectActiveStatus;
  builtin: boolean;
  version: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
