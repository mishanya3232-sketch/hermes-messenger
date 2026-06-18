const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'messenger.sqlite');
const JSON_DB_PATH = path.join(DATA_DIR, 'db.json');
let database = null;

function nowIso(offsetMinutes = 0) {
    return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

function defaultUsers() {
    return [
        { id: 'me', username: 'mikhail', name: 'Михаил', avatar: 'М', role: 'admin', isBot: 0, createdAt: nowIso(30 * 24 * 60) },
        { id: 'ivan', username: 'ivan', name: 'Иван', avatar: 'И', role: 'user', isBot: 0, createdAt: nowIso(29 * 24 * 60) },
        { id: 'maria', username: 'maria', name: 'Мария', avatar: 'М', role: 'user', isBot: 0, createdAt: nowIso(28 * 24 * 60) },
        { id: 'alex', username: 'alex', name: 'Алекс', avatar: 'А', role: 'user', isBot: 0, createdAt: nowIso(27 * 24 * 60) },
        { id: 'hermes', username: 'hermes', name: 'HermesBot', avatar: 'H', role: 'bot', isBot: 1, createdAt: nowIso(26 * 24 * 60) },
    ];
}

function defaultChats() {
    return [
        { id: 'private-ivan', type: 'private', title: 'Иван', subtitle: 'личный чат', avatar: 'И', botId: null, role: null, members: ['me', 'ivan'] },
        { id: 'group-mdf', type: 'group', title: 'МДФ-цех', subtitle: 'группа · 4 участника', avatar: 'Ц', botId: null, role: null, members: ['me', 'ivan', 'maria', 'alex'] },
        { id: 'channel-news', type: 'channel', title: 'Новости проекта', subtitle: 'канал · вы подписчик', avatar: 'Н', botId: null, role: 'subscriber', members: ['me', 'maria'] },
        { id: 'bot-hermes', type: 'bot', title: 'HermesBot', subtitle: 'AI-бот · backend mock', avatar: 'H', botId: 'hermes', role: null, members: ['me', 'hermes'] },
    ];
}

function defaultMessages() {
    return {
        'private-ivan': [
            { senderId: 'ivan', text: 'Привет! Как тебе новый мессенджер?', createdAt: nowIso(40), system: 0 },
            { senderId: 'me', text: 'Сделали backend-каркас: API, SQLite-хранилище и HermesBot-прокси.', createdAt: nowIso(35), system: 0 },
        ],
        'group-mdf': [
            { senderId: 'maria', text: 'Кто сегодня смотрит заказы по МДФ?', createdAt: nowIso(80), system: 0 },
            { senderId: 'alex', text: 'Я уже начал. В этом чате потом можно подключить настоящего Hermes.', createdAt: nowIso(75), system: 0 },
        ],
        'channel-news': [
            { senderId: 'maria', text: 'План: mock-MVP → backend → SQLite → WebSocket/SSE → Hermes-прокси → APK.', createdAt: nowIso(120), system: 1 },
        ],
        'bot-hermes': [
            { senderId: 'hermes', text: 'Привет! Я HermesBot. Backend уже умеет принимать запросы, но Hermes пока в mock-режиме: без токенов и без внешних вызовов. Введи /help.', createdAt: nowIso(10), system: 0 },
        ],
    };
}

function defaultDb() {
    return {
        version: 2,
        users: defaultUsers(),
        chats: defaultChats(),
        messages: defaultMessages(),
    };
}

function createSchema(database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL,
            role TEXT NOT NULL,
            is_bot INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL,
            avatar TEXT NOT NULL,
            bot_id TEXT NULL,
            role TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_members (
            chat_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            PRIMARY KEY (chat_id, user_id),
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            text TEXT NOT NULL,
            system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat_created
            ON messages(chat_id, created_at);
    `);
}

function loadJsonDb() {
    if (!fs.existsSync(JSON_DB_PATH)) return null;
    try {
        return JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf8'));
    } catch (error) {
        return null;
    }
}

function userExists(database, id) {
    return database.prepare('SELECT 1 FROM users WHERE id = ?').get(id) !== undefined;
}

function chatExists(database, id) {
    return database.prepare('SELECT 1 FROM chats WHERE id = ?').get(id) !== undefined;
}

function messageExists(database, id) {
    return database.prepare('SELECT 1 FROM messages WHERE id = ?').get(id) !== undefined;
}

function insertUser(database, user) {
    database.prepare(`
        INSERT OR IGNORE INTO users (id, username, name, avatar, role, is_bot, created_at)
        VALUES (@id, @username, @name, @avatar, @role, @isBot, @createdAt)
    `).run({
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        role: user.role || 'user',
        isBot: user.isBot ? 1 : 0,
        createdAt: user.createdAt,
    });
}

function insertChat(database, chat) {
    database.prepare(`
        INSERT OR IGNORE INTO chats (id, type, title, subtitle, avatar, bot_id, role)
        VALUES (@id, @type, @title, @subtitle, @avatar, @botId, @role)
    `).run({
        id: chat.id,
        type: chat.type,
        title: chat.title,
        subtitle: chat.subtitle,
        avatar: chat.avatar,
        botId: chat.botId || null,
        role: chat.role || null,
    });

    const insertMember = database.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)');
    for (const memberId of chat.members || []) {
        insertMember.run(chat.id, memberId);
    }
}

function insertMessage(database, chatId, message) {
    if (messageExists(database, message.id)) return;
    database.prepare(`
        INSERT OR IGNORE INTO messages (id, chat_id, sender_id, text, system, created_at)
        VALUES (@id, @chatId, @senderId, @text, @system, @createdAt)
    `).run({
        id: message.id,
        chatId,
        senderId: message.senderId,
        text: message.text,
        system: message.system ? 1 : 0,
        createdAt: message.createdAt,
    });
}

function seedFromJson(database, jsonDb) {
    for (const user of jsonDb.users || []) insertUser(database, user);
    for (const chat of jsonDb.chats || []) insertChat(database, chat);
    for (const [chatId, messages] of Object.entries(jsonDb.messages || {})) {
        for (const message of messages || []) insertMessage(database, chatId, message);
    }
}

function seedDefaults(database) {
    const jsonDb = defaultDb();
    seedFromJson(database, jsonDb);
}

function hasAnyUsers(database) {
    return database.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0;
}

function initDatabase() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const db = new DatabaseSync(DB_PATH);
    database = db;
    createSchema(db);

    if (!hasAnyUsers(db)) {
        const jsonDb = loadJsonDb();
        seedFromJson(db, jsonDb || defaultDb());
    }

    return {
        path: DB_PATH,
        sqlitePath: DB_PATH,
        storage: 'sqlite',
        database,
    };
}

function getUserById(id) {
    const row = database.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? normalizeUser(row) : null;
}

function getUserByUsername(username) {
    const row = database.prepare('SELECT * FROM users WHERE username = ?').get(username);
    return row ? normalizeUser(row) : null;
}

function normalizeUser(row) {
    return {
        id: row.id,
        username: row.username,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        isBot: Boolean(row.is_bot),
        createdAt: row.created_at,
    };
}

function getChatsForUser(userId) {
    const rows = database.prepare(`
        SELECT c.*
        FROM chats c
        JOIN chat_members cm ON cm.chat_id = c.id
        WHERE cm.user_id = ?
        ORDER BY c.id
    `).all(userId);

    return rows.map((row) => normalizeChat(row));
}

function getChat(chatId) {
    const row = database.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    return row ? normalizeChat(row) : null;
}

function normalizeChat(row) {
    const members = database
        .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? ORDER BY user_id')
        .all(row.id)
        .map((member) => member.user_id);

    return {
        id: row.id,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        avatar: row.avatar,
        botId: row.bot_id,
        role: row.role,
        members,
    };
}

function getMessages(chatId) {
    const rows = database.prepare(`
        SELECT id, chat_id AS chatId, sender_id AS senderId, text, system, created_at AS createdAt
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(chatId);

    return rows.map((row) => ({
        id: row.id,
        chatId: row.chatId,
        senderId: row.senderId,
        text: row.text,
        system: Boolean(row.system),
        createdAt: row.createdAt,
    }));
}

function addMessage(chatId, senderId, text, extra = {}) {
    const message = {
        id: cryptoRandomId(),
        chatId,
        senderId,
        text,
        system: extra.system ? 1 : 0,
        createdAt: new Date().toISOString(),
    };

    database.prepare(`
        INSERT INTO messages (id, chat_id, sender_id, text, system, created_at)
        VALUES (@id, @chatId, @senderId, @text, @system, @createdAt)
    `).run(message);

    return {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        text: message.text,
        system: Boolean(message.system),
        createdAt: message.createdAt,
    };
}

function cryptoRandomId() {
    const crypto = require('crypto');
    if (crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

module.exports = {
    initDatabase,
    getUserById,
    getUserByUsername,
    getChatsForUser,
    getChat,
    getMessages,
    addMessage,
};
