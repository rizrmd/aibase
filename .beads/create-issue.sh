#!/bin/bash
# Helper script to create beads issue (works around bd create bug)
# Usage: ./create-issue.sh "Issue Title" "type" "priority" "description"

TITLE="${1:-New Issue}"
TYPE="${2:-task}"
PRIORITY="${3:-2}"
DESCRIPTION="${4:-}"
STATUS="${5:-open}"
ASSIGNEE="${6:-}"

# Generate random ID suffix
ID_SUFFIX=$(cat /dev/urandom | tr -dc 'a-z0-9' | fold -w 3 | head -n 1)
ID="aibase-$ID_SUFFIX"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSON
if [ -z "$ASSIGNEE" ]; then
  JSON="{\"id\":\"$ID\",\"title\":\"$TITLE\",\"description\":\"$DESCRIPTION\",\"type\":\"$TYPE\",\"priority\":$PRIORITY,\"status\":\"$STATUS\",\"created_at\":\"$NOW\"}"
else
  JSON="{\"id\":\"$ID\",\"title\":\"$TITLE\",\"description\":\"$DESCRIPTION\",\"type\":\"$TYPE\",\"priority\":$PRIORITY,\"status\":\"$STATUS\",\"created_at\":\"$NOW\",\"created_by\":\"$ASSIGNEE\"}"
fi

# Append to issues.jsonl
echo "$JSON" >> .beads/issues.jsonl

echo "Issue created: $ID"
echo "  Title: $TITLE"
echo "  Type: $TYPE, Priority: $PRIORITY"
echo ""
echo "Commands:"
echo "  bd show $ID    # View issue"
echo "  bd list        # List all issues"
