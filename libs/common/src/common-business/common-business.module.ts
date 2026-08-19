import { Module } from '@nestjs/common';
import { SharedServicesModule } from '../shared/services/shared-services.module';
import { OpPermissionService } from './opPermission/opPermission.service';
import { OpDeptService } from './opDept/opDept.service';
import { SharedFileUploadModule } from './file-management/shared-file-upload.module';
import { RuntimeConfigAdminModule } from './runtime-config/runtime-config-admin.module';
import { OpUserBootstrapTask } from './opUser/opUser.bootstrap.task';

@Module({
  imports: [SharedServicesModule, SharedFileUploadModule, RuntimeConfigAdminModule],
  providers: [OpPermissionService, OpDeptService, OpUserBootstrapTask],
  exports: [
    SharedServicesModule,
    SharedFileUploadModule,
    RuntimeConfigAdminModule,
    OpPermissionService,
    OpDeptService,
    OpUserBootstrapTask,
  ],
})
export class CommonBusinessModule {}
