# Sync-Gram: sync your Kino devices through your own Telegram bot

[Leer en español](README.es.md)

> **Unofficial: not affiliated with Telegram.** Sync-Gram is a Kino plugin that uses Telegram's
> public Bot API; Telegram does not make, endorse or support it.

This repository is **Sync-Gram**, a complete **Kino sync provider** that keeps your phone and your TV in step (history,
library, progress and settings) through a **Telegram bot that you create yourself**. Kino encrypts a
copy of your data; the plugin sends that copy to your private chat with the bot as a file and pins
it. Your other devices read the pinned file back.

There is no server of Kino's and no server of yours: only Telegram's public Bot API
(`api.telegram.org`), which is the one and only address this plugin may reach.

```
your phone ─┐                                                 ┌─ your private chat with the bot
            ├─ https ─▶ api.telegram.org (your bot's token) ──┤    📌 kino-sync.bin  (the encrypted copy)
your TV  ───┘                                                 └─ (only the newest copy is kept)
```

It is an example to learn from and to copy, published by Kino's authors as source code. Nobody runs a
bot for you: the bot is yours.

## What you need

- A Telegram account, on any device (phone, desktop or <https://web.telegram.org>).
- Kino 0.9.74 or newer on your devices.

**Why no tunnel?** Some sync providers need a tunnel because a Kino plugin may only reach public
https addresses and never your home network. Telegram's Bot API already is a public https address,
so here you need no computer that stays on, no tunnel and no server.

## 1. Create your bot with @BotFather

1. In Telegram, search for **@BotFather** (the official one has a blue check mark) and open it.
2. Send `/newbot`.
3. BotFather asks for a **name**: anything, for example `My Kino sync`.
4. It asks for a **username**: it must end in `bot`, for example `ana_kino_sync_bot`. If it is
   taken, try another.
5. BotFather answers with your bot's **token**, a line like `7712345678:AAH…` (digits, a colon and
   about 35 letters, digits, `-` or `_`). **Copy it.**
   - The token is like a password to your synced data: anyone who has it can read it (see
     [What Telegram and the plugin can read](#what-telegram-and-the-plugin-can-read)). Do not paste it
     into chats or screenshots.
   - Use this bot **only for Kino**. Do not add it to groups and do not connect it to other programs
     or bot services.
6. Tap the bot's link in BotFather's answer (`t.me/<username>`) and tap **Start**.

## 2. Install the plugin in Kino

1. On the phone, open **Menu ▸ Plugins** and tap **+** (Add plugin). On the TV, open **Plugins** and
   choose **Add plugin**.
2. Leave the type on **Kino**. In **Plugin address**, type `kinotvapp/kino-plugin-sync-gram`, then
   tap **Add**. (It is also listed in Kino's recommended plugins, from Kino 0.9.74 on: older versions
   cannot run a sync provider and do not show it.)
3. Kino shows **Install Sync-Gram**. Tap **See details** and read the line in red:
   - *Will sync your data through its service: the plugin and its service can read it.* This is
     true; see [What Telegram and the plugin can read](#what-telegram-and-the-plugin-can-read).
4. It also says *This plugin uses your username and password*: here that is the bot token. Its only
   host is `api.telegram.org`. Tap **Install**.

Kino copies the plugin to your other paired devices by that address, and each one downloads it
itself.

## 3. Turn the provider on

1. Open **Settings ▸ Settings for all profiles ▸ Sync ▸ Provider**. *Sync-Gram* is listed below
   **Local network**.
2. Turn on its switch. Kino asks **"Sync with Sync-Gram?"**:
   - local network sync turns off while you use this provider;
   - if the bot already holds data from another device, it is combined with this device's data;
     nothing that only one of them has is lost;
   - in red: the plugin and its service will be able to read the data.

   Tap **Combine with this device**.
3. The row now says *The token is missing: set it in Connect*, with a **Connect** button.

## 4. Connect: paste the token, write to your bot, confirm it is you

1. Tap **Connect**. The plugin's form opens on the phone as three numbered steps: *1. Open BotFather*,
   *2. Enter the Telegram token* and *3. Write your bot anything*. Under step 1:
   - **Help** opens a short note with what you need (a bot token from @BotFather, then write to your
     bot and confirm it is you).
   - **Open @BotFather** opens BotFather in the Telegram app (on a TV, Kino shows the address and a QR
     to open it on your phone). Kino itself makes no request to that address.
2. Paste the token into **Bot token** and tap **Save**. The **Status** line says
   *@ana_kino_sync_bot is ready. Your chat is missing: write to it and tap Check the message in the chat.*
3. In Telegram, open **your bot** and write it anything (`hi` is fine).
4. Back in Kino, tap **Check the message in the chat**. The plugin reads the messages your bot received and takes the
   most recent one written to it **in private by a person**. Messages in groups, from channels or
   from other bots are ignored.
   - Nothing yet? It says *No messages yet: open your bot in Telegram, tap Start, write it something
     and tap Check the message in the chat again.*
5. Kino asks with its own question: **"Is this you, @ana?"** (your Telegram username, or your name
   if you have none). It has **Yes, it's me** and **Cancel**.
   - **Compare that name with your own Telegram account** (in Telegram: Settings, your username under
     your name). Anyone who finds your bot can write to it; if the name is not yours, tap **Cancel**,
     write to your bot again and tap **Check the message in the chat** again.
   - **Cancel** links nothing.
   - **Yes, it's me** links that chat, and only the chat you confirm is ever used: someone who writes
     to your bot later is never used. The plugin remembers the chat it offered for 10 minutes; after that, tap **Find my
     chat** again.
6. The status line says *Connected to your chat (@ana, id 401234567). No copy saved yet.*
   Kino also fills in the **Chat id** field with that number and saves it, as if you had typed it:
   you type nothing, and **Send to another device** (step 5) has everything it needs.
7. Go back. The first sync runs at once: the row says *Synced a moment ago*, and your chat with the
   bot now shows a pinned file, `kino-sync.bin`, with the text *Kino sync copy. Do not delete or
   unpin it.* The plugin sends and pins it silently. Mute the bot's chat in Telegram so the copies
   don't notify you.

From then on, Kino pulls when it comes to the front and every 10 minutes, and pushes about 5 minutes
after something changes. **Sync now** syncs right away. Each push sends a new file, pins it and
deletes the previous one, so the chat keeps a single copy.

## 5. Add your second device

The second device needs only the same two settings, **Bot token** and **Chat id**. Kino derives the
same key from the same token, so no key ever travels between your devices, and the second device
writes nothing to the bot.

With both devices on the same Wi-Fi:

1. Install the plugin on the second device too (step 2), if it is not there yet.
2. On the **second** device (say, the TV), open **Settings for all profiles ▸ Sync ▸ Provider** and
   tap **Receive from another device** under *Sync-Gram*. For 3 minutes it shows a QR
   code, an address such as `192.168.1.`**`23`**`:38917` and a 6-digit code.
3. On the **first** device (the phone that already syncs), open the same
   screen and tap **Send to another device**.
   - Point the camera at the QR.
   - No camera, or you refused it? Kino goes to **Type address**. Type the last number of the address
     and the 6-digit code that the other device shows, then tap **Send**.
   - The phone says *Sent. Confirm it on the other device.*
4. The second device asks **"Received for Sync-Gram: apply?"**. It lists *Bot token*
   and *Chat id*, never their values. Tap **Apply**, then **Combine with this device**.

On different networks? On the phone's send screen choose **Other network** and type the words and the
code the TV shows: the receive screen opens a temporary internet route for that.

On the TV the plugin's page shows only its status and Kino's **Sync ▸ Provider** button: the setup
(BotFather, the token, the chat) is drawn on the phone only (`"devices": ["phone"]`), and the TV gets
the token and the chat id with **Receive from another device**.

## What Telegram and the plugin can read

- **The copy is encrypted.** Kino encrypts it (AES-256-GCM) before the plugin sees it. The file in
  your chat is ciphertext.
- **But the key comes from the bot token.** That is what lets a second device join with just the
  token and the chat id. So **anyone who has the token can decrypt your data**:
  - you;
  - the plugin, which reads the token to talk to Telegram;
  - **Telegram**, which issued the token and stores the file;
  - anyone who copies the token from one of your devices or from your chat with @BotFather.
- **What is in the copy:** everything Kino syncs between your devices: library, history, progress and
  settings, plus your plugins and their settings. Passwords are included, sealed again inside the
  copy.
- **What the plugin sends where:** only to `api.telegram.org`, over https. The token goes in the
  address path, which is how the Bot API works (`https://api.telegram.org/bot<token>/<method>`). The
  plugin never puts the token in an error or status message.
- **What the plugin reads in Telegram:** while you tap **Check the message in the chat**, the messages people sent to
  your bot (to find yours); after that, only the pinned file of your chat.

### Changing (rotating) the token

Do it if the token leaked, or to cut off a device you lost.

1. In @BotFather send `/revoke`, pick your bot, and copy the **new** token. The old one stops
   working at once.
2. On one device: **Connect**, paste the new token, **Save**. The chat id does not change.
3. Kino now finds a copy it cannot open (*The token does not match, or the saved data is not
   Kino's*). Tap **Reset sync** and confirm. The pinned copy is replaced by this device's copy, made
   with the new token.
4. Send the settings to your other devices again (step 5).

## Bot API limits

- Telegram takes files up to **50 MB** from a bot and hands back files up to **20 MB**. Kino's own
  limit for a sync provider is lower: this plugin declares **4 MiB** (4,194,304 bytes), the most
  Kino lets a sync provider move.
- Telegram limits how fast a bot may send (about one message per second in one chat). A sync round
  sends one file, far below that. When Telegram does say *Too Many Requests*, the plugin stops that
  round and Kino tries again later.
- Telegram deletes a bot's message only during its first 48 hours. If an old copy cannot be deleted,
  the plugin unpins it instead; you can delete it by hand.

## Troubleshooting

| What you see | What it means and what to do |
| --- | --- |
| *The token is missing: set it in Connect* | This device has no token. Tap **Connect** and paste it. |
| Status: *Telegram does not recognise the bot token. Copy it again from @BotFather.* | The token is wrong, incomplete, or was revoked. In @BotFather send `/token` (or `/revoke` for a new one), copy it whole, paste it again. |
| Under the field: *That does not look like a bot token…* | Copy only the token line from BotFather: digits, a colon and the rest, with no spaces and no `bot` in front. |
| Status: *…Your chat is missing: write to it and tap Check the message in the chat.* | The token works, but no chat is linked yet. Do step 4. |
| *No messages yet…* after **Check the message in the chat** | The bot received nothing yet. Open the bot in Telegram, tap **Start**, write it something, then tap **Check the message in the chat** again. |
| *Another program reads this bot (a webhook or another getUpdates).* | Telegram answered `409`: the bot is connected to another program or service. Create a new bot only for Kino (step 1), or remove that program's webhook. |
| *Your bot is blocked or was never started…* | You blocked the bot, or never tapped **Start**. Open it in Telegram and tap **Start** or **Unblock**. |
| *Telegram cannot find your chat: write to your bot and tap Check the message in the chat again.* | The chat id is wrong for this bot (a typo in **Chat id**, a different bot's token, or you deleted the chat). Write to the bot, tap **Check the message in the chat** and confirm: Kino fills in **Chat id** again. |
| *Telegram asks to wait 37 s before going on. Kino will try again.* | Telegram's rate limit (`429`). Nothing to do: Kino retries later. If you see it often, check that no other program uses the same bot. |
| *The last sync failed: another device was saving at the same time, it will try again* | Two devices pushed at once, or the pinned copy changed since this device last read it. Kino pulls, merges and pushes again on its own. |
| The row says *Waiting for the first sync* and the chat shows no pinned file | No copy was pushed yet. Tap **Sync now**. |
| Status: *A message of yours is pinned over the copy: unpin it in the chat with your bot. Meanwhile Kino saves a new copy.* | Telegram shows the plugin only the most recent pinned message, and the newest pin is one of yours (a message or a file the bot did not send). The plugin never reads, deletes or unpins it. Unpin it in the chat with your bot; meanwhile Kino pins a new copy above it on the next sync. |
| You deleted or unpinned `kino-sync.bin` by mistake | The bot then holds no copy. The next push saves this device's copy again; nothing on your devices is lost. Do not delete it on purpose: it is what the other devices read. |
| *The copy saved in Telegram is larger than Kino accepts.* | The copy grew over 4 MiB, the most Kino lets a sync provider move. If it persists, **Reset sync**. |
| *The token does not match, or the saved data is not Kino's*, with **Fix the token** and **Reset sync** | The pinned copy was made with another token (you rotated it on one device only). Put the current token on this device (**Fix the token**), or **Reset sync** as in [rotating the token](#changing-rotating-the-token). |

## For plugin authors

- **`plugin/plugin.js`:**
  - **Only our own copy is trusted:** a pinned message counts as the copy only when it is a document the
    bot itself sent (`from.id` is the token's bot id) named `kino-sync.bin`. Anything else pinned is never
    downloaded, deleted or unpinned, and the status line says a message of the person's is pinned over it.
  - `syncPush`: `getChat` (the chat's most recent pinned message, when ours, is the current copy; its
    `message_id` is the version, compared with `expectedVersion`, else `conflict`), `sendDocument`
    (multipart/form-data), `pinChatMessage` with `disable_notification`, `getChat` again (if another
    device's copy is now the newest pinned, the push deletes its own copy and throws `conflict`), then
    `deleteMessage` of the previous copy, or `unpinChatMessage` when Telegram refuses to delete it.
  - `syncPull`: `getChat` ▸ `pinned_message.document` ▸ `getFile` ▸ the download from
    `https://api.telegram.org/file/bot<token>/<file_path>`. No pinned document: `null`.
  - `syncStatus`: one `getChat` (or `getMe` before a chat is linked); never downloads the copy.
  - **The multipart body without decoding the blob:** `kino.fetch` sends a `{ base64 }` body's bytes
    as they are, with your `Content-Type`. The plugin writes the multipart framing as text, makes the
    text before the file a multiple of 3 bytes long (by the boundary's length), and joins
    `base64(head) + blob without its last 4 characters + base64(those 4 decoded + the closing
    boundary)`. Only one extra copy of the base64 text is made, never a decoded one.
  - **Linking:** `findChat` reads `getUpdates` (short poll, `timeout: 0`, `allowed_updates:
    ["message"]`, with the offset kept in `kino.storage` so read updates are acknowledged), keeps
    the most recent private message from a person, stores it as the pending offer (10 minutes) and
    answers `link: { candidate, confirm: "confirmChat" }`. `confirmChat` is `"linkOnly": true`, so the
    person sees one button and only Kino's "Is this you?" runs it. It takes no chat id from
    anywhere but that stored offer, checks it is a positive safe integer for the same bot, keeps it in
    `kino.storage` and answers `setSettings: { chatId }`, so Kino saves it into the `chatId` setting
    (which `sync.provision` hands to the second device). The token never goes into an answer.
  - **Configuration aids:** a short `help` (what the person needs) and a `link` to
    `https://t.me/BotFather`, both apiVersion 12.
  - **Devices:** every setup item is `"devices": ["phone"]`; the TV keeps only the status line and
    receives `botToken` and `chatId` with "Recibir desde otro aparato". The three section titles are
    the numbered steps.
  - Every error goes through a scrub that removes the token and anything token-shaped, including
    Telegram's own error descriptions.
- **The manifest:** id `sync-gram`, name `Sync-Gram`, `icon.png` (512 px, under the 128 KB limit),
  `"capabilities": ["syncProvider"]` alone, `"hosts": ["api.telegram.org"]` (no
  `fetchHosts`), and `"sync": { "mode": "poll", "pullEveryMs": 600000, "pushDebounceMs": 300000,
  "maxBlobBytes": 4194304, "keySecret": "botToken", "provision": ["botToken", "chatId"] }`.
- **Tests:** `node --test test/*.test.mjs` runs the plugin under Kino's Node kit (the `sdk/` folder
  of this repository) against `test/telegram-mock.mjs`, a local imitation of the Bot API (getMe,
  getUpdates, sendDocument with real multipart parsing, pin, unpin, delete, getChat, getFile, file
  download, 409, 429 and error answers). They need no network and no real bot.
- **The contract:** Kino's plugin guide (the `syncProvider` capability, the manifest's `sync` field
  and `action.link`), `contract.json` and `kino.d.ts` in this repository.
