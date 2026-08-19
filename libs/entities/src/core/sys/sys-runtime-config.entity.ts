import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WithAuditor, WithStatus, WithTimeTrace } from '../base/extendable';

/**
 * 运行时配置的值类型。
 *
 * 仅用于提示前端选择合适的编辑器形态（对象/数组走 JSON 编辑器，标量走普通输入框），
 * 不参与后端强校验——真正的结构约束由 `valueSchema` 或业务侧自行负责。
 */
export enum RuntimeConfigValueType {
  OBJECT = 'object',
  ARRAY = 'array',
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
}

/** 运行时配置的值，任意合法 JSON。 */
export type RuntimeConfigValue = unknown;

class SysRuntimeConfigEntityRoot {}

/**
 * 系统运行时配置表。
 *
 * 与进程配置（env / yaml / `ConfigService<AllConfig>`）**不对等**：
 * - 进程配置：启动期加载、同步读取、随发布变更，适合连接串、端口、密钥等基础设施参数；
 * - 运行时配置：存库、异步读取（带缓存）、后台随时改且立即生效，适合频繁调整的业务参数。
 *
 * 业务侧一律通过 `RuntimeConfigService` 读取，禁止塞进 `AllConfig` 命名空间。
 */
@Entity('sys_runtime_config')
@Index('idx_sys_runtime_config_group', ['group'])
export class SysRuntimeConfigEntity extends WithStatus(
  WithAuditor(WithTimeTrace(SysRuntimeConfigEntityRoot)),
) {
  @PrimaryColumn({
    type: 'varchar',
    length: 128,
    comment: '配置识别码（主键），建议用点分命名，如 generation.default_params',
  })
  code: string;

  @Column({ type: 'varchar', length: 255, comment: '配置展示名称' })
  name: string;

  @Column({
    name: 'group_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '配置分组，用于后台分类展示',
  })
  group?: string | null;

  @Column({ type: 'text', nullable: true, comment: '备注说明' })
  remark?: string | null;

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
    comment: '配置值，任意合法 JSON',
  })
  value: RuntimeConfigValue;

  @Column({
    name: 'value_type',
    type: 'varchar',
    length: 16,
    default: RuntimeConfigValueType.OBJECT,
    comment: '值类型提示，供后台选择编辑器形态',
  })
  valueType: RuntimeConfigValueType;

  @Column({
    name: 'value_schema',
    type: 'jsonb',
    nullable: true,
    comment: '可选的 JSON Schema，供后台编辑器做提示与校验',
  })
  valueSchema?: Record<string, unknown> | null;

  @Column({
    type: 'boolean',
    default: false,
    comment: '是否内置配置项，内置项禁止删除',
  })
  builtin: boolean;

  @Column({
    type: 'integer',
    default: 1,
    comment: '版本号，每次改值自增，用于乐观锁',
  })
  version: number;
}
