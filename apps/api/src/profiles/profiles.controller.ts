import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Profile } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { UpdateProfileDto } from './dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me/profile')
  own(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.profiles.getOwn(user.id);
  }

  @Patch('me/profile')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.profiles.update(user.id, dto);
  }

  @Post('me/onboarding/complete')
  completeOnboarding(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.profiles.completeOnboarding(user.id);
  }

  @Get('profiles/:username')
  byUsername(@Param('username') username: string, @CurrentUser() viewer: AuthUser): Promise<Profile> {
    return this.profiles.getByUsername(username.toLowerCase(), viewer);
  }
}
