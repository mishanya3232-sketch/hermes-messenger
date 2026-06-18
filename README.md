# Hermes Messenger

Мессенджер наподобие Telegram с чатами, группами, каналами, ботами и HermesBot.

## Статус

Готов и опубликован **mock-MVP frontend**.

Демо:  
https://mishanya3232-sketch.github.io/hermes-messenger/?v=2

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

## Чего пока нет

- backend;
- настоящей регистрации;
- WebSocket;
- настоящего Hermes API;
- APK.

Это сделано специально: токены Hermes не попадают в браузер.

## Как работает HermesBot

Сейчас HermesBot работает в **mock-режиме**:

- `/start`
- `/help`
- `/status`
- `/model`
- `/reset`
- `/ask текст`

Настоящий Hermes пока не вызывается.

## Структура

```txt
hermes-messenger/
├─ README.md
├─ index.html
├─ style.css
├─ script.js
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

`public/` оставлен как чистая папка frontend. Для GitHub Pages копии `index.html`, `style.css` и `script.js` лежат ещё и в корне репозитория.

## Следующий этап

После проверки интерфейса можно добавить backend:

- Node.js + Express;
- SQLite;
- REST API;
- WebSocket;
- авторизация;
- `/api/hermes/ask`;
- безопасный Hermes-прокси.
