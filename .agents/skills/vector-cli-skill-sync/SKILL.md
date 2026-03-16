---
name: vector-cli-skill-sync
description: Reminder to update the public vector-skill submodule (packages/vector-skill/SKILL.md) whenever CLI commands, options, or behavior change in src/cli/.
---

# Vector CLI Skill Sync

When you make changes to the CLI source files under `src/cli/` that affect:

- Command names, subcommands, or aliases
- Options/flags (added, removed, or renamed)
- Auth flow or session behavior
- Convex URL resolution logic
- Output format or `--json` structure
- New command groups or removed commands

You **must** also update `packages/vector-skill/SKILL.md` to reflect those changes.

This file is the public-facing skill installed via:

```bash
npx skills add xrehpicx/vector-skill
```

After updating the skill, commit and push the submodule:

```bash
cd packages/vector-skill
git add SKILL.md
git commit -m "Update skill to reflect CLI changes"
git push
cd ../..
git add packages/vector-skill
git commit -m "Update vector-skill submodule"
```
