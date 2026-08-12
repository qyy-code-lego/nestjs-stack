import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { LocalUploadService } from '@qyy-code-lego/nestjs/core/nest/file-management/local-upload.service';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { BizError } from '@qyy-code-lego/nestjs/core/BizError';
import {
  Account,
  AccountProfile,
  AccountSource,
  Identity,
  OpAccount,
  OpAccountProfile,
} from '@qyy-code-lego/nestjs/entities';
import { SysFileEntity } from '@qyy-code-lego/nestjs/entities/core/sys/sys-file.entity';
import { AvatarUploadDto } from './dto/business-file.dto';
import {
  ACCOUNT_AVATAR_UPDATED_EVENT,
  AccountAvatarUpdatedEvent,
} from '../../shared/services/account-avatar.events';
import { FindAccountService } from '../../shared/services/find-account.service';

interface IAppEventEmitter {
  emit(event: string | symbol, payload: unknown): boolean;
}

@Injectable()
export class AccountAvatarService {
  constructor(
    private readonly localUploadService: LocalUploadService,
    private readonly threadLocal: ThreadLocal,
    private readonly eventEmitter: EventEmitter2,
    private readonly findAccountService: FindAccountService,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(OpAccount)
    private readonly opAccountRepository: Repository<OpAccount>,
    @InjectRepository(AccountProfile)
    private readonly accountProfileRepository: Repository<AccountProfile>,
    @InjectRepository(OpAccountProfile)
    private readonly opAccountProfileRepository: Repository<OpAccountProfile>,
  ) {}

  private emitAccountAvatarUpdated(event: AccountAvatarUpdatedEvent): void {
    const emitter = this.eventEmitter as unknown as IAppEventEmitter;
    emitter.emit(ACCOUNT_AVATAR_UPDATED_EVENT, event);
  }

  private getIdentityOrFail(): Identity {
    const store = this.threadLocal.getStore();
    const identity = store?.identity as Identity | undefined;
    if (!identity) {
      throw new BizError('没有身份信息，无法上传文件').codeAs(401);
    }
    return identity;
  }

  async uploadAvatar(
    file: Express.Multer.File,
    dto: AvatarUploadDto,
  ): Promise<SysFileEntity> {
    if (!file) {
      throw new BizError('未检测到上传文件').codeAs(400);
    }

    const identity = this.getIdentityOrFail();
    const account = await this.accountRepository.findOne({
      where: { username: dto.username },
    });
    const opAccount = account
      ? null
      : await this.opAccountRepository.findOne({
          where: { username: dto.username },
        });

    if (!account && !opAccount) {
      throw new BizError('账号不存在').codeAs(404);
    }

    const targetAccountId = account?.id ?? opAccount!.id;
    const targetAccountSource = account
      ? AccountSource.ACCOUNT
      : AccountSource.OP_ACCOUNT;
    const isCurrentIdentityTargetAccount =
      identity.accountId === targetAccountId &&
      identity.accountSource === targetAccountSource;
    if (!isCurrentIdentityTargetAccount) {
      throw new BizError('仅允许上传当前登录账号的头像').codeAs(403);
    }

    const object = `/avatar/${dto.username}/${Date.now()}_${file.originalname}`;
    const record = await this.localUploadService.saveLocalFile(
      file,
      object,
      identity.identityType,
      identity.id,
    );

    const avatarUrl = record.fullUrl || record.object;
    if (account) {
      const profile =
        (await this.accountProfileRepository.findOne({
          where: { accountId: account.id },
        })) ?? this.accountProfileRepository.create({ accountId: account.id });
      profile.avatarUrl = avatarUrl;
      await this.accountProfileRepository.save(profile);
      await this.findAccountService.clearAccountCache(
        account.id,
        account.username,
      );
      this.emitAccountAvatarUpdated({
        accountId: account.id,
        accountSource: AccountSource.ACCOUNT,
        avatarUrl,
      });
      return record;
    }

    const profile =
      (await this.opAccountProfileRepository.findOne({
        where: { opAccountId: opAccount!.id },
      })) ??
      this.opAccountProfileRepository.create({ opAccountId: opAccount!.id });
    profile.avatarUrl = avatarUrl;
    await this.opAccountProfileRepository.save(profile);
    await this.findAccountService.clearAccountCache(
      opAccount!.id,
      opAccount!.username,
    );
    this.emitAccountAvatarUpdated({
      accountId: opAccount!.id,
      accountSource: AccountSource.OP_ACCOUNT,
      avatarUrl,
    });

    return record;
  }
}
