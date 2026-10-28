// Sync-Gram (unofficial, not affiliated with Telegram): Kino's cross-device sync through a Telegram bot the person
// creates with @BotFather.
//
// Kino encrypts the snapshot and hands this plugin an opaque blob (base64). The plugin sends it to the person's private
// chat with their bot as a document (sendDocument, multipart/form-data), pins it, and removes the previous one. The
// pinned document's message_id is the version: before uploading, the plugin reads the chat's pinned message (getChat)
// and throws "conflict" if it is not the version Kino last pulled, and after pinning it checks again that its copy is
// the current one (two devices pushing at once: the loser removes its copy and throws "conflict").
//
// Only api.telegram.org is ever reached, and the bot token only ever travels in the URL path, as the Bot API requires.
// The sync key is derived by Kino from the "botToken" setting (manifest: sync.keySecret), so this plugin and Telegram
// CAN read the synced data: that is why the install screen says so in red.

const API = "https://api.telegram.org";
const FILE_NAME = "kino-sync.bin";
const PENDING = "pendingChat"; // the chat the screen offered, until it is confirmed (10 minutes)
const LINKED = "linkedChat"; // the chat the person confirmed
const OFFSET = "updatesOffset"; // getUpdates' next offset, so read updates are acknowledged and never read twice
const PENDING_TTL_MS = 10 * 60 * 1000;
const TOKEN_SHAPE = /^(\d{5,15}):[A-Za-z0-9_-]{30,}$/;

const es = () => !String(kino.lang || "es").toLowerCase().startsWith("en");
const t = (esText, enText) => (es() ? esText : enText);

// --- Secrets never leave in a text ---

/** [text] without the bot token, or anything shaped like one, or the "bot<token>" piece of a Bot API path. */
function scrub(text) {
  let s = String(text == null ? "" : text);
  const token = String(kino.config.get("botToken") || "").trim();
  if (token) s = s.split(token).join("…");
  const secret = token.includes(":") ? token.slice(token.indexOf(":") + 1) : "";
  if (secret.length >= 8) s = s.split(secret).join("…");
  return s.replace(/\d{5,15}:[A-Za-z0-9_-]{20,}/g, "…").replace(/\/(file\/)?bot[^/\s)]*/g, "/$1bot…");
}

/** A typed error for Kino that also keeps the person's sentence where this plugin can read it back (`say`). */
function fail(code, detail, say) {
  const d = scrub(detail).slice(0, 200);
  const e = say ? kino.error(code, d, { userMessage: say }) : kino.error(code, d);
  try { e.say = say || null; } catch (_) { /* a frozen error just has no sentence */ }
  return e;
}

// --- Settings ---

function token() {
  const raw = String(kino.config.get("botToken") || "").trim();
  if (!raw) throw fail("auth_required", "botToken missing", t("Falta el token del bot que te dio @BotFather.", "The bot token from @BotFather is missing."));
  const m = TOKEN_SHAPE.exec(raw);
  if (!m) throw fail("auth_required", "botToken malformed", t("Ese no parece un token de bot: cópialo otra vez de @BotFather.", "That does not look like a bot token: copy it again from @BotFather."));
  return { token: raw, botId: m[1] };
}

/** A private chat's id is the person's positive user id: a whole number within JavaScript's safe range. */
function chatIdOf(value) {
  const s = String(value == null ? "" : value).trim();
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function readJson(key) {
  try {
    const v = kino.storage.get(key);
    return v ? JSON.parse(v) : null;
  } catch (_) {
    return null;
  }
}

/**
 * The chat to sync with: the "chatId" setting when it holds one (typed, or received from another device), else the chat
 * the person confirmed with this same bot. Null when there is none yet.
 */
function chat(botId) {
  const typed = String(kino.config.get("chatId") || "").trim();
  if (typed) {
    const id = chatIdOf(typed);
    if (id === null) throw fail("auth_required", "chatId setting is not a private chat id", t("El id del chat no es válido: abre Configurar y cambia de chat.", "The chat id is not valid: open Set up and change the chat."));
    return { id, name: null };
  }
  const linked = readJson(LINKED);
  if (linked && linked.bot === botId && chatIdOf(linked.id) !== null) return { id: chatIdOf(linked.id), name: linked.name || null };
  return null;
}

function needChat() {
  const tk = token();
  const c = chat(tk.botId);
  if (!c) throw fail("auth_required", "no linked chat", t("Falta vincular tu chat: escríbele a tu bot y abre Configurar.", "Your chat is not linked yet: write to your bot and open Set up."));
  return { ...tk, chat: c };
}

// --- The Bot API ---

/** Telegram's answer to a failed call, in words the person can act on. Never the token, never Telegram's raw text to them. */
function apiError(method, status, body) {
  const desc = String((body && body.description) || "");
  const detail = `telegram ${method} ${status}: ${desc}`;
  if (status === 429) {
    const after = Math.max(1, Math.min(86400, Number(body && body.parameters && body.parameters.retry_after) || 0)) || 1;
    return fail("rate_limited", detail, t(`Telegram pide esperar ${after} s antes de seguir. Kino lo intentará de nuevo.`, `Telegram asks to wait ${after} s before going on. Kino will try again.`));
  }
  if (status === 401 || status === 404) return fail("auth_required", detail, t("Telegram no reconoce el token del bot. Cópialo otra vez de @BotFather.", "Telegram does not recognise the bot token. Copy it again from @BotFather."));
  if (status === 403) return fail("auth_required", detail, t("Tu bot está bloqueado o no lo has iniciado: ábrelo en Telegram y toca Iniciar o Desbloquear.", "Your bot is blocked or was never started: open it in Telegram and tap Start or Unblock."));
  if (status === 400 && /chat not found|chat_id is empty|user not found/i.test(desc)) {
    return fail("auth_required", detail, t("Telegram no encuentra tu chat: escríbele a tu bot y abre Configurar.", "Telegram cannot find your chat: write to your bot and open Set up."));
  }
  if (status === 409) return fail("unavailable", detail, t("Otro programa lee este bot (un webhook u otro getUpdates). Usa un bot solo para Kino.", "Another program reads this bot (a webhook or another getUpdates). Use a bot only for Kino."));
  if (status === 413) return fail("unavailable", detail, t("La copia es demasiado grande para Telegram.", "The copy is too large for Telegram."));
  if (status >= 500) return fail("unavailable", detail, t("Telegram no responde ahora. Kino lo intentará de nuevo.", "Telegram is not answering right now. Kino will try again."));
  return fail("unavailable", detail, t(`Telegram respondió ${status}.`, `Telegram answered ${status}.`));
}

/** kino.fetch with its failures in the person's words (and never the address, which holds the token). */
async function send(url, init, method) {
  try {
    return await kino.fetch(url, { redirect: "manual", cookies: false, ...init });
  } catch (e) {
    const code = e && e.code;
    if (code === "rate_limited") return Promise.reject(fail("rate_limited", "kino.fetch budget", t("Demasiadas consultas seguidas: Kino lo intentará de nuevo.", "Too many requests in a row: Kino will try again.")));
    if (code === "too_large") return Promise.reject(fail("unavailable", `${method}: too large for kino.fetch`, t("La copia es demasiado grande para este plugin.", "The copy is too large for this plugin.")));
    return Promise.reject(fail("unavailable", `${method}: ${code || "network"}`, t("No se pudo llegar a Telegram. Revisa la conexión a internet.", "Could not reach Telegram. Check the internet connection.")));
  }
}

/** One Bot API method; answers its `result` or throws what [apiError] makes of Telegram's answer. */
async function api(tk, method, params, { body = null, headers = {}, timeoutMs = 10000 } = {}) {
  const r = await send(`${API}/bot${tk}/${method}`, {
    method: "POST",
    headers: body ? headers : { "Content-Type": "application/json" },
    body: body || { json: params || {} },
    timeoutMs,
  }, method);
  let data = null;
  try { data = r.json(); } catch (_) { data = null; }
  if (!r.ok || !data || data.ok !== true) throw apiError(method, r.status, data);
  return data.result;
}

/**
 * The chat's most recent pinned message as our copy, or null. Only a document this bot sent under [FILE_NAME] is ours:
 * anything else pinned (the person's own message or file, another file name) is never read, deleted or unpinned, and
 * `foreign` says it is there, over whatever copy may lie beneath it.
 */
async function pinnedCopy(tk, chatId) {
  const info = await api(tk, "getChat", { chat_id: chatId });
  const m = info && info.pinned_message;
  if (!m) return { info, copy: null, foreign: false };
  const botId = Number(String(tk).split(":")[0]);
  const ours = m.document && m.document.file_id && m.document.file_name === FILE_NAME && m.from && m.from.id === botId;
  if (!ours) return { info, copy: null, foreign: true };
  return { info, copy: { version: String(m.message_id), fileId: m.document.file_id, size: Number(m.document.file_size) || null }, foreign: false };
}

// --- Base64 and the multipart body ---

/** Text as UTF-8 bytes in a "binary string" (one char per byte), what btoa encodes. */
function utf8Binary(text) {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function blobBytes(blob) {
  return (blob.length / 4) * 3 - (blob.endsWith("==") ? 2 : blob.endsWith("=") ? 1 : 0);
}

/**
 * The sendDocument body as base64, built without ever decoding the blob: kino.fetch sends a `{ base64 }` body's bytes as
 * they are, so the multipart framing is spliced around the blob's own base64. The text before the file is made a
 * multiple of 3 bytes long (by the boundary's length), so its base64 ends cleanly and the blob's base64 follows it
 * as is; only the blob's last 4 characters are decoded, joined to the closing boundary and encoded again.
 */
function multipart(fields, blob) {
  const seed = kino.crypto.randomBytes(12, "hex");
  for (let pad = 0; pad < 3; pad++) {
    const boundary = "KinoSync" + seed + "x".repeat(pad);
    let head = "";
    for (const [k, v] of fields) head += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    head += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${FILE_NAME}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const headBin = utf8Binary(head);
    if (headBin.length % 3 !== 0) continue;
    const tail = atob(blob.slice(-4)) + `\r\n--${boundary}--\r\n`;
    return { contentType: `multipart/form-data; boundary=${boundary}`, base64: btoa(headBin) + blob.slice(0, -4) + btoa(tail) };
  }
  // Every boundary character is counted once per part (four parts), so one of three lengths always fits.
  throw kino.error("unavailable", "multipart framing did not align");
}

// --- Sync ---

/** The pinned copy and its version, or null when the chat holds none yet. */
export async function syncPull({ maxBlobBytes } = {}) {
  const { token: tk, chat: c } = needChat();
  const { copy } = await pinnedCopy(tk, c.id);
  if (!copy) return null;
  const tooBig = () => fail("unavailable", "pinned document over maxBlobBytes", t("La copia guardada en Telegram es más grande de lo que Kino acepta.", "The copy saved in Telegram is larger than Kino accepts."));
  if (maxBlobBytes && copy.size && copy.size > maxBlobBytes) throw tooBig();
  const file = await api(tk, "getFile", { file_id: copy.fileId });
  if (!file || !file.file_path) throw fail("unavailable", "getFile without file_path", t("Telegram no entregó la copia guardada.", "Telegram did not hand over the saved copy."));
  if (maxBlobBytes && file.file_size && file.file_size > maxBlobBytes) throw tooBig();
  const path = String(file.file_path).split("/").map(encodeURIComponent).join("/");
  const r = await send(`${API}/file/bot${tk}/${path}`, { method: "GET", timeoutMs: 30000 }, "download");
  if (!r.ok) throw apiError("download", r.status, null);
  const blob = r.base64();
  if (maxBlobBytes && blobBytes(blob) > maxBlobBytes) throw tooBig();
  return { blob, version: copy.version };
}

/** Uploads the blob as a document, pins it, then removes the previous copy. "conflict" when the pinned copy moved. */
export async function syncPush({ blob, expectedVersion, maxBlobBytes } = {}) {
  if (typeof blob !== "string" || blob.length < 4 || blob.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(blob)) throw kino.error("invalid_request", "no blob");
  if (maxBlobBytes && blobBytes(blob) > maxBlobBytes) throw kino.error("invalid_request", "blob over maxBlobBytes");
  const { token: tk, chat: c } = needChat();
  const expected = expectedVersion == null ? "" : String(expectedVersion);
  const before = (await pinnedCopy(tk, c.id)).copy;
  if ((before ? before.version : "") !== expected) throw kino.error("conflict", `the pinned copy is ${before ? before.version : "none"}, not ${expected || "none"}`);

  const body = multipart([
    ["chat_id", String(c.id)],
    ["disable_notification", "true"],
    ["caption", t("Copia de sincronización de Kino. No la borres ni la desfijes.", "Kino sync copy. Do not delete or unpin it.")],
  ], blob);
  const sent = await api(tk, "sendDocument", null, { body: { base64: body.base64 }, headers: { "Content-Type": body.contentType }, timeoutMs: 30000 });
  const id = sent && sent.message_id;
  if (!Number.isSafeInteger(id)) throw fail("unavailable", "sendDocument without message_id", t("Telegram no confirmó la copia.", "Telegram did not confirm the copy."));
  const drop = async (messageId) => {
    try { await api(tk, "deleteMessage", { chat_id: c.id, message_id: messageId }); return true; } catch (_) { return false; }
  };
  try {
    await api(tk, "pinChatMessage", { chat_id: c.id, message_id: id, disable_notification: true });
  } catch (e) {
    await drop(id);
    throw e;
  }
  // Two devices may have pushed at once: the chat's most recent pinned message decides who won.
  const after = (await pinnedCopy(tk, c.id)).copy;
  if (!after || after.version !== String(id)) {
    await drop(id);
    throw kino.error("conflict", "another copy was pinned meanwhile");
  }
  // The previous copy: deleted, or (Telegram deletes only messages under 48 hours old) at least unpinned.
  if (before && !(await drop(Number(before.version)))) {
    try { await api(tk, "unpinChatMessage", { chat_id: c.id, message_id: Number(before.version) }); } catch (_) { /* an old pin left behind is harmless */ }
  }
  return { version: String(id) };
}

/** Cheap: getChat (or getMe before a chat is linked). Never downloads the copy. */
export async function syncStatus() {
  try {
    const tk = token();
    const c = chat(tk.botId);
    if (!c) {
      const me = await api(tk.token, "getMe", {});
      const bot = me && me.username ? "@" + me.username : t("Tu bot", "Your bot");
      return { ready: false, message: t(`${bot} está listo. Falta tu chat: escríbele a tu bot y abre Configurar.`, `${bot} is ready. Your chat is missing: write to your bot and open Set up.`) };
    }
    const { info, copy, foreign } = await pinnedCopy(tk.token, c.id);
    const who = info && info.username ? `@${info.username}, ` : "";
    const where = `(${who}${t("id", "id")} ${c.id})`;
    if (foreign) {
      return {
        ready: true,
        message: t("Hay un mensaje tuyo fijado encima de la copia: desfíjalo en el chat con tu bot. Mientras, Kino guarda una copia nueva.",
          "A message of yours is pinned over the copy: unpin it in the chat with your bot. Meanwhile Kino saves a new copy."),
      };
    }
    return {
      ready: true,
      message: copy
        ? t(`Conectado con tu chat ${where}. Hay una copia guardada.`, `Connected to your chat ${where}. A copy is saved.`)
        : t(`Conectado con tu chat ${where}. Aún no hay copia guardada.`, `Connected to your chat ${where}. No copy saved yet.`),
    };
  } catch (e) {
    return { ready: false, message: (e && e.say) || t("No se pudo consultar Telegram.", "Could not ask Telegram.") };
  }
}

// --- The setup screen (apiVersion 14) ---

// What Kino refuses in a link candidate (control, invisible formatting, separators, odd spaces, blank fillers).
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}ᅟᅠㅤﾠ⠀]|(?! )\p{Zs}/gu;

/** How the person is shown in "Is this you?": @username, else their name, cleaned to what Kino accepts (1..64 chars). */
function candidateOf(from, id) {
  const raw = from.username ? "@" + from.username : [from.first_name, from.last_name].filter(Boolean).join(" ");
  const clean = Array.from(String(raw).replace(UNSAFE, "").replace(/ {2,}/g, " ").trim()).slice(0, 64).join("").trim();
  return clean || t(`la cuenta ${id}`, `account ${id}`);
}

async function findChat() {
  let tk;
  try { tk = token(); } catch (e) { return { message: e.say }; }
  const pending = readJson(PENDING);
  let updates;
  try {
    const offset = Number(kino.storage.get(OFFSET)) || 0;
    updates = await api(tk.token, "getUpdates", { ...(offset ? { offset } : {}), timeout: 0, limit: 100, allowed_updates: ["message"] });
  } catch (e) {
    return { message: (e && e.say) || t("No se pudo consultar Telegram.", "Could not ask Telegram.") };
  }
  let found = null;
  let last = 0;
  for (const u of Array.isArray(updates) ? updates : []) {
    if (Number.isSafeInteger(u && u.update_id) && u.update_id > last) last = u.update_id;
    const m = u && u.message;
    // Only a person writing to the bot in private: the chat is theirs (its id is their user id).
    if (!m || !m.chat || m.chat.type !== "private" || !m.from || m.from.is_bot || m.from.id !== m.chat.id) continue;
    const id = chatIdOf(m.chat.id);
    if (id !== null) found = { id, name: candidateOf(m.from, id) };
  }
  // The next getUpdates starts after what was read here, which tells Telegram those updates are done.
  if (last) kino.storage.set(OFFSET, String(last + 1));
  const offer = found || (pending && pending.bot === tk.botId && chatIdOf(pending.id) !== null ? { id: chatIdOf(pending.id), name: pending.name } : null);
  if (!offer) {
    return { message: t("Aún no hay mensajes: abre tu bot en Telegram, toca Iniciar y escríbele algo. Aquí aparece solo.", "No messages yet: open your bot in Telegram, tap Start and write it something. It shows up here by itself.") };
  }
  kino.storage.set(PENDING, JSON.stringify({ id: offer.id, bot: tk.botId, name: offer.name }), { ttlMs: PENDING_TTL_MS });
  return {
    message: t(`Te escribió ${offer.name}. Confirma que eres tú.`, `${offer.name} wrote to your bot. Confirm it is you.`),
    link: { candidate: offer.name, confirm: "confirmChat" },
  };
}

/** Runs only after the person confirmed Kino's "Is this you?": links the chat the screen offered, nothing else. */
function confirmChat() {
  const refuse = { message: t("Primero escríbele a tu bot y espera a que aparezca aquí.", "First write to your bot and wait for it to show up here.") };
  let tk;
  try { tk = token(); } catch (e) { return { message: e.say }; }
  const pending = readJson(PENDING);
  const id = pending ? chatIdOf(pending.id) : null;
  if (!pending || pending.bot !== tk.botId || id === null) return refuse;
  kino.storage.set(LINKED, JSON.stringify({ id, bot: tk.botId, name: String(pending.name || "") }));
  kino.storage.remove(PENDING);
  // Kino saves it into the "chatId" setting as if typed (setSettings), so it syncs and pairing can hand it to another
  // device. Only the chat id: the token is the person's to type and never goes back through an answer.
  return {
    message: t(`Listo: Kino usará tu chat con ${pending.name} (id ${id}).`, `Done: Kino will use your chat with ${pending.name} (id ${id}).`),
    setSettings: { chatId: String(id) },
  };
}

export async function validateSettings(values) {
  const out = {};
  const tk = String(values.botToken || "").trim();
  if (tk && !TOKEN_SHAPE.test(tk)) out.botToken = t("Ese no parece un token de bot: son números, dos puntos y unas 35 letras. Cópialo de @BotFather.", "That does not look like a bot token: digits, a colon and about 35 letters. Copy it from @BotFather.");
  const id = String(values.chatId || "").trim();
  if (id && chatIdOf(id) === null) out.chatId = t("Debe ser el número de tu chat privado con el bot (sin signo menos), o quedar vacío.", "It must be the number of your private chat with the bot (no minus sign), or stay empty.");
  return Object.keys(out).length ? out : null;
}

// --- The screen: the setup as Kino's `steps` (apiVersion 14) ---
// The token is typed in a masked field of a Form: its text reaches the event once, is checked against Telegram right
// there, and is written to its password setting by the answer's `config`; it is never in the screen's state, a log or a
// render. The chat is found by itself while the screen is open and the person confirms it with two buttons ("Is this
// you?"): a timer's answer cannot open a pop-up, so the question is a card on the screen, and only the person's press
// links a chat.

const text = (esText, enText, style) => ({ type: "Text", text: esText, textEn: enText, ...(style ? { style } : {}) });
const button = (esText, enText, onPressed, extra = {}) => ({ type: "ElevatedButton", labelText: esText, labelTextEn: enText, onPressed, ...extra });
const textButton = (esText, enText, onPressed) => ({ type: "TextButton", labelText: esText, labelTextEn: enText, onPressed });
const openUrl = (href, title) => ({ go: { url: { href, title } } });
const line = (s) => ({ type: "Text", text: s, style: "body" });
const isTv = () => kino.device === "tv";
const TICK_MS = 4000;
const TOKEN_PATTERN = "^[0-9]{5,15}:[A-Za-z0-9_-]{30,}$";
const CHAT_ID_PATTERN = "^[1-9][0-9]{0,15}$";
const MUTE = ["Silencia el chat del bot en Telegram para que las copias no te avisen.", "Mute the bot's chat in Telegram so the copies don't notify you."];

/** Where the setup stands, without asking Telegram: "noToken", "noChat" or "linked". */
function stage() {
  let tk;
  try { tk = token(); } catch (_) { return "noToken"; }
  try { return chat(tk.botId) ? "linked" : "noChat"; } catch (_) { return "noChat"; }
}

/** Only the current step draws children: any other step's would be dropped (and logged) by Kino. */
const onlyCurrentOpen = (item) => {
  if (item.state === "current") return item;
  const { children, ...rest } = item;
  return rest;
};
const said = (state) => [state.msg, state.line].filter(Boolean).map(line);

function phoneSteps(st, state) {
  const editing = state.edit === "token" && st !== "noToken";
  const at = editing || st === "noToken" ? 0 : st === "noChat" ? 1 : 2;
  const mark = (i) => (i < at ? "done" : i === at ? "current" : "pending");
  const cand = state.candidate;
  return {
    type: "steps",
    key: "setup",
    onStepTap: "go_back",
    items: [
      {
        key: "token", title: "Tu bot", titleEn: "Your bot", subtitle: "Token guardado", subtitleEn: "Token saved", state: mark(0),
        children: [
          text("Abre @BotFather, envía /newbot y sigue los pasos: te dará un token. Pégalo aquí; es como una contraseña, no lo compartas.", "Open @BotFather, send /newbot and follow the steps: it gives you a token. Paste it here; it is like a password, do not share it."),
          button("Abrir @BotFather", "Open @BotFather", openUrl("https://t.me/BotFather", "@BotFather")),
          {
            type: "Form", key: "tokenForm", onSubmitted: "save_token", children: [
              { type: "TextField", key: "token", obscureText: true, required: true, maxLength: 80, pattern: TOKEN_PATTERN, errorText: "Ese no parece un token de bot: son números, dos puntos y unas 35 letras.", errorTextEn: "That does not look like a bot token: digits, a colon and about 35 letters.", labelText: "Token del bot", labelTextEn: "Bot token", hintText: "123456789:AAH…", hintTextEn: "123456789:AAH…" },
              { type: "ElevatedButton", labelText: "Guardar", labelTextEn: "Save", submit: true },
            ],
          },
          ...said(state),
        ],
      },
      {
        key: "chat", title: "Tu chat con el bot", titleEn: "Your chat with the bot", subtitle: "Vinculado", subtitleEn: "Linked", state: mark(1),
        children: [
          text("En Telegram abre tu bot, toca Iniciar y escríbele cualquier cosa. Aquí aparece solo.", "In Telegram open your bot, tap Start and write it anything. It shows up here by itself."),
          text(MUTE[0], MUTE[1]),
          ...(state.bot ? [button("Abrir @" + state.bot, "Open @" + state.bot, openUrl("https://t.me/" + state.bot, "@" + state.bot))] : []),
          ...(cand
            ? [text("Te escribió " + cand + ". ¿Eres tú?", cand + " wrote to your bot. Is this you?", "h3"),
              button("Sí, soy yo", "Yes, it is me", "confirm"), textButton("No soy yo", "It is not me", "decline")]
            : []),
          ...said(state),
        ],
      },
      {
        key: "ready", title: "Conectado", titleEn: "Connected", state: mark(2),
        children: [
          ...said(state),
          text(MUTE[0], MUTE[1]),
          button("Revisar el estado", "Check the status", "check"),
          textButton("Cambiar de chat", "Change chat", "change"),
          {
            type: "ExpansionTile", key: "advanced", items: [{ key: "adv", title: "Avanzado", titleEn: "Advanced", children: [
              { type: "TextField", key: "chatId", bind: "chatId", kind: "number", maxLength: 16, pattern: CHAT_ID_PATTERN, errorText: "Debe ser el número de tu chat privado con el bot, o quedar vacío.", errorTextEn: "It must be the number of your private chat with the bot, or stay empty.", labelText: "Id del chat", labelTextEn: "Chat id" },
            ] }],
          },
        ],
      },
    ].map(onlyCurrentOpen),
  };
}

function tvSteps(st, state) {
  const got = st !== "noToken";
  return {
    type: "steps",
    key: "setup",
    items: [
      { key: "recv", title: "Recibir la configuración", titleEn: "Receive the setup", subtitle: "Recibida", subtitleEn: "Received", state: got ? "done" : "current",
        children: [text("Desde tu celular: Ajustes ▸ Sincronización ▸ Enviar configuración. En esta TV: Recibir configuración.", "From your phone: Settings ▸ Sync ▸ Send configuration. On this TV: Receive configuration."), ...said(state)] },
      { key: "ready", title: "Conectado", titleEn: "Connected", state: got ? "current" : "pending", children: said(state) },
    ].map(onlyCurrentOpen),
  };
}

export async function screen({ state = {} } = {}) {
  const st = stage();
  return {
    type: "Column",
    padding: { compact: 16, expanded: 32 },
    gap: 12,
    every: { ms: TICK_MS, event: "tick" },
    children: [text("Sync-Gram", "Sync-Gram", "h1"), text("Sincroniza tus aparatos de Kino a través de un bot de Telegram que creas tú.", "Sync your Kino devices through a Telegram bot you create yourself."), isTv() ? tvSteps(st, state) : phoneSteps(st, state)],
  };
}

export async function screenEvent({ name, value, arg, state = {} } = {}) {
  if (isTv()) {
    if (name === "tick" && state.line) return null;
    return name === "open" || name === "check" || name === "tick" ? { state: { line: (await syncStatus()).message } } : null;
  }
  const st = stage();
  const form = value && typeof value === "object" ? value : {};
  if (name === "open" || name === "check") return { state: { line: (await syncStatus()).message, msg: "" } };
  if (name === "go_back") return { state: { edit: arg === "token" ? "token" : null, msg: "" } };
  if (name === "save_token") {
    const typed = typeof form.token === "string" ? form.token.trim() : "";
    if (!TOKEN_SHAPE.test(typed)) return { state: { msg: t("Ese no parece un token de bot: son números, dos puntos y unas 35 letras. Cópialo de @BotFather.", "That does not look like a bot token: digits, a colon and about 35 letters. Copy it from @BotFather.") } };
    // Ask Telegram with the typed token before keeping it: a token that does not work is never saved.
    let bot = null;
    try {
      const me = await api(typed, "getMe", {});
      bot = me && typeof me.username === "string" && /^[A-Za-z0-9_]{3,64}$/.test(me.username) ? me.username : null;
    } catch (e) {
      return { state: { msg: (e && e.say) || t("No se pudo consultar Telegram.", "Could not ask Telegram.") } };
    }
    return { state: { msg: "", edit: null, bot, candidate: null }, config: { botToken: typed } };
  }
  if (name === "tick") {
    if (st === "noToken") return { state: { bot: null, candidate: null } };
    if (st === "linked") return state.candidate || state.bot ? { state: { candidate: null, bot: null } } : null;
    // A token and no chat: learn the bot's name once, then listen for the person's first message.
    let bot = state.bot || null;
    if (!bot) {
      try {
        const me = await api(token().token, "getMe", {});
        bot = me && typeof me.username === "string" && /^[A-Za-z0-9_]{3,64}$/.test(me.username) ? me.username : null;
      } catch (e) {
        return { state: { line: (e && e.say) || t("No se pudo consultar Telegram.", "Could not ask Telegram.") } };
      }
    }
    const found = await findChat();
    return { state: { bot, candidate: found.link ? found.link.candidate : null, line: found.link ? "" : found.message } };
  }
  if (name === "confirm") {
    const done = confirmChat();
    return { state: { msg: done.message, candidate: null, line: "" }, ...(done.setSettings ? { config: done.setSettings } : {}) };
  }
  if (name === "decline") {
    kino.storage.remove(PENDING);
    return { state: { candidate: null, msg: "" } };
  }
  if (name === "change") {
    kino.storage.remove(LINKED);
    kino.storage.remove(PENDING);
    return { state: { candidate: null, msg: "", line: "" }, config: { chatId: null } };
  }
  return null;
}
