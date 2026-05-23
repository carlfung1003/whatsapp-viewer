# whatsapp-viewer

A local-only web dashboard for your personal WhatsApp data, paired with the [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) bridge. Sidebar of chats, per-chat view with reactions and quoted replies rendered inline, click-to-load image previews, plus a cross-chat "Image drops" dashboard for tracking auction-style image bursts in business groups.

Built in one evening to scratch a personal itch for a specific use case (tracking which items in a vintage-luxury auction group got claimed) — captures the full stack so anyone with a similar workflow can reproduce it.

## What you end up with

Two always-on services on your Mac:

- **`:8080`** — the WhatsApp bridge (Go, [whatsmeow](https://github.com/tulir/whatsmeow)), paired once to your personal WhatsApp via QR. Captures every message, reaction, and quoted-reply context into a local SQLite DB. Runs as a LaunchAgent.
- **`:8081`** — this viewer (Next.js 16), reads the bridge's SQLite read-only. Runs as a LaunchAgent.

Plus an MCP server that exposes the same data to Claude Code if you want to query it conversationally.

## Architecture

```
WhatsApp (your phone, primary device)
    │
    │  WhatsApp Web protocol (linked device)
    ▼
┌──────────────────────────────────────────┐
│  whatsapp-bridge (Go, :8080)             │
│   • whatsmeow client                     │
│   • SQLite store/messages.db (history)   │
│   • SQLite store/whatsapp.db (session)   │
│   • REST POST /api/download for media    │
└──────────────────────────────────────────┘
    │ reads SQLite                │ POST /api/download
    │ read-only                   │
    ▼                             ▼
┌──────────────────┐         ┌────────────────────────────┐
│  whatsapp-viewer │         │  whatsapp-mcp-server       │
│  (Next.js, :8081)│         │  (Python, stdio MCP)       │
│  • Sidebar       │         │  • search_contacts         │
│  • Chat detail   │         │  • list_messages           │
│  • /drops        │         │  • list_reactions          │
│  • /api/media/*  │         │  • send_message etc.       │
└──────────────────┘         └────────────────────────────┘
        │                                │
        ▼                                ▼
   your browser                  Claude Code session
```

## Prerequisites

- macOS (LaunchAgents are macOS-specific; the rest is cross-platform)
- Go 1.24+
- Node 22+ (via nvm or homebrew)
- Python 3.11+ via [uv](https://github.com/astral-sh/uv)
- ffmpeg (optional, only needed for sending voice messages)
- A spare WhatsApp linked-device slot (you have 4 total — Mac/Windows/Web etc. each use one)

## Setup

### 1. Clone and patch the bridge

```bash
# Use the fork with our patches (reactions + quoted-replies capture, filename
# collision fix, QR-to-PNG helper, whatsmeow API update via PR #245)
git clone https://github.com/carlfung/whatsapp-mcp.git ~/whatsapp-mcp
cd ~/whatsapp-mcp/whatsapp-bridge
go build -o whatsapp-bridge .
```

The bridge ships with `whatsmeow` pinned to early 2025, which WhatsApp's server now rejects with "Client outdated" (HTTP 405). Our fork includes the fix.

### 2. Pair WhatsApp

Run the bridge once in the foreground to see the QR code:

```bash
cd ~/whatsapp-mcp/whatsapp-bridge
./whatsapp-bridge
```

The QR will render as half-block Unicode in your terminal. If your terminal can't render it cleanly, the bridge also writes the raw QR data to `/tmp/whatsapp-qr.txt`. Convert it to a scannable PNG:

```bash
uv run --with "qrcode[pil]" python -c "
import qrcode
qrcode.make(open('/tmp/whatsapp-qr.txt').read().strip(), box_size=12, border=2).save('/tmp/wa-qr.png')
" && open /tmp/wa-qr.png
```

On your phone: WhatsApp → Settings → Linked Devices → Link a Device → scan.

The bridge will sync your full history (can take a few minutes if you have lots of chats). You'll see "Stored N messages" logged repeatedly. Stop the bridge with Ctrl+C once "History sync complete" appears — we'll daemonize it next.

### 3. Daemonize the bridge (LaunchAgent)

Save as `~/Library/LaunchAgents/dev.<you>.whatsapp-bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.<you>.whatsapp-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/<you>/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/<you>/whatsapp-mcp/whatsapp-bridge</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key>
    <string>/Users/<you>/whatsapp-mcp/whatsapp-bridge/whatsapp.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/<you>/whatsapp-mcp/whatsapp-bridge/whatsapp.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.<you>.whatsapp-bridge.plist
launchctl print gui/$(id -u)/dev.<you>.whatsapp-bridge | grep state
# should print: state = running
```

### 4. Install the viewer

```bash
git clone https://github.com/carlfung/whatsapp-viewer.git ~/whatsapp-viewer
cd ~/whatsapp-viewer
npm install
npm run dev    # localhost:8081
```

The viewer expects the bridge at `~/whatsapp-mcp/whatsapp-bridge/store/`. If your bridge lives elsewhere, edit `BRIDGE_STORE` in `lib/db.ts`.

#### Optional: Claude API key for the AI summary feature

The chat-detail "Summarize" button uses Claude Sonnet 4.6 to summarize the loaded messages. Set up an API key:

```bash
cp .env.example .env.local
# edit .env.local and paste your key from https://console.anthropic.com/settings/keys
```

Restart the dev server. Without a key, the button still appears but returns a clear error. Prompt caching is enabled so follow-up questions on the same chat are cheap (~$0.005 first call, ~$0.0005 each subsequent).

### 5. Daemonize the viewer (LaunchAgent)

```bash
npm run build
```

Then a plist similar to the bridge's, but running `npm run start` instead of the binary. Example in this repo at `launchagents/dev.example.whatsapp-viewer.plist`.

### 6. (optional) Wire the MCP server into Claude Code

```bash
cd ~/whatsapp-mcp/whatsapp-mcp-server && uv sync
claude mcp add --scope user whatsapp -- \
  /opt/homebrew/bin/uv --directory /Users/<you>/whatsapp-mcp/whatsapp-mcp-server run main.py
```

Restart Claude Code. `mcp__whatsapp__*` tools will appear in the deferred tool list — `list_chats`, `list_messages`, `list_reactions`, `search_contacts`, etc.

## Features

- **Sidebar** — top chats sorted by real last activity (computed from `MAX(messages.timestamp)`, not the stale `chats.last_message_time`). Client-side search filter. Group/DM tag + message count.
- **Chat detail** — last 200 messages, sender LIDs resolved to contact names via the bridge's `whatsmeow_lid_map` + `whatsmeow_contacts` tables. Quoted replies show a preview of the message they're quoting. Reactions appear inline next to the timestamp with the reactor's name. In-chat search filter.
- **Image drops banner** — clusters of ≥5 images from the same sender within 5 minutes get a dedicated grid above the messages. Each tile is click-to-load (saves your model quota — no images are fetched until you ask). Tiles turn green when they have a reaction ("claimed" in auction-style group workflows). Per-drop counts of reactions and quoted-replies make it easy to spot which items generated interest.
- **Cross-chat /drops dashboard** — every image burst across every chat over the last 1/3/7/14/30 days, sorted by recency. Shows chat name, sender, time range, item count, reactions, quoted replies, and a `%claimed` rate. Click into the source chat for detail.
- **`/api/media/[chat_jid]/[msg_id]`** — checks the bridge's local cache first, falls back to triggering a fresh download via the bridge's REST endpoint, streams the decrypted bytes with the right Content-Type. Returns HTTP 410 for media WhatsApp has purged from their CDN (everything older than ~30–45 days) so the UI can render a soft "expired" placeholder.

## Querying the SQLite directly

The bridge's `messages.db` is plain SQLite. You can poke at it any way you'd query any SQLite — the viewer is just one UI on top.

### CLI

```bash
sqlite3 ~/whatsapp-mcp/whatsapp-bridge/store/messages.db
# inside:
.headers on
.mode column
.tables
.schema messages
```

For LID→name resolution, the contact metadata lives in a separate DB next door:

```bash
# open both at once
sqlite3 ~/whatsapp-mcp/whatsapp-bridge/store/messages.db
ATTACH '/Users/<you>/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db' AS wa;
SELECT m.id, m.sender, c.push_name, c.full_name, m.content
FROM messages m
LEFT JOIN wa.whatsmeow_lid_map lm ON lm.lid = m.sender
LEFT JOIN wa.whatsmeow_contacts c
  ON c.their_jid = COALESCE(lm.pn, m.sender) || '@s.whatsapp.net'
WHERE m.chat_jid = '<group_jid>@g.us' ORDER BY m.timestamp DESC LIMIT 20;
```

### GUI

[TablePlus](https://tableplus.com/) (or any SQLite GUI — DB Browser for SQLite is free) → open `messages.db` read-only. Tab over to the `messages`, `chats`, `reactions` tables; sort, filter, export to CSV. Don't `ATTACH` from the GUI if you want to enforce read-only — open the two DBs as separate connections.

### Schema cheat sheet

```
chats        (jid, name, last_message_time)
messages     (id, chat_jid, sender, content, timestamp, is_from_me,
              media_type, filename, url, media_key, file_sha256,
              file_enc_sha256, file_length, quoted_message_id)
reactions    (target_id, target_chat_jid, reactor, emoji, timestamp)
```

In `whatsapp.db` (whatsmeow's own store):

```
whatsmeow_lid_map   (lid, pn)        -- LID → phone number
whatsmeow_contacts  (our_jid, their_jid, first_name, full_name, push_name, ...)
whatsmeow_device    (jid, ...)       -- your paired device, includes your own jid
```

### Useful sample queries

```sql
-- Top 20 most active chats over the last 7 days
SELECT c.name, COUNT(*) AS msgs
FROM messages m JOIN chats c ON c.jid = m.chat_jid
WHERE m.timestamp > datetime('now', '-7 days')
GROUP BY c.jid ORDER BY msgs DESC LIMIT 20;

-- Image bursts: ≥10 images from one sender within 5 minutes
SELECT chat_jid, sender, MIN(timestamp) AS start, COUNT(*) AS n
FROM messages WHERE media_type = 'image'
GROUP BY chat_jid, sender, strftime('%Y%m%d%H%M', timestamp)
HAVING n >= 10 ORDER BY start DESC;

-- Reaction emoji frequency across all chats (last 30 days)
SELECT emoji, COUNT(*) AS n
FROM reactions WHERE timestamp > datetime('now', '-30 days')
GROUP BY emoji ORDER BY n DESC;

-- Messages I sent that someone reacted to, with the reactor + emoji
SELECT m.timestamp, m.content, r.emoji, r.reactor
FROM messages m JOIN reactions r ON r.target_id = m.id
WHERE m.is_from_me = 1 ORDER BY m.timestamp DESC LIMIT 50;

-- Quoted-reply chains: who's replying to whom
SELECT replied.sender AS reply_sender, target.sender AS quoted_sender,
       replied.content AS reply, target.content AS quoted
FROM messages replied
JOIN messages target ON target.id = replied.quoted_message_id
WHERE replied.timestamp > datetime('now', '-7 days')
LIMIT 50;

-- Activity heatmap (UTC hour of day × day of week)
SELECT strftime('%w', timestamp) AS dow, strftime('%H', timestamp) AS hour,
       COUNT(*) AS n
FROM messages GROUP BY dow, hour ORDER BY dow, hour;

-- Find messages mentioning a keyword
SELECT m.timestamp, c.name AS chat, m.sender, m.content
FROM messages m JOIN chats c ON c.jid = m.chat_jid
WHERE m.content LIKE '%keyword%' ORDER BY m.timestamp DESC LIMIT 50;

-- All chats with at least one message in the last 24h, by last activity
SELECT c.name, MAX(m.timestamp) AS last
FROM chats c JOIN messages m ON m.chat_jid = c.jid
WHERE m.timestamp > datetime('now', '-1 day')
GROUP BY c.jid ORDER BY last DESC;
```

The viewer at `/sql` has these and more pre-loaded.

## Iteration workflow

To work on the viewer while the production LaunchAgent is running:

```bash
launchctl bootout gui/$(id -u)/dev.<you>.whatsapp-viewer
cd ~/whatsapp-viewer
npm run dev     # HMR, code changes live
# ...edit...
npm run build
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.<you>.whatsapp-viewer.plist
```

The bridge LaunchAgent can stay running through viewer iteration — they're independent.

## Privacy

- **Everything is local.** No cloud anywhere. The bridge's SQLite contains your entire WhatsApp history, including media decryption keys; the viewer reads it read-only. Nothing leaves your Mac unless you choose to expose `:8081` via Tailscale Serve, Cloudflare Tunnel, etc.
- **The `whatsapp-bridge/store/` directory holds session creds + decrypted message history.** It is git-ignored at multiple layers. Never commit it. Never rsync it to an unencrypted destination.
- **MCP exposure is opt-in.** When wired up, Claude Code reads your messages on demand. The same prompt-injection caveat as any agent-readable inbox applies — a malicious message could attempt to instruct the assistant. If you don't want this risk, skip step 6.
- **WhatsApp ToS.** Unofficial clients (whatsmeow, Baileys, etc.) violate the personal-WhatsApp terms of service. Account-ban risk is low for read-heavy use but non-zero. Pair a number you'd accept losing if you're cautious.

## Credit

The bridge is a fork of [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp). Read the upstream README and [Simon Willison's "lethal trifecta"](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) before exposing it to an LLM.

## License

MIT
