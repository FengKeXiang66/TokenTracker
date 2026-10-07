# Devin CLI usage tracking

TokenTracker reads retained **local** [Devin CLI](https://devin.ai) history as a passive source — the same class of integration as Cursor, Goose, or AnythingLLM. Nothing is installed into Devin, no hook is registered, and no Devin endpoint is contacted. Token statistics never read credentials, sign-in state, `cogs_json`, prompts, or message bodies.

## What is read

| Location | Purpose |
|---|---|
| `$XDG_DATA_HOME/devin/cli/sessions.db` (default `~/.local/share/devin/cli/sessions.db`) | Devin CLI's local session history (SQLite) |

Set `TOKENTRACKER_DEVIN_DB` to point at a different database file.

On Windows there is no known native Devin data directory; a Devin install inside WSL is discovered through the `\\wsl$` bridge like other WSL-resident tools.

The reader runs a narrow SQL projection over `message_nodes`: `role = 'assistant'` is a `WHERE` filter, and SQLite's `json_extract` pulls only `metadata.request_id`, `metadata.generation_model`, `metadata.started_generation_at` / `metadata.created_at`, and the scalar `metadata.metrics.*_tokens` counters out of `chat_message`, joined with `sessions.working_directory` for local project attribution. Only those projected scalars enter Node memory — the application never loads whole message documents.

## Deduplication and corrections

`request_id` is the billing identity, not the message node. Devin's retained history contains replay, fork, and compaction copies of the same request, so TokenTracker keeps a per-request ledger under `cursors.devin.requests` in `tracker/cursors.json`:

- The first observed copy of a request contributes its usage once; its owning session, resolved project, and conversation share are recorded in the ledger at that point and stay authoritative for the request's lifetime. Later copies of the same `request_id` — in the same session or in a fork — never add usage and never re-home the recorded attribution, even if the original node is deleted or compacted away while a copy survives.
- A fork made only of copied requests contributes no usage and no conversation of its own; the first genuinely new request in a session pays that session's single `conversation_count` once.
- If a retained record's metrics are corrected, the previous contribution is subtracted and the corrected one applied — model and hour buckets may move, but the contribution stays with the request's recorded owning session and project.
- Deleting or compacting a conversation does **not** refund tokens already consumed.
- Buckets use `metadata.started_generation_at` (falling back to `metadata.created_at`), never node insertion time, and the recorded `generation_model` — including `compactor` — is preserved rather than rewritten to the session's configured model.

## Pricing caveat

Token counts are authoritative. Devin's observed models (`swe-2`, `swe-2-high`, `compactor`) currently have **no pricing data** in TokenTracker's curated pricing or the public litellm feed, so their usage is reported in tokens but excluded from dollar estimates. A **$0 cost figure does not mean the usage was free** — the dashboard shows an explicit notice on the Devin provider view and on the combined "All tools" view whenever Devin contributes usage.

## Scope

This covers only the Devin CLI's local SQLite history. It does not include Devin Cloud sessions, Devin Desktop, Windsurf history, or Devin subscription/quota tracking (a separate, default-off limits concern).
