---
name: user-workflow-auto-mode
description: "User runs Claude Code in auto mode (auto-accept) once a plan is complete — plan first, then let it run"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0078a710-9f36-484c-9f54-1965280e63ef
  modified: 2026-09-04T10:00:22.284Z
---

The user works plan-first: they build/approve a plan, then switch to **auto mode (auto-accept edits)** and let the run proceed unattended.

**Why:** it reframes feature priorities for the [[wsm-design-system]] Workstation app. For an auto-mode user, `permissions.allow` (auto-approve convenience) matters little; the `deny` half (guardrails) and **hooks** matter more — Stop/Notification hooks to signal when an unattended run finishes, PreToolUse deny hooks to block dangerous actions before they happen.

**How to apply:** when suggesting/building Workstation features, rank deny-rules + hook management above allow-list convenience.
