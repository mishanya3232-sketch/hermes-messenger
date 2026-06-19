const STORAGE_KEY = 'hermes-messenger-state-v3';
const TOKEN_KEY = 'hermes-messenger-token-v3';
const API_BASE_KEY = 'hermes-messenger-api-base-v3';
const NOTIFICATION_KEY = 'hermes-messenger-notifications-v1';
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
    els.authPasswordConfirmInput = document.getElementById('authPasswordConfirmInput');
    els.authPasswordConfirmField = document.getElementById('authPasswordConfirmField');
    els.authError = document.getElementById('authError');
    els.authPendingInfo = document.getElementById('authPendingInfo');
    els.authSubmitBtn = document.getElementById('authSubmitBtn');
    els.logoutBtn = document.getElementById('logoutBtn');
    els.adminAccessBtn = document.getElementById('adminAccessBtn');
    els.currentUserLine = document.getElementById('currentUserLine');
    els.chatList = document.getElementById('chatList');
    els.chatSearch = document.getElementById('chatSearch');
    els.connectionStatus = document.getElementById('connectionStatus');
    els.notificationButton = document.getElementById('notificationButton');
    els.notificationStatus = document.getElementById('notificationStatus');
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
    els.fileInput = document.getElementById('fileInput');
    els.attachButton = document.getElementById('attachButton');
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
    if (els.notificationButton) els.notificationButton.addEventListener('click', setupNotifications);
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
        await sendMessageFromMe();
    });
    els.attachButton.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => {
        if (els.fileInput.files.length) sendMessageFromMe();
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
                showPendingAccess(`Аккаунт @${api.user.username} создан. Администратор @mikhail ещё не выдал доступ.`);
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

    if (!username) {
        els.authError.textContent = 'Введите логин.';
        return;
    }
    if (mode === 'register' && !name) {
        els.authError.textContent = 'Введите имя.';
        return;
    }
    if (password.length < 4) {
        els.authError.textContent = 'Пароль должен быть минимум 4 символа.';
        return;
    }
    if (mode === 'register' && password !== els.authPasswordConfirmInput.value) {
        els.authError.textContent = 'Пароли не совпадают.';
        return;
    }

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
        api.pendingApproval = Boolean(response.pendingApproval ?? (response.user && !response.user.approved && response.user.role !== 'admin'));
        api.hermesMode = 'mock';
        await loadHermesStatus();
        localStorage.setItem(TOKEN_KEY, api.token);
        if (api.pendingApproval) {
            showAuthScreen();
            setAuthMode('login');
            showPendingAccess(api.user?.role === 'admin'
                ? 'Администратор уже имеет доступ.'
                : `Аккаунт @${username} создан. Администратор @mikhail выдаст доступ после проверки.`);
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
    els.authPasswordConfirmField.classList.toggle('hidden', mode !== 'register');
    els.authPasswordConfirmInput.value = '';
    els.authSubmitBtn.textContent = mode === 'register' ? 'Создать аккаунт' : 'Войти';
    els.authPasswordInput.placeholder = mode === 'register' ? 'Придумайте пароль' : 'Введите пароль';
    if (!api.pendingApproval) {
        els.authError.textContent = '';
        els.authPendingInfo.classList.add('hidden');
    }
}

function showPendingAccess(text) {
    els.authPendingInfo.textContent = text;
    els.authPendingInfo.classList.toggle('hidden', !text);
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
    showPendingAccess('');
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

function setupNotifications() {
    renderNotificationStatus();
    if (!('Notification' in window)) {
        setNotificationStatus('Браузер не поддерживает уведомления', false);
        return;
    }

    if (Notification.permission === 'granted') {
        api.notifications = true;
        localStorage.setItem(NOTIFICATION_KEY, '1');
        setNotificationStatus('Уведомления включены', true);
        return;
    }

    if (Notification.permission === 'denied') {
        api.notifications = false;
        localStorage.removeItem(NOTIFICATION_KEY);
        setNotificationStatus('Уведомления запрещены в браузере', false);
        return;
    }

    Notification.requestPermission().then((permission) => {
        api.notifications = permission === 'granted';
        if (api.notifications) {
            localStorage.setItem(NOTIFICATION_KEY, '1');
            setNotificationStatus('Уведомления включены', true);
        } else {
            localStorage.removeItem(NOTIFICATION_KEY);
            setNotificationStatus('Уведомления выключены', false);
        }
    }).catch(() => {
        api.notifications = false;
        localStorage.removeItem(NOTIFICATION_KEY);
        setNotificationStatus('Не удалось включить уведомления', false);
    });
}

function renderNotificationStatus() {
    if (!els.notificationStatus) return;
    const enabled = Boolean(api.notifications || localStorage.getItem(NOTIFICATION_KEY) === '1');
    api.notifications = enabled;
    if (!('Notification' in window)) {
        els.notificationStatus.textContent = 'Уведомления не поддерживаются';
        els.notificationStatus.classList.add('muted');
        return;
    }
    if (Notification.permission === 'granted' && enabled) {
        els.notificationStatus.textContent = 'Уведомления включены';
        els.notificationStatus.classList.remove('muted');
    } else if (Notification.permission === 'denied') {
        els.notificationStatus.textContent = 'Уведомления запрещены в браузере';
        els.notificationStatus.classList.add('muted');
    } else {
        els.notificationStatus.textContent = 'Уведомления выключены';
        els.notificationStatus.classList.add('muted');
    }
}

function setNotificationStatus(text, enabled) {
    if (!els.notificationStatus) return;
    els.notificationStatus.textContent = text;
    els.notificationStatus.classList.toggle('muted', !enabled);
}

function notifyMessage(message) {
    if (!api.notifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.hasFocus() && activeChat()?.id === message.chatId) return;

    const chat = state.chats.find((item) => item.id === message.chatId);
    const sender = users[message.senderId];
    const title = message.system ? (chat?.title || 'Hermes') : `${sender?.name || message.senderId} · ${chat?.title || 'Чат'}`;
    const body = message.system
        ? message.text
        : (message.text || (message.attachment ? `Файл: ${message.attachment.name}` : 'Новое сообщение'));

    try {
        const notification = new Notification(title, {
            body,
            tag: message.id,
            silent: false,
        });
        window.setTimeout(() => notification.close(), 6000);
    } catch (error) {
        console.warn('Не удалось показать уведомление:', error);
    }
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
    notifyMessage(message);
}

function resetDemo() {
    state = defaultState();
    saveState();
    render();
}

function render() {
    renderConnection();
    renderNotificationStatus();
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

function renderAttachment(attachment) {
    const box = document.createElement('div');
    box.className = 'attachment';

    const icon = document.createElement('span');
    icon.className = 'attachment-icon';
    icon.textContent = attachment.mime?.startsWith('image/') ? '🖼️' : '📄';

    const meta = document.createElement('span');
    meta.className = 'attachment-meta';
    meta.textContent = `${attachment.name} · ${formatBytes(attachment.size || 0)}`;

    const link = document.createElement('a');
    link.className = 'attachment-link';
    link.href = `/api/files/${attachment.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Скачать';

    box.append(icon, meta, link);
    return box;
}

function formatBytes(bytes) {
    if (!bytes) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
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
            if (message.text) bubble.textContent = message.text;
            if (message.attachment) bubble.append(renderAttachment(message.attachment));

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

    const body = { text: text || '' };
    const selectedFile = els.fileInput.files?.[0];
    if (selectedFile) {
        body.attachment = await readFileAsAttachment(selectedFile);
    }
    if (!body.text && !body.attachment) return;

    if (api.baseUrl) {
        sending = true;
        renderMessages();

        try {
            const response = await apiFetch(`/api/chats/${chat.id}/messages`, {
                method: 'POST',
                body: JSON.stringify(body),
            });

            if (response?.message) {
                addMessage(chat.id, response.message, { silent: true });
                if (chat.type === 'bot' && chat.botId === 'hermes') {
                    await waitForHermesReply(chat.id, response.message.createdAt);
                }
            }
        } catch (error) {
            addSystemMessage(chat.id, `Ошибка backend: ${error.message}`);
        } finally {
            sending = false;
            els.fileInput.value = '';
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
        text: body.text,
        attachment: body.attachment,
        createdAt: new Date().toISOString(),
    });
    els.fileInput.value = '';
}

async function readFileAsAttachment(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            data: String(reader.result || '').replace(/^data:[^,]+,/, ''),
        });
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
    });
}

async function waitForHermesReply(chatId, userMessageCreatedAt) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        try {
            const response = await apiFetch(`/api/chats/${chatId}/messages`);
            const reply = (response.messages || []).find((message) => (
                message.senderId === 'hermes' && message.createdAt > userMessageCreatedAt
            ));
            if (reply) {
                addMessage(chatId, reply, { silent: true });
                return;
            }
        } catch (error) {
            console.warn('Не удалось проверить ответ HermesBot:', error);
        }
    }

    addSystemMessage(chatId, 'HermesBot не ответил через backend. Проверь Hermes API Server и соединение с backend.');
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
            'bot-hermes': [],
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
        return location.origin;
    }

    return '';
}

function normalizeApiBase(value) {
    if (!value) return '';
    return value.replace(/\/+$/, '');
}
