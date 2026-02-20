# Test Fixtures

Captured Claude CLI JSONL stream output used by the mock CLI during e2e tests.

## Format

Each `.jsonl` file contains one JSON object per line, matching the Claude CLI
`--output-format stream-json` output. The main event types are:

| Type | Description |
|------|-------------|
| `stream_event` | Streaming chunks: `content_block_start`, `content_block_delta`, `content_block_stop` |
| `assistant` | Accumulated assistant message with full `content` array (text and tool_use blocks) |
| `result` | Final combined text result with `is_error` flag |

A typical simple response looks like:

```
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello!"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}
{"type":"result","result":"Hello!","is_error":false}
```

## Capturing new fixtures

Run the real Claude CLI with `--output-format stream-json` and redirect stdout
to a `.jsonl` file:

```bash
claude -p "your prompt here" --output-format stream-json > tests/fixtures/claude-stream-your-scenario.jsonl
```

Review the captured file and trim any extraneous output if needed. Each line
must be valid JSON.

## How the mock CLI uses fixtures

The mock CLI (`tests/helpers/mock-claude-cli.ts`) intercepts the `-p` argument
passed by the Electron app, scans it for keywords, and selects a matching
fixture file:

| Keywords | Fixture file |
|----------|-------------|
| `read`, `file`, `tool`, `check` | `claude-stream-with-tools.jsonl` |
| `hello`, `hi`, `hey`, `how are you` | `claude-stream-simple.jsonl` |
| _(no match)_ | `claude-stream-simple.jsonl` (default) |

Each line of the chosen fixture is streamed to stdout with a small random delay
(10-50ms) to simulate real streaming latency.
