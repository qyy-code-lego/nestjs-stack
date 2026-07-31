import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { OpRole } from '@qyy-code-lego/nestjs/entities/core/common-business/op-role.entity';
import { OpRolePermission } from '@qyy-code-lego/nestjs/entities/core/common-business/op-role-permission.entity';
import { OpUserRole } from '@qyy-code-lego/nestjs/entities/core/common-business/op-user-role.entity';
import { OpUser } from '@qyy-code-lego/nestjs/entities/core/common-business/op-user.entity';
import { IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
import { PermissionService } from '../guards/permission/permission.service';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities';

/**
 * 创建角色的参数
 */
export interface ICreateRoleParams {
  code: string;
  name: string;
  description?: string;
  status?: ObjectActiveStatus;
  bucketId?: string | null; // 🆕 租户内角色必填，平台预置角色 null
}

/**
 * 更新角色的参数
 */
export interface IUpdateRoleParams {
  name?: string;
  description?: string;
  status?: ObjectActiveStatus;
}

/**
 * 角色查询参数
 */
export interface IRoleQueryParams {
  keyword?: string;
  name?: string;
  status?: ObjectActiveStatus;
  bucketId?: string; // 🆕 有值则注入 bucket 过滤；undefined=超管跨租户
}

/**
 * 带账号信息的OpUser视图对象
 */
export interface IOpUserWithAccountVO {
  id: string;
  name?: string;
  phone?: string;
  username?: string;
}

@Injectable()
export class OpRoleSharedService {
  private readonly logger = new Logger(OpRoleSharedService.name);

  constructor(
    @InjectRepository(OpRole)
    private readonly roleRepository: Repository<OpRole>,
    @InjectRepository(OpRolePermission)
    private readonly rolePermissionRepository: Repository<OpRolePermission>,
    @InjectRepository(OpUserRole)
    private readonly userRoleRepository: Repository<OpUserRole>,
    @InjectRepository(OpUser)
    private readonly opUserRepository: Repository<OpUser>,
    private readonly permissionService: PermissionService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 创建角色
   */
  async createRole(
    params: ICreateRoleParams,
    operatorId: string,
    manager?: EntityManager,
  ): Promise<OpRole> {
    const { code, name, description, status } = params;
    const roleRepository =
      manager?.getRepository(OpRole) ?? this.roleRepository;

    // 检查代码是否已存在
    const existingCode = await roleRepository.findOne({
      where: { code },
    });
    if (existingCode) {
      throw new BizError('角色代码已存在').httpStatusAs(409).codeAs(40901);
    }

    // 检查名称是否已存在
    const existingName = await roleRepository.findOne({
      where: { name },
    });
    if (existingName) {
      throw new BizError('角色名称已存在').httpStatusAs(409).codeAs(40902);
    }

    const role = roleRepository.create({
      code,
      name,
      description,
      status: status || ObjectActiveStatus.ACTIVE,
      createdAdminId: operatorId,
      bucketId: params.bucketId ?? null,
    });

    return await roleRepository.save(role);
  }

  /**
   * 更新角色
   */
  async updateRole(id: string, params: IUpdateRoleParams): Promise<OpRole> {
    const role = await this.roleRepository.findOne({ where: { id } });

    if (!role) {
      throw new BizError('角色不存在').httpStatusAs(404).codeAs(40401);
    }

    // 如果更新名称，检查名称是否重复
    if (params.name && params.name !== role.name) {
      const existingName = await this.roleRepository.findOne({
        where: { name: params.name },
      });
      if (existingName && existingName.id !== id) {
        throw new BizError('角色名称已存在').httpStatusAs(409).codeAs(40902);
      }
    }

    if (params.name !== undefined) {
      role.name = params.name;
    }
    if (params.description !== undefined) {
      role.description = params.description;
    }
    if (params.status !== undefined) {
      role.status = params.status;
    }

    const saved = await this.roleRepository.save(role);
    await this.clearRoleCaches(saved);
    return saved;
  }

  /**
   * 更新角色状态
   */
  async updateStatus(id: string, status: ObjectActiveStatus): Promise<OpRole> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new BizError('角色不存在').httpStatusAs(404).codeAs(40401);
    }

    role.status = status;
    const saved = await this.roleRepository.save(role);
    await this.clearRoleCaches(saved);
    return saved;
  }

  /**
   * 清理角色相关的缓存
   * 包括: 角色缓存和绑定该角色的所有用户的权限缓存
   */
  private async clearRoleCaches(role: OpRole) {
    // 1. 清理角色缓存
    await this.permissionService.clearRoleCache(role.code);

    // 2. 清理绑定该角色的所有用户的权限缓存
    const userRoles = await this.userRoleRepository.find({
      where: { roleId: role.id },
      select: ['opUserId'],
    });

    for (const ur of userRoles) {
      await this.permissionService.clearUserPermissionCache(ur.opUserId);
    }
  }

  /**
   * 删除角色
   */
  async deleteRole(id: string, manager?: EntityManager): Promise<void> {
    const roleRepository =
      manager?.getRepository(OpRole) ?? this.roleRepository;
    const rolePermissionRepository =
      manager?.getRepository(OpRolePermission) ?? this.rolePermissionRepository;
    const userRoleRepository =
      manager?.getRepository(OpUserRole) ?? this.userRoleRepository;
    const role = await roleRepository.findOne({ where: { id } });

    if (!role) {
      throw new BizError('角色不存在').httpStatusAs(404).codeAs(40401);
    }

    // 检查是否有用户绑定了该角色
    const userCount = await userRoleRepository.count({
      where: { roleId: id },
    });
    if (userCount > 0) {
      throw new BizError('该角色已绑定用户，无法删除')
        .httpStatusAs(409)
        .codeAs(40903);
    }

    if (manager) {
      await rolePermissionRepository.delete({ roleId: id });
      await roleRepository.delete({ id });
    } else {
      await this.dataSource.transaction(async (transactionManager) => {
        await transactionManager.delete(OpRolePermission, { roleId: id });
        await transactionManager.delete(OpRole, { id });
      });
    }

    await this.clearRoleCaches(role);

    this.logger.log(`删除角色: ${role.name}`);
  }

  /**
   * 查询单个角色
   */
  async findRole(id: string, manager?: EntityManager): Promise<OpRole> {
    const roleRepository =
      manager?.getRepository(OpRole) ?? this.roleRepository;
    const role = await roleRepository.findOne({
      where: { id },
      relations: ['creator', 'creator.account'],
    });

    if (!role) {
      throw new BizError('角色不存在').httpStatusAs(404).codeAs(40401);
    }

    return role;
  }

  /**
   * 列出所有角色（用于下拉选择）
   */
  async listRoles(queryParams: IRoleQueryParams): Promise<OpRole[]> {
    const keyword = queryParams.keyword ?? queryParams.name;
    const { status } = queryParams;
    const qb = this.roleRepository.createQueryBuilder('role');

    qb.orderBy('role.createdAt', 'DESC');

    if (keyword) {
      qb.andWhere('(role.name LIKE :keyword OR role.code LIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }
    if (status) {
      qb.andWhere('role.status = :status', { status });
    }
    if (queryParams.bucketId) {
      qb.andWhere('role.bucketId = :bucketId', {
        bucketId: queryParams.bucketId,
      });
    }

    return await qb.getMany();
  }

  /**
   * 分页查询角色（用于管理页面）
   */
  async findRolePage(
    queryParams: IRoleQueryParams,
    page: number,
    pageSize: number,
  ): Promise<IPageData<OpRole>> {
    const keyword = queryParams.keyword ?? queryParams.name;
    const { status } = queryParams;

    const qb = this.roleRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.creator', 'creator')
      .orderBy('role.createdAt', 'DESC');

    if (keyword) {
      qb.andWhere('(role.name LIKE :keyword OR role.code LIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }
    if (status) {
      qb.andWhere('role.status = :status', { status });
    }
    if (queryParams.bucketId) {
      qb.andWhere('role.bucketId = :bucketId', {
        bucketId: queryParams.bucketId,
      });
    }

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { rows, total, page, pageSize };
  }

  /**
   * 获取角色绑定的用户（带账号信息）
   */
  async getRoleBoundUsers(roleId: string): Promise<IOpUserWithAccountVO[]> {
    // 验证角色是否存在
    await this.findRole(roleId);

    const userRoles = await this.userRoleRepository.find({
      where: { roleId },
      relations: ['opUser', 'opUser.identity', 'opUser.identity.opAccount'],
    });

    return userRoles.map((ur) => ({
      id: ur.opUser!.id,
      name: ur.opUser!.name,
      phone: ur.opUser!.phone,
      username: ur.opUser!.identity?.opAccount?.username,
    }));
  }

  /**
   * 批量设置角色的权限
   */
  async setRolePermissions(
    roleId: string,
    permissionCodes: string[],
    manager?: EntityManager,
  ): Promise<void> {
    // 验证角色是否存在
    await this.findRole(roleId, manager);

    const normalizedCodes = Array.from(
      new Set(permissionCodes.map((code) => code.trim()).filter(Boolean)),
    );
    if (normalizedCodes.length > 0) {
      const permissions =
        await this.permissionService.getPermissionsByCodes(normalizedCodes);
      const activePermissions = permissions.filter(
        (permission) => permission.status === ObjectActiveStatus.ACTIVE,
      );
      if (activePermissions.length !== normalizedCodes.length) {
        throw new BizError('权限码不存在或已停用')
          .httpStatusAs(400)
          .codeAs(40004);
      }
    }

    const updatePermissions = async (transactionManager: EntityManager) => {
      await transactionManager.delete(OpRolePermission, { roleId });

      if (normalizedCodes.length > 0) {
        const rolePermissions = normalizedCodes.map((code) =>
          transactionManager.create(OpRolePermission, {
            roleId,
            permissionCode: code,
          }),
        );
        await transactionManager.save(rolePermissions);
      }
    };

    if (manager) {
      await updatePermissions(manager);
    } else {
      await this.dataSource.transaction(updatePermissions);
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (role) {
      await this.clearRoleCaches(role);
    }

    this.logger.log(
      `角色 ${roleId} 权限已更新，共 ${normalizedCodes.length} 个权限`,
    );
  }

  /**
   * 获取角色的所有权限关系，注意是关系
   */
  async getRolePermissions(roleId: string): Promise<OpRolePermission[]> {
    // 验证角色是否存在
    await this.findRole(roleId);

    return await this.rolePermissionRepository.find({
      where: { roleId },
      relations: ['permission'],
    });
  }

  /**
   * 获取所有可用的权限（用于角色权限绑定的选择列表）
   * 使用缓存提高性能
   */
  async getAvailablePermissions() {
    return this.permissionService.getPermissions();
  }

  /**
   * 批量给角色绑定用户
   */
  async bindUsersToRole(
    roleId: string,
    userIds: string[],
    assignedByAdminId?: string,
  ): Promise<void> {
    // 验证角色是否存在
    await this.findRole(roleId);

    await this.dataSource.transaction(async (manager) => {
      for (const userId of userIds) {
        // 检查是否已经绑定
        const existing = await manager.findOne(OpUserRole, {
          where: { roleId, opUserId: userId },
        });
        if (existing) continue;

        const binding = manager.create(OpUserRole, {
          roleId,
          opUserId: userId,
          assignedAdminId: assignedByAdminId || undefined,
        });
        await manager.save(binding);
      }
    });

    // 清理绑定用户的权限缓存
    for (const userId of userIds) {
      await this.permissionService.clearUserPermissionCache(userId);
    }
  }

  /**
   * 批量解绑角色的用户
   */
  async unbindUsersFromRole(roleId: string, userIds: string[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(OpUserRole, {
        roleId,
        opUserId: In(userIds),
      });
    });

    // 清理解绑用户的权限缓存
    for (const userId of userIds) {
      await this.permissionService.clearUserPermissionCache(userId);
    }
  }
}
