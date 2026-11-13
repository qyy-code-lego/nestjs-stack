import { Test, TestingModule } from '@nestjs/testing';
import { QyyCodeLegoAppController } from './qyy-code-lego-app.controller';
import { QyyCodeLegoAppService } from './qyy-code-lego-app.service';

describe('QyyCodeLegoAppController', () => {
  let qyyCodeLegoAppController: QyyCodeLegoAppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [QyyCodeLegoAppController],
      providers: [QyyCodeLegoAppService],
    }).compile();

    qyyCodeLegoAppController = app.get<QyyCodeLegoAppController>(
      QyyCodeLegoAppController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(qyyCodeLegoAppController.getHello()).toBe('Hello World!');
    });
  });
});
