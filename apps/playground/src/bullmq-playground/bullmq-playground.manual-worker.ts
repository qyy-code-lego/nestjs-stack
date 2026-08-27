import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  WorkerFactory,
  QueueName,
  TaskProcessor,
} from '@qyy-code-lego/nestjs/core/nest/bullmq';

/**
 * BullMQ Playground Manual Worker
 *
 * 演示方式二：使用 WorkerFactory 手动创建 Worker
 * 这种方式适合需要对 Worker 进行特殊配置（如不同的并发数、不同的 Redis 连接等）的场景。
 */
@Injectable()
export class BullmqPlaygroundManualWorker implements OnModuleInit {
  private readonly logger = new Logger(BullmqPlaygroundManualWorker.name);

  constructor(private readonly workerFactory: WorkerFactory) {}

  onModuleInit(): void {
    // 使用 WorkerFactory 手动创建一个 Routed Worker
    // 这种方式可以让我们显式指定并发数 (concurrency)
    this.workerFactory.createRoutedWorker(
      QueueName.CRITICAL, // 演示在 CRITICAL 队列上工作
      {
        'critical.manual.task': this.handleManualCriticalTask.bind(this),
      },
      {
        concurrency: 2, // 显式设置并发
      },
    );

    this.logger.log('BullMQ Playground Manual Worker initialized');
  }

  /**
   * 处理手动注册的关键任务
   */
  private async handleManualCriticalTask(job: Job): Promise<void> {
    this.logger.log(
      `[ManualWorker] Processing manual critical task: ${job.id}`,
    );

    // 模拟耗时操作
    await new Promise((resolve) => setTimeout(resolve, 1500));

    this.logger.log(`[ManualWorker] Manual critical task completed: ${job.id}`);
  }
}
