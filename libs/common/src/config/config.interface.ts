import type { LogLevel } from '@nestjs/common';

export type AppLoggerLevel =
  'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface AppLoggerConfig {
  /** 日志最小输出级别，默认 info */
  level: AppLoggerLevel;
  /** Nest 实际启用的日志级别列表 */
  levels: LogLevel[];
  /** 启动日志上下文，默认取 APP_NAME */
  context: string;
}

export interface AppRequestLogsConfig {
  /** 是否持久化 HTTP 请求日志，默认 false */
  persistEnabled: boolean;
  /** 是否通过 Nest Logger 输出 HTTP 访问日志，默认 false */
  accessLogEnabled: boolean;
  /** @deprecated use accessLogEnabled */
  printToStdout: boolean;
}

/** 日志文件落盘格式：json=结构化逐行 JSON；text=直接镜像 std 原文 */
export type AppLogFileFormat = 'json' | 'text';

export interface AppLogFileConfig {
  /** 总开关，默认 false；关闭时进程对 std 输出零侵入，开发态保持原样 */
  enabled: boolean;
  /** 落盘格式，默认 json */
  format: AppLogFileFormat;
  /** 日志目录，默认 ./logs（docker 下建议 /app/logs），相对 cwd 或绝对路径 */
  dir: string;
  /**
   * 活跃文件名模板，默认 `{app}.log`。
   * 占位符：{app}=APP_NAME，{pid}=进程号，{host}=主机名。
   * 多进程「不同文件」用 {app}/{pid} 区分（推荐，翻转安全）；
   * 「相同文件」设静态名（多进程共享，注意见文档翻转约束）。
   */
  fileName: string;
  /** 按大小翻转阈值（如 20M），空表示不按大小翻转 */
  size?: string;
  /** 按时间翻转间隔（如 1d/30m），空表示不按时间翻转 */
  interval?: string;
  /** 保留的历史归档份数，超出自动清理；空表示不限制 */
  maxFiles?: number;
  /** 翻转归档是否 gzip 压缩，默认 true */
  compress: boolean;
  /**
   * 仅 json 模式生效：是否额外捕获未经 Nest Logger 的 std/崩溃输出
   * （uncaughtException / unhandledRejection / 裸 console），默认 false。
   */
  captureStd: boolean;
}

export interface AppHealthConfig {
  /** 健康接口总开关，默认 true；false 时接口返回 404 */
  enabled: boolean;
  /**
   * 详情接口（/health/ready）令牌；非空则需 X-Health-Token 头或 ?token= 匹配，
   * 为空表示不校验令牌（依赖 nginx IP 白名单等外层保护）。
   */
  token?: string;
  /** readiness 结果缓存毫秒，默认 3000，避免高频探测打爆 DB */
  cacheTtlMs: number;
  /** 单个检查的硬超时毫秒，默认 2500；卡死的检查超时即判 down，不拖垮接口 */
  checkTimeoutMs: number;
}

export interface AppConfig {
  port: number;
  name: string;
  devName: string;
  apiPrefix: string;
  host?: string;
  logger: AppLoggerConfig;
  requestLogs: AppRequestLogsConfig;
  logFile: AppLogFileConfig;
  health: AppHealthConfig;
}

export interface SessionConfig {
  maxTime: number;
  debounceTime: number;
  kickOutEnable: boolean;
}
export interface QuestionBankConfig {
  baseUrl: string;
  defaultAgentId: string;
  sessionKey: string;
}

export interface FileConfig {
  local: {
    storageRoot: string;
    serveRoot: string;
    multipartTempRoot?: string;
    multipartChunkSize: number;
  };
}

export interface DataSourceConfig {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  autoLoadEntities: boolean;
  synchronize: boolean;
  logging: boolean;
  namingStrategy: any;
  name?: string;
  /** 驱动级连接池/超时参数（pg: max/connectionTimeoutMillis/statement_timeout 等） */
  extra?: Record<string, unknown>;
  /** 慢查询日志阈值（毫秒），超过则记 warn，便于排查 */
  maxQueryExecutionTime?: number;
}

declare global {
  interface AllConfig {
    app: AppConfig;
    session: SessionConfig;
    datasource: Record<string, DataSourceConfig>;
    questionBank: QuestionBankConfig;
    file: FileConfig;
  }
}
