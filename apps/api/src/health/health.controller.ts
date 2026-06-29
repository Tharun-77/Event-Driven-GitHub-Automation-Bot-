import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Service is healthy.' })
  check(): { status: 'ok'; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
