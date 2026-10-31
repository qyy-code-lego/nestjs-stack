import { IsChinaPhoneNumber } from '@qyy-code-lego/nestjs/core';
import {
  ICreateOpUserParams,
  IOpUserQueryParams,
  IUpdateOpUserParams,
} from '../../../shared/services/op-user-shared.service';
import { ObjectActiveStatus } from '@qyy-code-lego/nestjs/entities';
import { EnsureNotBlank } from '@qyy-code-lego/nestjs/core/nest/composition/ensure-not-blank.decorator';
import {
  IsEnum,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDTO implements ICreateOpUserParams {
  @EnsureNotBlank({ message: '用户名不能为空' })
  username: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @IsString()
  @MinLength(6, { message: '密码长度至少6位' })
  password: string;

  @EnsureNotBlank()
  name: string;

  @IsOptional()
  @IsChinaPhoneNumber()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  deptId?: string;

  @IsOptional()
  @IsBoolean()
  isSuper?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsEnum(ObjectActiveStatus)
  status?: ObjectActiveStatus;
}

export class UpdateUserDTO implements IUpdateOpUserParams {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  deptId?: string | null;

  @IsOptional()
  @IsBoolean()
  isSuper?: boolean;
}

export class UpdateUserStatusDTO {
  @IsEnum(ObjectActiveStatus)
  status: ObjectActiveStatus;
}

export class UserQueryDTO implements IOpUserQueryParams {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  deptId?: string;

  @IsOptional()
  @IsEnum(ObjectActiveStatus)
  status?: ObjectActiveStatus;
}

export class BindUserRolesDTO {
  @IsArray()
  @IsString({ each: true })
  roleIds: string[];
}

export class ResetOpUserPasswordDTO {
  @IsNotEmpty({ message: '密码不能为空' })
  @IsString()
  @MinLength(6, { message: '密码长度至少6位' })
  password: string;
}
