# Create Worktree

Create a fresh git worktree and branch before making any code changes, then open it in a new tmux pane and start `codex`.

---

## Goal

Set up a fully ready isolated working directory for the task and continue only from that worktree.

---

## Rules

- Default source branch: local `main` (unless user explicitly says another branch).
- Always resolve and pass an explicit source commit to `git worktree add`; never rely on current `HEAD`.
- Worktree directory format: `imai-some-feature` in the parent directory (`../` sibling).
- Branch format: `codex/some-feature`.
- Never delete or modify existing worktrees.
- Never use destructive git commands.
- If branch or path already exists, create a unique `-2`, `-3`, etc suffix.
- Only report "ready" after dependency install succeeds and tmux pane launch is complete.

---

## Step 1: Gather Context

```bash
git rev-parse --show-toplevel
git status -sb
git branch --show-current
git worktree list
git branch --list main
```

---

## Step 2: Build Names and Paths

Use a short slug from the task (example: `discord-webhook-admin`).

```bash
ROOT=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$ROOT")

BASE_SLUG="some-feature"
BASE_BRANCH="codex/${BASE_SLUG}"
BASE_WT_PATH="${PARENT_DIR}/imai-${BASE_SLUG}"
SOURCE_BRANCH="${SOURCE_BRANCH:-main}" # Override only if user explicitly requested another source branch.

if ! git show-ref --verify --quiet "refs/heads/${SOURCE_BRANCH}"; then
  echo "Missing local source branch: ${SOURCE_BRANCH}"
  echo "Create/sync it first (example: git fetch upstream && git branch --track main upstream/main)"
  exit 1
fi

# Pin to an explicit commit so the new branch cannot accidentally come from the current branch.
SOURCE_COMMIT=$(git rev-parse --verify "${SOURCE_BRANCH}^{commit}")
echo "Using source ${SOURCE_BRANCH} at ${SOURCE_COMMIT}"

BRANCH="$BASE_BRANCH"
WT_PATH="$BASE_WT_PATH"
i=1
while [ -e "$WT_PATH" ] || git show-ref --verify --quiet "refs/heads/$BRANCH"; do
  i=$((i+1))
  BRANCH="${BASE_BRANCH}-${i}"
  WT_PATH="${BASE_WT_PATH}-${i}"
done
```

---

## Step 3: Create Worktree from `main`

```bash
git worktree add -b "$BRANCH" "$WT_PATH" "$SOURCE_COMMIT"
```

---

## Step 4: Copy Env and Install Dependencies

```bash
if [ -f "$ROOT/.env.local" ]; then
  cp "$ROOT/.env.local" "$WT_PATH/.env.local"
fi

(cd "$WT_PATH" && pnpm install)
```

---

## Step 5: Open New tmux Pane and Start Codex

```bash
if [ -n "${TMUX:-}" ]; then
  tmux split-window -c "$WT_PATH"
  NEW_PANE=$(tmux display-message -p "#{pane_id}")
  tmux send-keys -t "$NEW_PANE" "codex" C-m
else
  echo "Not inside tmux. Start manually:"
  echo "tmux new-session -c \"$WT_PATH\" 'codex'"
fi
```

---

## Step 6: Continue Work in New Directory

Run all follow-up commands in `WT_PATH` (the new worktree), not the original repo directory.

---

## Step 7: Report Result

Return:

1. Source branch used
2. New branch name
3. New worktree path
4. `pnpm install` result
5. tmux pane id (or fallback note if tmux was unavailable)
