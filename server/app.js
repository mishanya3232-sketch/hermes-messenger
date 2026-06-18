const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const sessions = new Map();
const subscribers = new Set();
let eventId = 1;

function defaultUsers() {
    const now = Date.now();
    return [
        { id: 'me', username: 'mikhail', name: 'Михаил', avatar: 'М', role: 'admin', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString() },
        { id: 'ivan', username: 'ivan', name: 'Иван', avatar: 'И', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 29).toISOString() },
        { id: 'maria', username: 'maria', name: 'Мария', avatar: 'М', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 28).toISOString() },
        { id: 'alex', username: 'alex', name: 'Алекс', avatar: 'А', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 27).toISOString() },
        { id: 'hermes', username: 'hermes', name: 'HermesBot', avatar: 'H', isBot: true, createdAt: new Date(now - 1000 * 60 * 60 * 24 * 26).toISOString() },
    ];
}

function defaultChats() {
    return [
        { id: 'private-ivan', type: 'private', title: 'Иван', subtitle: 'личный чат', avatar: 'И', members: ['me', 'ivan'] },
        { id: 'group-mdf', type: 'group', title: 'МДФ-цех', subtitle: 'группа · 4 участника', avatar: 'Ц', members: ['me', 'ivan', 'maria', 'alex'] },
        { id: 'channel-news', type: 'channel', title: 'Новости проекта', subtitle: 'канал · вы подписчик', avatar: 'Н', members: ['me', 'maria'], role: 'subscriber' },
        { id: 'bot-hermes', type: 'bot', title: 'HermesBot', subtitle: 'AI-бот · backend mock', avatar: 'H', botId: 'hermes', members: ['me', 'hermes'] },
    ];
}

function defaultMessages() {
    const now = Date.now();
    const t = (minutesAgo) => new Date(now - minutesAgo * 60 * 1000).toISOString();

    return {
        'private-ivan': [
            { id: id(), senderId: 'ivan', text: 'Привет! Как тебе новый мессенджер?', createdAt: t(40) },
            { id: id(), senderId: 'me', text: 'Сделали backend-каркас: API, JSON-хранилище и HermesBot-прокси.', createdAt: t(35) },
        ],
        'group-mdf': [
            { id: id(), senderId: 'maria', text: 'Кто сегодня смотрит заказы по МДФ?', createdAt: t(80) },
            { id: id(), senderId: 'alex', text: 'Я уже начал. В этом чате потом можно подключить настоящего Hermes.', createdAt: t(75) },
        ],
        'channel-news': [
            { id: id(), senderId: 'maria', text: 'План: mock-MVP → backend → WebSocket/SSE → Hermes-прокси → APK.', createdAt: t(120), system: true },
        ],
        'bot-hermes': [
            { id: id(), senderId: 'hermes', text: 'Привет! Я HermesBot. Backend уже умеет принимать запросы, но Hermes пока в mock-режиме: без токенов и без внешних вызовов. Введи /help.', createdAt: t(10) },
        ],
    };
}

function defaultDb() {
    return {
        version: 1,
        users: defaultUsers(),
        chats: defaultChats(),
        messages: defaultMessages(),
    };
}

function id() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDb() {
    ensureDataDir();
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        const db = defaultDb();
        saveDb(db);
        return db;
    }
}

function saveDb(db) {
    ensureDataDir();
    const temp = `${DB_PATH}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(db, null, 2));
    fs.renameSync(temp, DB_PATH);
}

const db = loadDb();

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(text);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1000 * 1000) {
                req.destroy();
                reject(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function tokenFromRequest(req) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();

    const headerToken = (req.headers['x-auth-token'] || '').toString().trim();
    if (headerToken) return headerToken;

    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
        cookieHeader
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const index = part.indexOf('=');
                if (index === -1) return [part, ''];
                return [part.slice(0, index), part.slice(index + 1)];
            })
    );

    return cookies.messenger_token || '';
}

function requireUser(req) {
    const token = tokenFromRequest(req);
    const session = sessions.get(token);
    if (!session) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
    }
    return session.user;
}

function getUser(userId) {
    return db.users.find((user) => user.id === userId);
}

function getUserByUsername(username) {
    return db.users.find((user) => user.username === username);
}

function getChat(chatId) {
    return db.chats.find((chat) => chat.id === chatId);
}

function canReadChat(user, chat) {
    return chat.members.includes(user.id) || user.role === 'admin';
}

function canWriteChat(user, chat) {
    if (!canReadChat(user, chat)) return false;
    if (chat.type === 'channel') return chat.role === 'admin';
    return true;
}

function addMessage(chatId, senderId, text, extra = {}) {
    if (!db.messages[chatId]) db.messages[chatId] = [];
    const message = {
        id: id(),
        senderId,
        text,
        createdAt: new Date().toISOString(),
        ...extra,
    };
    db.messages[chatId].push(message);
    saveDb(db);
    emitEvent('message', chatId, { message });
    return message;
}

function emitEvent(type, chatId, payload) {
    const event = {
        id: eventId++,
        type,
        chatId,
        payload,
        createdAt: new Date().toISOString(),
    };

    for (const res of Array.from(subscribers)) {
        if (res.chatId && res.chatId !== chatId) continue;
        try {
            res.write(`id: ${event.id}\n`);
            res.write(`event: ${type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (error) {
            subscribers.delete(res);
        }
    }
}

function hermesAnswer(text) {
    const clean = (text || '').trim();
    const lower = clean.toLowerCase();

    if (lower === '/start') {
        return 'Привет! Я HermesBot. Backend уже принимает запросы, но настоящий Hermes пока не вызывается. Это безопасный mock-режим без токенов в браузере.';
    }

    if (lower === '/help') {
        return 'Команды: /start — приветствие, /help — помощь, /status — статус, /model — модель, /reset — сброс контекста, /ask текст — вопрос Hermes.';
    }

    if (lower === '/status') {
        return 'Статус HermesBot: backend OK, Hermes mock OK. Настоящий Hermes не вызывается, пока не включишь HERMES_API_BASE_URL/HERMES_API_KEY на сервере.';
    }

    if (lower === '/model') {
        return 'Модель HermesBot будет задаваться на backend. Сейчас модель не вызывается, чтобы не хранить токены в frontend.';
    }

    if (lower === '/reset') {
        return 'Контекст HermesBot очищен. В mock-режиме это просто сообщение; позже backend будет чистить историю диалога.';
    }

    if (lower.startsWith('/ask ')) {
        const question = clean.slice(5).trim();
        return `HermesBot backend mock-ответ: «${question}». Следующий шаг — включить настоящий Hermes API/gateway через backend-прокси.`;
    }

    if (lower.includes('архитектур') || lower.includes('план')) {
        return 'План: уже есть mock-MVP и backend-каркас. Дальше добавляем SSE/WebSocket, регистрацию, SQLite и настоящее подключение Hermes через безопасный серверный прокси.';
    }

    if (lower.includes('мдф') || lower.includes('фасад')) {
        return 'Для МДФ-фасадов можно сделать ботов: заказ, OCR заявки, расчёт цены, статус производства и уведомления клиенту.';
    }

    return 'Я HermesBot в backend mock-режиме. Сейчас я не вызываю настоящий Hermes, но интерфейс и API уже готовы для подключения.';
}

function handleHermesMessage(chatId, text) {
    return hermesAnswer(text);
}

function handleGroupReply(chatId) {
    windowSafeDelay(() => {
        addMessage(chatId, 'maria', 'Backend получил сообщение. Это демо-ответ участника группы; дальше можно заменить на реальные уведомления.', { system: true });
    });
}

function handlePrivateReply(chatId) {
    windowSafeDelay(() => {
        addMessage(chatId, 'ivan', 'Принял. Backend работает, сообщения сохраняются в JSON-хранилище.', { system: true });
    });
}

function windowSafeDelay(fn) {
    setTimeout(fn, 650);
}

function route(req, res, parsedUrl, user) {
    const pathname = parsedUrl.pathname;

    if (req.method === 'OPTIONS') {
        return sendJson(res, 204, {});
    }

    if (req.method === 'GET' && pathname === '/healthz') {
        return sendJson(res, 200, { ok: true, time: new Date().toISOString(), mode: process.env.HERMES_MOCK === 'false' ? 'real-ready' : 'mock' });
    }

    if (req.method === 'GET' && pathname === '/') {
        return serveStatic(path.join(PUBLIC_DIR, 'index.html'), res);
    }

    if (req.method === 'GET' && pathname.startsWith('/')) {
        const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^([.][.][\/])+/, '');
        const filePath = path.join(PUBLIC_DIR, safePath);
        if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return serveStatic(filePath, res);
        }
    }

    if (!pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'Not found' });
    }

    if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, version: '0.1.0', hermes: 'mock', noTokensInFrontend: true });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
        return login(req, res);
    }

    let authenticatedUser = null;
    try {
        authenticatedUser = requireUser(req);
    } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Unauthorized' });
    }

    if (req.method === 'GET' && pathname === '/api/me') {
        return sendJson(res, 200, { user: publicUser(authenticatedUser) });
    }

    if (req.method === 'GET' && pathname === '/api/chats') {
        const chats = db.chats.filter((chat) => canReadChat(authenticatedUser, chat));
        return sendJson(res, 200, { chats });
    }

    const chatMessagesMatch = pathname.match(/^\/api\/chats\/([^/]+)\/messages$/);
    if (req.method === 'GET' && chatMessagesMatch) {
        const chat = getChat(chatMessagesMatch[1]);
        if (!chat || !canReadChat(authenticatedUser, chat)) return sendJson(res, 404, { error: 'Chat not found' });
        return sendJson(res, 200, { messages: db.messages[chat.id] || [] });
    }

    if (req.method === 'POST' && chatMessagesMatch) {
        return createMessage(req, res, authenticatedUser, chatMessagesMatch[1]);
    }

    if (req.method === 'GET' && pathname === '/api/events') {
        return events(req, res, authenticatedUser);
    }

    if (req.method === 'POST' && pathname === '/api/hermes/ask') {
        return hermesAsk(req, res, authenticatedUser);
    }

    return sendJson(res, 404, { error: 'Not found' });
}

function publicUser(user) {
    return { id: user.id, username: user.username, name: user.name, avatar: user.avatar, role: user.role, isBot: !!user.isBot };
}

async function login(req, res) {
    const body = await readBody(req);
    const username = String(body.username || body.user || 'mikhail').trim();
    const user = getUserByUsername(username) || getUserByUsername('mikhail');
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { user, createdAt: Date.now() });

    res.setHeader('Set-Cookie', [
        `messenger_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    ]);

    sendJson(res, 200, {
        token,
        user: publicUser(user),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    });
}

async function createMessage(req, res, user, chatId) {
    const chat = getChat(chatId);
    if (!chat || !canReadChat(user, chat)) return sendJson(res, 404, { error: 'Chat not found' });
    if (!canWriteChat(user, chat)) return sendJson(res, 403, { error: 'No write permission' });

    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'Empty message' });
    if (text.length > 2000) return sendJson(res, 413, { error: 'Message too long' });

    const message = addMessage(chat.id, user.id, text);

    if (chat.type === 'bot' && chat.botId === 'hermes') {
        windowSafeDelay(() => {
            const reply = handleHermesMessage(chat.id, text);
            addMessage(chat.id, 'hermes', reply);
        });
    } else if (chat.type === 'group') {
        handleGroupReply(chat.id);
    } else if (chat.type === 'private') {
        handlePrivateReply(chat.id);
    }

    sendJson(res, 200, { message, replyPending: true });
}

async function hermesAsk(req, res, user) {
    const body = await readBody(req);
    const chat = getChat(body.chatId || 'bot-hermes');
    if (!chat || !canReadChat(user, chat)) return sendJson(res, 404, { error: 'Chat not found' });

    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'Empty message' });
    if (text.length > 1000) return sendJson(res, 413, { error: 'Message too long' });

    const answer = handleHermesMessage(chat.id, text);
    const message = addMessage(chat.id, 'hermes', answer);

    sendJson(res, 200, { answer: message.text, message });
}

function events(req, res, user) {
    const chatId = req.url.includes('chatId=') ? new URL(req.url, 'http://localhost').searchParams.get('chatId') : null;
    const subscriber = {
        res,
        chatId,
        heartbeat: null,
    };

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');

    subscribers.add(subscriber);
    subscriber.heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (error) {
            subscribers.delete(subscriber);
            clearInterval(subscriber.heartbeat);
        }
    }, 25000);

    req.on('close', () => {
        subscribers.delete(subscriber);
        clearInterval(subscriber.heartbeat);
    });
}

function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
    };

    if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: 'Not found' });
    }

    res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    });
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const user = tokenFromRequest(req) ? null : null;
        await route(req, res, parsedUrl, user);
    } catch (error) {
        console.error(error);
        if (!res.headersSent) sendJson(res, error.status || 500, { error: error.message || 'Internal server error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Hermes Messenger backend: http://localhost:${PORT}`);
    console.log(`Demo frontend: http://localhost:${PORT}/?api=http://localhost:${PORT}`);
    console.log(`API health: http://localhost:${PORT}/api/health`);
});

process.on('SIGINT', () => {
    server.close(() => process.exit(0));
});
