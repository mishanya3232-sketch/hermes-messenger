# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов MVP с backend, SQLite, WebSocket realtime и нормальной регистрацией/входом. Работает по публичному HTTP `IP:PORT` без домена и HTTPS.

- Frontend работает прямо с backend-сервера.
- Backend запускается без npm-зависимостей.
- Сообщения сохраняются в SQLite-хранилище.
- Realtime работает через WebSocket на чистом Node.js, без npm-зависимостей.
- Старый JSON-файл используется только как одноразовый источник для миграции демо-данных.
- HermesBot работает через backend; по умолчанию fallback на mock.
- Можно включить Hermes Agent API Server и backend будет обращаться к нему без токенов в браузере.
- Backend закреплён как `systemd`-сервис.
- Пользователи входят через логин/пароль; пароль хранится в SQLite в виде PBKDF2-SHA256 hash.

## Публичный тест без домена и HTTPS

Открыть мессенджер с backend:

```txt
http://185.244.40.184:3000/
```

API:

```txt
http://185.244.40.184:3000/api/health
```

GitHub Pages mock-версия:

```txt
https://mishanya3232-sketch.github.io/hermes-messenger/
```

Важно: GitHub Pages работает в mock-режиме, без backend. Для backend нужен запуск на сервере по `IP:PORT`.

## Быстрый запуск вручную

```bash
cd /root/hermes-messenger
npm run check
npm start
```

Открыть:

```txt
http://localhost:3000/
```

## systemd-сервис

Backend уже настроен как сервис:

```bash
systemctl status hermes-messenger.service
```

Команды:

```bash
systemctl restart hermes-messenger.service
systemctl stop hermes-messenger.service
systemctl start hermes-messenger.service
journalctl -u hermes-messenger.service -n 50 --no-pager
```

Сервис-файл:

```txt
/etc/systemd/system/hermes-messenger.service
```

## Что есть сейчас

- список чатов;
- личный чат;
- группа;
- канал;
- HermesBot;
- отправка сообщений;
- backend API;
- регистрацию, вход, logout и сессии;
- SQLite-хранилище пользователей и паролей;
- JSON-хранилище больше не используется для записи, только для первой миграции;
- WebSocket-события для realtime;
- команды HermesBot;
- сохранение истории;
- мобильный интерфейс;
- публичный запуск по HTTP `IP:PORT`;
- автозапуск backend через `systemd`.

## Команды HermesBot

```txt
/start
/help
/status
/model
/reset
/ask текст
```

## Backend API

Базовые endpoints:

```txt
GET  /api/health
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/chats
GET  /api/chats/:id/messages
POST /api/chats/:id/messages
GET  /api/ws?chatId=bot-hermes
GET  /api/hermes/status
POST /api/hermes/ask
```

В MVP авторизация через логин/пароль. После входа backend выдаёт bearer-токен и ставит HttpOnly-cookie. Токен в localStorage нужен только frontend-клиенту; токены Hermes остаются только на backend.

## HermesBot

HermesBot доступен только администратору. Backend сам решает, как отвечать:

```txt
Frontend → Backend → Hermes Agent API Server
                  ↘ fallback mock
```

Если `HERMES_API_ENABLED=true` и задан `HERMES_API_KEY`/`API_SERVER_KEY`, HermesBot вызывает Hermes Agent API Server:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=<strong-secret>
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
```

Messenger backend подключается к нему через:

```txt
HERMES_API_ENABLED=true
HERMES_API_KEY=<strong-secret>
HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
```

Если Hermes API Server недоступен, backend не ломает чат: ответ идёт из mock-режима. Токены Hermes не попадают в браузер.

## Структура

```txt
hermes-messenger/
├─ README.md
├─ package.json
├─ index.html
├─ style.css
├─ script.js
├─ public/
│  ├─ index.html
│  ├─ style.css
│  └─ script.js
├─ server/
│  └─ app.js
└─ docs/
```

## Следующий этап

Дальше можно добавить:

- загрузку файлов;
- push-уведомления;
- Android APK через Capacitor.
