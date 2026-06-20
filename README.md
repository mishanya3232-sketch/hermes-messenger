# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов MVP с backend, SQLite, WebSocket/SSE realtime и нормальной регистрацией/входом. Работает по публичному HTTP `IP:PORT` без домена и HTTPS.

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
- поиск пользователей по нику/телефону;
- создание личного чата;
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
- автозапуск backend через `systemd`;
- уведомления браузера и backend SSE-канал `/api/events`;
- Capacitor-конфиг и скрипты для сборки Android APK;
- Flutter MVP с настоящим Android UI и Bot Gateway для HermesBot/HTTP-ботов.

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
GET  /api/users/search
GET  /api/chats
POST /api/chats
GET  /api/chats/:id/messages
POST /api/chats/:id/messages
GET  /api/ws?chatId=bot-hermes
GET  /api/events
GET  /api/bots
POST /api/bots
PATCH /api/bots/:id
GET  /api/bots/:id/messages
POST /api/bots/:id/messages
GET  /api/hermes/status
POST /api/hermes/ask
```

Bot Gateway:

```txt
Flutter / Browser → Backend Bot Gateway → HermesBot / HTTP webhook / future Telegram / future Discord
```

Для HermesBot сохраняется правило: доступен только администратору. Для универсальных ботов используется `type: echo` для демо или `type: http` с `config.webhookUrl`.

В MVP авторизация через логин/пароль. После входа backend выдаёт bearer-токен. Токены Hermes и HTTP-ботов остаются только на backend.

## Flutter Android-приложение

Flutter-проект лежит в:

```txt
mobile-flutter/
```

Сборка debug APK:

```bash
cd mobile-flutter
flutter pub get
flutter build apk --debug
```

Готовый APK:

```txt
mobile-flutter/build/app/outputs/flutter-apk/app-debug.apk
artifacts/hermes_messenger_flutter_debug.apk
```

Debug APK можно скачать с backend-сервера:

```txt
http://185.244.40.184:3000/api/artifacts/hermes_messenger_flutter_debug.apk
```

Публичный backend URL по умолчанию для телефона/любой внешней сети:

```txt
http://185.244.40.184:3000
```

Для Android emulator можно указать локальный backend URL:

```txt
http://10.0.2.2:3000
```

Для телефона в той же локальной сети можно указать LAN IP, например:

```txt
http://192.168.1.50:3000
```

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
├─ mobile-flutter/
│  ├─ lib/
│  │  └─ main.dart
│  └─ android/
├─ public/
│  ├─ index.html
│  ├─ style.css
│  └─ script.js
├─ server/
│  └─ app.js
└─ docs/
```

## Android APK через Capacitor

Конфиг Capacitor:

```txt
capacitor.config.json
```

Проверить окружение:

```bash
npm run apk:check
```

Собрать debug APK:

```bash
npm run apk:build
```

Скрипт сборки сам установит dev-зависимости Capacitor при первом запуске, добавит Android-проект, синхронизирует `public/` и вызовет:

```bash
cd android && ./gradlew assembleDebug
```

Готовый APK:

```txt
android/app/build/outputs/apk/debug/app-debug.apk
```

Backend по-прежнему запускается отдельно через systemd по HTTP `IP:PORT`. В APK укажите backend URL через настройки API в интерфейсе, например:

```txt
http://185.244.40.184:3000
```

## Следующий этап

Дальше можно добавить:
- push-уведомления с service worker;
- production signing/release APK;
- автообновление APK без кнопки.
