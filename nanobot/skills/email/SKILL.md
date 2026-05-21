---
name: email
description: Gmail via Composio — read, search, summarize, reply, forward, send, draft, label, archive, and trash messages. Use when the user asks about inbox, email, Gmail, "any important mail", "check messages from X", "reply to", "send an email", "draft", "archive", or "unread".
metadata:
  nanobot:
    requires:
      env: []
---

# Gmail (Composio)

Handle **Gmail** for the authenticated profile using Composio Tool Router MCP tools and nanobot's `composio_connect` when OAuth is missing.

**Toolkit slug:** `gmail`  
**Full tool catalog:** https://docs.composio.dev/toolkits/gmail (~63 tools)

---

## Before you act

1. **Read this skill** for any Gmail read/send/reply/organize task.
2. **Never invent** message ids, thread ids, label ids, or tool slugs.
3. **Sending is irreversible** — confirm recipient(s), subject, and body before `GMAIL_SEND_EMAIL` or `GMAIL_REPLY_TO_THREAD`.
4. **IDs are not interchangeable:**
   - `message_id` — 15–16 char hex (e.g. `19b11732c1b578fd`)
   - `thread_id` — hex string for a conversation
   - `draft_id` — often `r`-prefixed (e.g. `r-1234567890`)
   - UUIDs, subjects, and web UI ids are **invalid** for API calls
5. **Report honestly** — only confirm send/archive/delete after `successful: true`.

---

## Composio Tool Router workflow (required)

Same pattern as calendar (see calendar skill). Summary:

1. **`COMPOSIO_SEARCH_TOOLS`** with `session: { "generate_id": true }` and atomic Gmail-scoped queries.
2. If disconnected → **`composio_connect`** (`toolkit: "gmail"`) or **`COMPOSIO_MANAGE_CONNECTIONS`**.
3. Load schemas if `schemaRef` present → **`COMPOSIO_GET_TOOL_SCHEMAS`**.
4. Execute via **`COMPOSIO_MULTI_EXECUTE_TOOL`** with saved `session_id` and **`memory`** always set.

**Search query examples:**

```json
{
  "queries": [
    { "use_case": "fetch recent unread Gmail inbox messages", "known_fields": "max: 10" },
    { "use_case": "send Gmail email", "known_fields": "recipient: jane@example.com" }
  ],
  "session": { "generate_id": true }
}
```

Split: "check email from boss and reply yes" → (1) fetch/search emails from boss (2) reply to Gmail thread.

---

## Core tools (reference — verify via search)

### Read / search

| Slug | Use when |
|------|----------|
| `GMAIL_FETCH_EMAILS` | List/search with Gmail query operators; paginate with `page_token` |
| `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID` | Full body after you have `message_id` |
| `GMAIL_FETCH_MESSAGE_BY_THREAD_ID` | All messages in a thread |
| `GMAIL_LIST_THREADS` | Thread-centric inbox view |
| `GMAIL_GET_PROFILE` | Account email address, totals |
| `GMAIL_LIST_LABELS` | Resolve custom label **ids** (`Label_123`) — display names fail |
| `GMAIL_SEARCH_PEOPLE` | Find contact email by name (not in headers) |

### Write / send

| Slug | Use when |
|------|----------|
| `GMAIL_SEND_EMAIL` | New email (not a thread reply) |
| `GMAIL_REPLY_TO_THREAD` | Reply in existing thread — **no custom subject** |
| `GMAIL_FORWARD_MESSAGE` | Forward existing message |
| `GMAIL_CREATE_EMAIL_DRAFT` | Draft for user review |
| `GMAIL_SEND_DRAFT` | Send existing draft (**recipients must already be on draft**) |

### Organize

| Slug | Use when |
|------|----------|
| `GMAIL_ADD_LABEL_TO_EMAIL` | Star, label, mark read (`remove UNREAD`) |
| `GMAIL_BATCH_MODIFY_MESSAGES` | Bulk label/archive |
| `GMAIL_MOVE_TO_TRASH` | Single message to trash |
| `GMAIL_MOVE_THREAD_TO_TRASH` | Whole thread to trash |
| `GMAIL_BATCH_DELETE_MESSAGES` | Permanent delete — **extra confirmation** |
| `GMAIL_CREATE_LABEL` | New user label |

---

## Gmail search query cheat sheet (`GMAIL_FETCH_EMAILS`)

Use the `query` parameter (Gmail search syntax):

| User intent | Query |
|-------------|-------|
| Unread inbox | `is:unread in:inbox` |
| From person | `from:alice@company.com` |
| Subject contains | `subject:invoice` |
| Last 7 days | `newer_than:7d` |
| Has attachment | `has:attachment` |
| Starred | `is:starred` |
| Important | `is:important` |
| Label (user) | `label:work` — custom labels need id via LIST_LABELS for modify ops |
| Snoozed | `is:snoozed` (**not** `label:snoozed`) |
| Combine | `from:boss is:unread newer_than:3d` |

**Pagination:** Loop until `nextPageToken` is absent. Results may not be sorted by date — sort by `internalDate` client-side when summarizing.

**Performance:** For many messages use `ids_only: true` or `verbose: false`, then fetch bodies only for messages you need.

---

## Standard workflows

### A. "Check my email / anything important?"

1. Search: fetch unread or recent Gmail messages.
2. `GMAIL_FETCH_EMAILS` with `query: "is:unread in:inbox"`, reasonable `max_results` (10–20).
3. For each important hit: optional `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID` with `format: "metadata"` or full if summary needs body.
4. Reply with: sender, subject, one-line summary, age. Offer to open/reply/archive.

**Nuanced:** "Important" may mean `is:important`, not just unread — try both if inbox empty.

### B. "Find email from X about Y"

1. `GMAIL_FETCH_EMAILS` with `from:... subject:Y` or broad `from:...` + scan subjects.
2. If name not email: `GMAIL_SEARCH_PEOPLE` first, then search by resolved email.
3. Present matches; ask which thread if multiple.

### C. "Summarize this thread / long email"

1. Get `thread_id` or `message_id` from prior fetch.
2. `GMAIL_FETCH_MESSAGE_BY_THREAD_ID` or full message fetch.
3. Summarize: who said what, decisions, action items, dates. Do not invent content not in body.

### D. "Send an email to …"

1. **Confirm** with user: To, Cc/Bcc, subject, body (show draft text).
2. Search: send Gmail email.
3. `GMAIL_SEND_EMAIL`:
   - At least one of: `recipient_email` / `to`, `cc`, `bcc`
   - At least one of: `subject`, `body`
   - `is_html: true` if body contains HTML tags
   - Attachments: need valid `s3key` from Composio upload flow — not local paths
4. Confirm sent only after success response.

**Nuanced:**

| Case | Tool |
|------|------|
| New cold email | `GMAIL_SEND_EMAIL` |
| Reply in conversation | `GMAIL_REPLY_TO_THREAD` with `thread_id` from fetch |
| "Send but let me edit first" | `GMAIL_CREATE_EMAIL_DRAFT` → show user → `GMAIL_SEND_DRAFT` |
| Reply-all | `GMAIL_REPLY_TO_THREAD` with `cc` / `extra_recipients` as needed |

### E. "Reply to the last email from X"

1. Fetch latest from X (`from:email` sort by date).
2. Extract `thread_id` (not message_id for reply tool).
3. Draft reply text → **user approval** → `GMAIL_REPLY_TO_THREAD`.

**Critical:** Do not pass `subject` to reply tool — it starts a new thread.

### F. "Archive / mark read / label"

1. Resolve `message_id` or `thread_id` from fetch.
2. Archive thread: remove `INBOX` label via `GMAIL_ADD_LABEL_TO_EMAIL` or batch modify (`removeLabelIds: ["INBOX"]`).
3. Mark read: remove `UNREAD`.
4. Custom label: `GMAIL_LIST_LABELS` → use `Label_N` id, not display name.

### G. "Delete / trash"

- Prefer **trash** (`GMAIL_MOVE_TO_TRASH`) unless user says permanent delete.
- Permanent: `GMAIL_BATCH_DELETE_MESSAGES` — require explicit confirmation; irreversible.

---

## Send safety checklist

Before any send/reply/forward:

- [ ] Recipient email validated (full `user@domain.com`)
- [ ] Subject appropriate (new mail only)
- [ ] Body reviewed (no placeholder text)
- [ ] Reply uses correct `thread_id`
- [ ] Attachments under ~25 MB total
- [ ] User confirmed (especially external / sensitive)

---

## Cross-skill: email → calendar

If user says "add the meeting from that email to my calendar":

1. Complete email read (this skill) — extract time, title, location, attendees from body/invite.
2. Switch to **calendar** skill — search + create event with ISO datetimes.
3. Do not assume ICS parsing unless a tool returns structured invite data.

---

## Error handling

| Error | Action |
|-------|--------|
| Invalid id value | Re-fetch ids from FETCH_EMAILS / LIST_THREADS |
| 401 / not connected | `composio_connect` for `gmail` |
| Empty messages array | Valid — report no matches; widen query |
| Rate limit | Back off; reduce batch size |
| Draft send with no recipients | Create new draft with recipients or use SEND_EMAIL |

---

## User-facing response style

- Summarize emails in plain language; quote sparingly.
- For sends: "Sent to **jane@example.com** — subject: **Project update**."
- Never paste raw base64 bodies or full MIME.
- On iMessage/SMS, keep summaries short; offer "want the full text?"

---

## Config hints

```json
"tools": {
  "composio": {
    "enabled": true,
    "mode": "toolRouter",
    "toolkits": ["gmail", "google_calendar"]
  }
}
```

Per-profile Composio `user_id` (Sendblue/WebSocket profiles) keeps inboxes isolated.
