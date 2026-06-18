# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов **mock-MVP + backend-каркас**, работающий по публичному HTTP `IP:PORT` без домена и HTTPS.

- Frontend работает прямо с backend-сервера.
- Backend запускается без npm-зависимостей.
- Сообщения сохраняются в SQLite-хранилище.
- Realtime работает через WebSocket на чистом Node.js, без npm-зависимостей.
- Старый JSON-файл используется только как одноразовый источник для миграции демо-данных.
- HermesBot работает в безопасном mock-режиме.
- Настоящий Hermes пока не вызывается, чтобы токены не попадали в браузер.
- Backend закреплён как `systemd`-сервис.

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
- demo-логин;
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
POST /api/auth/login
GET  /api/me
GET  /api/chats
GET  /api/chats/:id/messages
POST /api/chats/:id/messages
GET  /api/ws?chatId=bot-hermes
POST /api/hermes/ask
```

В MVP авторизация demo-токеном. Токен хранится в localStorage для frontend-проверки и дополнительно ставится в HttpOnly-cookie для HTTP/WebSocket-сессии.

## HermesBot

Сейчас HermesBot не вызывает настоящий Hermes. Он работает через backend-прокси в mock-режиме:

```txt
Frontend → Backend → HermesBot mock
```

Правильная схема для настоящей интеграции:

```txt
Frontend → Backend → Hermes Gateway / API Server → Hermes Agent
```

Так токены Hermes остаются только на сервере.

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

- нормальную регистрацию/вход;
- загрузку файлов;
- push-уведомления;
- настоящее подключение Hermes через backend-прокси;
- Android APK через Capacitor.
