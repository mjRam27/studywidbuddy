import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CHAT_MESSAGE_MAX } from '@studywidbuddy/shared';
import type { ChatMessageView, ChatPage, SendChatRequest } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { ChatService } from './chat.service';

class SendChatDto implements SendChatRequest {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, CHAT_MESSAGE_MAX)
  body: string;
}

class ChatQuery {
  @ApiPropertyOptional({ description: 'Load messages older than this message id' })
  @IsOptional()
  @IsUUID()
  before?: string;
}

@ApiTags('chat')
@ApiBearerAuth()
@Controller('projects/:slug/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Team chat, newest page first (messages oldest-first within the page)' })
  page(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Query() q: ChatQuery): Promise<ChatPage> {
    return this.chat.page(user, slug, q.before);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: SendChatDto): Promise<ChatMessageView> {
    return this.chat.send(user, slug, dto.body);
  }

  @Post('read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    await this.chat.markRead(user, slug);
  }

  @Get('unread')
  async unread(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<{ count: number }> {
    return { count: await this.chat.unread(user, slug) };
  }
}
