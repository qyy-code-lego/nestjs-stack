import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResBody } from '@qyy-code-lego/nestjs/core/ApiResBody';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import {
  IPageData,
  PaginationDTO,
} from '@qyy-code-lego/nestjs/core/Pagination';
import {
  IOpUserWithAccountVO,
  OpRoleSharedService,
} from '../../shared/services/op-role-shared.service';
import {
  BindPermissionsDTO,
  CreateRoleDTO,
  RoleQueryDTO,
  UpdateRoleDTO,
} from './dto/role.dto';
import {
  Identity,
  IdentityType,
  ObjectActiveStatus,
  OpRole,
  OpRolePermission,
} from '@qyy-code-lego/nestjs/entities';

@IdentityRequired(IdentityType.OP_USER)
@Controller('o-role')
export class OpRoleController {
  constructor(
    private readonly opRoleSharedService: OpRoleSharedService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  private getCurrentIdentityId(): string {
    const identity = this.threadLocal.getStore()?.identity as
      Identity | undefined;
    return identity?.id || '';
  }

  private toStatus(enable?: string): ObjectActiveStatus | undefined {
    if (enable === undefined) {
      return undefined;
    }
    return enable === 'enabled'
      ? ObjectActiveStatus.ACTIVE
      : ObjectActiveStatus.DISABLED;
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  async listRoles(
    @Query() queryDto: RoleQueryDTO,
  ): Promise<ApiResBody<OpRole[]>> {
    const roles = await this.opRoleSharedService.listRoles({
      name: queryDto.name,
    });
    return ApiResBody.of(roles);
  }

  @Get('page')
  @HttpCode(HttpStatus.OK)
  async findRolePage(
    @Query() queryDto: RoleQueryDTO,
    @Query() pagination: PaginationDTO,
  ): Promise<ApiResBody<IPageData<OpRole>>> {
    const result = await this.opRoleSharedService.findRolePage(
      {
        name: queryDto.name,
      },
      pagination.page,
      pagination.pageSize,
    );
    return ApiResBody.of(result);
  }

  @Get('detail')
  @HttpCode(HttpStatus.OK)
  async getDetail(@Query('id') id: string): Promise<ApiResBody<OpRole>> {
    const role = await this.opRoleSharedService.findRole(id);
    return ApiResBody.of(role);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRole(
    @Body() createDto: CreateRoleDTO,
  ): Promise<ApiResBody<OpRole>> {
    const operatorId = this.getCurrentIdentityId();
    const role = await this.opRoleSharedService.createRole(
      {
        code: createDto.code,
        name: createDto.name,
        description: createDto.description,
      },
      operatorId,
    );
    return ApiResBody.of(role);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateRole(
    @Query('id') id: string,
    @Body() updateDto: UpdateRoleDTO,
  ): Promise<ApiResBody<OpRole>> {
    const nextStatus = this.toStatus(updateDto.enable);
    const hasBaseFields =
      updateDto.name !== undefined || updateDto.description !== undefined;

    let role = hasBaseFields
      ? await this.opRoleSharedService.updateRole(id, {
          name: updateDto.name,
          description: updateDto.description,
        })
      : await this.opRoleSharedService.findRole(id);

    if (nextStatus !== undefined) {
      role = await this.opRoleSharedService.updateStatus(id, nextStatus);
    }

    return ApiResBody.of(role);
  }

  @Patch('enable')
  @HttpCode(HttpStatus.OK)
  async updateEnable(
    @Query('id') id: string,
    @Body('enable') enable: string,
  ): Promise<ApiResBody<OpRole>> {
    const role = await this.opRoleSharedService.updateStatus(
      id,
      this.toStatus(enable) ?? ObjectActiveStatus.DISABLED,
    );
    return ApiResBody.of(role);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteRole(@Query('id') id: string): Promise<ApiResBody<null>> {
    await this.opRoleSharedService.deleteRole(id);
    return ApiResBody.of(null);
  }

  @Get('bound-users')
  @HttpCode(HttpStatus.OK)
  async getBoundUsers(
    @Query('id') id: string,
  ): Promise<ApiResBody<IOpUserWithAccountVO[]>> {
    const users = await this.opRoleSharedService.getRoleBoundUsers(id);
    return ApiResBody.of(users);
  }

  @Post('permissions')
  @HttpCode(HttpStatus.OK)
  async setPermissions(
    @Query('id') id: string,
    @Body() dto: BindPermissionsDTO,
  ): Promise<ApiResBody<null>> {
    await this.opRoleSharedService.setRolePermissions(id, dto.permissionCodes);
    return ApiResBody.of(null);
  }

  @Get('permissions')
  @HttpCode(HttpStatus.OK)
  async getPermissions(
    @Query('id') id: string,
  ): Promise<ApiResBody<OpRolePermission[]>> {
    const permissions = await this.opRoleSharedService.getRolePermissions(id);
    return ApiResBody.of(permissions);
  }

  @Post('bind-users')
  @HttpCode(HttpStatus.OK)
  async bindUsers(
    @Query('id') id: string,
    @Body() dto: { userIds: string[] },
  ): Promise<ApiResBody<null>> {
    const operatorId = this.getCurrentIdentityId();
    await this.opRoleSharedService.bindUsersToRole(id, dto.userIds, operatorId);
    return ApiResBody.of(null);
  }

  @Post('unbind-users')
  @HttpCode(HttpStatus.OK)
  async unbindUsers(
    @Query('id') id: string,
    @Body() dto: { userIds: string[] },
  ): Promise<ApiResBody<null>> {
    await this.opRoleSharedService.unbindUsersFromRole(id, dto.userIds);
    return ApiResBody.of(null);
  }
}
