// The Telegram sync plugin run with Kino's Node kit (plugins/sdk): the same `kino` API the app gives, the same sandbox,
// against a local imitation of the Bot API (telegram-mock.mjs). The plugin asks for https://api.telegram.org/...; the
// kit's network (fetchImpl) records every request and carries it to the mock on 127.0.0.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTelegramMock } from "./telegram-mock.mjs";
import { createKino } from "../sdk/kino-shim.mjs";
import { loadPlugin } from "../sdk/sandbox.mjs";
import { validate } from "../sdk/validate.mjs";
import { checkSettingsOutput, checkSyncAnswer, validateManifest } from "../sdk/contract.mjs";
import { checkScreenTree } from "../sdk/screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(HERE, "..");
const MANIFEST_TEXT = readFileSync(join(PLUGIN_DIR, "kino-plugin.json"), "utf8");
const MANIFEST = JSON.parse(MANIFEST_TEXT);
// Shaped like a real token (bot id, colon, 35 characters); the secret part is what must never leak.
const TOKEN = "7712345678:AAHk3J9qXw-Zt5rLm2Pv8sYb_Nc4Ud6Ef0G";
const SECRET = TOKEN.split(":")[1];
const ANA = { id: 401234567, username: "ana_kino", first_name: "Ana" };
const API = "https://api.telegram.org";
const quiet = { log() {}, info() {}, warn() {}, error() {} };

async function rig({ token = TOKEN, chatId = undefined, lang = "es-CO", syncCall = false, mock = {}, device = undefined } = {}) {
  const tg = createTelegramMock({ token: TOKEN, ...mock });
  await new Promise((r) => tg.server.listen(0, "127.0.0.1", r));
  const local = `http://127.0.0.1:${tg.server.address().port}`;
  const seen = [];
  const fetchImpl = (url, init) => {
    const body = init.body === undefined ? "" : Buffer.isBuffer(init.body) || init.body instanceof Uint8Array ? Buffer.from(init.body).toString("latin1") : String(init.body);
    seen.push({ url: String(url), method: init.method, headers: { ...init.headers }, body });
    return fetch(String(url).replace(API, local), init);
  };
  const config = {};
  if (token !== null) config.botToken = token;
  if (chatId !== undefined) config.chatId = chatId;
  const made = createKino(MANIFEST, { config, fetchImpl, lang, syncCall });
  const kino = device ? Object.freeze({ ...made.kino, device }) : made.kino;
  let plugin;
  try {
    ({ plugin } = await loadPlugin(join(PLUGIN_DIR, "plugin.js"), kino, { console: quiet }));
  } catch (e) {
    await new Promise((r) => tg.server.close(r));
    throw e;
  }
  // The screen's events as the old form's actions, so one set of link scenarios covers both: "findChat" is the timer's tick
  // (the screen listens by itself), "confirmChat" the "Sí, soy yo" press.
  const event = async (name) => plain((await plugin.screenEvent({ name, state: {}, device: "phone" })) ?? null);
  plugin.action = async (key) => {
    if (key === "findChat") {
      const a = await event("tick");
      const st = (a && a.state) || {};
      return { message: st.line || "", ...(st.candidate ? { link: { candidate: st.candidate, confirm: "confirmChat" } } : {}) };
    }
    if (key === "confirmChat") {
      const a = await event("confirm");
      return { message: a.state.msg, ...(a.config ? { setSettings: a.config } : {}) };
    }
    return { message: "" };
  };
  plugin.settingsStatus = async () => ({ status: (await plugin.syncStatus()).message });
  const ctx = { maxBlobBytes: MANIFEST.sync.maxBlobBytes };
  return { plugin, tg, seen, ctx, kino, close: () => new Promise((r) => tg.server.close(r)) };
}

/** A rig whose chat with Ana is already linked the normal way (write, find, confirm). */
async function linked(opts = {}) {
  const r = await rig(opts);
  r.tg.userWrites(ANA);
  const found = plain(await r.plugin.action("findChat"));
  assert.equal(found.link?.confirm, "confirmChat", JSON.stringify(found));
  await r.plugin.action("confirmChat");
  r.seen.length = 0;
  r.tg.state.calls.length = 0;
  return r;
}

// The plugin answers from its own realm (the sandbox); Kino reads them as JSON, so compare them that way.
const plain = (v) => JSON.parse(JSON.stringify(v));
const b64 = (s) => Buffer.from(s).toString("base64");
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
const methods = (r) => r.tg.state.calls.map((c) => c.method);
const action = (r, key) => r.plugin.action(key).then((v) => plain(v ?? null));

test("manifestValidatesUnderTheKitAndKeySecretRules", async () => {
  const v = await validate(PLUGIN_DIR);
  assert.equal(v.ok, true, v.problems.join("\n"));
  assert.deepEqual(MANIFEST.capabilities, ["syncProvider", "screen"]);
  assert.deepEqual(MANIFEST.hosts, ["api.telegram.org"]);
  assert.equal(MANIFEST.fetchHosts, undefined, "only api.telegram.org, never any host");
  assert.equal(MANIFEST.apiVersion, 14);
  assert.equal(MANIFEST.version, "1.1.1");
  // Sync-Gram: its own name and icon, and it says it is not Telegram's.
  assert.equal(MANIFEST.id, "sync-gram");
  assert.equal(MANIFEST.name, "Sync-Gram");
  assert.match(MANIFEST.description, /No oficial: sin relación con Telegram/);
  assert.match(MANIFEST.description, /Unofficial: not affiliated with Telegram/);
  assert.equal(MANIFEST.icon, "icon.png");
  const icon = readFileSync(join(PLUGIN_DIR, "icon.png"));
  assert.equal(icon.subarray(1, 4).toString("latin1"), "PNG");
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), "a square icon");
  assert.ok(statSync(join(PLUGIN_DIR, "icon.png")).size <= 128 * 1024, "at most 128 KB");
  // The setup is a screen opened from the settings page, which then shows only its button.
  assert.deepEqual(MANIFEST.screen, { label: "Sync-Gram", labelEn: "Sync-Gram", opensFrom: ["settings"], settingsIn: "screen", settingsButton: { label: "Configurar", labelEn: "Set up" } });
  // The install sheet says in red that the plugin and its service (Telegram) can read the synced data.
  assert.ok(v.consent.some((l) => l.danger && /podrán leerlos/.test(l.text)), JSON.stringify(v.consent));
  assert.deepEqual(MANIFEST.sync, { mode: "poll", pullEveryMs: 600000, pushDebounceMs: 300000, maxBlobBytes: 4194304, keySecret: "botToken", provision: ["botToken", "chatId"] });
  const token = MANIFEST.settings.find((s) => s.key === "botToken");
  assert.equal(token.type, "password");
  assert.equal(token.default, undefined);
  assert.equal(MANIFEST.settings.find((s) => s.key === "chatId").type, "text");
  // Only the two values stay as settings; the steps, the chat search and the confirmation live in the screen.
  assert.deepEqual(MANIFEST.settings.map((x) => x.key), ["botToken", "chatId"]);
  for (const x of MANIFEST.settings) assert.deepEqual(x.devices, ["phone"], x.key);
  // The keySecret rules, as Kino refuses them: the key of a password setting, no default, inside provision, 4 MiB at most.
  const variant = (f) => { const m = JSON.parse(MANIFEST_TEXT); f(m); return validateManifest(JSON.stringify(m)); };
  assert.equal(validateManifest(MANIFEST_TEXT).ok, true);
  assert.match(variant((m) => { m.sync.keySecret = "chatId"; }).message, /password/);
  assert.match(variant((m) => { m.settings.find((s) => s.key === "botToken").default = "123:abc"; }).message, /default/);
  assert.match(variant((m) => { m.sync.provision = ["chatId"]; }).message, /provision/);
  assert.equal(variant((m) => { m.sync.maxBlobBytes = 8388608; }).ok, false);
  assert.equal(variant((m) => { m.capabilities = ["search"]; }).ok, false);
});

test("pushUploadsDocumentPinsItAndRemovesThePrevious", async () => {
  const r = await linked({ syncCall: true });
  try {
    // A blob whose length is not a multiple of 3 and holds every byte value: the multipart body must keep it exact.
    const bytes = Buffer.from(Array.from({ length: 1001 }, (_, i) => (i * 37) % 256));
    const first = plain(await r.plugin.syncPush({ ...r.ctx, blob: bytes.toString("base64"), expectedVersion: null }));
    const pinned1 = r.tg.pinnedOf(ANA.id);
    assert.equal(first.version, String(pinned1.message_id));
    assert.deepEqual(r.tg.state.files.get(pinned1.document.file_id).bytes, bytes);
    assert.equal(pinned1.silent, true, "sendDocument with disable_notification");
    assert.equal(pinned1.pinnedSilently, true, "pinChatMessage with disable_notification");
    const send = r.tg.state.calls.find((c) => c.method === "sendDocument");
    assert.equal(send.params.chat_id, String(ANA.id));
    assert.equal(send.params.document.filename, "kino-sync.bin");
    const upload = r.seen.find((s) => s.url.endsWith("/sendDocument"));
    assert.equal(upload.method, "POST");
    assert.match(upload.headers["Content-Type"], /^multipart\/form-data; boundary=/);

    // Every remainder of the base64 tail (0, 1 and 2 padding characters) and a second round over the first.
    let previous = first.version;
    for (const n of [3, 4, 5]) {
      r.tg.state.calls.length = 0;
      const blob = Buffer.alloc(n * 100 + n, n).toString("base64");
      const next = plain(await r.plugin.syncPush({ ...r.ctx, blob, expectedVersion: previous }));
      assert.notEqual(next.version, previous);
      const pinned = r.tg.pinnedOf(ANA.id);
      assert.equal(String(pinned.message_id), next.version);
      assert.equal(r.tg.state.files.get(pinned.document.file_id).bytes.toString("base64"), blob);
      assert.equal(r.tg.state.messages.has(Number(previous)), false, "the previous document is deleted");
      assert.deepEqual([...r.tg.state.pins.get(ANA.id)], [Number(next.version)], "only the new one stays pinned");
      assert.deepEqual(methods(r), ["getChat", "sendDocument", "pinChatMessage", "getChat", "deleteMessage"]);
      previous = next.version;
    }
    assert.deepEqual(checkSyncAnswer("syncPush", { version: previous }, MANIFEST), { version: previous });
  } finally { await r.close(); }
});

test("a previous document older than 48 hours cannot be deleted: it is unpinned instead and the push still succeeds", async () => {
  const r = await linked();
  try {
    const old = r.tg.seedDocument(ANA.id, Buffer.from("old copy"));
    r.tg.state.undeletable.add(old.message_id);
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob: b64("new copy"), expectedVersion: String(old.message_id) }));
    assert.equal(String(r.tg.pinnedOf(ANA.id).message_id), version);
    assert.equal(r.tg.state.pins.get(ANA.id).has(old.message_id), false);
    assert.deepEqual(methods(r).slice(-2), ["deleteMessage", "unpinChatMessage"]);
  } finally { await r.close(); }
});

test("pushWithStaleExpectedVersionThrowsConflict", async () => {
  const r = await linked();
  try {
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob: b64("device A"), expectedVersion: null }));
    r.tg.state.calls.length = 0;
    // Device B last pulled nothing, or an older version: Kino's conflict, and nothing was uploaded.
    for (const stale of [null, "1"]) {
      const e = await caught(r.plugin.syncPush({ ...r.ctx, blob: b64("device B"), expectedVersion: stale }));
      assert.equal(e?.code, "conflict");
    }
    assert.deepEqual(methods(r), ["getChat", "getChat"]);
    assert.equal(String(r.tg.pinnedOf(ANA.id).message_id), version);
  } finally { await r.close(); }
});

test("a push that loses a race (another device pinned a newer copy meanwhile) throws conflict and removes its own copy", async () => {
  const r = await linked();
  try {
    let theirs = null;
    r.tg.state.afterPin = (chat, id) => {
      r.tg.state.afterPin = null;
      theirs = r.tg.seedDocument(chat, Buffer.from("other device"));
      void id;
    };
    const e = await caught(r.plugin.syncPush({ ...r.ctx, blob: b64("mine"), expectedVersion: null }));
    assert.equal(e?.code, "conflict");
    assert.equal(r.tg.pinnedOf(ANA.id).message_id, theirs.message_id, "the other device's copy stays the current one");
    const mine = r.tg.state.calls.find((c) => c.method === "pinChatMessage").params.message_id;
    assert.equal(r.tg.state.messages.has(Number(mine)), false, "the losing upload is deleted");
  } finally { await r.close(); }
});

test("pullReadsPinnedDocumentViaGetChatGetFile", async () => {
  const r = await linked({ syncCall: true });
  try {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const seeded = r.tg.seedDocument(ANA.id, bytes);
    const got = checkSyncAnswer("syncPull", plain(await r.plugin.syncPull(r.ctx)), MANIFEST);
    assert.deepEqual(got, { blob: bytes.toString("base64"), version: String(seeded.message_id) });
    assert.deepEqual(methods(r), ["getChat", "getFile"]);
    assert.equal(r.tg.state.downloads, 1);
    const dl = r.seen.at(-1);
    assert.equal(dl.url, `${API}/file/bot${TOKEN}/documents/file_${seeded.message_id}.bin`);
    // And what a push wrote, a pull returns byte for byte.
    const blob = Buffer.alloc(4000, 7).toString("base64");
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob, expectedVersion: got.version }));
    assert.deepEqual(plain(await r.plugin.syncPull(r.ctx)), { blob, version });
  } finally { await r.close(); }
});

test("pullWithNoPinnedMessageReturnsNull", async () => {
  const r = await linked();
  try {
    assert.equal(await r.plugin.syncPull(r.ctx), null);
    // A pinned message that is not a document (the person pinned one of their own) is not a copy either.
    r.tg.pinMessage(ANA.id, r.tg.userWrites({ ...ANA, text: "mi nota" }).message_id);
    assert.equal(await r.plugin.syncPull(r.ctx), null);
    assert.equal(r.tg.state.downloads, 0);
    assert.equal(methods(r).includes("getFile"), false);
  } finally { await r.close(); }
});

test("a pinned document that is not ours (the person's own, or another file name) is never downloaded, deleted or unpinned", async () => {
  const r = await linked();
  try {
    const theirs = r.tg.seedDocument(ANA.id, Buffer.from("my notes"), { fileName: "notas.pdf", from: { id: ANA.id, is_bot: false, first_name: "Ana" } });
    assert.equal(await r.plugin.syncPull(r.ctx), null);
    // The bot's file name, but sent by the person: not ours either.
    const forged = r.tg.seedDocument(ANA.id, Buffer.from("not kino"), { from: { id: ANA.id, is_bot: false, first_name: "Ana" } });
    assert.equal(await r.plugin.syncPull(r.ctx), null);
    // The bot's own message with another file name: not ours.
    const other = r.tg.seedDocument(ANA.id, Buffer.from("other"), { fileName: "otro.bin" });
    assert.equal(await r.plugin.syncPull(r.ctx), null);
    assert.equal(r.tg.state.downloads, 0);
    assert.equal(methods(r).includes("getFile"), false);
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob: b64("ours"), expectedVersion: null }));
    assert.equal(String(r.tg.pinnedOf(ANA.id).message_id), version);
    for (const m of [theirs, forged, other]) {
      assert.equal(r.tg.state.messages.has(m.message_id), true, "not deleted");
      assert.equal(r.tg.state.pins.get(ANA.id).has(m.message_id), true, "not unpinned");
    }
    assert.equal(methods(r).some((x) => x === "deleteMessage" || x === "unpinChatMessage"), false);
  } finally { await r.close(); }
});

test("a message of the person's pinned over the copy: pull finds no copy, and the status says to unpin it (ES and EN)", async () => {
  for (const [lang, re] of [["es-CO", /mensaje tuyo fijado encima de la copia/], ["en-US", /message of yours is pinned over the copy/]]) {
    const r = await linked({ lang });
    try {
      r.tg.seedDocument(ANA.id, Buffer.from("copy"));
      r.tg.pinMessage(ANA.id, r.tg.userWrites({ ...ANA, text: "mi nota" }).message_id);
      assert.equal(await r.plugin.syncPull(r.ctx), null);
      const s = plain(await r.plugin.syncStatus(null));
      assert.match(s.message, re);
      assert.equal(r.tg.state.downloads, 0);
    } finally { await r.close(); }
  }
});

test("pullRefusesOversizedDocument", async () => {
  const r = await linked();
  try {
    const small = { maxBlobBytes: 1000 };
    // Telegram says how big it is: refused before downloading.
    r.tg.seedDocument(ANA.id, Buffer.alloc(1001, 1));
    const e = await caught(r.plugin.syncPull(small));
    assert.ok(e && e.code !== "conflict", "an error");
    assert.match(e.say, /grande/);
    assert.equal(r.tg.state.downloads, 0);
    // Telegram does not say: refused after the download, before anything is answered.
    r.tg.seedDocument(ANA.id, Buffer.alloc(1001, 2), { fileSize: undefined });
    r.tg.state.files.forEach((f) => { f.reportSize = false; });
    const e2 = await caught(r.plugin.syncPull(small));
    assert.ok(e2, "an error");
    // A push over the cap never leaves the device.
    r.tg.state.calls.length = 0;
    const e3 = await caught(r.plugin.syncPush({ ...small, blob: Buffer.alloc(1001).toString("base64"), expectedVersion: null }));
    assert.ok(e3, "an error");
    assert.deepEqual(methods(r), []);
  } finally { await r.close(); }
});

test("linkReturnsTheCandidateFromGetUpdatesAndIgnoresOtherChats", async () => {
  const r = await rig();
  try {
    // Nothing written yet: a message saying what to do, no link.
    const empty = await action(r, "findChat");
    assert.equal(empty.link, undefined);
    assert.match(empty.message, /escríbele/i);
    r.tg.userWrites({ id: 999001, username: "otra_persona", first_name: "Otra" });
    r.tg.groupWrites({});
    r.tg.channelPost();
    r.tg.userWrites(ANA);
    r.tg.userWrites({ id: 999002, first_name: "Bot", is_bot: true });
    r.tg.groupWrites({ from: { id: 7, first_name: "Tarde" } });
    const got = await action(r, "findChat");
    // The most recent private message from a person (not a bot, not a group, not a channel).
    assert.deepEqual(got.link, { candidate: "@ana_kino", confirm: "confirmChat" });
    const call = r.tg.state.calls.filter((c) => c.method === "getUpdates").at(-1);
    assert.equal(call.params.timeout, "0", "a short poll, never a long one");
    // The offset moved past what was read: those updates are acknowledged, and the candidate waits in storage.
    assert.equal(r.tg.state.updates.length, 6);
    const again = await action(r, "findChat");
    assert.deepEqual(again.link, { candidate: "@ana_kino", confirm: "confirmChat" }, "the waiting candidate is offered again");
    assert.equal(r.tg.state.updates.length, 0, "acknowledged with offset = last update_id + 1");
    // No username: the first and last name, cleaned of characters Kino refuses.
    r.tg.userWrites({ id: 401234568, first_name: "Ana​  María", last_name: "Pérez‮" });
    assert.deepEqual((await action(r, "findChat")).link, { candidate: "Ana María Pérez", confirm: "confirmChat" });
    // Never linked by finding alone.
    assert.equal(await r.plugin.syncStatus(null).then((s) => s.ready), false);
  } finally { await r.close(); }
});

test("a webhook on the bot (getUpdates 409) is explained, without the token", async () => {
  const r = await rig({ mock: {} });
  try {
    r.tg.state.webhook = true;
    r.tg.state.echoPathInErrors = true;
    const got = await action(r, "findChat");
    assert.equal(got.link, undefined);
    assert.match(got.message, /webhook|otro programa/i);
    assert.equal(got.message.includes(SECRET), false);
  } finally { await r.close(); }
});

test("confirmStoresOnlyTheOfferedChat", async () => {
  const r = await rig();
  try {
    r.tg.userWrites(ANA);
    await action(r, "findChat");
    // Someone else writes after the offer: confirming still links the chat that was offered, not the newest one.
    r.tg.userWrites({ id: 999003, username: "intrusa", first_name: "Intrusa" });
    const raw = plain(await r.plugin.action("confirmChat"));
    const done = checkSettingsOutput("action", raw, MANIFEST, (t) => t, () => {}, "confirmChat");
    assert.match(done.message, /ana_kino/);
    assert.equal(done.link, undefined);
    // Kino saves the confirmed chat into the chatId setting itself (setSettings): the person types nothing, and
    // "Send to another device" has both provision values. Only chatId, never the token.
    assert.deepEqual(done.setSettings, { chatId: String(ANA.id) });
    assert.deepEqual(Object.keys(raw.setSettings), ["chatId"]);
    assert.equal(JSON.stringify(raw).includes(SECRET), false);
    const s = plain(await r.plugin.syncStatus(null));
    assert.equal(s.ready, true);
    assert.match(s.message, new RegExp(String(ANA.id)));
    await r.plugin.syncPull(r.ctx);
    const chatsAsked = r.tg.state.calls.filter((c) => c.method === "getChat").map((c) => c.params.chat_id);
    assert.deepEqual([...new Set(chatsAsked)], [String(ANA.id)]);
    // The offer is used up: a second confirm without a new find is refused.
    assert.match((await action(r, "confirmChat")).message, /aparezca aquí|abre Configurar/);
  } finally { await r.close(); }
});

test("confirmWithoutAPendingLinkIsRefused", async () => {
  const r = await rig();
  try {
    r.tg.userWrites(ANA);
    const got = await action(r, "confirmChat");
    assert.match(got.message, /aparezca aquí|abre Configurar/);
    assert.equal(got.setSettings, undefined, "nothing is filled without an offer");
    assert.equal((await r.plugin.syncStatus(null)).ready, false);
    assert.equal(r.tg.state.calls.some((c) => c.method === "getUpdates"), false, "confirm never reads getUpdates itself");
    // A pending offer from another bot (the token changed since) is refused too.
    await action(r, "findChat");
    const other = await rig({ token: "7712345679:" + "B".repeat(35) });
    try {
      for (const k of r.kino.storage.keys()) other.kino.storage.set(k, r.kino.storage.get(k));
      const refused = await action(other, "confirmChat");
      assert.match(refused.message, /aparezca aquí|abre Configurar/);
      assert.equal(refused.setSettings, undefined);
    } finally { await other.close(); }
  } finally { await r.close(); }
});

test("a chat id typed or received by provisioning is used, and a bad one is refused before anything is sent", async () => {
  const r = await rig({ chatId: String(ANA.id) });
  r.tg.state.chats.set(ANA.id, { id: ANA.id, type: "private", first_name: "Ana" });
  try {
    assert.equal((await r.plugin.syncStatus(null)).ready, true);
    assert.equal(await r.plugin.syncPull(r.ctx), null);
  } finally { await r.close(); }
  for (const bad of ["-100123", "abc", "0", "1.5", "99999999999999999999"]) {
    const r2 = await rig({ chatId: bad });
    try {
      const e = await caught(r2.plugin.syncPull(r2.ctx));
      assert.equal(e?.code, "auth_required", bad);
      assert.equal(r2.seen.length, 0, bad);
      assert.equal(typeof (await r2.plugin.validateSettings({ botToken: TOKEN, chatId: bad })).chatId, "string", bad);
    } finally { await r2.close(); }
  }
});

test("tokenOnlyGoesToApiTelegramOrg", async () => {
  const r = await rig({ syncCall: true });
  const all = [];
  try {
    r.tg.userWrites(ANA);
    await r.plugin.action("findChat");
    await r.plugin.action("confirmChat");
    await r.plugin.syncStatus(null);
    await r.plugin.settingsStatus();
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob: b64("x".repeat(300)), expectedVersion: null }));
    await r.plugin.syncPull(r.ctx);
    await r.plugin.syncPush({ ...r.ctx, blob: b64("y".repeat(300)), expectedVersion: version });
    all.push(...r.seen);
  } finally { await r.close(); }
  assert.ok(all.length >= 10);
  for (const s of all) {
    const u = new URL(s.url);
    assert.equal(u.protocol, "https:");
    assert.equal(u.host, "api.telegram.org");
    assert.ok(u.pathname.startsWith(`/bot${TOKEN}/`) || u.pathname.startsWith(`/file/bot${TOKEN}/`), u.pathname);
    // Only in the path, as Telegram requires: never in the query, a header or a body.
    assert.equal(u.search.includes(SECRET), false);
    assert.equal(JSON.stringify(s.headers).includes(SECRET), false);
    assert.equal(s.body.includes(SECRET), false);
  }
});

test("errorsNeverContainTheToken", async () => {
  const leaks = (e) => [e?.message, e?.say, e?.userMessage, JSON.stringify(e ?? null), String(e)].some((t) => String(t).includes(SECRET) || String(t).includes(TOKEN));
  // Telegram's own error text carries the path with the token in it here (echoPathInErrors): it must come out scrubbed.
  const r = await linked();
  try {
    r.tg.state.echoPathInErrors = true;
    r.tg.state.chats.delete(ANA.id);
    for (const run of [() => r.plugin.syncPull(r.ctx), () => r.plugin.syncPush({ ...r.ctx, blob: b64("z"), expectedVersion: null })]) {
      const e = await caught(run());
      assert.ok(e, "an error");
      assert.equal(e.code, "auth_required");
      assert.equal(leaks(e), false, e.message);
    }
    const s = plain(await r.plugin.syncStatus(null));
    assert.equal(s.ready, false);
    assert.equal(JSON.stringify(s).includes(SECRET), false);
    assert.equal(JSON.stringify(plain(await r.plugin.settingsStatus())).includes(SECRET), false);
  } finally { await r.close(); }
  // A token Telegram does not know (401), and Telegram unreachable.
  const wrong = await rig({ token: "7712345678:AAHk3J9qXw-Zt5rLm2Pv8sYb_Nc4Ud6Ef0X", chatId: String(ANA.id) });
  try {
    wrong.tg.state.echoPathInErrors = true;
    const e = await caught(wrong.plugin.syncPull(wrong.ctx));
    assert.equal(e.code, "auth_required");
    assert.match(e.say, /token/);
    assert.equal(e.message.includes("AAHk3J9qXw"), false);
    assert.equal((await wrong.plugin.action("findChat")).message.includes("AAHk3J9qXw"), false);
  } finally { await wrong.close(); }
  const down = await rig({ chatId: String(ANA.id) });
  await down.close();
  const e = await caught(down.plugin.syncPull(down.ctx));
  assert.equal(e.code, "unavailable");
  assert.equal(leaks(e), false);
});

test("rateLimit429IsReportedWithoutSecrets", async () => {
  const r = await linked();
  try {
    r.tg.state.echoPathInErrors = true;
    r.tg.state.rateLimit = { method: "sendDocument", retryAfter: 37 };
    const e = await caught(r.plugin.syncPush({ ...r.ctx, blob: b64("x"), expectedVersion: null }));
    assert.equal(e.code, "rate_limited");
    assert.match(e.say, /37/);
    assert.equal([e.message, e.say].join(" ").includes(SECRET), false);
    // One try only: no retry inside the call (Kino retries the round later).
    assert.equal(r.tg.state.calls.filter((c) => c.method === "sendDocument").length, 1);
    r.tg.state.rateLimit = { method: "getChat", retryAfter: 5 };
    const e2 = await caught(r.plugin.syncPull(r.ctx));
    assert.equal(e2.code, "rate_limited");
    const s = plain(await r.plugin.syncStatus(null));
    assert.equal(s.ready, true, "the 429 was used up; the next status asks again");
  } finally { await r.close(); }
});

test("statusDoesNotDownload", async () => {
  const r = await linked();
  try {
    r.tg.seedDocument(ANA.id, Buffer.alloc(5000, 1));
    const s = plain(await r.plugin.syncStatus(null));
    assert.equal(s.ready, true);
    assert.match(s.message, /@ana_kino|401234567/);
    await r.plugin.settingsStatus();
    assert.deepEqual(methods(r), ["getChat", "getChat"]);
    assert.equal(r.tg.state.downloads, 0);
    assert.equal(r.seen.some((x) => x.url.includes("/file/")), false);
  } finally { await r.close(); }
});

test("status lines: no token, a token with no linked chat, a blocked bot, English", async () => {
  const none = await rig({ token: null });
  try {
    const s = plain(await none.plugin.syncStatus(null));
    assert.equal(s.ready, false);
    assert.match(s.message, /token/);
    assert.equal(none.seen.length, 0);
    assert.equal((await caught(none.plugin.syncPull(none.ctx)))?.code, "auth_required");
  } finally { await none.close(); }
  const nochat = await rig();
  try {
    const s = plain(await nochat.plugin.syncStatus(null));
    assert.equal(s.ready, false);
    assert.match(s.message, /@kino_sync_test_bot/);
    assert.match(s.message, /aparezca aquí|abre Configurar/);
    assert.deepEqual(methods(nochat), ["getMe"]);
    assert.equal((await caught(nochat.plugin.syncPush({ ...nochat.ctx, blob: b64("x"), expectedVersion: null })))?.code, "auth_required");
  } finally { await nochat.close(); }
  const blocked = await linked();
  try {
    blocked.tg.state.blocked.add(ANA.id);
    const e = await caught(blocked.plugin.syncPush({ ...blocked.ctx, blob: b64("x"), expectedVersion: null }));
    assert.equal(e.code, "auth_required");
    assert.match(e.say, /bloque/);
  } finally { await blocked.close(); }
  const en = await linked({ lang: "en-US" });
  try {
    const s = plain(await en.plugin.syncStatus(null));
    assert.match(s.message, /^Connected/);
    assert.match((await action(en, "confirmChat")).message, /wait for it to show up here/);
  } finally { await en.close(); }
});

test("setup texts read well inside the Connect form and on the provider row: they never send the person to Connect (ES and EN)", async () => {
  for (const lang of ["es-CO", "en-US"]) {
    const none = await rig({ token: null, lang });
    try {
      const s = plain(await none.plugin.syncStatus(null));
      assert.doesNotMatch(s.message, /Conectar|Connect/);
      assert.doesNotMatch((await caught(none.plugin.syncPull(none.ctx))).say, /Conectar|Connect/);
    } finally { await none.close(); }
    const nochat = await rig({ lang });
    try {
      const e = await caught(nochat.plugin.syncPush({ ...nochat.ctx, blob: b64("x"), expectedVersion: null }));
      assert.equal(e.code, "auth_required");
      assert.doesNotMatch(e.say, /Conectar|Connect/);
    } finally { await nochat.close(); }
  }
});

const walk = (n, f) => { if (n && typeof n === "object") { f(n); for (const c of n.children || []) walk(c, f); for (const it of n.items || []) for (const c of it.children || []) walk(c, f); } };
const shown = (tree) => {
  const out = { settings: [], buttons: [], texts: [], fields: [], forms: [], steps: [], every: tree.every };
  walk(tree, (n) => {
    if (n.type === "settings") out.settings.push(...n.keys);
    else if (n.type === "ElevatedButton" || n.type === "TextButton") out.buttons.push(n.labelText);
    else if (n.type === "Text") out.texts.push(n.text);
    else if (n.type === "TextField") out.fields.push([n.key, n.obscureText === true]);
    else if (n.type === "Form") out.forms.push(n.key);
    else if (n.type === "steps") out.steps.push(...n.items.map((i) => i.state));
  });
  return out;
};
const view = async (r, state = {}, device = "phone") => {
  const tree = plain(await r.plugin.screen({ state, device }));
  assert.deepEqual(checkScreenTree(tree, "es", undefined, { settings: undefined }).dropped, [], "Kino keeps every node of the tree");
  return shown(tree);
};

test("the steps by stage: the token first, then the chat, then connected; every secret masked, two languages on every text", async () => {
  const none = await rig({ token: null });
  try {
    const v = await view(none);
    assert.deepEqual(v.steps, ["current", "pending", "pending"]);
    assert.deepEqual([v.buttons, v.forms, v.fields, v.settings], [["Abrir @BotFather", "Guardar"], ["tokenForm"], [["token", true]], []], "the token is typed in a masked field of a form, never in Kino's settings node");
    assert.deepEqual(v.every, { ms: 4000, event: "tick" });
    const tree = plain(await none.plugin.screen({ state: {} }));
    walk(tree, (n) => { if (n.type === "Text" && n.style !== "body") assert.ok((n.textEn && n.textEn !== n.text) || n.text === "Sync-Gram", JSON.stringify(n)); });
  } finally { await none.close(); }
  const nochat = await rig();
  try {
    const v = await view(nochat);
    assert.deepEqual(v.steps, ["done", "current", "pending"]);
    assert.deepEqual(v.buttons, []);
    assert.ok(v.texts.some((x) => /escríbele cualquier cosa/.test(x)));
  } finally { await nochat.close(); }
  const connected = await linked();
  try {
    const v = await view(connected);
    assert.deepEqual(v.steps, ["done", "done", "current"]);
    assert.deepEqual(v.buttons, ["Revisar el estado", "Cambiar de chat"]);
    assert.deepEqual(v.fields, [["chatId", false]], "the chat id is a plain field bound to its setting, under Avanzado");
    const back = await view(connected, { edit: "token" });
    assert.deepEqual(back.steps, ["current", "pending", "pending"], "tapping the done token step opens it again");
  } finally { await connected.close(); }
});

test("save_token asks Telegram with the typed token before keeping it: a good one is written through config, a bad one is not", async () => {
  const r = await rig({ token: null });
  try {
    const ev = async (value) => plain((await r.plugin.screenEvent({ name: "save_token", value, state: {}, device: "phone" })) ?? null);
    const bad = await ev({ token: "12ab" });
    assert.equal(bad.config, undefined);
    assert.match(bad.state.msg, /no parece un token/);
    assert.equal(r.seen.length, 0, "a token of the wrong shape never reaches the network");
    const wrong = await ev({ token: "7712345678:AAHk3J9qXw-Zt5rLm2Pv8sYb_Nc4Ud6Ef0X" });
    assert.equal(wrong.config, undefined, "Telegram refused it: nothing is saved");
    assert.ok(!JSON.stringify(wrong).includes("AAHk3J9qXw"), "the typed token is never echoed");
    const good = await ev({ token: TOKEN });
    assert.deepEqual(good.config, { botToken: TOKEN });
    assert.equal(good.state.bot, "kino_sync_test_bot");
    assert.ok(!JSON.stringify(good.state).includes(SECRET), "the secret never goes into the screen's state");
    assert.ok(r.seen.every((x) => x.url.startsWith(API + "/")), "only api.telegram.org");
  } finally { await r.close(); }
});

test("the chat is found by itself while the screen is open; the person confirms it, declines it, or changes chat", async () => {
  const r = await rig();
  try {
    const ev = async (name, state = {}) => plain((await r.plugin.screenEvent({ name, state, device: "phone" })) ?? null);
    const quiet = await ev("tick");
    assert.equal(quiet.state.bot, "kino_sync_test_bot");
    assert.equal(quiet.state.candidate, null);
    r.tg.userWrites(ANA);
    const heard = await ev("tick", { bot: "kino_sync_test_bot" });
    assert.equal(heard.state.candidate, "@ana_kino");
    const v = await view(r, { bot: "kino_sync_test_bot", candidate: "@ana_kino" });
    assert.deepEqual(v.buttons, ["Abrir @kino_sync_test_bot", "Sí, soy yo", "No soy yo"]);
    assert.ok(v.texts.some((x) => /@ana_kino\. ¿Eres tú\?/.test(x)));
    // Nothing is linked by being heard: only the press does it.
    assert.equal((await ev("tick", { bot: "kino_sync_test_bot" })).state.candidate, "@ana_kino");
    assert.equal(plain(await r.plugin.syncStatus(null)).ready, false);
    // "No soy yo": the waiting candidate is dropped.
    await ev("decline");
    assert.equal((await ev("tick", { bot: "kino_sync_test_bot" })).state.candidate, null);
    r.tg.userWrites(ANA);
    await ev("tick", { bot: "kino_sync_test_bot" });
    const done = await ev("confirm");
    assert.deepEqual(done.config, { chatId: String(ANA.id) });
    assert.match(done.state.msg, /Listo: Kino usará tu chat con @ana_kino/);
    // Cambiar de chat: the link and the setting go, and the screen listens again.
    const out = await ev("change");
    assert.deepEqual(out.config, { chatId: null });
  } finally { await r.close(); }
});

test("a screen's timer never links a chat: confirm needs a waiting candidate the same bot offered", async () => {
  const r = await rig();
  try {
    const refused = plain(await r.plugin.screenEvent({ name: "confirm", state: {}, device: "phone" }));
    assert.equal(refused.config, undefined);
    assert.match(refused.state.msg, /escríbele a tu bot/);
  } finally { await r.close(); }
});

test("the TV draws no setup: a status line, and nothing that asks for anything", async () => {
  const r = await rig({ token: null, device: "tv" });
  try {
    const v = await view(r, {}, "tv");
    assert.deepEqual([v.buttons, v.settings], [[], []]);
    assert.ok(v.texts.some((x) => /Recibir configuración/.test(x)));
  } finally { await r.close(); }
});

test("the setup says to mute the bot's chat, in both languages", async () => {
  const src = readFileSync(join(PLUGIN_DIR, "plugin.js"), "utf8");
  assert.match(src, /Silencia el chat del bot en Telegram para que las copias no te avisen\./);
  assert.match(src, /Mute the bot's chat in Telegram so the copies don't notify you\./);
});


test("validateSettings checks the token's shape and the chat id", async () => {
  const r = await rig();
  try {
    assert.equal(await r.plugin.validateSettings({ botToken: TOKEN }), null);
    assert.equal(await r.plugin.validateSettings({ botToken: TOKEN, chatId: String(ANA.id) }), null);
    assert.match((await r.plugin.validateSettings({ botToken: "123:abc" })).botToken, /token/);
    assert.match((await r.plugin.validateSettings({ botToken: "bot" + TOKEN })).botToken, /token/);
    assert.equal(r.seen.length, 0, "validating sends nothing");
  } finally { await r.close(); }
});

test("a blob at the manifest's maxBlobBytes goes up and comes back through kino.fetch inside the sync calls", async () => {
  const r = await linked({ syncCall: true });
  try {
    const blob = Buffer.alloc(MANIFEST.sync.maxBlobBytes, 9).toString("base64");
    const { version } = plain(await r.plugin.syncPush({ ...r.ctx, blob, expectedVersion: null }));
    const kept = checkSyncAnswer("syncPull", plain(await r.plugin.syncPull(r.ctx)), MANIFEST);
    assert.equal(kept.blob.length, blob.length);
    assert.equal(kept.blob === blob, true);
    assert.equal(kept.version, version);
  } finally { await r.close(); }
});
