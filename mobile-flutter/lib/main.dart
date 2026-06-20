import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const HermesMessengerFlutterApp());
}

class HermesMessengerFlutterApp extends StatelessWidget {
  const HermesMessengerFlutterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hermes Messenger',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  AppSession? _session;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    final session = await ApiClient.loadSession();
    if (!mounted) return;
    setState(() {
      _session = session;
      _loading = false;
    });
  }

  void _onLoggedOut() {
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_session == null) {
      return AuthScreen(onSession: (session) => setState(() => _session = session));
    }

    return HomeScreen(
      session: _session!,
      onLoggedOut: _onLoggedOut,
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.onSession});

  final void Function(AppSession session) onSession;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _baseUrlController = TextEditingController(text: ApiClient.defaultBaseUrl);
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController(text: 'Михаил');
  bool _register = false;
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final baseUrl = _baseUrlController.text.trim();
    final username = _usernameController.text.trim().toLowerCase();
    final password = _passwordController.text;
    final name = _nameController.text.trim();

    if (baseUrl.isEmpty || username.isEmpty || password.length < 4) {
      setState(() => _error = 'Проверь backend URL, логин и пароль.');
      return;
    }
    if (_register && name.isEmpty) {
      setState(() => _error = 'Введите имя.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final api = ApiClient(baseUrl);
      final result = _register
          ? await api.register(username: username, password: password, name: name)
          : await api.login(username: username, password: password);

      await ApiClient.saveSession(AppSession(
        baseUrl: baseUrl,
        token: result.token,
        user: result.user,
        pendingApproval: result.pendingApproval,
      ));

      widget.onSession(AppSession(
        baseUrl: baseUrl,
        token: result.token,
        user: result.user,
        pendingApproval: result.pendingApproval,
      ));
    } catch (error) {
      setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hermes Messenger')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Вход')),
                  ButtonSegment(value: true, label: Text('Регистрация')),
                ],
                selected: {_register},
                onSelectionChanged: (value) => setState(() => _register = value.first),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _baseUrlController,
                decoration: const InputDecoration(
                  labelText: 'Backend URL',
                  hintText: 'http://10.0.2.2:3000',
                  prefixIcon: Icon(Icons.link),
                ),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _usernameController,
                decoration: const InputDecoration(labelText: 'Логин', prefixIcon: Icon(Icons.person)),
                textInputAction: TextInputAction.next,
              ),
              if (_register) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Имя', prefixIcon: Icon(Icons.badge)),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Пароль', prefixIcon: Icon(Icons.lock)),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
                label: Text(_busy ? 'Загрузка…' : (_register ? 'Создать аккаунт' : 'Войти')),
              ),
              const SizedBox(height: 12),
              Text(
                'Для Android emulator используй http://10.0.2.2:3000. Для телефона — IP компьютера в той же Wi‑Fi сети.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.session, required this.onLoggedOut});

  final AppSession session;
  final VoidCallback onLoggedOut;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final ApiClient _api;
  int _page = 0;
  User? _user;
  List<Bot> _bots = const [];
  String? _selectedBotId;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = ApiClient(widget.session.baseUrl, token: widget.session.token);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final user = await _api.me();
      final bots = await _api.getBots();
      final prefs = await SharedPreferences.getInstance();
      final selected = prefs.getString('selected_bot_id') ?? bots.firstWhereOrNull((bot) => bot.canUse)?.id;
      setState(() {
        _user = user;
        _bots = bots;
        _selectedBotId = selected;
        _loading = false;
      });
    } catch (error) {
      setState(() {
        _error = _message(error);
        _loading = false;
      });
    }
  }

  void _selectBot(String botId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('selected_bot_id', botId);
    setState(() => _selectedBotId = botId);
  }

  void _botCreated() {
    _load();
    setState(() => _page = 1);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_user?.pendingApproval == true) {
      return PendingApprovalScreen(user: _user!, onLoggedOut: widget.onLoggedOut);
    }

    final selectedBot = _bots.firstWhereOrNull((bot) => bot.id == _selectedBotId) ?? _bots.firstWhereOrNull((bot) => bot.canUse);

    return Scaffold(
      body: IndexedStack(
        index: _page,
        children: [
          BotsScreen(
            api: _api,
            bots: _bots,
            isAdmin: _user?.role == 'admin',
            selectedBotId: _selectedBotId,
            onSelected: _selectBot,
            onCreated: _botCreated,
            onRefresh: _load,
          ),
          selectedBot == null
              ? const EmptyState('Ботов пока нет')
              : BotChatScreen(api: _api, bot: selectedBot),
          SettingsScreen(
            api: _api,
            session: widget.session,
            user: _user,
            error: _error,
            onRetry: _load,
            onLoggedOut: widget.onLoggedOut,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _page,
        onDestinationSelected: (value) => setState(() => _page = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy), label: 'Боты'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Чат'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Настройки'),
        ],
      ),
    );
  }
}

class PendingApprovalScreen extends StatelessWidget {
  const PendingApprovalScreen({super.key, required this.user, required this.onLoggedOut});

  final User user;
  final VoidCallback onLoggedOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ожидание доступа')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.hourglass_empty, size: 64, color: Colors.orange),
              const SizedBox(height: 16),
              Text(
                'Аккаунт @${user.username} создан. Администратор ещё не выдал доступ.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(onPressed: onLoggedOut, icon: const Icon(Icons.logout), label: const Text('Выйти')),
            ],
          ),
        ),
      ),
    );
  }
}

class BotsScreen extends StatefulWidget {
  const BotsScreen({
    super.key,
    required this.api,
    required this.bots,
    required this.isAdmin,
    required this.selectedBotId,
    required this.onSelected,
    required this.onCreated,
    required this.onRefresh,
  });

  final ApiClient api;
  final List<Bot> bots;
  final bool isAdmin;
  final String? selectedBotId;
  final void Function(String botId) onSelected;
  final VoidCallback onCreated;
  final VoidCallback onRefresh;

  @override
  State<BotsScreen> createState() => _BotsScreenState();
}

class _BotsScreenState extends State<BotsScreen> {
  bool _busy = false;

  Future<void> _createBot() async {
    final idController = TextEditingController();
    final nameController = TextEditingController();
    final typeController = TextEditingController(text: 'echo');
    final webhookController = TextEditingController();
    final result = await showDialog<Map<String, String?>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Добавить бота'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: idController, decoration: const InputDecoration(labelText: 'ID', hintText: 'telegram_bot')),
              const SizedBox(height: 12),
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Название', hintText: 'TelegramBot')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: typeController.text,
                decoration: const InputDecoration(labelText: 'Тип'),
                items: const [
                  DropdownMenuItem(value: 'echo', child: Text('Echo demo')),
                  DropdownMenuItem(value: 'http', child: Text('HTTP webhook')),
                  DropdownMenuItem(value: 'hermes', child: Text('HermesBot')),
                ],
                onChanged: (value) => typeController.text = value ?? 'echo',
              ),
              const SizedBox(height: 12),
              TextField(controller: webhookController, decoration: const InputDecoration(labelText: 'Webhook URL', hintText: 'https://...')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          FilledButton(
            onPressed: () {
              Navigator.pop(context, {
                'id': idController.text.trim(),
                'name': nameController.text.trim(),
                'type': typeController.text,
                'webhookUrl': webhookController.text.trim(),
              });
            },
            child: const Text('Создать'),
          ),
        ],
      ),
    );

    if (result == null) return;
    setState(() => _busy = true);

    try {
      final config = <String, dynamic>{};
      if (result['webhookUrl']?.isNotEmpty == true) config['webhookUrl'] = result['webhookUrl'];
      await widget.api.createBot(
        id: result['id']!,
        name: result['name']!,
        type: result['type']!,
        config: config,
      );
      widget.onCreated();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_message(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Боты'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: widget.onRefresh,
          ),
        ],
      ),
      body: widget.bots.isEmpty
          ? const EmptyState('Боты пока не добавлены')
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: widget.bots.length,
              itemBuilder: (context, index) {
                final bot = widget.bots[index];
                final selected = bot.id == widget.selectedBotId;
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    selected: selected,
                    leading: CircleAvatar(child: Text(bot.name.isEmpty ? '?' : bot.name[0].toUpperCase())),
                    title: Text(bot.name),
                    subtitle: Text('${bot.type} · ${bot.canUse ? 'доступен' : 'только админ'}'),
                    isThreeLine: true,
                    trailing: selected ? const Icon(Icons.check_circle, color: Colors.green) : null,
                    onTap: () {
                      if (bot.canUse) widget.onSelected(bot.id);
                    },
                  ),
                );
              },
            ),
      floatingActionButton: widget.isAdmin
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _createBot,
              icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.add),
              label: const Text('Бот'),
            )
          : null,
    );
  }
}

class BotChatScreen extends StatefulWidget {
  const BotChatScreen({super.key, required this.api, required this.bot});

  final ApiClient api;
  final Bot bot;

  @override
  State<BotChatScreen> createState() => _BotChatScreenState();
}

class _BotChatScreenState extends State<BotChatScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final List<BotMessage> _messages = [];
  StreamSubscription<void>? _subscription;
  Timer? _timer;
  bool _busy = false;
  String? _error;

  Bot get bot => widget.bot;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _connectStream();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _loadMessages());
  }

  @override
  void didUpdateWidget(covariant BotChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.bot.id != bot.id) {
      _messages.clear();
      _loadMessages();
      _connectStream();
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _timer?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    try {
      final messages = await widget.api.getBotMessages(bot.id);
      if (!mounted) return;
      setState(() => _messages
        ..clear()
        ..addAll(messages));
      _scrollToBottom();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _message(error));
    }
  }

  void _connectStream() {
    _subscription?.cancel();
    _subscription = widget.api.streamBotEvents(bot.id).listen(
      (message) {
        if (!mounted) return;
        setState(() {
          final exists = _messages.any((item) => item.id == message.id);
          if (!exists) _messages.add(message);
        });
        _scrollToBottom();
      },
      onError: (error) => setState(() => _error = 'Realtime: ${_message(error)}'),
      onDone: () {
        _subscription = null;
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) _connectStream();
        });
      },
    );
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final message = await widget.api.sendBotMessage(bot.id, text);
      setState(() {
        final exists = _messages.any((item) => item.id == message.id);
        if (!exists) _messages.add(message);
      });
      _controller.clear();
      _scrollToBottom();
    } catch (error) {
      setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(bot.name),
            Text(bot.canUse ? bot.type : 'нет доступа', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white70)),
          ],
        ),
      ),
      body: Column(
        children: [
          if (!bot.canUse)
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.orange.shade50,
              child: const Text('Этот бот доступен только администратору.'),
            ),
          Expanded(
            child: _messages.isEmpty
                ? const EmptyState('Сообщений пока нет')
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) => _MessageBubble(message: _messages[index]),
                  ),
          ),
          if (_error != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              color: Colors.red.shade50,
              child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: bot.canUse,
                      maxLines: 1,
                      decoration: const InputDecoration(
                        hintText: 'Сообщение боту…',
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _busy || !bot.canUse ? null : _send,
                    child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Отправить'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final BotMessage message;

  @override
  Widget build(BuildContext context) {
    final hasResponse = message.responseText?.isNotEmpty == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: Container(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.blue.shade100,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(14),
                  topRight: Radius.circular(14),
                  bottomLeft: Radius.circular(14),
                ),
              ),
              child: Text(message.text),
            ),
          ),
          if (hasResponse) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.86),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(14),
                    topRight: Radius.circular(14),
                    bottomRight: Radius.circular(14),
                  ),
                ),
                child: Text(message.responseText!),
              ),
            ),
          ],
          if (message.status == 'error') ...[
            const SizedBox(height: 4),
            Text('Ошибка: ${message.error ?? 'unknown'}', style: const TextStyle(color: Colors.red, fontSize: 12)),
          ],
          Text(_formatTime(message.createdAt), style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.api,
    required this.session,
    required this.user,
    required this.error,
    required this.onRetry,
    required this.onLoggedOut,
  });

  final ApiClient api;
  final AppSession session;
  final User? user;
  final String? error;
  final VoidCallback onRetry;
  final VoidCallback onLoggedOut;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.session.baseUrl);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _saveBaseUrl() async {
    final baseUrl = _controller.text.trim();
    if (baseUrl.isEmpty) return;
    await ApiClient.saveBaseUrl(baseUrl);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Backend URL сохранён')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Пользователь', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(widget.user?.name ?? '—'),
                  Text('@${widget.user?.username ?? ''}'),
                  Text(widget.user?.role == 'admin' ? 'Администратор' : 'Пользователь'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Backend URL'),
                  const SizedBox(height: 8),
                  TextField(controller: _controller, decoration: const InputDecoration(hintText: 'http://10.0.2.2:3000')),
                  const SizedBox(height: 12),
                  FilledButton.icon(onPressed: _saveBaseUrl, icon: const Icon(Icons.save), label: const Text('Сохранить URL')),
                ],
              ),
            ),
          ),
          if (widget.error != null) ...[
            const SizedBox(height: 16),
            Text(widget.error!, style: const TextStyle(color: Colors.red)),
            TextButton.icon(onPressed: widget.onRetry, icon: const Icon(Icons.refresh), label: const Text('Обновить')),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: widget.onLoggedOut,
            icon: const Icon(Icons.logout),
            label: const Text('Выйти'),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
      ),
    );
  }
}

class AppSession {
  const AppSession({required this.baseUrl, required this.token, required this.user, required this.pendingApproval});

  final String baseUrl;
  final String token;
  final User user;
  final bool pendingApproval;

  Map<String, dynamic> toJson() => {
        'baseUrl': baseUrl,
        'token': token,
        'pendingApproval': pendingApproval,
        'user': user.toJson(),
      };

  factory AppSession.fromJson(Map<String, dynamic> json) => AppSession(
        baseUrl: json['baseUrl'] as String,
        token: json['token'] as String,
        pendingApproval: json['pendingApproval'] as bool? ?? false,
        user: User.fromJson(json['user'] as Map<String, dynamic>),
      );
}

class User {
  const User({required this.id, required this.username, required this.name, required this.role, required this.approved});

  final String id;
  final String username;
  final String name;
  final String role;
  final bool approved;

  bool get pendingApproval => !approved && role != 'admin';

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        username: json['username'] as String,
        name: json['name'] as String,
        role: json['role'] as String,
        approved: json['approved'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'name': name,
        'role': role,
        'approved': approved,
      };
}

class AuthResult {
  const AuthResult({required this.token, required this.user, required this.pendingApproval});

  final String token;
  final User user;
  final bool pendingApproval;
}

class Bot {
  const Bot({required this.id, required this.name, required this.type, required this.enabled, required this.canUse, required this.createdAt});

  final String id;
  final String name;
  final String type;
  final bool enabled;
  final bool canUse;
  final String createdAt;

  factory Bot.fromJson(Map<String, dynamic> json) => Bot(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        enabled: json['enabled'] as bool? ?? false,
        canUse: json['canUse'] as bool? ?? true,
        createdAt: json['createdAt'] as String? ?? '',
      );
}

class BotMessage {
  const BotMessage({
    required this.id,
    required this.botId,
    required this.userId,
    required this.chatId,
    required this.text,
    this.responseText,
    required this.status,
    this.error,
    required this.createdAt,
  });

  final String id;
  final String botId;
  final String userId;
  final String chatId;
  final String text;
  final String? responseText;
  final String status;
  final String? error;
  final String createdAt;

  factory BotMessage.fromJson(Map<String, dynamic> json) => BotMessage(
        id: json['id'] as String,
        botId: json['botId'] as String,
        userId: json['userId'] as String,
        chatId: json['chatId'] as String? ?? '',
        text: json['text'] as String,
        responseText: json['responseText'] as String?,
        status: json['status'] as String? ?? '',
        error: json['error'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
      );
}

class ApiClient {
  ApiClient(this.baseUrl, {String? token})
      : _client = http.Client(),
        _token = token;

  static const String _baseUrlKey = 'hermes_flutter_base_url';
  static const String _tokenKey = 'hermes_flutter_token';
  static const String _userKey = 'hermes_flutter_user';
  static const String _pendingKey = 'hermes_flutter_pending';

  static String get defaultBaseUrl => 'http://185.244.40.184:3000';

  final http.Client _client;
  final String baseUrl;
  final String? _token;

  String get _base => baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

  static Future<AppSession?> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final baseUrl = prefs.getString(_baseUrlKey) ?? defaultBaseUrl;
    final userJson = prefs.getString(_userKey);
    if (token == null || userJson == null) return null;

    try {
      return AppSession(
        baseUrl: baseUrl,
        token: token,
        pendingApproval: prefs.getBool(_pendingKey) ?? false,
        user: User.fromJson(jsonDecode(userJson) as Map<String, dynamic>),
      );
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  static Future<void> saveSession(AppSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_baseUrlKey, session.baseUrl);
    await prefs.setString(_tokenKey, session.token);
    await prefs.setBool(_pendingKey, session.pendingApproval);
    await prefs.setString(_userKey, jsonEncode(session.user.toJson()));
  }

  static Future<void> saveBaseUrl(String baseUrl) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_baseUrlKey, baseUrl);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_baseUrlKey);
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    await prefs.remove(_pendingKey);
  }

  Future<AuthResult> login({required String username, required String password}) async {
    final json = await _request('POST', '/api/auth/login', body: {'username': username, 'password': password});
    return AuthResult(
      token: json['token'] as String,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      pendingApproval: json['pendingApproval'] as bool? ?? false,
    );
  }

  Future<AuthResult> register({required String username, required String password, required String name}) async {
    final json = await _request('POST', '/api/auth/register', body: {'username': username, 'password': password, 'name': name});
    return AuthResult(
      token: json['token'] as String,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      pendingApproval: json['pendingApproval'] as bool? ?? false,
    );
  }

  Future<User> me() async {
    final json = await _request('GET', '/api/me');
    return User.fromJson(json['user'] as Map<String, dynamic>);
  }

  Future<List<Bot>> getBots() async {
    final json = await _request('GET', '/api/bots');
    return (json['bots'] as List).map((item) => Bot.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<Bot> createBot({required String id, required String name, required String type, Map<String, dynamic> config = const {}}) async {
    final json = await _request('POST', '/api/bots', body: {'id': id, 'name': name, 'type': type, 'config': config});
    return Bot.fromJson(json['bot'] as Map<String, dynamic>);
  }

  Future<List<BotMessage>> getBotMessages(String botId) async {
    final json = await _request('GET', '/api/bots/$botId/messages');
    return (json['messages'] as List).map((item) => BotMessage.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<BotMessage> sendBotMessage(String botId, String text) async {
    final json = await _request('POST', '/api/bots/$botId/messages', body: {'text': text});
    return BotMessage.fromJson(json['message'] as Map<String, dynamic>);
  }

  Stream<BotMessage> streamBotEvents(String botId) async* {
    final uri = Uri.parse('$_base/api/events?chatId=bot-$botId');
    final request = http.Request('GET', uri);
    final token = _token;
    if (token != null && token.isNotEmpty) request.headers['Authorization'] = 'Bearer $token';

    final response = await _client.send(request);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('SSE ${response.statusCode}');
    }

    final lines = response.stream.transform(utf8.decoder).transform(const LineSplitter());
    await for (final line in lines) {
      if (!line.startsWith('data:')) continue;
      final raw = line.substring(5).trim();
      if (raw.isEmpty) continue;
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final type = json['type'];
        if (type != 'bot-message') continue;
        final payload = json['payload'] as Map<String, dynamic>?;
        final messageJson = payload?['message'] as Map<String, dynamic>?;
        if (messageJson != null) yield BotMessage.fromJson(messageJson);
      } catch (_) {
        // Игнорируем битый SSE-фрагмент и продолжаем слушать поток.
      }
    }
  }

  Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final token = _token;
    if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';

    final uri = Uri.parse('$_base$path');
    final request = http.Request(method, uri);
    request.headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);

    final response = await _client.send(request);
    final text = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String error = 'HTTP ${response.statusCode}';
      try {
        final json = jsonDecode(text) as Map<String, dynamic>;
        error = json['error'] as String? ?? error;
      } catch (_) {}
      throw ApiException(error);
    }

    if (text.isEmpty) return <String, dynamic>{};
    return jsonDecode(text) as Map<String, dynamic>;
  }
}

class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

String _message(Object error) => error is ApiException ? error.message : error.toString();

String _formatTime(String value) {
  if (value.isEmpty) return '';
  try {
    final date = DateTime.parse(value).toLocal();
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  } catch (_) {
    return value;
  }
}

extension _FirstWhereOrNull<T> on Iterable<T> {
  T? firstWhereOrNull(bool Function(T item) test) {
    for (final item in this) {
      if (test(item)) return item;
    }
    return null;
  }
}
