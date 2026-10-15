import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SkillLevel } from '@studywidbuddy/shared';
import type { ProfileSkill, Skill } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { SkillsService } from './skills.service';

class SkillSearchQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class SetSkillLevelDto {
  @ApiProperty({ enum: Object.values(SkillLevel) })
  @IsEnum(SkillLevel)
  level: SkillLevel;
}

@ApiTags('skills')
@ApiBearerAuth()
@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get('skills')
  search(@Query() query: SkillSearchQuery): Promise<Skill[]> {
    return this.skills.search(query.q, query.limit);
  }

  @Get('me/skills')
  mine(@CurrentUser() user: AuthUser): Promise<ProfileSkill[]> {
    return this.skills.listForUser(user.id);
  }

  @Put('me/skills/:skillId')
  set(
    @CurrentUser() user: AuthUser,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SetSkillLevelDto,
  ): Promise<ProfileSkill[]> {
    return this.skills.setClaimed(user.id, skillId, dto.level);
  }

  @Delete('me/skills/:skillId')
  remove(@CurrentUser() user: AuthUser, @Param('skillId', ParseUUIDPipe) skillId: string): Promise<ProfileSkill[]> {
    return this.skills.removeClaimed(user.id, skillId);
  }
}
