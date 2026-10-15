# Realtime

Socket.io on the API, under `/api/socket.io`. That's the same origin and proxy as REST: Angular's dev proxy has `ws: true`, and nginx sets the `Upgrade` and `Connection` headers.

## Rules

1. **Authenticate in the handshake.** The client sends its access token in `auth.token`. A socket.io middleware verifies it before the connection is accepted, so no event can arrive unauthenticated. A bad or expired token gets `connect_error: unauthorized`; the web client refreshes the session once and reconnects.
2. **Rooms are checked like REST.** `project:join` runs the same `WorkspaceAccess` check as the workspace endpoints (active team member or admin). Non-members get `{ ok: false }` and receive nothing.
3. **Writes go through REST.** Chat messages are `POST /projects/:slug/chat`: validated, stored, then broadcast. Sockets only carry events to clients, plus typing indicators. A message can't reach anyone without being stored first.

## Events (`RT_EVENTS` in `packages/shared/src/contracts/chat.ts`)

| Event                            | Direction       | Payload                                              |
| -------------------------------- | --------------- | ---------------------------------------------------- |
| `project:join` / `project:leave` | client → server | `{ projectId }` (ack `{ ok, error? }`)               |
| `chat:message`                   | server → room   | `ChatMessageView` (members, AI PM and system posts)  |
| `chat:typing`                    | both            | client `{ projectId }`, server `{ projectId, user }` |
| `presence`                       | server → room   | `{ projectId, online: userId[] }`                    |
| `meeting:updated`                | server → room   | `{ projectId, meetingId }`                           |
| `agent:updated`                  | server → room   | `{ projectId, runId }`                               |

Screens refetch over REST when they get an update event, so sockets never carry authoritative state. Meetings and the AI PM also poll slowly as a fallback.

## Scaling

Presence is kept in memory per API instance. Running more than one API instance needs the socket.io Redis adapter (`@socket.io/redis-adapter`, using the existing Redis) so broadcasts reach every instance. Presence would then move to Redis too. Not needed for a single instance.

## Not built yet

- Direct messages and Study Buddy chat (need connections and matching).
- Live group video and audio (needs an SFU; LiveKit is the candidate).
