import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { OpUserRole } from '@qyy-code-lego/nestjs/entities/core/common-business/op-user-role.entity';
import { OpAccount } from '@qyy-code-lego/nestjs/entities/core/account/op-account.entity';
import { OpAccountCredential } from '@qyy-code-lego/nestjs/entities/core/account/op-account-credential.entity';
import { OpAccountProfile } from '@qyy-code-lego/nestjs/entities/core/account/op-account-profile.entity';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
import { PasswordUtil } from '@qyy-code-lego/nestjs/common/utils/password';
import {
  AccountSource,
  Identity,
  IdentityType,
  ObjectActiveStatus,
  OpRole,
  OpUser,
} from '@qyy-code-lego/nestjs/entities';
import { PermissionService } from '../guards/permission/permission.service';
import { FindAccountService } from './find-account.service';

export interface ICreateOpUserParams {
  username: string;
  password: string;
  name?: string;
  phone?: string;
  email?: string;
  deptId?: string;
  avatarUrl?: string;
  isSuper?: boolean;
  roleIds?: string[];
  status?: ObjectActiveStatus;
}

export interface IUpdateOpUserParams {
  username?: string;
  name?: string;
  phone?: string;
  email?: string;
  deptId?: string | null;
  avatarUrl?: string;
  isSuper?: boolean;
  status?: ObjectActiveStatus;
  operatorId?: string;
}

export interface IOpUserQueryParams {
  keyword?: string;
  name?: string;
  phone?: string;
  username?: string;
  deptId?: string;
  roleId?: string;
  status?: ObjectActiveStatus;
  /** SaaS 租户隔离：按 identity_bucket_r 绑定的 bucketId 过滤；undefined 表示不限制（超管） */
  bucketId?: string;
}

@Injectable()
export class OpUserSharedService {
  private readonly logger = new Logger(OpUserSharedService.name);

  private readonly bootstrapOpUserId = '1';
  private readonly bootstrapOpAccountId = '1';
  private readonly bootstrapUsername = 'admin';
  private readonly bootstrapPassword = 'admin';

  constructor(
    @InjectRepository(OpUser)
    private readonly opUserRepository: Repository<OpUser>,
    @InjectRepository(OpUserRole)
    private readonly opUserRoleRepository: Repository<OpUserRole>,
    @InjectRepository(OpAccount)
    private readonly opAccountRepository: Repository<OpAccount>,
    @InjectRepository(Identity)
    private readonly identityRepository: Repository<Identity>,
    @InjectRepository(OpRole)
    private readonly opRoleRepository: Repository<OpRole>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly passwordUtil: PasswordUtil,
    private readonly permissionService: PermissionService,
    private readonly findAccountService: FindAccountService,
  ) {}

  private async upsertOpAccountProfileName(
    manager: EntityManager,
    opAccountId: string,
    name?: string,
  ): Promise<void> {
    if (!name) {
      return;
    }

    const profile =
      (await manager.findOne(OpAccountProfile, { where: { opAccountId } })) ??
      manager.create(OpAccountProfile, { opAccountId });
    profile.nickname = name;
    profile.realName = name;
    await manager.save(OpAccountProfile, profile);
  }

  private normalizeRoleIds(roleIds?: string[]): string[] {
    return Array.from(
      new Set((roleIds ?? []).map((id) => id.trim()).filter(Boolean)),
    );
  }

  private async validateRoleIds(roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }

    const roles = await this.opRoleRepository.find({
      where: { id: In(roleIds) },
      select: ['id'],
    });

    if (roles.length !== roleIds.length) {
      throw new BizError('角色不存在').httpStatusAs(400).codeAs(40003);
    }
  }

  /**
   * 确保内置管理员存在（opUser.id=1, opAccount.id=1）
   * - 不存在时创建账号、身份、密码凭证、用户
   * - 存在则忽略
   */
  async ensureBootstrapAdminUser(): Promise<void> {
    const existing = await this.opUserRepository.findOne({
      where: { id: this.bootstrapOpUserId },
      withDeleted: true,
      relations: ['identity'],
    });

    if (existing && !existing.deletedAt) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      if (existing?.deletedAt) {
        await manager.restore(OpUser, this.bootstrapOpUserId);
        return;
      }

      let account = await manager.findOne(OpAccount, {
        where: { id: this.bootstrapOpAccountId },
      });

      if (!account) {
        const existingAdminCount = await manager.count(OpAccount, {
          where: { username: this.bootstrapUsername },
        });
        const username =
          existingAdminCount > 0
            ? `${this.bootstrapUsername}_${this.bootstrapOpAccountId}`
            : this.bootstrapUsername;

        account = manager.create(OpAccount, {
          id: this.bootstrapOpAccountId,
          username,
          phone: undefined,
          status: ObjectActiveStatus.ACTIVE,
        });
        account = await manager.save(account);
        await this.upsertOpAccountProfileName(
          manager,
          account.id,
          '超级管理员',
        );
      }

      let identity = await manager.findOne(Identity, {
        where: {
          accountId: account.id,
          accountSource: AccountSource.OP_ACCOUNT,
          identityType: IdentityType.OP_USER,
        },
      });

      if (!identity) {
        identity = manager.create(Identity, {
          id: account.id,
          accountId: account.id,
          accountSource: AccountSource.OP_ACCOUNT,
          identityType: IdentityType.OP_USER,
          name: '超级管理员',
          status: ObjectActiveStatus.ACTIVE,
        });
        identity = await manager.save(identity);
      } else if (!identity.name) {
        identity.name = '超级管理员';
        identity = await manager.save(identity);
      }

      const passwordCredential = await manager.findOne(OpAccountCredential, {
        where: {
          opAccountId: account.id,
          type: 'password',
          isPrimary: true,
        },
      });

      if (!passwordCredential) {
        const { hash, salt } = this.passwordUtil.hashPassword(
          this.bootstrapPassword,
        );

        const credential = manager.create(OpAccountCredential, {
          opAccountId: account.id,
          type: 'password',
          identifier: account.username,
          secret: hash,
          salt,
          isPrimary: true,
          status: ObjectActiveStatus.ACTIVE,
        });
        await manager.save(credential);
      }

      const opUser = manager.create(OpUser, {
        id: this.bootstrapOpUserId,
        accountId: account.id,
        identityId: identity.id,
        name: '超级管理员',
        deptId: null,
        isSuper: true,
        status: ObjectActiveStatus.ACTIVE,
      });
      await manager.save(opUser);
    });

    this.logger.log('内置超级管理员检测完成（opUser.id=1）');
  }

  /**
   * 创建运营用户（包含账号、身份、凭证、用户记录）
   */
  async createOpUser(
    params: ICreateOpUserParams,
    operatorId?: string,
  ): Promise<OpUser> {
    const {
      username,
      password,
      name,
      phone,
      email,
      deptId,
      avatarUrl,
      isSuper,
      roleIds,
      status,
    } = params;

    if (!username) throw new BizError('用户名不能为空').codeAs(40001);
    if (!password) throw new BizError('密码不能为空').codeAs(40002);

    const normalizedRoleIds = this.normalizeRoleIds(roleIds);
    await this.validateRoleIds(normalizedRoleIds);

    return await this.dataSource.transaction(async (manager) => {
      const nextStatus = status ?? ObjectActiveStatus.ACTIVE;

      const existingAccount = await manager.findOne(OpAccount, {
        where: { username },
        order: { createdAt: 'DESC' },
      });

      let savedAccount: OpAccount;
      if (existingAccount) {
        const existingSameIdentityType = await manager.findOne(Identity, {
          where: {
            accountId: existingAccount.id,
            accountSource: AccountSource.OP_ACCOUNT,
            identityType: IdentityType.OP_USER,
          },
        });

        if (existingSameIdentityType) {
          throw new BizError('用户名已存在').httpStatusAs(409).codeAs(40901);
        }

        savedAccount = existingAccount;
        savedAccount.phone = phone;
        savedAccount.email = email;
        savedAccount.status = nextStatus;
        savedAccount = await manager.save(savedAccount);
        await this.upsertOpAccountProfileName(manager, savedAccount.id, name);
      } else {
        // 1. 创建账号
        const account = manager.create(OpAccount, {
          username,
          phone,
          email,
          status: nextStatus,
        });
        savedAccount = await manager.save(account);
        await this.upsertOpAccountProfileName(
          manager,
          savedAccount.id,
          name || username,
        );

        // 2. 新账号创建密码凭证
        const { hash, salt } = this.passwordUtil.hashPassword(password);
        const credential = manager.create(OpAccountCredential, {
          opAccountId: savedAccount.id,
          type: 'password',
          identifier: username,
          secret: hash,
          salt,
          isPrimary: true,
          status: ObjectActiveStatus.ACTIVE,
        });
        await manager.save(credential);
      }

      // 3. 创建身份
      const identity = manager.create(Identity, {
        accountId: savedAccount.id,
        accountSource: AccountSource.OP_ACCOUNT,
        identityType: IdentityType.OP_USER,
        name: name || username,
        status: nextStatus,
      });
      const savedIdentity = await manager.save(identity);

      // 4. 创建用户记录
      const opUser = manager.create(OpUser, {
        accountId: savedAccount.id,
        identityId: savedIdentity.id,
        name: name || username,
        phone,
        avatarUrl,
        deptId: deptId || null,
        isSuper: isSuper || false,
        status: nextStatus,
        createdBy: operatorId,
      });
      const savedUser = await manager.save(opUser);

      // 5. 如果有角色，绑定角色
      if (normalizedRoleIds.length > 0) {
        const userRoles = normalizedRoleIds.map((roleId) =>
          manager.create(OpUserRole, {
            opUserId: savedUser.id,
            roleId,
            assignedAdminId: operatorId,
          }),
        );
        await manager.save(userRoles);
      }

      this.logger.log(`创建运营用户: ${username}, ID: ${savedUser.id}`);
      return savedUser;
    });
  }

  /**
   * 更新运营用户信息
   */
  async updateOpUser(id: string, params: IUpdateOpUserParams): Promise<OpUser> {
    if (!id) throw new BizError('用户ID不能为空').codeAs(40001);

    const user = await this.opUserRepository.findOne({
      where: { id },
      relations: ['identity', 'identity.opAccount'],
    });
    if (!user) {
      throw new BizError('用户不存在').httpStatusAs(404).codeAs(40401);
    }

    const {
      username,
      name,
      phone,
      email,
      deptId,
      avatarUrl,
      isSuper,
      status,
      operatorId,
    } = params;

    const opAccount = user.identity?.opAccount;

    if (
      username !== undefined &&
      opAccount &&
      username !== opAccount.username
    ) {
      const existingAccount =
        await this.findAccountService.findAccountByUsername(username);
      if (existingAccount && existingAccount.id !== opAccount.id) {
        throw new BizError('用户名已存在').httpStatusAs(409).codeAs(40901);
      }
      opAccount.username = username;
    }

    if (name !== undefined) {
      user.name = name;
      if (user.identity) {
        user.identity.name = name;
      }
    }
    if (phone !== undefined) {
      user.phone = phone;
      if (opAccount) {
        opAccount.phone = phone;
      }
    }
    if (email !== undefined && opAccount) {
      opAccount.email = email;
    }
    if (deptId !== undefined) {
      user.deptId = deptId || null;
    }
    if (isSuper !== undefined) user.isSuper = isSuper;
    if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl;
    }
    if (status !== undefined) {
      user.status = status;
      // 同步禁用状态到 identity.status
      if (user.identity) {
        user.identity.status = status;
      }
      if (opAccount) {
        opAccount.status = status;
      }
    }
    if (operatorId) user.updatedBy = operatorId;

    if (name !== undefined && user.accountId) {
      await this.upsertOpAccountProfileName(
        this.dataSource.manager,
        user.accountId,
        name,
      );
    }

    // 先保存 identity（如果存在）
    if (user.identity) {
      await this.identityRepository.save(user.identity);
    }
    if (opAccount) {
      await this.opAccountRepository.save(opAccount);
    }
    const result = await this.opUserRepository.save(user);

    // 用户信息变更后清除权限缓存
    await this.permissionService.clearUserPermissionCache(id);

    if (opAccount) {
      await this.findAccountService.clearAccountCache(
        opAccount.id,
        opAccount.username,
      );
    }

    return result;
  }

  /**
   * 删除运营用户
   */
  async deleteOpUser(id: string, operatorId?: string): Promise<void> {
    if (!id) throw new BizError('用户ID不能为空').codeAs(40001);

    const user = await this.opUserRepository.findOne({
      where: { id },
      relations: ['identity', 'identity.opAccount'],
    });
    if (!user) {
      throw new BizError('用户不存在').httpStatusAs(404).codeAs(40401);
    }

    await this.dataSource.transaction(async (manager) => {
      // 记录删除人并保存
      if (operatorId) {
        user.updatedBy = operatorId;
        await manager.save(OpUser, user);
      }

      // 使用软删除
      await manager.softDelete(OpUser, id);
      if (!user.identityId) {
        return;
      }

      await manager.softDelete(Identity, user.identityId);

      const accountId = user.identity?.accountId;
      if (!accountId) {
        return;
      }

      const activeIdentityCount = await manager.count(Identity, {
        where: {
          accountId,
          accountSource: AccountSource.OP_ACCOUNT,
        },
      });

      if (activeIdentityCount === 0) {
        await manager.softDelete(OpAccount, accountId);
      }
    });

    await this.permissionService.clearUserPermissionCache(id);

    const accountId = user.identity?.accountId;
    const accountUsername = user.identity?.opAccount?.username;
    if (accountId) {
      await this.findAccountService.clearAccountCache(
        accountId,
        accountUsername,
      );
    }

    this.logger.log(`删除运营用户: ID: ${id}`);
  }

  /**
   * 分页查询运营用户
   */
  async findOpUserPage(
    queryParams: IOpUserQueryParams,
    page: number,
    pageSize: number,
  ): Promise<IPageData<OpUser>> {
    const { keyword, name, phone, username, deptId, roleId, status } =
      queryParams;

    const qb = this.opUserRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.identity', 'identity')
      .leftJoinAndSelect('identity.opAccount', 'opAccount')
      .leftJoinAndSelect('user.dept', 'dept')
      .leftJoinAndSelect('user.creator', 'creator')
      .leftJoinAndSelect('creator.opUser', 'creatorOpUser')
      .leftJoinAndSelect('user.roles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('userRoles.assignedBy', 'assignedBy')
      .leftJoinAndSelect('assignedBy.opUser', 'assignedByOpUser')
      .orderBy('user.createdAt', 'DESC')
      .distinct(true);

    if (keyword) {
      qb.andWhere(
        '(user.name LIKE :keyword OR opAccount.username LIKE :keyword OR opAccount.phone LIKE :keyword OR opAccount.email LIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }
    if (name) {
      qb.andWhere('user.name LIKE :name', { name: `%${name}%` });
    }
    if (phone) {
      qb.andWhere('(user.phone LIKE :phone OR opAccount.phone LIKE :phone)', {
        phone: `%${phone}%`,
      });
    }
    if (username) {
      qb.andWhere('opAccount.username LIKE :username', {
        username: `%${username}%`,
      });
    }
    if (deptId) {
      qb.andWhere('user.deptId = :deptId', { deptId });
    }
    if (roleId) {
      qb.andWhere('userRoles.roleId = :roleId', { roleId });
    }
    if (status) {
      qb.andWhere('user.status = :status', { status });
    }
    if (queryParams.bucketId) {
      // SaaS 租户隔离：仅查 identity 已绑定到当前 bucket 的用户
      qb.andWhere(
        'identity.id IN (SELECT ibr.identity_id FROM identity_bucket_r ibr WHERE ibr.bucket_id = :__opUserBucketId)',
        { __opUserBucketId: queryParams.bucketId },
      );
    }

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { rows, total, page, pageSize };
  }

  /**
   * 获取用户详情
   */
  async findOpUserDetail(id: string): Promise<OpUser> {
    const user = await this.opUserRepository.findOne({
      where: { id },
      relations: [
        'identity',
        'identity.opAccount',
        'dept',
        'roles',
        'roles.role',
        'roles.assignedBy',
        'roles.assignedBy.opAccount',
        'creator',
        'creator.opAccount',
      ],
    });
    if (!user) {
      throw new BizError('用户不存在').httpStatusAs(404).codeAs(40401);
    }
    return user;
  }

  /**
   * 设置用户角色
   */
  async setUserRoles(
    userId: string,
    roleIds: string[],
    assignerId?: string,
  ): Promise<void> {
    if (!userId) throw new BizError('用户ID不能为空').codeAs(40001);

    const user = await this.opUserRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BizError('用户不存在').httpStatusAs(404).codeAs(40401);
    }

    const normalizedRoleIds = this.normalizeRoleIds(roleIds);
    await this.validateRoleIds(normalizedRoleIds);

    await this.dataSource.transaction(async (manager) => {
      // 删除现有角色
      await manager.delete(OpUserRole, { opUserId: userId });

      // 添加新角色
      if (normalizedRoleIds.length > 0) {
        const userRoles = normalizedRoleIds.map((roleId) =>
          manager.create(OpUserRole, {
            opUserId: userId,
            roleId,
            assignedAdminId: assignerId,
          }),
        );
        if (userRoles.length > 0) {
          await manager.save(userRoles);
        }
      }
    });

    this.logger.log(
      `用户 ${userId} 角色已更新，共 ${normalizedRoleIds.length} 个角色`,
    );

    // 用户角色变更后清除权限缓存
    await this.permissionService.clearUserPermissionCache(userId);
  }

  /**
   * 获取用户角色
   */
  async getUserRoles(userId: string): Promise<OpUserRole[]> {
    if (!userId) throw new BizError('用户ID不能为空').codeAs(40001);

    return await this.opUserRoleRepository.find({
      where: { opUserId: userId },
      relations: ['role'],
    });
  }

  /**
   * 获取运营用户列表 (用于翻译和选择)
   */
  async getOpUserListPublic(
    keyword?: string,
    limit: number = 10,
    status?: ObjectActiveStatus,
    bucketId?: string,
  ): Promise<
    { id: string; name?: string; phone?: string; username?: string }[]
  > {
    const qb = this.opUserRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.identity', 'identity')
      .leftJoinAndSelect('identity.opAccount', 'opAccount')
      .select([
        'user.id',
        'user.name',
        'user.phone',
        'identity.id',
        'opAccount.id',
        'opAccount.username',
        'opAccount.phone',
      ]);

    if (keyword) {
      qb.andWhere(
        '(user.name LIKE :keyword OR user.phone LIKE :keyword OR opAccount.username LIKE :keyword)',
        {
          keyword: `%${keyword}%`,
        },
      );
    }

    if (status) {
      qb.andWhere('user.status = :status', { status });
    }
    if (bucketId) {
      // SaaS 租户隔离：仅查 identity 已绑定到当前 bucket 的用户
      qb.andWhere(
        'identity.id IN (SELECT ibr.identity_id FROM identity_bucket_r ibr WHERE ibr.bucket_id = :__opUserListBucketId)',
        { __opUserListBucketId: bucketId },
      );
    }

    qb.andWhere('user.deletedAt IS NULL');
    qb.orderBy('user.createdAt', 'DESC');
    qb.take(limit);

    const rows = await qb.getMany();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.identity?.opAccount?.phone ?? row.phone,
      username: row.identity?.opAccount?.username,
    }));
  }

  async resetOpUserPassword(id: string, password: string): Promise<void> {
    if (!id) {
      throw new BizError('用户ID不能为空').codeAs(40001);
    }
    if (!password) {
      throw new BizError('密码不能为空').codeAs(40002);
    }

    const user = await this.opUserRepository.findOne({
      where: { id },
      relations: ['identity', 'identity.opAccount'],
    });

    if (!user?.accountId) {
      throw new BizError('用户不存在').httpStatusAs(404).codeAs(40401);
    }

    const identifier = user.identity?.opAccount?.username;
    if (!identifier) {
      throw new BizError('后台账号不存在').httpStatusAs(404).codeAs(40405);
    }

    const { hash, salt } = this.passwordUtil.hashPassword(password);

    await this.dataSource.transaction(async (manager) => {
      const credential = await manager.findOne(OpAccountCredential, {
        where: {
          opAccountId: user.accountId,
          type: 'password',
          isPrimary: true,
        },
      });

      if (credential) {
        credential.identifier = identifier;
        credential.secret = hash;
        credential.salt = salt;
        credential.status = ObjectActiveStatus.ACTIVE;
        await manager.save(credential);
        return;
      }

      await manager.save(
        manager.create(OpAccountCredential, {
          opAccountId: user.accountId,
          type: 'password',
          identifier,
          secret: hash,
          salt,
          isPrimary: true,
          status: ObjectActiveStatus.ACTIVE,
        }),
      );
    });
  }
}
