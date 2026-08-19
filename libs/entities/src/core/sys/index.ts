import { SysFileEntity } from './sys-file.entity';
import { SysOssConfigEntity } from './sys-oss-config.entity';
import { SysRuntimeConfigEntity } from './sys-runtime-config.entity';
import { CoreRequestLogEntity } from './core-request-log.entity';

export const SysEntities = [
  SysFileEntity,
  SysOssConfigEntity,
  SysRuntimeConfigEntity,
  CoreRequestLogEntity,
];

export * from './oss-s3-config.interface';
export * from './core-request-log.entity';
export * from './sys-file.entity';
export * from './sys-oss-config.entity';
export * from './sys-runtime-config.entity';
