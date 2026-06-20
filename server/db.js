const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
        { id: 'me', username: 'mikhail', name: 'Михаил', avatar: 'М', role: 'admin', isBot: 0, approved: 1, approvedBy: null, approvedAt: null, createdAt: nowIso(30 * 24 * 60), phone: null },
        { id: 'ivan', username: 'ivan', name: 'Иван', avatar: 'И', role: 'user', isBot: 0, approved: 1, approvedBy: null, approvedAt: null, createdAt: nowIso(29 * 24 * 60), phone: null },
        { id: 'maria', username: 'maria', name: 'Мария', avatar: 'М', role: 'user', isBot: 0, approved: 1, approvedBy: null, approvedAt: null, createdAt: nowIso(28 * 24 * 60), phone: null },
        { id: 'alex', username: 'alex', name: 'Алекс', avatar: 'А', role: 'user', isBot: 0, approved: 1, approvedBy: null, approvedAt: null, createdAt: nowIso(27 * 24 * 60), phone: null },
        { id: 'hermes', username: 'hermes', name: 'HermesBot', avatar: 'H', role: 'bot', isBot: 1, approved: 1, approvedBy: null, approvedAt: null, createdAt: nowIso(26 * 24 * 60), phone: null },
    ];
}

function defaultChats() {
    return [
        { id: 'private-ivan', type: 'private', title: 'Иван', subtitle: 'личный чат', avatar: 'И', botId: null, role: null, members: ['me', 'ivan'] },
        { id: 'group-mdf', type: 'group', title: 'МДФ-цех', subtitle: 'группа · 4 участника', avatar: 'Ц', botId: null, role: null, members: ['me', 'ivan', 'maria', 'alex'] },
        { id: 'channel-news', type: 'channel', title: 'Новости проекта', subtitle: 'канал · вы подписчик', avatar: 'Н', botId: null, role: 'subscriber', members: ['me', 'maria'] },
        { id: 'bot-hermes', type: 'bot', title: 'HermesBot', subtitle: 'AI-бот · backend Hermes API', avatar: 'H', botId: 'hermes', role: null, members: ['me', 'hermes'] },
    ];
}

function defaultBots() {
    return [
        {
            id: 'hermes',
            name: 'HermesBot',
            type: 'hermes',
            enabled: 1,
            configJson: JSON.stringify({ model: process.env.HERMES_API_MODEL || 'hermes-agent' }),
            createdAt: nowIso(25 * 24 * 60),
        },
    ];
}

function defaultMessages() {
    return {
        'private-ivan': [
            { id: cryptoRandomId(), senderId: 'ivan', text: 'Привет! Как тебе новый мессенджер?', createdAt: nowIso(40), system: 0 },
            { id: cryptoRandomId(), senderId: 'me', text: 'Сделали backend-каркас: API, SQLite-хранилище и HermesBot-прокси.', createdAt: nowIso(35), system: 0 },
        ],
        'group-mdf': [
            { id: cryptoRandomId(), senderId: 'maria', text: 'Кто сегодня смотрит заказы по МДФ?', createdAt: nowIso(80), system: 0 },
            { id: cryptoRandomId(), senderId: 'alex', text: 'Я уже начал. В этом чате потом можно подключить настоящего Hermes.', createdAt: nowIso(75), system: 0 },
        ],
        'channel-news': [
            { id: cryptoRandomId(), senderId: 'maria', text: 'План: mock-MVP → backend → WebSocket/SSE → Hermes-прокси → APK.', createdAt: nowIso(120), system: 1 },
        ],
        'bot-hermes': [
            { id: cryptoRandomId(), senderId: 'hermes', text: 'Привет! Я HermesBot. Backend Hermes API включён: токены Hermes остаются только на сервере. Введи /help.', createdAt: nowIso(10), system: 1 },
        ],
    };
}

function defaultDb() {
    return {
        version: 4,
        users: defaultUsers(),
        chats: defaultChats(),
        bots: defaultBots(),
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
            password_hash TEXT NULL,
            phone TEXT NULL,
            approved INTEGER NOT NULL DEFAULT 0,
            approved_by TEXT NULL,
            approved_at TEXT NULL,
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
            attachment TEXT NULL,
            system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            config_json TEXT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bot_messages (
            id TEXT PRIMARY KEY,
            bot_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            chat_id TEXT NULL,
            text TEXT NOT NULL,
            response_text TEXT NULL,
            status TEXT NOT NULL DEFAULT 'sent',
            error TEXT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat_created
            ON messages(chat_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_bot_messages_bot_created
            ON bot_messages(bot_id, created_at);
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
        INSERT OR IGNORE INTO users (id, username, name, avatar, role, is_bot, password_hash, phone, approved, approved_by, approved_at, created_at)
        VALUES (@id, @username, @name, @avatar, @role, @isBot, @passwordHash, @phone, @approved, @approvedBy, @approvedAt, @createdAt)
    `).run({
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        role: user.role || 'user',
        isBot: user.isBot ? 1 : 0,
        passwordHash: user.passwordHash || null,
        phone: user.phone || null,
        approved: user.approved === undefined ? 1 : user.approved ? 1 : 0,
        approvedBy: user.approvedBy || null,
        approvedAt: user.approvedAt || null,
        createdAt: user.createdAt,
    });
}

function migratePasswordHashColumn(database) {
    try {
        database.exec('ALTER TABLE users ADD COLUMN password_hash TEXT NULL');
    } catch (error) {
        if (!String(error.message || '').toLowerCase().includes('duplicate column')) {
            throw error;
        }
    }
}

function migrateApprovalColumns(database) {
    try {
        database.exec(`
            ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE users ADD COLUMN approved_by TEXT NULL;
            ALTER TABLE users ADD COLUMN approved_at TEXT NULL;
            UPDATE users SET approved = 1;
        `);
    } catch (error) {
        const message = String(error.message || '');
        if (!message.toLowerCase().includes('duplicate column')) {
            throw error;
        }
    }
    database.exec('UPDATE users SET approved = 1');
}

function migratePhoneColumn(database) {
    try {
        database.exec('ALTER TABLE users ADD COLUMN phone TEXT NULL');
    } catch (error) {
        if (!String(error.message || '').toLowerCase().includes('duplicate column')) {
            throw error;
        }
    }
}

function migrateAttachmentColumn(database) {
    try {
        database.exec('ALTER TABLE messages ADD COLUMN attachment TEXT NULL');
    } catch (error) {
        const message = String(error.message || '');
        if (!message.toLowerCase().includes('duplicate column')) {
            throw error;
        }
    }
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex');
    return `pbkdf2-sha256:210000:${salt}:${hash}`;
}

function verifyPassword(user, password) {
    if (!user || !user.passwordHash || !password) return false;

    const [algo, iterationsText, salt, expectedHash] = user.passwordHash.split(':');
    if (algo !== 'pbkdf2-sha256') return false;

    const iterations = Number(iterationsText);
    const actualHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(actualHash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createUser(username, password, displayName = '', options = {}) {
    const name = displayName.trim() || username;
    const phone = String(options.phone || '').trim() || null;
    const avatar = (name.trim().slice(0, 1).toUpperCase() || 'U').slice(0, 1);
    const user = {
        id: `user-${cryptoRandomId()}`,
        username,
        name,
        avatar,
        role: options.role || 'user',
        isBot: Boolean(options.isBot),
        approved: options.approved === undefined ? 1 : options.approved ? 1 : 0,
        phone,
        approvedBy: options.approvedBy || null,
        approvedAt: options.approved ? options.approvedAt || nowIso() : null,
        passwordHash: hashPassword(password),
        createdAt: nowIso(),
    };

    database.prepare(`
        INSERT INTO users (id, username, name, avatar, role, is_bot, password_hash, phone, approved, approved_by, approved_at, created_at)
        VALUES (@id, @username, @name, @avatar, @role, @isBot, @passwordHash, @phone, @approved, @approvedBy, @approvedAt, @createdAt)
    `).run({
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        isBot: user.isBot ? 1 : 0,
        passwordHash: user.passwordHash,
        phone: user.phone,
        approved: user.approved,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
        createdAt: user.createdAt,
    });

    if (user.role === 'admin' || user.approved) {
        ensureOnboardingChats(user.id, { includeBot: user.role === 'admin' });
    }
    return getUserById(user.id);
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

function ensureOnboardingChats(userId, options = {}) {
    const includeBot = Boolean(options.includeBot);
    const chatIds = includeBot ? ['bot-hermes', 'group-mdf', 'channel-news'] : ['group-mdf', 'channel-news'];
    const addMember = database.prepare(`
        INSERT INTO chat_members (chat_id, user_id)
        VALUES (?, ?)
        ON CONFLICT(chat_id, user_id) DO NOTHING
    `);

    for (const chatId of chatIds) {
        if (!chatExists(database, chatId)) continue;
        addMember.run(chatId, userId);
    }
}

function insertMessage(database, chatId, message) {
    const messageId = message.id || crypto.randomUUID();
    if (messageExists(database, messageId)) return;
    database.prepare(`
        INSERT OR IGNORE INTO messages (id, chat_id, sender_id, text, attachment, system, created_at)
        VALUES (@id, @chatId, @senderId, @text, @attachment, @system, @createdAt)
    `).run({
        id: messageId,
        chatId,
        senderId: message.senderId,
        text: message.text,
        attachment: message.attachment ? JSON.stringify(message.attachment) : null,
        system: message.system ? 1 : 0,
        createdAt: message.createdAt,
    });
}

function seedFromJson(database, jsonDb) {
    for (const user of jsonDb.users || []) insertUser(database, user);
    for (const chat of jsonDb.chats || []) insertChat(database, chat);
    for (const bot of jsonDb.bots || []) insertBot(database, bot);
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
    migratePasswordHashColumn(db);
    migrateApprovalColumns(db);
    migratePhoneColumn(db);
    migrateAttachmentColumn(db);

    if (!hasAnyUsers(db)) {
        const jsonDb = loadJsonDb();
        seedFromJson(db, jsonDb || defaultDb());
    }

    seedDefaultBots(db);
    normalizeUserRights(db);

    return {
        path: DB_PATH,
        sqlitePath: DB_PATH,
        storage: 'sqlite',
        database,
    };
}

function normalizeUserRights(database) {
    const adminUsername = process.env.ADMIN_USERNAME || 'mikhail';
    const admin = database.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
    if (admin) {
        database.prepare('UPDATE users SET role = ?, approved = 1, approved_by = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?')
            .run('admin', admin.id, nowIso(), admin.id);
        if (process.env.ADMIN_PASSWORD) {
            database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(process.env.ADMIN_PASSWORD), admin.id);
        }
    } else {
        const firstHuman = database.prepare('SELECT id FROM users WHERE is_bot = 0 ORDER BY created_at ASC LIMIT 1').get();
        if (firstHuman) {
            database.prepare('UPDATE users SET role = ?, approved = 1, approved_by = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?')
                .run('admin', firstHuman.id, nowIso(), firstHuman.id);
        }
    }

    database.prepare(`
        UPDATE users
        SET approved = 1, approved_by = 'system', approved_at = COALESCE(approved_at, ?)
        WHERE username IN ('ivan', 'maria', 'alex')
    `).run(nowIso());

    const removeBot = database.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id IN (SELECT id FROM users WHERE role <> ?)');
    removeBot.run('bot-hermes', 'admin');

    const removeUnapproved = database.prepare(`
        DELETE FROM chat_members
        WHERE user_id IN (SELECT id FROM users WHERE approved = 0 AND role <> 'admin')
    `);
    removeUnapproved.run();

    const approvedUsers = database.prepare('SELECT id, role FROM users WHERE approved = 1 ORDER BY id').all();
    for (const user of approvedUsers) {
        ensureOnboardingChats(user.id, { includeBot: user.role === 'admin' });
    }
}

function getAllUsers() {
    const rows = database.prepare(`
        SELECT id, username, name, avatar, role, is_bot, approved, approved_by AS approvedBy, approved_at AS approvedAt, created_at AS createdAt
        FROM users
        WHERE is_bot = 0
          AND username NOT IN ('ivan', 'maria', 'alex')
        ORDER BY approved ASC, role DESC, created_at DESC
    `).all();

    return rows.map((row) => ({
        id: row.id,
        username: row.username,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        isBot: Boolean(row.is_bot),
        approved: Boolean(row.approved),
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        createdAt: row.createdAt,
    }));
}

function hasAnyBots(database) {
    return database.prepare('SELECT COUNT(*) AS count FROM bots').get().count > 0;
}

function insertBot(database, bot) {
    database.prepare(`
        INSERT OR IGNORE INTO bots (id, name, type, enabled, config_json, created_at)
        VALUES (@id, @name, @type, @enabled, @configJson, @createdAt)
    `).run({
        id: bot.id,
        name: bot.name,
        type: bot.type,
        enabled: bot.enabled === undefined ? 1 : bot.enabled ? 1 : 0,
        configJson: bot.configJson || bot.config_json || JSON.stringify(bot.config || {}),
        createdAt: bot.createdAt || nowIso(),
    });
}

function seedDefaultBots(database) {
    if (!hasAnyBots(database)) {
        for (const bot of defaultBots()) insertBot(database, bot);
    }
}

function getBots() {
    const rows = database.prepare(`
        SELECT id, name, type, enabled, config_json AS configJson, created_at AS createdAt
        FROM bots
        ORDER BY name ASC
    `).all();

    return rows.map(normalizeBot);
}

function getBot(botId) {
    const row = database.prepare(`
        SELECT id, name, type, enabled, config_json AS configJson, created_at AS createdAt
        FROM bots
        WHERE id = ?
    `).get(botId);

    return row ? normalizeBot(row) : null;
}

function normalizeBot(row) {
    let config = {};
    try {
        config = row.configJson ? JSON.parse(row.configJson) : {};
    } catch (error) {
        config = { raw: row.configJson };
    }

    return {
        id: row.id,
        name: row.name,
        type: row.type,
        enabled: Boolean(row.enabled),
        config,
        hasConfig: Boolean(row.configJson),
        createdAt: row.createdAt,
    };
}

function addBotMessage(botId, userId, text, extra = {}) {
    const message = {
        id: cryptoRandomId(),
        botId,
        userId,
        chatId: extra.chatId || null,
        text,
        responseText: extra.responseText || null,
        status: extra.status || 'sent',
        error: extra.error || null,
        createdAt: extra.createdAt || new Date().toISOString(),
    };

    database.prepare(`
        INSERT INTO bot_messages (id, bot_id, user_id, chat_id, text, response_text, status, error, created_at)
        VALUES (@id, @botId, @userId, @chatId, @text, @responseText, @status, @error, @createdAt)
    `).run({
        id: message.id,
        botId: message.botId,
        userId: message.userId,
        chatId: message.chatId,
        text: message.text,
        responseText: message.responseText,
        status: message.status,
        error: message.error,
        createdAt: message.createdAt,
    });

    return {
        id: message.id,
        botId: message.botId,
        userId: message.userId,
        chatId: message.chatId,
        text: message.text,
        responseText: message.responseText,
        status: message.status,
        error: message.error,
        createdAt: message.createdAt,
    };
}

function getBotMessages(botId, userId = null) {
    const params = [botId];
    let sql = `
        SELECT id, bot_id AS botId, user_id AS userId, chat_id AS chatId, text, response_text AS responseText, status, error, created_at AS createdAt
        FROM bot_messages
        WHERE bot_id = ?
    `;

    if (userId) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    sql += ' ORDER BY created_at ASC, id ASC';

    return database.prepare(sql).all(...params).map((row) => ({
        id: row.id,
        botId: row.botId,
        userId: row.userId,
        chatId: row.chatId,
        text: row.text,
        responseText: row.responseText,
        status: row.status,
        error: row.error,
        createdAt: row.createdAt,
    }));
}

function updateUserApproval(userId, approvedBy, approved = true) {
    const user = getUserById(userId);
    if (!user || user.isBot) return null;
    if (approved) {
        ensureOnboardingChats(user.id, { includeBot: false });
    }

    database.prepare(`
        UPDATE users
        SET approved = ?, approved_by = ?, approved_at = ?
        WHERE id = ?
    `).run(approved ? 1 : 0, approvedBy, approved ? nowIso() : null, userId);

    if (!approved) {
        database.prepare(`
            DELETE FROM chat_members
            WHERE user_id = ? AND chat_id IN ('bot-hermes', 'group-mdf', 'channel-news')
        `).run(userId);
    }

    return getUserById(userId);
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
        approved: Boolean(row.approved),
        approvedBy: row.approved_by || null,
        approvedAt: row.approved_at || null,
        phone: row.phone || null,
        passwordHash: row.password_hash || null,
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

function searchUsers(query) {
    const term = `%${String(query || '').trim().slice(0, 80)}%`;
    if (!term || term === '%%') return [];
    const rows = database.prepare(`
        SELECT id, username, name, avatar, role, is_bot, approved, approved_by AS approvedBy, approved_at AS approvedAt, phone, created_at AS createdAt
        FROM users
        WHERE is_bot = 0
          AND approved = 1
          AND (
              username LIKE ?
              OR name LIKE ?
              OR COALESCE(phone, '') LIKE ?
          )
        ORDER BY username ASC
        LIMIT 20
    `).all(term, term, term);

    return rows.map((row) => ({
        id: row.id,
        username: row.username,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        isBot: Boolean(row.is_bot),
        approved: Boolean(row.approved),
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        phone: row.phone || null,
        createdAt: row.createdAt,
    }));
}

function getExistingPrivateChat(userId, otherUserId) {
    return database.prepare(`
        SELECT c.*
        FROM chats c
        JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
        JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
        WHERE c.type = 'private'
        ORDER BY c.created_at ASC
        LIMIT 1
    `).get(userId, otherUserId);
}

function createPrivateChat(userId, otherUserId) {
    if (userId === otherUserId) return null;
    const existing = getExistingPrivateChat(userId, otherUserId);
    if (existing) return normalizeChat(existing);

    const other = getUserById(otherUserId);
    if (!other || other.isBot) return null;

    const chat = {
        id: `private-${[userId, otherUserId].sort().join('-')}`,
        type: 'private',
        title: other.name,
        subtitle: 'личный чат',
        avatar: other.avatar,
        botId: null,
        role: null,
        members: [userId, otherUserId],
    };
    insertChat(database, chat);
    return getChat(chat.id);
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
        SELECT id, chat_id AS chatId, sender_id AS senderId, text, attachment, system, created_at AS createdAt
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(chatId);

    return rows.map((row) => ({
        id: row.id,
        chatId: row.chatId,
        senderId: row.senderId,
        text: row.text,
        attachment: row.attachment ? JSON.parse(row.attachment) : null,
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
        attachment: extra.attachment || null,
        system: extra.system ? 1 : 0,
        createdAt: new Date().toISOString(),
    };

    database.prepare(`
        INSERT INTO messages (id, chat_id, sender_id, text, attachment, system, created_at)
        VALUES (@id, @chatId, @senderId, @text, @attachment, @system, @createdAt)
    `).run({
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        text: message.text,
        attachment: message.attachment ? JSON.stringify(message.attachment) : null,
        system: message.system,
        createdAt: message.createdAt,
    });

    return {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        text: message.text,
        attachment: message.attachment,
        system: Boolean(message.system),
        createdAt: message.createdAt,
    };
}

function getMessageById(messageId) {
    const row = database.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    return row ? {
        id: row.id,
        chatId: row.chat_id,
        senderId: row.sender_id,
        text: row.text,
        attachment: row.attachment ? JSON.parse(row.attachment) : null,
        system: Boolean(row.system),
        createdAt: row.created_at,
    } : null;
}

function getMessageByAttachmentId(attachmentId) {
    const row = database.prepare(`
        SELECT *
        FROM messages
        WHERE attachment LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(`%"id":"${attachmentId}"%`);
    return row ? {
        id: row.id,
        chatId: row.chat_id,
        senderId: row.sender_id,
        text: row.text,
        attachment: row.attachment ? JSON.parse(row.attachment) : null,
        system: Boolean(row.system),
        createdAt: row.created_at,
    } : null;
}

function deleteMessagesByChat(chatId) {
    return database.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
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
    createUser,
    verifyPassword,
    getChatsForUser,
    getChat,
    searchUsers,
    createPrivateChat,
    getMessages,
    addMessage,
    getMessageById,
    getMessageByAttachmentId,
    deleteMessagesByChat,
    getAllUsers,
    updateUserApproval,
    getBots,
    getBot,
    addBotMessage,
    getBotMessages,
};
