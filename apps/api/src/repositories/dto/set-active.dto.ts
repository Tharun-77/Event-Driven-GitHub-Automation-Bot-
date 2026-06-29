import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetActiveDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  active!: boolean;
}
