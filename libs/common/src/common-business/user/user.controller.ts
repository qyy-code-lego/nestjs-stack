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
import { IdentityRequired } from '../../shared/guards/identity-required/identity-required.decorator';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { Identity, IdentityType, User } from '@qyy-code-lego/nestjs/entities';
import {
  IPageData,
  ListParamsDTO,
  PaginationDTO,
} from '@qyy-code-lego/nestjs/core/Pagination';
import { UserSharedService } from '../../shared/services/user-shared.service';
import {
  BizUserQueryDTO,
  CreateBizUserDTO,
  UpdateBizUserDTO,
} from './dto/user.dto';

@IdentityRequired(IdentityType.OP_USER)
@Controller('user')
export class UserController {
  constructor(
    private readonly userSharedService: UserSharedService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  private getCurrentIdentityId(): string {
    const identity = this.threadLocal.getStore()?.identity as
      Identity | undefined;
    return identity?.id || '';
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateBizUserDTO): Promise<ApiResBody<User>> {
    const operatorId = this.getCurrentIdentityId();
    const user = await this.userSharedService.createUser(dto, operatorId);
    return ApiResBody.of(user);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Query('id') id: string,
    @Body() dto: UpdateBizUserDTO,
  ): Promise<ApiResBody<User>> {
    if (!id) {
      throw new BizError('id is required').httpStatusAs(HttpStatus.BAD_REQUEST);
    }
    const operatorId = this.getCurrentIdentityId();
    const user = await this.userSharedService.updateUser(id, {
      ...dto,
      operatorId,
    });
    return ApiResBody.of(user);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Query('id') id: string): Promise<ApiResBody<null>> {
    const operatorId = this.getCurrentIdentityId();
    await this.userSharedService.deleteUser(id, operatorId);
    return ApiResBody.of(null);
  }

  @Get('page')
  @HttpCode(HttpStatus.OK)
  async findUserPage(
    @Query() queryDto: BizUserQueryDTO,
    @Query() pagination: PaginationDTO,
  ): Promise<ApiResBody<IPageData<User>>> {
    const result = await this.userSharedService.findUserPage(
      queryDto,
      pagination.page,
      pagination.pageSize,
    );
    return ApiResBody.of(result);
  }

  @Get('detail')
  @HttpCode(HttpStatus.OK)
  async getUserDetail(@Query('id') id: string): Promise<ApiResBody<User>> {
    const user = await this.userSharedService.findUserDetail(id);
    return ApiResBody.of(user);
  }

  @Get('public-list')
  @HttpCode(HttpStatus.OK)
  async getUserListPublic(
    @Query('keyword') keyword: string,
    @Query() listParams: ListParamsDTO,
  ): Promise<ApiResBody<{ id: string; name?: string; phone?: string }[]>> {
    const list = await this.userSharedService.getUserListPublic(
      keyword,
      listParams.limit,
    );
    return ApiResBody.of(list);
  }
}
