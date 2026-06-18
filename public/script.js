const STORAGE_KEY = 'hermes-messenger-state-v2';
const TOKEN_KEY = 'hermes-messenger-token-v2';
const API_BASE_KEY = 'hermes-messenger-api-base-v2';
const POLL_INTERVAL = 3000;

const users = {
    me: { id: 'me', name: 'Михаил', avatar: 'М' },
    ivan: { id: 'ivan', name: 'Иван', avatar: 'И' },
    maria: { id: 'maria', name: 'Мария', avatar: 'М' },
    alex: { id: 'alex', name: 'Алекс', avatar: 'А' },
    hermes: { id: 'hermes', name: 'HermesBot', avatar: 'H', isBot: true },
};

const api = {
    enabled: false,
    baseUrl: detectApiBase(),
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    socket: null,
    wsReconnectTimer: null,
};

let state = loadState();
let sending = false;
const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    cacheElements();
    bindEvents();
    render();
    boot();
}

function cacheElements() {
    els.chatList = document.getElementById('chatList');
    els.chatSearch = document.getElementById('chatSearch');
    els.resetDemoBtn = document.getElementById('resetDemoBtn');
    els.connectionStatus = document.getElementById('connectionStatus');
    els.apiBaseInput = document.getElementById('apiBaseInput');
    els.connectApiBtn = document.getElementById('connectApiBtn');
    els.disconnectApiBtn = document.getElementById('disconnectApiBtn');
    els.chatAvatar = document.getElementById('chatAvatar');
    els.chatTitle = document.getElementById('chatTitle');
    els.chatSubtitle = document.getElementById('chatSubtitle');
    els.chatActions = document.getElementById('chatActions');
    els.messageList = document.getElementById('messageList');
    els.botHelp = document.getElementById('botHelp');
    els.composer = document.getElementById('composer');
    els.messageInput = document.getElementById('messageInput');
    els.sendButton = document.querySelector('#composer button[type="submit"]');
}

function bindEvents() {
    els.chatList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-chat-id]');
        if (!button) return;
        state.activeChatId = button.dataset.chatId;
        saveState();
        connectWebSocket();
        render();
    });

    els.chatSearch.addEventListener('input', renderChatList);
    els.resetDemoBtn.addEventListener('click', resetDemo);

    els.connectApiBtn.addEventListener('click', () => {
        const base = normalizeApiBase(els.apiBaseInput.value.trim());
        if (!base) {
            localStorage.removeItem(API_BASE_KEY);
            location.reload();
            return;
        }
        localStorage.setItem(API_BASE_KEY, base);
        location.reload();
    });

    els.disconnectApiBtn.addEventListener('click', () => {
        localStorage.removeItem(API_BASE_KEY);
        const params = new URLSearchParams(location.search);
        params.delete('api');
        const next = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
        location.href = next;
    });

    els.composer.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;

        const text = els.messageInput.value.trim();
        if (!text) return;

        els.messageInput.value = '';
        await sendMessageFromMe(text);
    });

    if (els.apiBaseInput) {
        els.apiBaseInput.value = api.baseUrl;
    }
}

async function boot() {
    if (!api.baseUrl && !isSameOriginApiHost()) {
        setConnection('mock-режим', 'offline');
        render();
        return;
    }

    setConnection('подключаюсь…', 'connecting');
    try {
        await ensureApiSession();
        await loadRemoteState();
        connectWebSocket();
        setConnection(`backend · ${api.user.name}`, 'online');
    } catch (error) {
        console.warn('Backend недоступен, включён mock-режим:', error);
        setConnection(`mock · ${error.message}`, 'offline');
    }
    render();
}

async function ensureApiSession() {
    api.enabled = true;

    if (api.token) {
        try {
            const me = await apiFetch('/api/me');
            api.user = me.user;
            return;
        } catch (error) {
            api.token = '';
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    const login = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'mikhail' }),
    });

    api.token = login.token;
    api.user = login.user;
    localStorage.setItem(TOKEN_KEY, api.token);
}

async function loadRemoteState() {
    const chatsResponse = await apiFetch('/api/chats');
    const messages = {};

    await Promise.all(chatsResponse.chats.map(async (chat) => {
        const messagesResponse = await apiFetch(`/api/chats/${chat.id}/messages`);
        messages[chat.id] = messagesResponse.messages || [];
    }));

    state = {
        activeChatId: 'private-ivan',
        chats: chatsResponse.chats,
        messages,
    };
    saveState();
}

function apiFetch(path, options = {}) {
    if (!api.baseUrl && !isSameOriginApiHost()) throw new Error('API не подключена');

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (api.token) {
        headers.Authorization = `Bearer ${api.token}`;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    return fetch(`${api.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
    }).then(async (response) => {
        window.clearTimeout(timer);

        if (response.status === 204) return null;

        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch (error) {
            payload = { error: text || 'Пустой ответ' };
        }

        if (!response.ok) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }

        return payload;
    });
}

function setConnection(text, state = 'offline') {
    if (!els.connectionStatus) return;
    els.connectionStatus.textContent = text;
    els.connectionStatus.dataset.state = state;
}

function connectWebSocket() {
    if (!api.baseUrl && !isSameOriginApiHost()) return;
    if (typeof WebSocket === 'undefined') return;

    if (api.socket) {
        api.socket.close();
    }

    if (api.wsReconnectTimer) {
        window.clearTimeout(api.wsReconnectTimer);
        api.wsReconnectTimer = null;
    }

    const url = buildWebSocketUrl(activeChat()?.id || '');
    const socket = new WebSocket(url);
    api.socket = socket;

    socket.addEventListener('open', () => {
        setConnection(`backend · ${api.user?.name || 'online'}`, 'online');
    });

    socket.addEventListener('message', (event) => {
        try {
            const serverEvent = JSON.parse(event.data);
            applyServerEvent(serverEvent);
        } catch (error) {
            console.warn('Не удалось обработать событие backend:', error);
        }
    });

    socket.addEventListener('error', () => {
        setConnection('backend: reconnect…', 'connecting');
    });

    socket.addEventListener('close', () => {
        if (!api.socket || api.socket !== socket) return;
        setConnection('backend: reconnect…', 'connecting');
        api.wsReconnectTimer = window.setTimeout(() => connectWebSocket(), 1500);
    });
}

function buildWebSocketUrl(chatId) {
    const base = api.baseUrl || location.origin;
    const protocol = base.startsWith('https') ? 'wss' : 'ws';
    const url = new URL('/api/ws', base);
    url.searchParams.set('chatId', chatId || '');

    if (api.token && api.baseUrl && api.baseUrl !== location.origin) {
        url.searchParams.set('token', api.token);
    }

    return url.toString();
}

async function refreshRemoteMessages() {
    if (!api.enabled) return;

    try {
        const chat = activeChat();
        if (!chat) return;
        const response = await apiFetch(`/api/chats/${chat.id}/messages`);
        const nextMessages = response.messages || [];
        const currentMessages = state.messages[chat.id] || [];

        if (JSON.stringify(nextMessages) !== JSON.stringify(currentMessages)) {
            state.messages[chat.id] = nextMessages;
            saveState();
            render();
        }
    } catch (error) {
        console.warn('Не удалось обновить сообщения:', error);
    }
}

function applyServerEvent(serverEvent) {
    if (serverEvent.type !== 'message') return;

    const message = serverEvent.payload?.message;
    if (!message) return;

    addMessage(message.chatId || serverEvent.chatId, message, { silent: true });
}

function resetDemo() {
    state = defaultState();
    saveState();
    render();
}

function render() {
    renderConnection();
    renderChatList();
    renderChatHeader();
    renderMessages();
    renderBotHelp();
}

function renderConnection() {
    if (!els.connectionStatus) return;

    const mode = api.enabled || isSameOriginApiHost() ? 'backend' : 'mock';
    els.connectionStatus.textContent = mode === 'backend' && api.user ? `backend · ${api.user.name}` : 'backend: connecting';
    els.connectionStatus.dataset.state = mode;
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
        badge.textContent = api.enabled || isSameOriginApiHost() ? 'backend mock' : 'без backend';
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
    els.sendButton.disabled = sending;
    els.sendButton.textContent = sending ? 'Отправляю…' : 'Отправить';
}

function renderBotHelp() {
    const chat = activeChat();
    const isHermes = chat && chat.type === 'bot' && chat.botId === 'hermes';
    els.botHelp.classList.toggle('hidden', !isHermes);
    els.botHelp.innerHTML = '';

    if (!isHermes) return;

    const title = document.createElement('p');
    title.textContent = api.enabled || isSameOriginApiHost()
        ? 'Команды HermesBot через backend mock:'
        : 'Команды HermesBot в mock-режиме:';

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

async function sendMessageFromMe(text) {
    const chat = activeChat();
    if (!chat) return;

    if (chat.type === 'channel' && chat.role !== 'admin') {
        addSystemMessage(chat.id, 'В каналах писать могут только администраторы.');
        return;
    }

    if (api.baseUrl) {
        sending = true;
        renderMessages();

        try {
            const response = await apiFetch(`/api/chats/${chat.id}/messages`, {
                method: 'POST',
                body: JSON.stringify({ text }),
            });

            if (response?.message) {
                addMessage(chat.id, response.message, { silent: true });
            }
        } catch (error) {
            addSystemMessage(chat.id, `Ошибка backend: ${error.message}`);
        } finally {
            sending = false;
            renderMessages();
        }

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
    } else if (chat.type === 'private') {
        simulatePrivateReply(chat.id);
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

function simulatePrivateReply(chatId) {
    showTyping(chatId, 'Иван');
    window.setTimeout(() => {
        clearTyping(chatId);
        addMessage(chatId, {
            id: cryptoId(),
            senderId: 'ivan',
            text: 'Backend пока не подключён, но интерфейс уже готов.',
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

function addMessage(chatId, message, options = {}) {
    if (!state.messages[chatId]) {
        state.messages[chatId] = [];
    }

    const exists = state.messages[chatId].some((item) => item.id === message.id);
    if (exists) return;

    state.messages[chatId].push(message);
    saveState();

    if (!options.silent) render();
    else render();
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
                { id: cryptoId(), senderId: 'maria', text: 'План: сначала mock-MVP, потом backend, SSE/WebSocket и Hermes-прокси.', createdAt: t(120), system: true },
            ],
            'bot-hermes': [
                { id: cryptoId(), senderId: 'hermes', text: 'Привет! Я HermesBot. Пока работаю в mock-режиме, без токенов и backend. Введи /help, чтобы увидеть команды.', createdAt: t(10) },
            ],
        },
    };
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.warn('Не удалось загрузить состояние:', error);
    }
    return defaultState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('Не удалось сохранить состояние:', error);
    }
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

function isSameOriginApiHost() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function detectApiBase() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('api');
    if (fromUrl) return normalizeApiBase(fromUrl);

    const saved = localStorage.getItem(API_BASE_KEY);
    if (saved) return normalizeApiBase(saved);

    if (isSameOriginApiHost()) {
        return '';
    }

    return '';
}

function normalizeApiBase(value) {
    if (!value) return '';
    return value.replace(/\/+$/, '');
}
