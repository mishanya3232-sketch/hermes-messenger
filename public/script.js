const STORAGE_KEY = 'hermes-messenger-state-v3';
const TOKEN_KEY = 'hermes-messenger-token-v3';
const API_BASE_KEY = 'hermes-messenger-api-base-v3';
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
    authMode: 'login',
    pendingApproval: false,
    hermesMode: 'mock',
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
    els.app = document.querySelector('#mainApp');
    els.authScreen = document.getElementById('authScreen');
    els.loginTabBtn = document.getElementById('loginTabBtn');
    els.registerTabBtn = document.getElementById('registerTabBtn');
    els.authForm = document.getElementById('authForm');
    els.authNameInput = document.getElementById('authNameInput');
    els.authUsernameInput = document.getElementById('authUsernameInput');
    els.authPasswordInput = document.getElementById('authPasswordInput');
    els.authError = document.getElementById('authError');
    els.authSubmitBtn = document.getElementById('authSubmitBtn');
    els.logoutBtn = document.getElementById('logoutBtn');
    els.adminAccessBtn = document.getElementById('adminAccessBtn');
    els.currentUserLine = document.getElementById('currentUserLine');
    els.chatList = document.getElementById('chatList');
    els.chatSearch = document.getElementById('chatSearch');
    els.connectionStatus = document.getElementById('connectionStatus');
    els.mobileBackBtn = document.getElementById('mobileBackBtn');
    els.adminPanel = document.getElementById('adminPanel');
    els.adminUsersList = document.getElementById('adminUsersList');
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
        if (isMobileLayout()) {
            state.mobileView = 'chat';
        }
        saveState();
        connectWebSocket();
        render();
    });

    els.chatSearch.addEventListener('input', renderChatList);
    els.loginTabBtn.addEventListener('click', () => setAuthMode('login'));
    els.registerTabBtn.addEventListener('click', () => setAuthMode('register'));
    els.authForm.addEventListener('submit', handleAuthSubmit);
    els.logoutBtn.addEventListener('click', logout);
    if (els.adminAccessBtn) {
        els.adminAccessBtn.addEventListener('click', () => {
            els.adminPanel.classList.toggle('hidden');
        });
    }
    els.mobileBackBtn.addEventListener('click', () => {
        state.mobileView = 'list';
        saveState();
        render();
    });
    window.addEventListener('resize', renderMobileView);

    els.composer.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;

        const text = els.messageInput.value.trim();
        if (!text) return;

        els.messageInput.value = '';
        await sendMessageFromMe(text);
    });
}

async function boot() {
    api.enabled = true;
    setConnection('backend: вход', 'connecting');

    if (api.token) {
        try {
            const me = await apiFetch('/api/me');
            api.user = me.user;
            await loadHermesStatus();
            if (api.user && !api.user.approved && api.user.role !== 'admin') {
                api.pendingApproval = true;
                showAuthScreen();
                setAuthMode('login');
                els.authError.textContent = 'Аккаунт создан. Доступ выдаст администратор @mikhail.';
                render();
                return;
            }
            api.pendingApproval = false;
            showMainApp();
            await loadRemoteState();
            connectWebSocket();
            setConnection(`backend · ${api.user.name}`, 'online');
            render();
            return;
        } catch (error) {
            console.warn('Сессия недействительна:', error);
            api.token = '';
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    setAuthMode('login');
    showAuthScreen();
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const mode = api.authMode;
    const username = els.authUsernameInput.value.trim().toLowerCase();
    const password = els.authPasswordInput.value;
    const name = els.authNameInput.value.trim();
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';

    els.authError.textContent = '';
    els.authSubmitBtn.disabled = true;
    els.authSubmitBtn.textContent = mode === 'register' ? 'Регистрация…' : 'Вход…';

    try {
        const response = await apiFetch(path, {
            method: 'POST',
            body: JSON.stringify({ username, password, name }),
        });

        api.token = response.token;
        api.user = response.user;
        api.pendingApproval = Boolean(response.user && !response.user.approved && response.user.role !== 'admin');
        api.hermesMode = 'mock';
        await loadHermesStatus();
        localStorage.setItem(TOKEN_KEY, api.token);
        if (api.pendingApproval) {
            showAuthScreen();
            setAuthMode('login');
            els.authError.textContent = api.user?.role === 'admin'
                ? 'Администратор уже имеет доступ.'
                : 'Аккаунт создан. Доступ выдаст администратор @mikhail.';
            render();
            return;
        }
        showMainApp();
        setAuthMode('login');
        await loadRemoteState();
        connectWebSocket();
        setConnection(`backend · ${api.user.name}`, 'online');
        render();
    } catch (error) {
        els.authError.textContent = error.message || 'Не удалось войти';
    } finally {
        els.authSubmitBtn.disabled = false;
        els.authSubmitBtn.textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
    }
}

function setAuthMode(mode) {
    api.authMode = mode;
    els.loginTabBtn.classList.toggle('active', mode === 'login');
    els.registerTabBtn.classList.toggle('active', mode === 'register');
    els.authNameInput.closest('.auth-field').classList.toggle('hidden', mode === 'login');
    els.authSubmitBtn.textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
    els.authPasswordInput.placeholder = mode === 'register' ? 'Придумайте пароль' : 'Введите пароль';
    if (!api.pendingApproval) els.authError.textContent = '';
}

function showMainApp() {
    els.app.classList.remove('hidden');
    els.authScreen.classList.add('hidden');
}

function showAuthScreen() {
    els.app.classList.add('hidden');
    els.authScreen.classList.remove('hidden');
}

async function logout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.warn('Logout failed:', error);
    }

    api.token = '';
    api.user = null;
    api.pendingApproval = false;
    api.hermesMode = 'mock';
    localStorage.removeItem(TOKEN_KEY);
    if (api.socket) api.socket.close();
    if (els.adminPanel) els.adminPanel.classList.add('hidden');
    if (els.adminAccessBtn) els.adminAccessBtn.classList.add('hidden');
    showAuthScreen();
    setConnection('backend: вход', 'connecting');
    render();
}

async function loadHermesStatus() {
    try {
        const status = await apiFetch('/api/hermes/status');
        api.hermesMode = status.mode || 'mock';
    } catch (error) {
        api.hermesMode = 'mock';
    }
}

async function loadRemoteState() {
    const chatsResponse = await apiFetch('/api/chats');
    const messages = {};

    await Promise.all(chatsResponse.chats.map(async (chat) => {
        const messagesResponse = await apiFetch(`/api/chats/${chat.id}/messages`);
        messages[chat.id] = messagesResponse.messages || [];
    }));

    const firstChatId = chatsResponse.chats[0]?.id || null;
    state = {
        activeChatId: state.activeChatId && chatsResponse.chats.some((chat) => chat.id === state.activeChatId) ? state.activeChatId : firstChatId,
        mobileView: state.mobileView || 'list',
        chats: chatsResponse.chats,
        messages,
    };
    saveState();
}

function detectApiBase() {
    return '';
}

function isSameOriginApiHost() {
    return true;
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
            if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
                api.token = '';
                localStorage.removeItem(TOKEN_KEY);
                showAuthScreen();
            }
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

function isMobileLayout() {
    return window.matchMedia('(max-width: 760px)').matches;
}

function renderMobileView() {
    if (!els.app || !els.mobileBackBtn) return;

    const mobile = isMobileLayout();
    const view = state.mobileView === 'chat' ? 'chat' : 'list';

    els.app.classList.toggle('mobile-list', mobile && view === 'list');
    els.app.classList.toggle('mobile-chat', mobile && view === 'chat');
    els.mobileBackBtn.classList.toggle('hidden', !mobile || view !== 'chat');
}

function connectWebSocket() {
    if (!api.baseUrl && !isSameOriginApiHost()) return;
    if (!api.user || !api.token) return;
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
    renderCurrentUser();
    renderAdminPanel();
    renderChatList();
    renderChatHeader();
    renderMessages();
    renderBotHelp();
    renderMobileView();
}

function renderConnection() {
    if (!els.connectionStatus) return;

    const mode = api.enabled || isSameOriginApiHost() ? 'backend' : 'mock';
    els.connectionStatus.textContent = mode === 'backend' && api.user ? `backend · ${api.user.name}` : 'backend: вход';
    els.connectionStatus.dataset.state = mode === 'backend' && api.user ? 'online' : 'connecting';
}

function renderCurrentUser() {
    if (!els.currentUserLine) return;
    if (api.user) {
        const status = api.user.role === 'admin' ? 'админ' : api.user.approved ? 'доступ разрешён' : 'ожидает подтверждения';
        els.currentUserLine.textContent = `${api.user.name} · @${api.user.username} · ${status}`;
    } else {
        els.currentUserLine.textContent = 'Вход через backend';
    }
}

async function renderAdminPanel() {
    if (!els.adminPanel || !els.adminUsersList || !els.adminAccessBtn) return;

    if (!api.user || api.user.role !== 'admin' || !api.user.approved) {
        els.adminPanel.classList.add('hidden');
        els.adminAccessBtn.classList.add('hidden');
        return;
    }

    els.adminAccessBtn.classList.remove('hidden');
    els.adminPanel.classList.add('hidden');
    els.adminUsersList.innerHTML = '<div class="muted">Загрузка заявок…</div>';
    try {
        const response = await apiFetch('/api/admin/users');
        const users = response.users || [];
        const pending = users.filter((user) => !user.approved);
        const approved = users.filter((user) => user.approved && user.role !== 'admin');

        els.adminAccessBtn.textContent = pending.length ? `Доступ (${pending.length})` : 'Доступ';

        els.adminUsersList.innerHTML = '';
        if (!users.length) {
            const empty = document.createElement('p');
            empty.className = 'muted';
            empty.textContent = 'Пользователей пока нет.';
            els.adminUsersList.append(empty);
            return;
        }

        const title = document.createElement('p');
        title.className = 'muted';
        title.textContent = 'HermesBot доступен только вам. Остальных пользователей можно пропустить через аппров.';
        els.adminUsersList.append(title);

        if (pending.length) {
            const heading = document.createElement('strong');
            heading.textContent = 'Ожидают подтверждения';
            els.adminUsersList.append(heading);
            pending.forEach((user) => els.adminUsersList.append(userRow(user, true)));
        }

        if (approved.length) {
            const heading = document.createElement('strong');
            heading.textContent = 'Доступ разрешён';
            els.adminUsersList.append(heading);
            approved.forEach((user) => els.adminUsersList.append(userRow(user, false)));
        }
    } catch (error) {
        els.adminUsersList.innerHTML = '';
        const errorNode = document.createElement('p');
        errorNode.className = 'auth-error';
        errorNode.textContent = `Не удалось загрузить заявки: ${error.message}`;
        els.adminUsersList.append(errorNode);
    }
}

function userRow(user, pending) {
    const row = document.createElement('div');
    row.className = 'admin-user-row';

    const meta = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.name || user.username;
    const username = document.createElement('span');
    username.className = 'muted';
    username.textContent = `@${user.username}`;
    meta.append(name, username);

    const actions = document.createElement('div');
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'ghost small';
    approve.textContent = pending ? 'Разрешить' : 'Запретить';
    approve.addEventListener('click', () => approveUser(user.id, pending));
    actions.append(approve);

    row.append(meta, actions);
    return row;
}

async function approveUser(userId, approve) {
    const path = approve ? `/api/admin/users/${userId}/approve` : `/api/admin/users/${userId}/revoke`;
    try {
        await apiFetch(path, { method: 'POST' });
        await renderAdminPanel();
        await loadRemoteState();
    } catch (error) {
        els.authError.textContent = error.message;
    }
}

function renderChatList() {
    const query = els.chatSearch.value.trim().toLowerCase();
    els.chatList.innerHTML = '';

    const chats = state.chats
        .filter((chat) => !query || chat.title.toLowerCase().includes(query) || chat.subtitle.toLowerCase().includes(query));

    if (!chats.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = api.user && !api.user.approved && api.user.role !== 'admin'
            ? 'Нет доступных чатов. Администратор выдаст доступ после подтверждения.'
            : 'Чатов пока нет.';
        els.chatList.append(empty);
        return;
    }

    chats.forEach((chat) => {
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
        badge.textContent = api.hermesMode === 'api-server' ? 'backend Hermes' : 'backend mock';
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
        const text = chat.type === 'bot' && api.user && api.user.role !== 'admin'
            ? 'Доступ к HermesBot есть только у администратора.'
            : 'Пока нет сообщений';
        const bubble = document.createElement('div');
        bubble.className = 'message system-message';
        bubble.textContent = text;
        empty.append(bubble);
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
    const canWriteBot = !(chat.type === 'bot' && api.user && api.user.role !== 'admin');
    const canWrite = canWriteBot && !(chat.type === 'channel' && chat.role !== 'admin');
    els.messageInput.disabled = !canWrite;
    els.messageInput.placeholder = !canWrite
        ? (chat.type === 'bot' ? 'Доступ к HermesBot есть только у администратора' : 'В этом канале могут писать только администраторы')
        : 'Напишите сообщение...';
    els.sendButton.disabled = sending || !canWrite;
    els.sendButton.textContent = sending ? 'Отправляю…' : 'Отправить';
}

function renderBotHelp() {
    const chat = activeChat();
    const isHermes = chat && chat.type === 'bot' && chat.botId === 'hermes';
    const adminHermes = isHermes && api.user && api.user.role === 'admin';
    els.botHelp.classList.toggle('hidden', !adminHermes);
    els.botHelp.innerHTML = '';

    if (!adminHermes) return;

    const title = document.createElement('p');
    title.textContent = api.hermesMode === 'api-server'
        ? 'Команды HermesBot через backend Hermes:'
        : 'Команды HermesBot через backend mock:';

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
    if (!chat || !api.user) return;

    if (chat.type === 'channel' && chat.role !== 'admin') {
        addSystemMessage(chat.id, 'В каналах писать могут только администраторы.');
        return;
    }

    if (chat.type === 'bot' && chat.botId === 'hermes' && api.user.role !== 'admin') {
        addSystemMessage(chat.id, 'Доступ к HermesBot есть только у администратора.');
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
        mobileView: 'list',
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
                subtitle: 'AI-бот · backend Hermes API',
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
                { id: cryptoId(), senderId: 'hermes', text: 'Привет! Я HermesBot. Backend Hermes API включён: токены Hermes остаются только на сервере. Введи /help.', createdAt: t(10) },
            ],
        },
    };
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            parsed.mobileView = parsed.mobileView || 'list';
            return parsed;
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
