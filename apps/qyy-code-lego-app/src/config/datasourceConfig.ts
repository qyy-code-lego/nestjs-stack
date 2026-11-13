import { datasourceConfigObject } from '@qyy-code-lego/nestjs/common/config/datasource.config.template';
import { registerAs } from '@nestjs/config';

export const datasourceConfig = registerAs('datasource', () => {
  return datasourceConfigObject('postgres');
});
