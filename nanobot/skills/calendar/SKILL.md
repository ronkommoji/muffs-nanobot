---
name: calendar
description: Google Calendar via Composio — view, create, update, reschedule, delete events, check availability, and schedule meetings. Use when the user asks about their calendar, meetings, appointments, availability, "what's on today/tomorrow", "schedule", "book", "move", "cancel", or "remind me at a specific time on the calendar".
metadata:
  nanobot:
    requires:
      env: []
---

# Google Calendar (Composio)

Handle **Google Calendar** tasks for the authenticated profile using Composio Tool Router MCP tools plus nanobot's `composio_connect` when OAuth is missing.

**Toolkit slug:** `google_calendar` (aliases: `googlecalendar`, `google calendar`)  
**Full tool catalog:** https://docs.composio.dev/toolkits/googlecalendar (~48 tools)

---

## Before you act

1. **Read this skill** when the request involves calendar events (not generic cron reminders — see **Calendar vs cron** below).
2. **Timezone:** Prefer the user's IANA timezone from runtime context / `USER.md` (e.g. `America/Los_Angeles`). Never pass abbreviations like `EST` or `PST` to Composio — use full IANA names.
3. **Never invent tool slugs or parameters.** Composio exposes 48+ calendar tools; slugs and schemas change. Always discover via search first.
4. **Confirm destructive actions** (delete, cancel series, bulk changes) in chat before executing.
5. **Report honestly:** Only say an event was created/updated/deleted after `successful: true` in the tool response.

---

## Composio Tool Router workflow (required)

Nanobot uses **Tool Router mode**. You do **not** call `GOOGLECALENDAR_*` tools directly by memory. Follow this sequence every time:

### Step 1 — Search

Call **`COMPOSIO_SEARCH_TOOLS`** with:

- `session`: `{ "generate_id": true }` on the **first** calendar action in a conversation turn (or new workflow).
- `queries`: one atomic query per sub-task, scoped to Google Calendar.

Example queries:

```json
{
  "queries": [
    {
      "use_case": "list Google Calendar events for today",
      "known_fields": "timezone: America/Los_Angeles"
    }
  ],
  "session": { "generate_id": true }
}
```

Split compound requests:

| User says | Search queries |
|-----------|----------------|
| "What's on my calendar tomorrow and add lunch at noon" | (1) list events tomorrow (2) create calendar event lunch noon |
| "Find my meeting with Alex and move it to 3pm" | (1) find calendar event Alex (2) update/reschedule calendar event |
| "Am I free Friday afternoon?" | find free slots Google Calendar |

Save the returned **`session_id`** for all following meta-tool calls in that workflow.

### Step 2 — Connection check

If search indicates **no active connection** for `google_calendar`:

1. Call nanobot's **`composio_connect`** with `toolkit: "google_calendar"` (sends auth link over iMessage/Web UI).
2. Wait for the user to connect (or use **`COMPOSIO_WAIT_FOR_CONNECTION`** / **`COMPOSIO_MANAGE_CONNECTIONS`** if instructed by search).
3. Re-run **`COMPOSIO_SEARCH_TOOLS`** before executing.

Alternatively: **`COMPOSIO_MANAGE_CONNECTIONS`** with toolkit slug from search output.

### Step 3 — Schemas (when needed)

If search returns `schemaRef` instead of inline `input_schema` for a tool:

- Call **`COMPOSIO_GET_TOOL_SCHEMAS`** (or **`COMPOSIO_GET_REQUIRED_PARAMETERS`**) for that slug **before** execute.

### Step 4 — Execute

Call **`COMPOSIO_MULTI_EXECUTE_TOOL`** with:

- `tools`: array of `{ "tool_slug": "...", "arguments": { ... } }` — arguments must match schema **exactly**.
- `session_id`: from search.
- `memory`: **always include** (dict of app → string facts). Example: `{ "google_calendar": ["User primary calendar id is primary"] }`
- `sync_response_to_workbench`: `false` for simple creates/reads; `true` for large list results.

**Rules:**

- Batch only **independent** tools in one multi-execute call.
- Chain dependent steps sequentially (search → list → patch) across separate multi-execute calls.
- On `Tool ... not found`: search again with a more specific query; do not guess slugs.

---

## Core tools (reference — always verify via search)

These are the **most common** slugs from Composio's Google Calendar toolkit. Names are stable but always confirm with search.

### Read / query

| Slug | Use when |
|------|----------|
| `GOOGLECALENDAR_GET_CURRENT_DATE_TIME` | User says "today", "tomorrow", "next Monday" — get anchor time in user's timezone **first** |
| `GOOGLECALENDAR_LIST_CALENDARS` | Need calendar IDs (shared calendars, "Work" calendar) |
| `GOOGLECALENDAR_EVENTS_LIST` | List events in a time window on one calendar |
| `GOOGLECALENDAR_FIND_EVENT` | Text search ("dentist", "standup", attendee name) |
| `GOOGLECALENDAR_EVENTS_GET` | You already have an `event_id` |
| `GOOGLECALENDAR_FIND_FREE_SLOTS` | "When am I free?", scheduling meetings (preferred over deprecated `FREE_BUSY_QUERY`) |
| `GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS` | Unified view across all calendars |

### Write / mutate

| Slug | Use when |
|------|----------|
| `GOOGLECALENDAR_CREATE_EVENT` | Structured create with ISO datetimes, attendees, Meet link |
| `GOOGLECALENDAR_QUICK_ADD` | Simple natural-language create ("Lunch with Sam Friday at noon") — **no attendees** |
| `GOOGLECALENDAR_PATCH_EVENT` | Partial update (time, title, location) — preferred for small edits |
| `GOOGLECALENDAR_UPDATE_EVENT` | Full replace / Meet link creation via `create_meeting_room` |
| `GOOGLECALENDAR_DELETE_EVENT` | Remove event (confirm first) |
| `GOOGLECALENDAR_EVENTS_MOVE` | Move event to another calendar |

### Key parameter rules (CREATE_EVENT)

From Composio schema — violations cause hard failures:

- **`start_datetime`**: Required. **ISO 8601 only** — `2026-05-21T15:00:00`. Natural language ("tomorrow 3pm") is **rejected**.
- **`timezone`**: IANA name (`America/New_York`). Required when datetime is naive.
- **`event_duration_hour` / `event_duration_minutes`**: Duration if `end_datetime` omitted. Minutes 0–59 only (use hours for 60+).
- **`calendar_id`**: Default `primary`. For named calendars, list calendars first — **display names are not IDs**.
- **`attendees`**: Email strings or `{ "email": "...", "optional": true }`. Plain names invalid.
- **`create_meeting_room`**: Default adds Google Meet (Workspace); personal Gmail may skip gracefully.
- **No conflict check** on create — use `GOOGLECALENDAR_FIND_FREE_SLOTS` or list overlapping events first if user cares.

### Key parameter rules (EVENTS_LIST / FIND_EVENT)

- **`timeMin` / `timeMax`**: RFC3339 with timezone offset. UTC `Z` windows may miss local "today" — use offset matching user TZ.
- **Pagination**: Follow `nextPageToken` until empty.
- **`singleEvents`**: `true` to expand recurring instances when listing by time.

### Key parameter rules (PATCH_EVENT)

- **`event_id`**: Opaque API id from list/find/create — **not** the event title.
- Recurring instance ids look like `baseId_20260522T093000Z`.
- **`attendees`**: Replaces entire list if provided; `[]` removes all.

---

## Calendar vs cron (nanobot)

| User intent | Use |
|-------------|-----|
| "Remind me every morning at 8" (recurring nudge in chat) | **`cron`** skill — not Calendar |
| "Add dentist May 21 at 2pm to my calendar" | **This skill** — Calendar event |
| "Block focus time Friday" | Calendar (`focusTime` event type; Workspace only) |
| "Text me when it's time to leave" | **cron** or Calendar reminder — ask if they want a **phone message** (cron) vs **calendar notification** |

---

## Standard workflows

### A. "What's on my calendar today / tomorrow / this week?"

1. `COMPOSIO_SEARCH_TOOLS` → list events for date range.
2. `GOOGLECALENDAR_GET_CURRENT_DATE_TIME` with user timezone (if relative dates).
3. `GOOGLECALENDAR_EVENTS_LIST` on `primary` with computed `timeMin`/`timeMax` in **local offset**.
4. Summarize: time, title, location, video link. Mention conflicts if overlapping.

**Nuanced:** "This week" = Monday 00:00 through Sunday 23:59:59 in user TZ, not UTC week.

### B. "Schedule / add / book …"

1. Search: `create Google Calendar event`.
2. If attendees or Meet needed → **`GOOGLECALENDAR_CREATE_EVENT`**.
3. If simple title+time only → **`GOOGLECALENDAR_QUICK_ADD`** OR create_event with ISO times.
4. Confirm back: title, local time, timezone, attendees, Meet link, calendar name.

**Examples:**

| User | Approach |
|------|----------|
| "Coffee with Jane Tuesday 10am for 30 min" | GET_CURRENT_DATE_TIME → CREATE_EVENT with `start_datetime`, `event_duration_minutes: 30`, `attendees: ["jane@..."]` if email known |
| "Team sync every Monday 9am" | CREATE_EVENT with `recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"]` — confirm series scope with user |
| "Hold 2 hours for deep work Friday" | CREATE_EVENT, `transparency: "opaque"`, optional `eventType: "focusTime"` (Workspace) |

### C. "Move / reschedule / change …"

1. FIND_EVENT or EVENTS_LIST with narrow window + query.
2. Confirm the **exact** event with user if ambiguous (multiple matches).
3. PATCH_EVENT with new `start_time`/`end_time` (preserves duration if only start given).
4. For recurring: confirm **this instance** vs **whole series** before patching.

### D. "Cancel / delete …"

1. Find event → show user what will be deleted.
2. After explicit yes → DELETE_EVENT.
3. Recurring: base id vs instance id — deleting instance ≠ deleting series.

### E. "Am I free / find a time / schedule with …"

1. FIND_FREE_SLOTS with `items: ["primary"]` (+ attendee calendars if needed and permitted).
2. Filter gaps for requested duration (API returns busy; you compute free).
3. Propose 2–3 options in user local time.
4. On selection → CREATE_EVENT with chosen slot.

**Nuanced:** "Free tomorrow afternoon" = `time_min`/`time_max` covering 12:00–18:00 local, not full day.

### F. "Add video call / Google Meet"

- CREATE_EVENT or UPDATE_EVENT with `create_meeting_room: true`.
- Return Meet link from response to user.

---

## Error handling

| Error | Action |
|-------|--------|
| 401 / not connected | `composio_connect` for `google_calendar`, then retry |
| `Tool ... not found` | Re-search with explicit operation name |
| Invalid timezone | Fix to IANA; call GET_CURRENT_DATE_TIME |
| Invalid `event_id` | Re-list/find; never fabricate ids |
| 404 on delete | Idempotent — event already gone; tell user |
| Rate limit on bulk delete | Back off; cap concurrency 5–10 |
| Read-only calendar | Cannot delete; explain which calendar blocked it |

---

## User-facing response style

- Use **local times** with timezone name once per message.
- For creates: "Added **Dentist** — Thu May 21, 2:00–2:30 PM PT on your primary calendar."
- For lists: compact bullets, not raw JSON.
- Never mention Composio, tool slugs, or `event_id` unless user asks for technical detail.

---

## Config hints (for operators)

In `~/.nanobot/config.json`:

```json
"tools": {
  "composio": {
    "enabled": true,
    "mode": "toolRouter",
    "toolkits": ["google_calendar"]
  }
}
```

Restricting `toolkits` reduces noise but is optional if Tool Router search is used correctly.
