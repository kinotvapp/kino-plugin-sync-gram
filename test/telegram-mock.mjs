// A small, in-memory imitation of the Telegram Bot API (https://core.telegram.org/bots/api), enough for the sync plugin's
// tests: getMe, getUpdates (with offset), sendDocument (real multipart/form-data parsing), pinChatMessage,
// unpinChatMessage, deleteMessage, getChat (pinned_message = the most recent pinned message), getFile and the file
// download under /file/bot<token>/<file_path>. Errors are answered the way Telegram answers them:
// { ok: false, error_code, description, parameters? } with the same HTTP status.
//
// It listens on 127.0.0.1 only; the tests carry https://api.telegram.org to it through the kit's fetchImpl.
import { createServer } from "node:http";

const TOKEN_SHAPE = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;

/**
 * [token]: the bot's token (`<botId>:<secret>`). [botUsername]: what getMe answers. Returns { server, state, ...helpers }.
 * state.rateLimit = { method, retryAfter, times } answers 429 to that method (times: how many calls, default 1).
 * state.webhook = true makes getUpdates answer 409. state.undeletable = Set of message ids deleteMessage refuses (48 h rule).
 * state.blocked = Set of chat ids that blocked the bot (403). state.echoPathInErrors = true puts the request path, with the
 * token in it, inside every error description (to prove the plugin scrubs what Telegram says).
 * state.afterPin = (chatId, messageId) => void runs after a successful pinChatMessage (to stage a race).
 */
export function createTelegramMock({ token, botUsername = "kino_sync_test_bot", botName = "Kino sync" } = {}) {
  const botId = Number(String(token).split(":")[0]);
  const state = {
    token,
    updates: [],
    nextUpdateId: 1000,
    nextMessageId: 1,
    clock: 1_760_000_000,
    chats: new Map(), // id -> { id, type, username?, first_name?, title? }
    messages: new Map(), // message_id -> message
    pins: new Map(), // chat id -> Set(message_id)
    files: new Map(), // file_id -> { bytes, file_path, file_unique_id }
    calls: [], // { method, params } of every Bot API method call that reached the mock (token valid or not)
    downloads: 0,
    rateLimit: null,
    webhook: false,
    undeletable: new Set(),
    blocked: new Set(),
    echoPathInErrors: false,
    afterPin: null,
  };

  const now = () => ++state.clock;
  const ok = (result) => ({ status: 200, body: { ok: true, result } });
  const err = (status, description, parameters, path) => ({
    status,
    body: { ok: false, error_code: status, description: state.echoPathInErrors ? `${description} (${path})` : description, ...(parameters ? { parameters } : {}) },
  });

  function pinnedOf(chatId) {
    const ids = [...(state.pins.get(chatId) || [])].map((id) => state.messages.get(id)).filter(Boolean);
    if (!ids.length) return null;
    ids.sort((a, b) => a.date - b.date || a.message_id - b.message_id);
    return ids[ids.length - 1];
  }

  /** The person (or anyone) writes to the bot in a private chat: an update getUpdates will hand out. */
  function userWrites({ id, username, first_name = "Ana", last_name, text = "hola", is_bot = false }) {
    const chat = { id, type: "private", first_name, ...(last_name ? { last_name } : {}), ...(username ? { username } : {}) };
    state.chats.set(id, chat);
    const message = { message_id: state.nextMessageId++, from: { id, is_bot, first_name, ...(last_name ? { last_name } : {}), ...(username ? { username } : {}) }, chat, date: now(), text };
    state.messages.set(message.message_id, message);
    state.updates.push({ update_id: state.nextUpdateId++, message });
    return message;
  }

  /** Someone writes in a group the bot is in: chat.type "group", a negative id. */
  function groupWrites({ id = -100123, title = "Familia", from = { id: 555, first_name: "Primo", username: "primo" }, text = "hola" }) {
    const chat = { id, type: "group", title };
    state.chats.set(id, chat);
    const message = { message_id: state.nextMessageId++, from: { is_bot: false, ...from }, chat, date: now(), text };
    state.updates.push({ update_id: state.nextUpdateId++, message });
    return message;
  }

  /** A channel post (no `message`, no `from`). */
  function channelPost({ id = -100999, title = "Canal" } = {}) {
    const chat = { id, type: "channel", title };
    state.updates.push({ update_id: state.nextUpdateId++, channel_post: { message_id: state.nextMessageId++, chat, date: now(), text: "post" } });
  }

  /** A document the bot already sent (and optionally pinned), as an earlier device would have left it. */
  function seedDocument(chatId, bytes, opts = {}) {
    const { pin = true, fileName = "kino-sync.bin" } = opts;
    const fileSize = "fileSize" in opts ? opts.fileSize : bytes.length;
    const file_id = "F" + state.nextMessageId + "x".repeat(20);
    state.files.set(file_id, { bytes: Buffer.from(bytes), file_path: `documents/file_${state.nextMessageId}.bin`, file_unique_id: "U" + state.nextMessageId });
    const message = {
      message_id: state.nextMessageId++,
      // opts.from: a document someone else sent (the person themselves), not the bot.
      from: opts.from || { id: botId, is_bot: true, first_name: botName, username: botUsername },
      chat: state.chats.get(chatId) || { id: chatId, type: "private" },
      date: now(),
      document: { file_name: fileName, mime_type: "application/octet-stream", file_id, file_unique_id: "U" + file_id, ...(fileSize === undefined ? {} : { file_size: fileSize }) },
    };
    state.messages.set(message.message_id, message);
    if (pin) pinMessage(chatId, message.message_id);
    return message;
  }

  /** The person pins one of their own text messages (no document). */
  function pinMessage(chatId, messageId) {
    if (!state.pins.has(chatId)) state.pins.set(chatId, new Set());
    state.pins.get(chatId).add(messageId);
  }

  const intOf = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
  const truthy = (v) => v === true || v === "true" || v === "1";

  async function readParams(req, url) {
    const params = Object.fromEntries(url.searchParams);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const type = String(req.headers["content-type"] || "");
    if (!raw.length) return { params, raw };
    if (type.startsWith("multipart/form-data")) {
      // The real parser of the platform: a body the plugin built by hand must be exactly right to come out whole.
      const form = await new Response(raw, { headers: { "content-type": type } }).formData();
      for (const [k, v] of form.entries()) {
        params[k] = typeof v === "string" ? v : { filename: v.name, type: v.type, bytes: Buffer.from(await v.arrayBuffer()) };
      }
    } else if (type.startsWith("application/json")) {
      // Telegram reads every parameter as text; so does this mock (objects stay JSON, like allowed_updates).
      for (const [k, v] of Object.entries(JSON.parse(raw.toString("utf8")))) params[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
    } else if (type.startsWith("application/x-www-form-urlencoded")) {
      Object.assign(params, Object.fromEntries(new URLSearchParams(raw.toString("utf8"))));
    }
    return { params, raw };
  }

  async function method(name, params, path) {
    const rl = state.rateLimit;
    if (rl && (rl.method === name || rl.method === "*") && (rl.times ?? 1) > 0) {
      rl.times = (rl.times ?? 1) - 1;
      return err(429, `Too Many Requests: retry after ${rl.retryAfter}`, { retry_after: rl.retryAfter }, path);
    }
    const chatId = intOf(params.chat_id);
    const needChat = () => {
      if (!state.chats.has(chatId)) return err(400, "Bad Request: chat not found", null, path);
      if (state.blocked.has(chatId)) return err(403, "Forbidden: bot was blocked by the user", null, path);
      return null;
    };
    switch (name) {
      case "getMe":
        return ok({ id: botId, is_bot: true, first_name: botName, username: botUsername, can_join_groups: true });
      case "getUpdates": {
        if (state.webhook) return err(409, "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first", null, path);
        const offset = intOf(params.offset);
        if (Number.isFinite(offset)) state.updates = state.updates.filter((u) => u.update_id >= offset);
        const limit = Number.isFinite(intOf(params.limit)) ? intOf(params.limit) : 100;
        return ok(state.updates.slice(0, limit));
      }
      case "getChat": {
        const bad = needChat();
        if (bad) return bad;
        const pinned = pinnedOf(chatId);
        return ok({ ...state.chats.get(chatId), ...(pinned ? { pinned_message: pinned } : {}) });
      }
      case "sendDocument": {
        const bad = needChat();
        if (bad) return bad;
        const doc = params.document;
        if (!doc || typeof doc !== "object" || !doc.bytes) return err(400, "Bad Request: there is no document in the request", null, path);
        if (doc.bytes.length > 50 * 1024 * 1024) return err(413, "Request Entity Too Large", null, path);
        const id = state.nextMessageId++;
        const file_id = "D" + id + "y".repeat(20);
        state.files.set(file_id, { bytes: doc.bytes, file_path: `documents/file_${id}.bin`, file_unique_id: "u" + id });
        const message = {
          message_id: id,
          from: { id: botId, is_bot: true, first_name: botName, username: botUsername },
          chat: state.chats.get(chatId),
          date: now(),
          document: { file_name: doc.filename, mime_type: doc.type || "application/octet-stream", file_id, file_unique_id: "u" + id, file_size: doc.bytes.length },
          ...(params.caption ? { caption: params.caption } : {}),
          silent: truthy(params.disable_notification),
        };
        state.messages.set(id, message);
        return ok(message);
      }
      case "pinChatMessage": {
        const bad = needChat();
        if (bad) return bad;
        const id = intOf(params.message_id);
        const m = state.messages.get(id);
        if (!m || m.chat.id !== chatId) return err(400, "Bad Request: message to pin not found", null, path);
        pinMessage(chatId, id);
        m.pinnedSilently = truthy(params.disable_notification);
        if (state.afterPin) await state.afterPin(chatId, id);
        return ok(true);
      }
      case "unpinChatMessage": {
        const bad = needChat();
        if (bad) return bad;
        const id = intOf(params.message_id);
        state.pins.get(chatId)?.delete(id);
        return ok(true);
      }
      case "deleteMessage": {
        const bad = needChat();
        if (bad) return bad;
        const id = intOf(params.message_id);
        const m = state.messages.get(id);
        if (!m || m.chat.id !== chatId) return err(400, "Bad Request: message to delete not found", null, path);
        if (state.undeletable.has(id)) return err(400, "Bad Request: message can't be deleted for everyone", null, path);
        state.messages.delete(id);
        state.pins.get(chatId)?.delete(id);
        return ok(true);
      }
      case "getFile": {
        const f = state.files.get(String(params.file_id));
        if (!f) return err(400, "Bad Request: invalid file_id", null, path);
        return ok({ file_id: params.file_id, file_unique_id: f.file_unique_id, ...(f.reportSize === false ? {} : { file_size: f.bytes.length }), file_path: f.file_path });
      }
      default:
        return err(404, "Not Found", null, path);
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (status, body, type = "application/json") => {
      const data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      res.writeHead(status, { "Content-Type": type, "Content-Length": data.length });
      res.end(data);
    };
    try {
      const file = /^\/file\/bot([^/]+)\/(.+)$/.exec(url.pathname);
      if (file) {
        if (file[1] !== state.token) return send(404, { ok: false, error_code: 404, description: "Not Found" });
        const f = [...state.files.values()].find((x) => x.file_path === decodeURIComponent(file[2]));
        if (!f) return send(404, { ok: false, error_code: 404, description: "Not Found" });
        state.downloads++;
        return send(200, f.bytes, "application/octet-stream");
      }
      const m = /^\/bot([^/]*)\/([A-Za-z]+)$/.exec(url.pathname);
      if (!m) return send(404, { ok: false, error_code: 404, description: "Not Found" });
      const { params } = await readParams(req, url);
      state.calls.push({ method: m[2], params });
      if (!TOKEN_SHAPE.test(m[1])) return send(404, { ok: false, error_code: 404, description: "Not Found" });
      if (m[1] !== state.token) {
        const e = err(401, "Unauthorized", null, url.pathname);
        return send(e.status, e.body);
      }
      const r = await method(m[2], params, url.pathname);
      return send(r.status, r.body);
    } catch (e) {
      return send(500, { ok: false, error_code: 500, description: "Internal Server Error: " + e.message });
    }
  });

  return { server, state, botId, userWrites, groupWrites, channelPost, seedDocument, pinMessage, pinnedOf };
}
