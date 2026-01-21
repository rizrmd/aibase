# How to Create Issues (bd create Bug Workaround)

## Problem
`bd create` command is broken in beads v0.48.0 on Windows.

## Solution
Use the helper script or edit JSONL directly.

## Option 1: Helper Script (Recommended)

```bash
./create-issue.sh "Issue title" "type" "priority" "description"
```

**Examples:**
```bash
# Simple task
./create-issue.sh "Fix mobile UI" "task" "2" "Mobile button positioning issue"

# Bug report
./create-issue.sh "Crash on startup" "bug" "0" "App crashes when opening"

# With assignee
./create-issue.sh "Add feature X" "feature" "1" "Implement new feature" "open" "username"
```

## Option 2: Manual JSONL Edit

```bash
cat >> .beads/issues.jsonl <<'END'
{"id":"aibase-xxx","title":"Issue title","description":"Description","type":"task","priority":2,"status":"open","created_at":"2026-01-21T10:20:00Z"}
END
```

## Working Commands
These commands work fine:
- `bd show <id>` - View issue
- `bd list` - List all issues
- `bd close <id>` - Close issue
- `bd update <id> --status=closed` - Update issue
- `bd ready` - Show issues ready to work (no blockers)

## Sync to Git
```bash
git add .beads/issues.jsonl
git commit -m "Issue: xxx"
git push
```
