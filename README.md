# whatsapp-viewer

A local-only web dashboard for your personal WhatsApp data, paired with the [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) bridge.

- **Sidebar + chat detail** with sender names resolved, reactions and quoted replies rendered inline
- **`/needs-reply`** — DMs where the latest message is theirs and you haven't responded
- **`/contacts`** — every person you've ever messaged, with per-contact timelines across all chats
- **`/drops`** — auction-style image bursts across groups (claim rates, quoted replies)
- **`/iluxury`** — claim ledger for vintage-luxury group with paid/shipped toggles (persistent state)
- **`/stats`** — recharts-powered: top chats, daily volume, media types, reaction emojis, activity heatmap
- **`/sql`** — read-only playground with 10 sample queries, ⌘+Enter to run, localStorage history
- **`/insights`** — 11 analytics views over your data (reply latency, drifting relationships, awkwardness detector, conversation simulator, relationship snapshot PNGs, topic clustering, birthday inference, etc.)
- **`/chat/[jid]/replay`** — scrubbable conversation timeline, 1×–600× playback speeds, reactions appear at their real timestamps
- **✨ AI features** — Sonnet 4.6 via Anthropic API with prompt caching for chat summary, reply simulation, drift re-opener composition, and topic clustering
- **Click-to-load image previews** with HTTP 410 graceful fallback for CDN-expired media
- **37 Playwright smoke tests**, 8-second runtime (`npm test`)

Built to scratch a personal itch (tracking auction items) and grew into a personal analytics suite for WhatsApp data — captures the full stack so anyone with a similar workflow can reproduce it.

## What you end up with

Two always-on services on your Mac:

- **`:8080`** — the WhatsApp bridge (Go, [whatsmeow](https://github.com/tulir/whatsmeow)), paired once to your personal WhatsApp via QR. Captures every message, reaction, and quoted-reply context into a local SQLite DB. Runs as a LaunchAgent.
- **`:8081`** — this viewer (Next.js 16), reads the bridge's SQLite read-only and writes viewer-managed state (paid/shipped toggles, topic-cluster cache) to a separate SQLite at `~/whatsapp-viewer-state/state.db`. Runs as a LaunchAgent.

Plus:

- An **MCP server** that exposes the same data to Claude Code if you want to query it conversationally.
- An optional **daily digest** LaunchAgent (`scripts/wa-digest.py` — see comments) that drafts a Gmail summary of needs-reply DMs + top activity, using your existing `google_workspace_mcp` OAuth credentials.

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
┌──────────────────────────┐         ┌────────────────────────────┐
│  whatsapp-viewer         │         │  whatsapp-mcp-server       │
│  (Next.js 16, :8081)     │         │  (Python, stdio MCP)       │
│  • Sidebar / chat detail │         │  • search_contacts         │
│  • /drops · /iluxury     │         │  • list_messages           │
│  • /stats · /sql         │         │  • list_reactions          │
│  • /needs-reply          │         │  • send_message etc.       │
│  • /contacts             │         └────────────────────────────┘
│  • /insights (11 views)  │                     │
│  • /chat/[jid]/replay    │                     ▼
│  • /api/media/*          │              Claude Code session
│  • Claude API (summary,  │
│    simulator, reopener,  │
│    topics)               │
└──────────────────────────┘
        │                  │
        ▼                  ▼
   your browser    ~/whatsapp-viewer-state/state.db
                   (paid/shipped toggles, topic-cluster cache)
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

### Browsing

- **Sidebar** — top chats sorted by real last activity (computed from `MAX(messages.timestamp)`, not the stale `chats.last_message_time`). Client-side search filter. Chats with numeric-looking names are back-filled via `resolveName()` (whatsmeow_lid_map → whatsmeow_contacts → push_name). Group/DM tag + message count. Top nav: Reply, People, Drops, iLuxury, Stats, Insights, SQL.
- **Chat detail** — last 200 messages, sender LIDs resolved to contact names. Quoted replies show a preview of the message they're quoting. Reactions appear inline next to the timestamp with the reactor's name. **Order toggle** (`↓ Newest` / `↑ Oldest`) flips chronological direction with the preference saved per browser. In-chat search filter. **▶ Replay** button jumps to the scrubbable timeline.
- **LID/PN dedup** — WhatsApp's gradual rollout of LID addressing splits a DM into two `chat_jid` rows (one `<phone>@s.whatsapp.net`, one `<lid>@lid`). The sidebar merges these into one row using `whatsmeow_lid_map`, and the chat-detail view pulls messages from both halves. Bookmarks of either URL still resolve correctly.

### Needs reply (`/needs-reply`)

DMs where the latest message is from them and is older than 2 hours (configurable). Group chats are excluded (no @-mention detection yet). Sorted by recency. One-click to the chat. Designed to be the first page you open in the morning.

### Contacts (`/contacts`, `/contact/[key]`)

Every person you've ever messaged, aggregated across all chats. The contacts list shows last-active time and message count. Click a contact for a **per-contact timeline** that shows their messages across every chat they appear in (groups + DMs), with chat-name pills that filter the timeline client-side. Useful for catching "what was the last thing X said to me anywhere?" without remembering which group.

### Image drops

- **Per-chat drops banner** — clusters of ≥5 images from the same sender within 5 minutes get a dedicated grid above the messages. Each tile is click-to-load (saves your model quota — no images are fetched until you ask). Tiles turn green when they have a reaction ("claimed" in auction-style group workflows). Per-drop counts of reactions and quoted-replies make it easy to spot which items generated interest.
- **Cross-chat `/drops` dashboard** — every image burst across every chat over the last 1/3/7/14/30 days, sorted by recency. Each card shows chat name, sender, time range, item count, reactions, quoted replies, and a `%claimed` rate. The first 8 thumbnails are shown inline (click to load real bytes), plus a `+N` indicator for the rest.
- **`/api/media/[chat_jid]/[msg_id]`** — checks the bridge's local cache first, falls back to triggering a fresh download via the bridge's REST endpoint, streams the decrypted bytes with the right Content-Type. Returns HTTP 410 for media WhatsApp has purged from their CDN (everything older than ~30–45 days) so the UI can render a soft "expired" placeholder.

### iLuxury claim ledger (`/iluxury`)

The motivating use case. A vintage-luxury auction group posts image bursts ("drops"); customers react with an emoji to claim an item; sellers manually track paid/shipped status. This view:

- Detects drops from the bridge SQLite (≥5 images, same sender, within 5 min).
- Joins each item to its reaction (= claimer) and to a writable **`claim_state`** table in `~/whatsapp-viewer-state/state.db`.
- Renders an accordion of drops with per-item rows: claimer name, paid/shipped checkboxes (POST `/api/iluxury/claim`, optimistic UI), and a green border when claimed.
- Window selector (7/14/30/60/90d) preserved in the URL; per-chat picker for groups with "iluxury" in the name.

### Conversation replay (`/chat/[jid]/replay`)

Scrubbable timeline of any chat. Drag the slider or press play; messages animate in at their actual timestamps, reactions appear when they happened. Speed control: 1× (real-time) → 600× (a day per second). Auto-scrolls to the bottom as messages appear. Useful for surfacing pacing patterns that disappear in a static log view — burst moments, awkward pauses, reaction storms.

### Insights hub (`/insights`)

11 analytics views over your chat history. All read-only over the bridge SQLite; AI-backed views use Sonnet 4.6 via the Anthropic API.

| Route | What | Backend |
|---|---|---|
| `/insights/reply-latency` | Median / p90 time-to-reply per DM (windowed SQL `LEAD` over `messages`) | SQL |
| `/insights/initiator` | Conversation-start ratio per DM — who reaches out first after ≥6h silence | SQL (windowed `LAG`) |
| `/insights/calendar` | GitHub-style year grid of daily message volume, 5-bucket intensity | SQL |
| `/insights/drifting` | DMs where current 90d volume dropped >50% from prior 90d. Includes **"✦ Compose re-opener"** Claude button per row — generates a contextual opener referencing your last shared topic | SQL + Claude |
| `/insights/words` | Top words + emojis in a specific chat (stopword-filtered, emoji regex via `\p{Extended_Pictographic}`) | SQL |
| `/insights/reactions` | Your messages that got the most reactions + emoji-traffic (given vs received) | SQL |
| `/insights/awkward` | Moments where reply rhythm jumped from <X min to ≥24h (≥5× the chat's normal cadence). Shows the message that landed before the silence | SQL |
| `/insights/simulator` | Pick a contact, type a draft, get Claude's prediction of how that specific person would actually reply, based on their past message patterns | Claude |
| `/insights/snapshot` | Spotify-Wrapped-style 1200×630 PNG card per contact (totals, peak hour, longest silence, top emoji, reaction traffic) via `next/og`. Downloadable | next/og + SQL |
| `/insights/topics` | Claude clusters recent DMs into 4–8 themes ("wedding planning", "work logistics"). 24h cache in `topic_cache` table to avoid re-spending tokens | Claude (cached) |
| `/insights/birthdays` | Birthdays inferred from past 🎂 / "happy birthday" / 生日快樂 / HBD messages. DMs use Carl→partner wishes; groups use ≥2 distinct wishers + @-mention recipient detection. Dates extracted via `strftime(...'localtime')` to avoid V8 TZ off-by-one. `.ics` export to import into Google Calendar | SQL |

The Claude-backed views (`drifting` re-opener, `simulator`, `topics`) all require `ANTHROPIC_API_KEY` in `.env.local`. Without one, the AI buttons return clear errors but the rest of the page still loads.

### `/stats` dashboard

[Recharts](https://recharts.org/)-powered visualizations:

- **Top chats by message count** — horizontal bar, top 12 (resolved name).
- **Messages per day** — line chart over the selected window.
- **Media-type breakdown** — pie of text vs image/video/audio/document.
- **Top reaction emojis** — pie of which emojis you and your contacts use most.
- **Activity heatmap** — day-of-week × hour-of-day grid, intensity = volume, local time.
- Window selector (7/14/30/60/90/180d) preserved in the URL.

### `/sql` playground

SQL queries direct against the bridge's SQLite, browser-rendered:

- Read-only connection — writes are rejected at the SQL layer + the connection itself.
- `whatsapp.db` is `ATTACH`ed as `wa` so you can join `whatsmeow_lid_map` / `whatsmeow_contacts` without opening two connections.
- 10 pre-loaded sample queries (top chats, image bursts, emoji frequency, my-messages-that-got-reactions, quoted-reply chains, activity heatmap, keyword search, media breakdown, LID→name resolution, top senders per chat).
- ⌘+Enter to run. Hard `LIMIT 1000` auto-applied if you forget. 5-second timeout. localStorage history of your last 20 queries.

### AI chat summary

The chat detail page has an **✨ Summarize** button in the top-right that calls Claude Sonnet 4.6 on the loaded messages:

- **Prompt caching** on the system prompt + the chat transcript so follow-up questions on the same chat hit the cache (~10× cheaper).
- Quick-prompt chips ("What needs my reply?", "Action items only", etc.) plus a freeform ask box.
- Rotating loading message + pulse indicator + elapsed-seconds counter while it works.
- Renders the response inline with usage stats (input/output tokens, cache hits) in the footer.
- Requires `ANTHROPIC_API_KEY` in `.env.local` — see "Optional: Claude API key" above. Without one, the button gracefully returns "key not set."

Rough pricing on Sonnet 4.6: ~$0.03 cold (first call for a chat, 200-message context) → ~$0.002 each follow-up question within 5 minutes via the cache.

## State DB

Viewer-managed state lives in a writable SQLite at `~/whatsapp-viewer-state/state.db`, kept separate from the bridge's read-only `messages.db` so the boundary is unambiguous.

Tables:

```
claim_state  (message_id, chat_jid, paid, shipped, claimer_override, notes, updated_at)
              PRIMARY KEY (message_id, chat_jid)
              -- written by /iluxury checkboxes via POST /api/iluxury/claim
topic_cache  (cache_key, payload TEXT, created_at)
              -- cached topic-clustering results (24h TTL)
              -- written by POST /api/topics; read on cache hit to skip Claude call
```

Helpers in `lib/state-db.ts` (`getClaimStates`, `setClaimState`, `getTopicCache`, `setTopicCache`). The directory is created on first run with `0700` permissions.

## Testing

```bash
npm test          # Playwright smoke suite, 37 tests, ~8s
npm run test:ui   # Playwright UI mode
```

The suite covers:

- Every static route returns 200 with **zero console errors** (catches client-side render bugs).
- Dynamic routes with query params (chat detail, replay, drops/stats windows) return 200.
- Every API route handler returns the expected validation status on empty/invalid bodies (`/api/sql`, `/api/summarize`, `/api/iluxury/claim`, `/api/simulate`, `/api/compose-reopener`, `/api/snapshot`, `/api/birthdays.ics`).
- The snapshot OG image route returns a valid PNG when given a valid chat.
- Sidebar renders chat names from the DB.
- No broken `<img>` sources on the homepage.

Anthropic-backed routes that would spend tokens (`/api/topics` first call) are intentionally NOT exercised — only their validation paths. CI is intentionally skipped because the test fixtures depend on the local bridge SQLite.

The suite is the deployment-breakage net: pre-commit, `npm test` should pass; if it doesn't, don't push.

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

The LaunchAgent runs `npm run start` (production), so new routes/files only show up after `npm run build` + restart. For active development:

```bash
launchctl bootout gui/$(id -u)/dev.<you>.whatsapp-viewer
cd ~/whatsapp-viewer
npm run dev     # HMR, code changes live
# ...edit...
npm test        # Playwright smoke suite, ~8s
npm run build
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.<you>.whatsapp-viewer.plist
```

Or, when running the smoke suite against the production server without booting it out:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/dev.<you>.whatsapp-viewer  # restart in place
npm test                                                        # reuses :8081
```

The bridge LaunchAgent can stay running through viewer iteration — they're independent.

## Privacy

- **Everything is local.** No cloud anywhere. The bridge's SQLite contains your entire WhatsApp history, including media decryption keys; the viewer reads it read-only. Nothing leaves your Mac unless you choose to expose `:8081` via Tailscale Serve, Cloudflare Tunnel, etc.
- **The `whatsapp-bridge/store/` directory holds session creds + decrypted message history.** It is git-ignored at multiple layers. Never commit it. Never rsync it to an unencrypted destination.
- **`~/whatsapp-viewer-state/state.db`** holds your paid/shipped toggles + cached topic-clusters. It is created with `0700` permissions and lives outside the repo. Manual state only — no message content.
- **AI features send chat content to Anthropic.** Chat-summary, simulator, drift re-opener, and topic-clustering routes call the Anthropic API. Snippets of your messages go to Anthropic to generate the response. If that's not OK, don't set `ANTHROPIC_API_KEY` — the AI buttons return clear errors and the rest of the app still works.
- **MCP exposure is opt-in.** When wired up, Claude Code reads your messages on demand. The same prompt-injection caveat as any agent-readable inbox applies — a malicious message could attempt to instruct the assistant. If you don't want this risk, skip step 6.
- **WhatsApp ToS.** Unofficial clients (whatsmeow, Baileys, etc.) violate the personal-WhatsApp terms of service. Account-ban risk is low for read-heavy use but non-zero. Pair a number you'd accept losing if you're cautious.

## Credit

The bridge is a fork of [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp). Read the upstream README and [Simon Willison's "lethal trifecta"](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) before exposing it to an LLM.

## License

MIT
