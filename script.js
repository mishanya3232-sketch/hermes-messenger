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
    eventSource: null,
    pollTimer: null,
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
        connectEvents();
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
        connectEvents();
        startPolling();
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

function connectEvents() {
    if (!api.baseUrl || typeof EventSource === 'undefined') return;

    if (api.eventSource) {
        api.eventSource.close();
    }

    const chatId = activeChat()?.id || '';
    const url = `${api.baseUrl}/api/events?chatId=${encodeURIComponent(chatId)}`;
    const source = new EventSource(url);

    api.eventSource = source;

    source.addEventListener('message', (event) => {
        try {
            const serverEvent = JSON.parse(event.data);
            applyServerEvent(serverEvent);
        } catch (error) {
            console.warn('Не удалось обработать событие backend:', error);
        }
    });

    source.addEventListener('open', () => setConnection(`backend · ${api.user?.name || 'online'}`, 'online'));
    source.addEventListener('error', () => setConnection('backend: reconnect…', 'connecting'));
}

function startPolling() {
    if (api.pollTimer) window.clearInterval(api.pollTimer);
    api.pollTimer = window.setInterval(refreshRemoteMessages, POLL_INTERVAL);
}

async function refreshRemoteMessages() {
    if (!api.enabled) return;

    try {
        await Promise.all(state.chats.map(async (chat) => {
            const response = await apiFetch(`/api/chats/${chat.id}/messages`);
            const nextMessages = response.messages || [];
            const currentMessages = state.messages[chat.id] || [];

            if (JSON.stringify(nextMessages) !== JSON.stringify(currentMessages)) {
                state.messages[chat.id] = nextMessages;
                saveState();
                render();
            }
        }));
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
        badge.textContent = api.baseUrl ? 'backend mock' : 'без backend';
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
    title.textContent = api.baseUrl
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

    if (!api.baseUrl && !isSameOriginApiHost()) {
        addSystemMessage(chat.id, 'HermesBot работает только через backend. Откройте приложение с backend-адресом или параметром ?api=http://IP:PORT.');
        return;
    }

    addMessage(chat.id, {
        id: cryptoId(),
        senderId: 'me',
        text,
        createdAt: new Date().toISOString(),
    });
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
            'bot-hermes': [],
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
