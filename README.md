# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов **mock-MVP frontend**.

- Без backend.
- Без npm install.
- Без curl install.
- Без токенов Hermes.
- Данные хранятся в `localStorage`.
- Можно открыть как обычный сайт.
- Можно завернуть в Android APK через Capacitor позже.

## Что есть в MVP

- список чатов;
- личный чат;
- группа;
- канал;
- HermesBot;
- отправка сообщений;
- имитация ответа группы;
- команды HermesBot;
- сохранение истории в `localStorage`;
- адаптивный мобильный интерфейс;
- безопасный mock-режим без секретов.

## Запуск локально

Открыть файл:

```txt
/root/hermes-messenger/public/index.html
```

Или через любой статический сервер, если он уже установлен:

```txt
python3 -m http.server 8080 --directory /root/hermes-messenger/public
```

## Структура

```txt
hermes-messenger/
├─ README.md
├─ docs/
│  ├─ architecture.md
│  ├─ mvp.md
│  ├─ database-api.md
│  ├─ hermes-integration.md
│  ├─ security.md
│  └─ roadmap.md
└─ public/
   ├─ index.html
   ├─ style.css
   └─ script.js
```

## Как работает HermesBot

Сейчас HermesBot работает в **mock-режиме**:

- `/start`
- `/help`
- `/status`
- `/model`
- `/reset`
- `/ask текст`

Настоящий Hermes пока не вызывается. Это правильно для MVP: токены не попадают в браузер.

## Следующий этап

После проверки интерфейса можно добавить backend:

- Node.js + Express;
- SQLite;
- REST API;
- WebSocket;
- авторизация;
- `/api/hermes/ask`;
- безопасный Hermes-прокси.
