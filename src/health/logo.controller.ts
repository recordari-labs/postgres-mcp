import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { Controller, Get, Header, NotFoundException, StreamableFile } from '@nestjs/common';

const logoPath = join(process.cwd(), 'assets', 'logo.png');

@Controller()
export class LogoController {
  @Get('logo.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  async logo(): Promise<StreamableFile> {
    try {
      await access(logoPath);
    } catch {
      throw new NotFoundException('Logo is not available');
    }
    return new StreamableFile(createReadStream(logoPath));
  }
}
