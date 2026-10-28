import { SnakeNamingStrategy } from 'typeorm-naming-strategies/snake-naming.strategy';
import { DataSourceConfig } from './config.interface';

type DatasourceType =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'mariadb'
  | 'mongodb'
  | 'oracle'
  | 'mssql'
  | 'sqljs'
  | 'cordova'
  | 'nativescript'
  | 'react-native'
  | 'expo'
  | 'better-sqlite3';

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 连接池与超时兜底参数（按驱动家族取对应字段名）。
 * 目的：连接打满时「等连接」快速失败而非无限挂；卡死的 SQL 自动中断释放连接，
 * 杜绝「所有 API 一起卡死、只能重启」的连接池耗尽机制。全部可经 env 覆盖。
 */
function buildPoolExtra(type: DatasourceType): Record<string, unknown> {
  const poolMax = parseIntEnv(process.env.DATABASE_POOL_MAX, 20);
  const connectTimeoutMs = parseIntEnv(
    process.env.DATABASE_CONNECT_TIMEOUT_MS,
    5000,
  );
  const idleTimeoutMs = parseIntEnv(
    process.env.DATABASE_IDLE_TIMEOUT_MS,
    30000,
  );
  const statementTimeoutMs = parseIntEnv(
    process.env.DATABASE_STATEMENT_TIMEOUT_MS,
    10000,
  );
  const queryTimeoutMs = parseIntEnv(
    process.env.DATABASE_QUERY_TIMEOUT_MS,
    10000,
  );
  const idleTxTimeoutMs = parseIntEnv(
    process.env.DATABASE_IDLE_TX_TIMEOUT_MS,
    30000,
  );

  if (type === 'postgres') {
    return {
      max: poolMax,
      // 等空闲连接的最长时间：超时即抛错快速失败，不再无限期排队
      connectionTimeoutMillis: connectTimeoutMs,
      idleTimeoutMillis: idleTimeoutMs,
      // 单条 SQL 服务端/客户端超时：卡死查询自动中断，释放连接
      statement_timeout: statementTimeoutMs,
      query_timeout: queryTimeoutMs,
      // 杀掉「事务开着但空闲」的连接，防长事务长期持锁持连接
      idle_in_transaction_session_timeout: idleTxTimeoutMs,
    };
  }
  if (type === 'mysql' || type === 'mariadb') {
    return {
      connectionLimit: poolMax,
      connectTimeout: connectTimeoutMs,
    };
  }
  return { max: poolMax };
}

export const datasourceConfigObject = (
  type: DatasourceType,
): Record<string, DataSourceConfig> => {
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = parseInt(process.env.DATABASE_PORT || '5432', 10);
  const username = process.env.DATABASE_USER || 'postgres';
  const password = process.env.DATABASE_PASSWORD || 'postgres';
  const database = process.env.DATABASE_NAME || 'postgres';
  return {
    default: {
      type,
      host,
      port,
      username,
      password,
      database,
      autoLoadEntities: true,
      synchronize: false,
      logging: process.env.TYPEORM_LOGGING === 'true' ? true : false,
      namingStrategy: new SnakeNamingStrategy(),
      // 连接池诊断标识：pg_stat_activity.application_name 可见三端来源
      applicationName: process.env.APPLICATION_NAME || undefined,
      extra: buildPoolExtra(type),
      // 慢查询告警阈值，便于定位「拖垮连接池」的重查询
      maxQueryExecutionTime: parseIntEnv(
        process.env.DATABASE_SLOW_QUERY_MS,
        5000,
      ),
    },
  };
};
