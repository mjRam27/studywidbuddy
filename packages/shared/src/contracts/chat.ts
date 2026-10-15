import type { ChatAuthorKind } from '../enums';
import type { PersonRef } from './teams';

export const CHAT_MESSAGE_MAX = 4000;

export interface ChatMessageView {
  id: string;
  projectId: string;
  /** Null for AI PM and system posts. */
  author: PersonRef | null;
  authorKind: ChatAuthorKind;
  body: string;
  /** What an AI/system post refers to, e.g. { type: 'meeting', id }. */
  ref: { type: string; id: string } | null;
  createdAt: string;
}

export interface ChatPage {
  /** Oldest first. */
  messages: ChatMessageView[];
  /** More, older messages exist (pass the first message's id as `before`). */
  hasMore: boolean;
  /** When the caller last read this chat (before this request). */
  lastReadAt: string | null;
}

export interface SendChatRequest {
  body: string;
}

/** Socket.io event names (server ⇄ client). Path: /api/socket.io. */
export const RT_EVENTS = {
  /** client → server: { projectId } — join a project room after the server checks membership. */
  JOIN_PROJECT: 'project:join',
  LEAVE_PROJECT: 'project:leave',
  /** server → client: ChatMessageView */
  CHAT_MESSAGE: 'chat:message',
  /** both ways: client sends { projectId }, server relays TypingEvent */
  TYPING: 'chat:typing',
  /** server → client: PresenceEvent */
  PRESENCE: 'presence',
  /** server → client: { projectId, meetingId } when a meeting opens, changes or closes */
  MEETING_UPDATED: 'meeting:updated',
  /** server → client: { projectId, runId } when an AI PM run or proposal changes */
  AGENT_UPDATED: 'agent:updated',
} as const;

export interface PresenceEvent {
  projectId: string;
  /** User ids currently connected to this project's room. */
  online: string[];
}

export interface TypingEvent {
  projectId: string;
  user: { id: string; displayName: string };
}

export interface JoinProjectAck {
  ok: boolean;
  error?: string;
}
