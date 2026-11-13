import { Injectable } from '@nestjs/common';

@Injectable()
export class QyyCodeLegoAppService {
  getHello(): string {
    return 'Hello World!';
  }
}
