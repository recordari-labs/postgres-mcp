import { BadRequestException } from '@nestjs/common';

export class SqlRejectedError extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'SqlRejectedError';
  }
}
