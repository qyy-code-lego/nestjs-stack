import { IsInt, IsOptional, Matches, MaxLength, Min } from 'class-validator';
import { OSS_KEY_PREFIX_PATTERN } from '../oss-storage-setting.service';

export class SetOssStorageDto {
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  ossConfigCode: string;

  @IsOptional()
  @Matches(OSS_KEY_PREFIX_PATTERN)
  @MaxLength(64)
  keyPrefix?: string;

  @IsInt()
  @Min(0)
  version: number;
}
