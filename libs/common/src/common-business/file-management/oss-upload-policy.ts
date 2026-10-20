import type { ObjectCannedACL } from '@aws-sdk/client-s3';

/** `sys_file.meta` 中记录上传用途的键；由框架写入，客户端传入的同名字段会被覆盖。 */
export const UPLOAD_PURPOSE_META_KEY = 'uploadPurpose';
/** `sys_file.meta` 中记录策略 ACL 的键；直传完成后服务端据此设置对象权限。 */
export const UPLOAD_ACL_META_KEY = 'uploadAcl';

export interface OssUploadPolicyInput {
  /** 客户端声明的业务用途，如 `file`、`avatar`；由策略校验并映射存储位置。 */
  purpose?: string;
  filename: string;
  /** 文件字节数。 */
  size: number;
  contentType?: string;
  hash: string;
  actor: { identityType: string; identityId: string };
}

export interface OssUploadTarget {
  /** `sys_oss_config.code`。 */
  ossConfigCode: string;
  /** 对象键，必须由服务端生成且全局唯一（建议含随机段）。 */
  key: string;
  /** 对象级 ACL；缺省沿用桶策略。直传完成（回调 / 分片合并）后由服务端设置。 */
  acl?: ObjectCannedACL;
  /** 额外写入 `sys_file.meta` 的字段。 */
  meta?: Record<string, unknown>;
}

/**
 * OSS 直传的服务端上传策略：决定写入哪个 OSS 配置、对象键与 ACL。
 *
 * 消费工程在提供 `MultipartUploadService` 的模块里注册实现：
 * `{ provide: OssUploadPolicy, useClass: AppUploadPolicy }`。
 * 注册后 `/files/oss/sign/put`、`/files/oss/multipart/init` 只接受 `purpose`，
 * 客户端再传 `ossConfigCode`、`key`、`acl`、`domain` 会被拒绝（400）。
 * 未注册时保留旧行为（客户端指定 `ossConfigCode` 与 `key`），该模式已废弃。
 * 约定详见 docs/development/oss-upload.md。
 */
export abstract class OssUploadPolicy {
  /** 不允许的用途或无权上传时抛 BizError（400 / 403）。 */
  abstract resolve(input: OssUploadPolicyInput): Promise<OssUploadTarget>;
}
