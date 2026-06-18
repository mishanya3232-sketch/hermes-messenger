# База данных и API

## База данных

Для MVP можно начать с SQLite.

## Таблицы

### users

```txt
id
username
display_name
avatar_url
password_hash
created_at
last_seen_at
is_bot
```

### chats

```txt
id
type
title
description
avatar_url
created_by
created_at
```

Типы чата:

- `private`;
- `group`;
- `channel`;
- `bot`.

### chat_members

```txt
id
chat_id
user_id
role
joined_at
```

Роли:

- `owner`;
- `admin`;
- `member`;
- `subscriber`.

### messages

```txt
id
chat_id
sender_id
text
created_at
updated_at
reply_to
is_deleted
```

### bots

```txt
id
name
description
avatar_url
is_active
handler_type
created_at
```

### bot_commands

```txt
id
bot_id
command
description
enabled
```

### sessions

```txt
id
user_id
token_hash
expires_at
created_at
```

## API

### Авторизация

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Чаты

```txt
GET    /api/chats
POST   /api/chats
GET    /api/chats/:id
PATCH  /api/chats/:id
DELETE /api/chats/:id
```

### Участники

```txt
GET    /api/chats/:id/members
POST   /api/chats/:id/members
DELETE /api/chats/:id/members/:userId
```

### Сообщения

```txt
GET    /api/chats/:id/messages
POST   /api/messages
PATCH  /api/messages/:id
DELETE /api/messages/:id
```

### Файлы

```txt
POST   /api/files/upload
GET    /api/files/:id
DELETE /api/files/:id
```

### Боты

```txt
GET    /api/bots
GET    /api/bots/:id
POST   /api/bots/:id/commands
DELETE /api/bots/:id/commands/:command
```

### Hermes

```txt
POST /api/hermes/ask
```

Тело запроса:

```txt
chat_id
sender_id
text
conversation_context
```

Ответ:

```txt
message_id
text
model
latency_ms
```

## WebSocket

Подключение:

```txt
WS /ws
```

События client → server:

```txt
message:send
message:typing
chat:join
chat:leave
bot:command
```

События server → client:

```txt
message:created
message:updated
message:deleted
typing:started
typing:stopped
bot:response
error
```

## Поток создания сообщения

1. Frontend отправляет `message:send`.
2. Backend проверяет пользователя.
3. Backend проверяет право писать в чат.
4. Backend сохраняет сообщение.
5. Backend отправляет `message:created` участникам.
6. Если сообщение адресовано боту, backend передаёт его обработчику бота.
7. Бот возвращает ответ.
8. Backend сохраняет ответ как новое сообщение.
9. Backend отправляет `message:created` в чат.

## Индексация

Для скорости нужны индексы:

```txt
messages(chat_id, created_at)
chat_members(chat_id, user_id)
sessions(user_id, expires_at)
users(username)
```
