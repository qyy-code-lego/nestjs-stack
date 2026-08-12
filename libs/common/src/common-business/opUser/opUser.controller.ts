import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResBody } from '@qyy-code-lego/nestjs/core/ApiResBody';
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import {
  Identity,
  IdentityType,
  OpUser,
  OpUserRole,
} from '@qyy-code-lego/nestjs/entities';
import {
  IPageData,
  PaginationDTO,
  ListParamsDTO,
} from '@qyy-code-lego/nestjs/core/Pagination';
import { OpUserSharedService } from '../../shared/services/op-user-shared.service';
import {
  BindUserRolesDTO,
  CreateUserDTO,
  ResetOpUserPasswordDTO,
  UpdateUserDTO,
  UserQueryDTO,
} from './dto/user.dto';

@IdentityRequired(IdentityType.OP_USER)
@Controller('op-user')
export class OpUserController {
  private readonly logger = new Logger(OpUserController.name);

  constructor(
    private readonly opUserSharedService: OpUserSharedService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  private getCurrentIdentityId(): string {
    const identity = this.threadLocal.getStore()?.identity as
      Identity | undefined;
    return identity?.id || '';
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDTO): Promise<ApiResBody<OpUser>> {
    const operatorId = this.getCurrentIdentityId();
    const user = await this.opUserSharedService.createOpUser(dto, operatorId);
    return ApiResBody.of(user);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Query('id') id: string,
    @Body() dto: UpdateUserDTO,
  ): Promise<ApiResBody<OpUser>> {
    if (!id) {
      throw new BizError('id is required').httpStatusAs(HttpStatus.BAD_REQUEST);
    }
    const operatorId = this.getCurrentIdentityId();
    const user = await this.opUserSharedService.updateOpUser(id, {
      ...dto,
      operatorId,
    });
    return ApiResBody.of(user);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Query('id') id: string): Promise<ApiResBody<null>> {
    const operatorId = this.getCurrentIdentityId();
    await this.opUserSharedService.deleteOpUser(id, operatorId);
    return ApiResBody.of(null);
  }

  @Get('page')
  @HttpCode(HttpStatus.OK)
  async findUserPage(
    @Query() queryDto: UserQueryDTO,
    @Query() pagination: PaginationDTO,
  ): Promise<ApiResBody<IPageData<OpUser>>> {
    const result = await this.opUserSharedService.findOpUserPage(
      queryDto,
      pagination.page,
      pagination.pageSize,
    );
    return ApiResBody.of(result);
  }

  @Get('detail')
  @HttpCode(HttpStatus.OK)
  async getUserDetail(@Query('id') id: string): Promise<ApiResBody<OpUser>> {
    const user = await this.opUserSharedService.findOpUserDetail(id);
    return ApiResBody.of(user);
  }

  @Post('roles')
  @HttpCode(HttpStatus.OK)
  async setUserRoles(
    @Query('id') id: string,
    @Body() dto: BindUserRolesDTO,
  ): Promise<ApiResBody<null>> {
    if (!id) {
      throw new BizError('id is required').httpStatusAs(HttpStatus.BAD_REQUEST);
    }
    const assignerId = this.getCurrentIdentityId();
    await this.opUserSharedService.setUserRoles(id, dto.roleIds, assignerId);
    return ApiResBody.of(null);
  }

  @Get('roles')
  @HttpCode(HttpStatus.OK)
  async getUserRoles(
    @Query('id') id: string,
  ): Promise<ApiResBody<OpUserRole[]>> {
    const roles = await this.opUserSharedService.getUserRoles(id);
    return ApiResBody.of(roles);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Query('id') id: string,
    @Body() dto: ResetOpUserPasswordDTO,
  ): Promise<ApiResBody<null>> {
    if (!id) {
      throw new BizError('id is required').httpStatusAs(HttpStatus.BAD_REQUEST);
    }
    const operatorId = this.getCurrentIdentityId();
    await this.opUserSharedService.resetOpUserPassword(id, dto.password);
    this.logger.log(`重置运营用户密码: ID: ${id}, operator: ${operatorId}`);
    return ApiResBody.of(null);
  }

  @Get('public-list')
  @HttpCode(HttpStatus.OK)
  async getOpUserListPublic(
    @Query('keyword') keyword: string,
    @Query() listParams: ListParamsDTO,
  ): Promise<ApiResBody<{ id: string; name?: string; phone?: string }[]>> {
    const list = await this.opUserSharedService.getOpUserListPublic(
      keyword,
      listParams.limit,
    );
    return ApiResBody.of(list);
  }
}
