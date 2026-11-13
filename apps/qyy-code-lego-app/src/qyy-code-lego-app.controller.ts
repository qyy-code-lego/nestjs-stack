import { Controller, Get } from '@nestjs/common';
import { QyyCodeLegoAppService } from './qyy-code-lego-app.service';

@Controller()
export class QyyCodeLegoAppController {
  constructor(private readonly qyyCodeLegoAppService: QyyCodeLegoAppService) {}

  @Get()
  getHello(): string {
    return this.qyyCodeLegoAppService.getHello();
  }
}
