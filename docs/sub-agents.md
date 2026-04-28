# Sub-Agents: Token Optimization & Specialized Agents

## The Problem with One Big Agent

Right now, every message you send to Muffs — whether it's "add coffee to my calendar" or "research
the best standing desks" — goes through the same agent with the same full tool list. That means:

- A calendar request pays for 100+ Composio tool definitions in context it doesn't need
- A research task loads Gmail and Calendar schemas it will never call
- Token cost scales with tool count, not task complexity
- The model's attention is diluted across irrelevant tools, reducing accuracy

The fix is **specialization**: a lightweight parent agent that understands the request and delegates
to purpose-built child agents that carry only the tools they need.

---

## How Sub-Agents Work in Nanobot

### The Building Blocks

**`SpawnTool`** — a built-in tool that launches a background `SubagentManager` task. The main agent
calls it, gives it a task description, and it runs independently.

**`SubagentManager`** — manages background tasks per session. Each subagent gets:
- Its own minimal `ToolRegistry` (only the tools it needs)
- Its own `AgentRunner` execution loop
- Real-time status tracking (phase, iteration, tool events)
- Automatic cleanup on completion or `/stop`

**`AgentLoop.cron_service`** — the parent's cron service is shared, so subagents can schedule
follow-up tasks without creating a second scheduler.

### The Current Flow

```
User message
    ↓
AgentLoop (main agent, ALL tools loaded)
    ↓
Executes everything inline
```

### The Target Flow

```
User message
    ↓
Parent agent (lightweight: classify + route only)
    ↓
    ├─ Calendar request → CalendarAgent (Google Calendar tools only)
    ├─ Email request    → GmailAgent (Gmail tools only)
    ├─ Research request → ResearchAgent (web search + fetch only)
    ├─ Code request     → CodingAgent (shell + filesystem + web)
    └─ Simple reply     → Answer inline (no spawn needed)
```

---

## Token Savings by Agent Type

| Agent | Tools needed | Composio tools eliminated | Est. token savings per call |
|---|---|---|---|
| Calendar | `GOOGLECALENDAR_*` (5–8 tools) | 90+ | ~3,000–5,000 tokens |
| Gmail | `GMAIL_*` (6–10 tools) | 85+ | ~2,500–4,500 tokens |
| Research | `web_search`, `web_fetch` | all Composio | ~4,000–6,000 tokens |
| Coding | `shell`, filesystem tools | all Composio | ~3,500–5,500 tokens |
| Simple reply | none | all | ~5,000–7,000 tokens |

These savings compound — a session with 20 turns saves 60k–140k tokens. At Claude Opus pricing,
that's real money and meaningfully faster responses.

---

## Implementation Plan

### Step 1: Create Specialized Skill Files

Each specialized agent is defined by a skill that teaches the parent when and how to delegate.
Create these in your workspace:

**`workspace/skills/calendar-agent/SKILL.md`**
```markdown
---
description: Delegate Google Calendar tasks to the CalendarAgent
---

# CalendarAgent

When the user wants to create, read, update, or delete calendar events, spawn a CalendarAgent.

## When to spawn
- "Add X to my calendar"
- "What's on my calendar today / this week"
- "Move / cancel / reschedule [event]"
- "Schedule a meeting with..."
- "Remind me to..."

## How to spawn
Use the `spawn` tool with this task description:
> CalendarAgent: [exact user request]. Use only GOOGLECALENDAR tools from Composio.

## Don't spawn for
- Questions about time / timezone (answer inline)
- Requests that mention both calendar AND email (spawn a combined agent)
```

**`workspace/skills/gmail-agent/SKILL.md`**
```markdown
---
description: Delegate Gmail tasks to the GmailAgent
---

# GmailAgent

When the user wants to read, send, search, or manage email, spawn a GmailAgent.

## When to spawn
- "Check my email / any important emails?"
- "Send an email to..."
- "Reply to..."
- "Search my inbox for..."
- "Mark as read / archive / delete..."

## How to spawn
Use the `spawn` tool with this task description:
> GmailAgent: [exact user request]. Use only GMAIL tools from Composio.
```

**`workspace/skills/research-agent/SKILL.md`**
```markdown
---
description: Delegate research and product-finding tasks to ResearchAgent
---

# ResearchAgent

When the user wants to research a topic, compare products, or find information online,
spawn a ResearchAgent.

## When to spawn
- "Find me the best X under $Y"
- "Compare A vs B"
- "What's the latest on..."
- "Research [topic] and give me a summary"
- "Which [product] should I buy and why"

## How to spawn
Use the `spawn` tool with this task description:
> ResearchAgent: [exact user request]. Use web_search and web_fetch only.
> Return a concise ranked list with reasons and links.
```

**`workspace/skills/coding-agent/SKILL.md`**
```markdown
---
description: Delegate coding, scripting, and prototype tasks to CodingAgent
---

# CodingAgent

When the user wants code written, a prototype built, or a script run, spawn a CodingAgent.

## When to spawn
- "Write a script that..."
- "Build a quick prototype for..."
- "Fix this code: ..."
- "Create a [small app / tool] that..."

## How to spawn
Use the `spawn` tool with this task description:
> CodingAgent: [exact user request].
> Available tools: shell, read_file, write_file, edit_file, web_search, web_fetch.
> Working directory: [specify if relevant].
```

---

### Step 2: Update SOUL.md with Routing Instructions

Add this section to your `SOUL.md` or `TOOLS.md`:

```markdown
## Task Routing

Before executing any multi-step task, classify it:

1. **Calendar task** → spawn CalendarAgent (see calendar-agent skill)
2. **Email task** → spawn GmailAgent (see gmail-agent skill)
3. **Research / product finding** → spawn ResearchAgent (see research-agent skill)
4. **Code / prototype** → spawn CodingAgent (see coding-agent skill)
5. **Simple answer** → reply inline, no spawn needed
6. **Mixed task** (e.g. read email + add to calendar) → spawn a combined agent

When spawning, pass the exact user request verbatim in the task description.
Monitor the spawned task and relay the result once it completes.
```

---

### Step 3: Native Sub-Agent Registry (Advanced)

For deeper optimization, nanobot's `SubagentManager` can be extended to pre-configure specialized
tool registries. This is code-level work in `nanobot/agent/subagent.py`:

```python
# Current: subagents get the same full tool registry
# Target: subagents get a filtered registry based on task type

AGENT_PROFILES = {
    "calendar": ["GOOGLECALENDAR_*"],          # only Calendar Composio tools
    "gmail":    ["GMAIL_*"],                    # only Gmail Composio tools
    "research": ["web_search", "web_fetch"],    # only web tools
    "coding":   ["shell", "read_file", "write_file", "edit_file", "web_search"],
}
```

This requires modifying `SubagentManager.spawn()` to accept a profile name and filter
`ToolRegistry.get_definitions()` before the first LLM call.

---

## Practical Usage Right Now

Even without code changes, you can get most of the benefit today by prompting explicitly:

```
"Use only Calendar tools for this — don't load anything else."
"This is a research task. Only use web_search and web_fetch."
```

The Composio Tool Router already has `COMPOSIO_SEARCH_TOOLS` which lets the agent
discover tools by intent before loading them all. Make sure your `TOOLS.md` instructs
the agent to always call `COMPOSIO_SEARCH_TOOLS` first.

---

## Two-Person Setup: Ron vs. Girlfriend

Sub-agents also solve the power-user vs. light-user problem:

**Ron's profile** — full parent agent with routing, all specialized child agents available.

**Girlfriend's profile** — lightweight parent with only Calendar + Gmail skills loaded, no coding
agent, no research agent, simpler SOUL.md. Can be set to use a cheaper/faster model (Claude Haiku
instead of Opus) since her requests are simple.

This is achievable today via Sendblue's per-sender workspace isolation — her workspace gets a
minimal `SOUL.md` and `TOOLS.md`, her `config.json` sets a lighter model, and only the Calendar
and Gmail skills are in her workspace's `skills/` directory.

---

## Status: What's Built vs. What's Next

| Feature | Status |
|---|---|
| `SpawnTool` for background tasks | Built, in `nanobot/agent/tools/spawn.py` |
| `SubagentManager` with status tracking | Built, in `nanobot/agent/subagent.py` |
| Skill-based routing via SOUL.md | Ready to configure (no code changes) |
| Specialized tool registry per subagent | Not yet implemented — requires code change |
| Per-profile model config (Sendblue) | Not yet implemented — configuration work |
| Native agent profiles (Calendar/Gmail/etc.) | Not yet implemented — medium effort |

The skill-based approach (Steps 1–2 above) is zero-code and works today. The native registry
filtering is the next level and unlocks the full token savings.
