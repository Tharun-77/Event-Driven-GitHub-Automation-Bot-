import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class RuleActionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  addLabel?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  labelName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  postComment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentBody?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  slackNotify?: boolean;
}

export class CreateRuleDto {
  @ApiProperty({ example: 'Bug triage' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: ['issues', 'pull_request', 'push'] })
  @IsIn(['issues', 'pull_request', 'push'])
  eventType!: string;

  @ApiProperty({ enum: ['title', 'body', 'author', 'label'] })
  @IsIn(['title', 'body', 'author', 'label'])
  matchField!: string;

  @ApiProperty({ enum: ['contains', 'equals'] })
  @IsIn(['contains', 'equals'])
  matchOp!: string;

  @ApiProperty({ example: 'bug' })
  @IsString()
  matchValue!: string;

  @ApiProperty({ type: RuleActionsDto })
  @ValidateNested()
  @Type(() => RuleActionsDto)
  actions!: RuleActionsDto;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
