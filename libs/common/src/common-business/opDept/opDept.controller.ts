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
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { Identity, IdentityType, OpDept } from '@qyy-code-lego/nestjs/entities';
import { IListData } from '@qyy-code-lego/nestjs/core/Pagination';
import { OpDeptService } from './opDept.service';
import {
  CreateDeptDTO,
  UpdateDeptDTO,
  DeptQueryDTO,
  SimpleItemDTO,
} from './dto/dept.dto';

@IdentityRequired(IdentityType.OP_USER)
@Controller('op-dept')
export class OpDeptController {
  constructor(
    private readonly opDeptService: OpDeptService,
    private readonly threadLocal: ThreadLocal,
  ) {}

  private getCurrentIdentityId(): string | undefined {
    const identity = this.threadLocal.getStore()?.identity as
      Identity | undefined;
    return identity?.id;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDept(@Body() dto: CreateDeptDTO): Promise<ApiResBody<OpDept>> {
    const createdBy = this.getCurrentIdentityId();
    const dept = await this.opDeptService.createDept(
      {
        name: dto.name,
        parentDeptId: dto.parentId,
        orderIndex: dto.orderIndex,
      },
      createdBy,
    );
    return ApiResBody.of(dept);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateDept(
    @Query('id') id: string,
    @Body() dto: UpdateDeptDTO,
  ): Promise<ApiResBody<OpDept>> {
    const dept = await this.opDeptService.updateDept(id, dto);
    return ApiResBody.of(dept);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteDept(@Query('id') id: string): Promise<ApiResBody<null>> {
    await this.opDeptService.deleteDept(id);
    return ApiResBody.of(null);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDeptDetail(@Query('id') id: string): Promise<ApiResBody<OpDept>> {
    const dept = await this.opDeptService.getDeptDetail(id);
    return ApiResBody.of(dept);
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  async getDeptList(
    @Query() query: DeptQueryDTO,
  ): Promise<ApiResBody<IListData<OpDept>>> {
    const result = await this.opDeptService.getDeptList(query);
    return ApiResBody.of({
      rows: result,
      limit: query.limit || 0,
    });
  }

  @Get('simple-list')
  @HttpCode(HttpStatus.OK)
  async getDeptSimpleList(): Promise<ApiResBody<SimpleItemDTO[]>> {
    const result = await this.opDeptService.getDeptSimpleList();
    return ApiResBody.of(result as SimpleItemDTO[]);
  }
}
