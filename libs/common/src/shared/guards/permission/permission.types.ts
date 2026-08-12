/**
 * 权限系统公共类型定义
 *
 * 这个文件定义了权限系统中的核心接口和类型，
 * 支持多种身份类型的权限管理，
 * 便于新身份类型权限服务的实现。
 */

/**
 * 用户角色和权限数据格式
 *
 * 所有身份类型的权限服务都应该返回这种格式
 */
export interface UserRoleData {
  /** 用户拥有的角色代码列表 */
  roleCodes: string[];
  /** 用户拥有的权限代码列表（所有角色权限的并集） */
  permissionCodes: string[];
}

/**
 * 身份的权限服务接口
 *
 * 为新身份类型实现权限服务时，应该实现这个接口
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class HospitalPermissionService implements IdentityPermissionProvider {
 *   async getUserPermissionData(userId: string): Promise<UserRoleData> {
 *     // 实现权限查询逻辑
 *   }
 *
 *   async clearUserPermissionCache(userId: string): Promise<void> {
 *     // 实现缓存清除逻辑
 *   }
 * }
 * ```
 */
export interface IdentityPermissionProvider {
  /**
   * 获取用户的角色和权限数据
   *
   * @param userId 用户ID
   * @returns 用户的角色和权限数据
   */
  getUserPermissionData(userId: string): Promise<UserRoleData>;

  /**
   * 清除用户的权限缓存
   *
   * 应在以下场景调用：
   * - 用户绑定新角色
   * - 用户解绑角色
   * - 用户权限被直接修改
   *
   * @param userId 用户ID
   */
  clearUserPermissionCache(userId: string): Promise<void>;
}

/**
 * 权限检查函数类型
 */
export type PermissionCheckFunc = (permissionList: string[]) => boolean;

/**
 * 权限要求类型
 *
 * 支持以下几种形式：
 * 1. 单个权限字符串: 'user.create'
 * 2. 权限字符串数组(AND关系): ['user.create', 'user.delete']
 * 3. 复杂逻辑数组(OR关系): [['user.view'], ['order.view']]
 * 4. 自定义函数: (list) => list.includes('admin')
 */
export type PermissionRequirement =
  string | string[] | PermissionCheckFunc | PermissionRequirement[];
