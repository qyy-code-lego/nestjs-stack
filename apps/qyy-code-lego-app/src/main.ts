import { NestFactory } from '@nestjs/core';
import { QyyCodeLegoAppModule } from './qyy-code-lego-app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqModule, setupAppLogger } from '@qyy-code-lego/nestjs/core';
import { connectGlobalGuards } from '@qyy-code-lego/nestjs/common';
import type { AppConfig } from '@qyy-code-lego/nestjs/common/config/config.interface';

async function bootstrap() {
  const logger = new Logger('qyy-code-lego-app');
  const app = await NestFactory.create(QyyCodeLegoAppModule);

  // 统一安装应用日志：默认仅控制台（零侵入），开启 APP_LOG_FILE_ENABLED 后异步滚动落盘
  const appConfig = app.get(ConfigService).get<AppConfig>('app')!;
  await setupAppLogger(app, appConfig);

  // 启用关闭钩子监听器，启动这个会有所有的微服务关日志
  // app.enableShutdownHooks();

  connectGlobalGuards(app);
  const port = process.env.PORT ?? 2500;
  await app.listen(port);
  logger.log(`App HTTP Server is running on: http://localhost:${port} ✅`);

  // 一键连接 MQ 微服务监听 (Kafka & RabbitMQ)
  MqModule.connectMicroservices(app);

  // 启动混合应用模式
  app
    .startAllMicroservices()
    .catch((err) => {
      logger.error('Microservices start failed ⚠️', err);
    })
    .finally(() => {
      logger.log('Microservices start process completed ✅');
    });

  // 官方的webpack热模块更新，不用
  // if (module.hot) {
  //   mo
  // dule.hot.accept();
  //   module.hot.dispose(() => app.close());
  // }
}
void bootstrap();
