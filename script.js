const STORAGE_KEY = 'hermes-messenger-mock-v1';

const users = {
    me: { id: 'me', name: 'Михаил', avatar: 'М' },
    ivan: { id: 'ivan', name: 'Иван', avatar: 'И' },
    maria: { id: 'maria', name: 'Мария', avatar: 'М' },
    alex: { id: 'alex', name: 'Алекс', avatar: 'А' },
    hermes: { id: 'hermes', name: 'HermesBot', avatar: 'H', isBot: true },
};

function defaultState() {
    const now = Date.now();
    const t = (minutesAgo) => new Date(now - minutesAgo * 60 * 1000).toISOString();

    return {
        activeChatId: 'private-ivan',
        chats: [
            {
                id: 'private-ivan',
                type: 'private',
                title: 'Иван',
                subtitle: 'личный чат',
                avatar: 'И',
                members: ['me', 'ivan'],
            },
            {
                id: 'group-mdf',
                type: 'group',
                title: 'МДФ-цех',
                subtitle: 'группа · 4 участника',
                avatar: 'Ц',
                members: ['me', 'ivan', 'maria', 'alex'],
            },
            {
                id: 'channel-news',
                type: 'channel',
                title: 'Новости проекта',
                subtitle: 'канал · вы подписчик',
                avatar: 'Н',
                members: ['me', 'maria'],
                role: 'subscriber',
            },
            {
                id: 'bot-hermes',
                type: 'bot',
                title: 'HermesBot',
                subtitle: 'AI-бот · mock-режим',
                avatar: 'H',
                botId: 'hermes',
                members: ['me', 'hermes'],
            },
        ],
        messages: {
            'private-ivan': [
                { id: cryptoId(), senderId: 'ivan', text: 'Привет! Как тебе новый мессенджер?', createdAt: t(40) },
                { id: cryptoId(), senderId: 'me', text: 'Пока делаю mock-MVP: чаты, группы, каналы и HermesBot.', createdAt: t(35) },
            ],
            'group-mdf': [
                { id: cryptoId(), senderId: 'maria', text: 'Кто сегодня смотрит заказы по МДФ?', createdAt: t(80) },
                { id: cryptoId(), senderId: 'alex', text: 'Я уже начал. В этом чате потом можно подключить настоящего Hermes.', createdAt: t(75) },
            ],
            'channel-news': [
                { id: cryptoId(), senderId: 'maria', text: 'План: сначала mock-MVP, потом backend, WebSocket и Hermes-прокси.', createdAt: t(120), system: true },
            ],
            'bot-hermes': [
                { id: cryptoId(), senderId: 'hermes', text: 'Привет! Я HermesBot. Пока работаю в mock-режиме, без токенов и backend. Введи /help, чтобы увидеть команды.', createdAt: t(10) },
            ],
        },
    };
}

const els = {};

let state = loadState();

document.addEventListener('DOMContentLoaded', init);

function init() {
    els.chatList = document.getElementById('chatList');
    els.chatSearch = document.getElementById('chatSearch');
    els.resetDemoBtn = document.getElementById('resetDemoBtn');
    els.chatAvatar = document.getElementById('chatAvatar');
    els.chatTitle = document.getElementById('chatTitle');
    els.chatSubtitle = document.getElementById('chatSubtitle');
    els.chatActions = document.getElementById('chatActions');
    els.messageList = document.getElementById('messageList');
    els.botHelp = document.getElementById('botHelp');
    els.composer = document.getElementById('composer');
    els.messageInput = document.getElementById('messageInput');

    els.chatList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-chat-id]');
        if (!button) return;
        state.activeChatId = button.dataset.chatId;
        saveState();
        render();
    });

    els.chatSearch.addEventListener('input', renderChatList);
    els.resetDemoBtn.addEventListener('click', resetDemo);

    els.composer.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = els.messageInput.value.trim();
        if (!text) return;
        sendMessageFromMe(text);
        els.messageInput.value = '';
    });

    render();
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.warn('Не удалось загрузить mock-состояние:', error);
    }
    return defaultState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('Не удалось сохранить mock-состояние:', error);
    }
}

function resetDemo() {
    state = defaultState();
    saveState();
    render();
}

function render() {
    renderChatList();
    renderChatHeader();
    renderMessages();
    renderBotHelp();
}

function renderChatList() {
    const query = els.chatSearch.value.trim().toLowerCase();
    els.chatList.innerHTML = '';

    state.chats
        .filter((chat) => !query || chat.title.toLowerCase().includes(query) || chat.subtitle.toLowerCase().includes(query))
        .forEach((chat) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `chat-item${chat.id === state.activeChatId ? ' active' : ''}`;
            button.dataset.chatId = chat.id;

            const avatar = document.createElement('div');
            avatar.className = `avatar ${avatarClass(chat.type)}`;
            avatar.textContent = chat.avatar;

            const meta = document.createElement('div');
            meta.className = 'chat-meta';

            const title = document.createElement('strong');
            title.textContent = chat.title;

            const subtitle = document.createElement('span');
            subtitle.textContent = lastMessageText(chat.id) || chat.subtitle;

            meta.append(title, subtitle);

            const unread = document.createElement('span');
            unread.className = 'unread';
            unread.textContent = chat.id === 'bot-hermes' ? '!' : '';
            if (!unread.textContent) unread.style.visibility = 'hidden';

            button.append(avatar, meta, unread);
            els.chatList.append(button);
        });
}

function renderChatHeader() {
    const chat = activeChat();
    if (!chat) return;

    els.chatAvatar.className = `avatar big ${avatarClass(chat.type)}`;
    els.chatAvatar.textContent = chat.avatar;
    els.chatTitle.textContent = chat.title;
    els.chatSubtitle.textContent = chat.subtitle;

    els.chatActions.innerHTML = '';

    if (chat.type === 'channel') {
        const badge = document.createElement('span');
        badge.className = 'muted';
        badge.textContent = chat.role === 'admin' ? 'Администратор' : 'Подписчик';
        els.chatActions.append(badge);
    }

    if (chat.type === 'bot') {
        const badge = document.createElement('span');
        badge.className = 'muted';
        badge.textContent = 'без backend';
        els.chatActions.append(badge);
    }
}

function renderMessages() {
    const chat = activeChat();
    els.messageList.innerHTML = '';

    if (!chat) return;

    const messages = state.messages[chat.id] || [];
    if (!messages.length) {
        const empty = document.createElement('div');
        empty.className = 'message-row system';
        empty.innerHTML = '<div class="message">Пока нет сообщений</div>';
        els.messageList.append(empty);
        return;
    }

    messages.forEach((message) => {
        const row = document.createElement('div');
        row.className = `message-row ${messageClass(message.senderId)}`;

        const author = users[message.senderId];
        if (message.system) {
            const bubble = document.createElement('div');
            bubble.className = 'message system-message';
            bubble.textContent = message.text;
            row.append(bubble);
        } else {
            if (message.senderId !== 'me') {
                const authorName = document.createElement('div');
                authorName.className = 'message-author';
                authorName.textContent = author ? author.name : message.senderId;
                row.append(authorName);
            }

            const bubble = document.createElement('div');
            bubble.className = 'message';
            bubble.textContent = message.text;

            const time = document.createElement('div');
            time.className = 'time';
            time.textContent = formatTime(message.createdAt);

            row.append(bubble, time);
        }

        els.messageList.append(row);
    });

    els.messageList.scrollTop = els.messageList.scrollHeight;
    els.messageInput.disabled = chat.type === 'channel' && chat.role !== 'admin';
    els.messageInput.placeholder = els.messageInput.disabled ? 'В этом канале могут писать только администраторы' : 'Напишите сообщение...';
}

function renderBotHelp() {
    const chat = activeChat();
    const isHermes = chat && chat.type === 'bot' && chat.botId === 'hermes';
    els.botHelp.classList.toggle('hidden', !isHermes);
    els.botHelp.innerHTML = '';

    if (!isHermes) return;

    const title = document.createElement('p');
    title.textContent = 'Команды HermesBot в mock-режиме:';

    const list = document.createElement('div');
    ['/start', '/help', '/status', '/model', '/reset', '/ask привет'].forEach((command) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'command';
        button.textContent = command;
        button.addEventListener('click', () => {
            els.messageInput.value = command;
            sendMessageFromMe(command);
            els.messageInput.value = '';
        });
        list.append(button);
    });

    els.botHelp.append(title, list);
}

function sendMessageFromMe(text) {
    const chat = activeChat();
    if (!chat) return;

    if (chat.type === 'channel' && chat.role !== 'admin') {
        addSystemMessage(chat.id, 'В каналах писать могут только администраторы.');
        return;
    }

    addMessage(chat.id, {
        id: cryptoId(),
        senderId: 'me',
        text,
        createdAt: new Date().toISOString(),
    });

    if (chat.type === 'bot' && chat.botId === 'hermes') {
        simulateHermesReply(chat.id, text);
    } else if (chat.type === 'group') {
        simulateGroupReply(chat.id);
    }
}

function simulateGroupReply(chatId) {
    showTyping(chatId, 'Мария');
    window.setTimeout(() => {
        clearTyping(chatId);
        addMessage(chatId, {
            id: cryptoId(),
            senderId: 'maria',
            text: 'Приняла. В mock-MVP это имитация ответа участника группы.',
            createdAt: new Date().toISOString(),
        });
    }, 700);
}

function simulateHermesReply(chatId, text) {
    showTyping(chatId, 'HermesBot');
    window.setTimeout(() => {
        clearTyping(chatId);
        addMessage(chatId, {
            id: cryptoId(),
            senderId: 'hermes',
            text: hermesAnswer(text),
            createdAt: new Date().toISOString(),
        });
    }, 650);
}

function showTyping(chatId, name) {
    addSystemMessage(chatId, `${name} печатает…`);
}

function clearTyping(chatId) {
    const messages = state.messages[chatId] || [];
    const last = messages[messages.length - 1];
    if (last && /печатает/.test(last.text)) {
        messages.pop();
        saveState();
        render();
    }
}

function hermesAnswer(text) {
    const clean = text.trim();
    const lower = clean.toLowerCase();

    if (lower === '/start') {
        return 'Привет! Я HermesBot. Сейчас я работаю в mock-режиме: без backend, без токенов и без настоящего вызова Hermes. На следующем этапе подключим backend-прокси.';
    }

    if (lower === '/help') {
        return 'Команды: /start — приветствие, /help — помощь, /status — статус, /model — модель, /reset — сброс контекста, /ask текст — вопрос Hermes.';
    }

    if (lower === '/status') {
        return 'Статус HermesBot: mock-режим OK. Backend и настоящий Hermes пока не подключены. Токены в браузере не используются.';
    }

    if (lower === '/model') {
        return 'Модель HermesBot будет задаваться на backend. В mock-режиме модель не вызывается.';
    }

    if (lower === '/reset') {
        return 'Контекст HermesBot очищен. В mock-режиме это просто сообщение, позже backend будет чистить историю диалога.';
    }

    if (lower.startsWith('/ask ')) {
        const question = clean.slice(5).trim();
        return `HermesBot mock-ответ на вопрос: «${question}». На следующем этапе этот текст уйдёт через backend в Hermes Agent.`;
    }

    if (lower.includes('архитектур') || lower.includes('план')) {
        return 'План такой: сначала mock-MVP, потом backend с SQLite/WebSocket, затем HermesBot через безопасный backend-прокси и только после этого APK.';
    }

    if (lower.includes('мдф') || lower.includes('фасад')) {
        return 'Для МДФ-фасадов можно сделать ботов: заказ, OCR заявки, расчёт цены, статус производства и уведомления клиенту.';
    }

    return 'Я HermesBot в mock-режиме. Сейчас я не вызываю настоящий Hermes, но интерфейс уже готов для подключения через backend-прокси.';
}

function addMessage(chatId, message) {
    if (!state.messages[chatId]) {
        state.messages[chatId] = [];
    }
    state.messages[chatId].push(message);
    saveState();
    render();
}

function addSystemMessage(chatId, text) {
    addMessage(chatId, {
        id: cryptoId(),
        senderId: 'system',
        text,
        createdAt: new Date().toISOString(),
        system: true,
    });
}

function activeChat() {
    return state.chats.find((chat) => chat.id === state.activeChatId) || state.chats[0];
}

function lastMessageText(chatId) {
    const messages = state.messages[chatId] || [];
    const last = messages[messages.length - 1];
    if (!last) return '';
    return last.system ? last.text : `${users[last.senderId]?.name || last.senderId}: ${last.text}`;
}

function messageClass(senderId) {
    if (senderId === 'system') return 'system';
    if (senderId === 'me') return 'me';
    const user = users[senderId];
    return user && user.isBot ? 'bot' : 'other';
}

function avatarClass(type) {
    if (type === 'bot') return 'bot';
    if (type === 'group') return 'group';
    if (type === 'channel') return 'channel';
    return '';
}

function formatTime(value) {
    const date = new Date(value);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function cryptoId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
