# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов **mock-MVP + backend-каркас**.

- Frontend уже работает в браузере.
- Backend запускается без npm-зависимостей.
- Сообщения сохраняются в JSON-хранилище.
- HermesBot работает в безопасном mock-режиме.
- Настоящий Hermes пока не вызывается, чтобы токены не попадали в браузер.

## Быстрый запуск

```bash
cd /root/hermes-messenger
npm run check
npm start
```

Открыть frontend с backend:

```txt
http://localhost:3000/?api=http://localhost:3000
```

Проверить API:

```txt
http://localhost:3000/api/health
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
- JSON-хранилище;
- SSE-события для realtime;
- команды HermesBot;
- сохранение истории;
- мобильный интерфейс.

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
GET  /api/events?chatId=bot-hermes
POST /api/hermes/ask
```

В MVP авторизация demo-токеном. Токен хранится в localStorage для frontend-проверки и дополнительно ставится в HttpOnly-cookie для SSE.

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

- SQLite вместо JSON-файла;
- нормальную регистрацию/вход;
- WebSocket вместо SSE;
- загрузку файлов;
- push-уведомления;
- настоящее подключение Hermes через backend-прокси;
- Android APK через Capacitor.
