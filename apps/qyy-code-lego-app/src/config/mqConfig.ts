import { getKafkaConfig } from '@qyy-code-lego/nestjs/core';
import { registerAs } from '@nestjs/config';

export const mqConfig = registerAs('mq', () => {
  return {
    kafka: getKafkaConfig(),
  };
});
