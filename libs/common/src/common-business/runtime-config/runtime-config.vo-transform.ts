import { plainToInstance } from 'class-transformer';
import type { SysRuntimeConfigEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-runtime-config.entity';
import { RuntimeConfigVO } from './vo/runtime-config.types';

export function toRuntimeConfigVO(
  entity: SysRuntimeConfigEntity,
): RuntimeConfigVO {
  return plainToInstance(RuntimeConfigVO, {
    code: entity.code,
    name: entity.name,
    group: entity.group ?? undefined,
    remark: entity.remark ?? undefined,
    value: entity.value,
    valueType: entity.valueType,
    valueSchema: entity.valueSchema ?? undefined,
    status: entity.status,
    builtin: entity.builtin ?? false,
    version: entity.version,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
