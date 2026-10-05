---
name: wsm-design-system
description: "Workstation app's UI follows the \"Workstation Manager Design System\" (@wsm/ui) on claude.ai/design"
metadata: 
  node_type: memory
  type: project
  originSessionId: f93ac95c-a217-4761-86e9-ccbe11ea4105
  modified: 2026-09-03T12:35:44.379Z
---

The Tauri "Workstation" app (C:\Projects\Tool\Workstation) is styled to the user's **Workstation Manager Design System** (`@wsm/ui`) on claude.ai/design — projectId `82877093-9af4-451d-85ea-dfbe89e7486e`.

Adopted **by hand into vanilla HTML/CSS**, not via the React bundle: `src/wsm.css` is the DS's `_ds_bundle.css` verbatim (tokens + IBM Plex import + `.wsm-mono`/`.wsm-label`); `src/styles.css` reproduces the 10 components on those tokens.

**Why:** DS components are compiled React (inline styles), and the app is a vanilla Tauri webview — reproducing the documented idiom on the real tokens was lighter, offline-clean, and kept the stack. Real-React-bundle route (load react/react-dom/_ds_bundle.js → window.WSM.*) is available if pixel-exact fidelity is ever needed.

**How to apply (idiom):** dark-first, cool slate + ONE amber accent (`--accent #e2a24e`), green/red semantics only (`--add`/`--del`). Surfaces `--bg`/`--panel`/`--panel-2`; text `--ink`/`--muted`/`--faint`; lines `--rule`/`--rule-2`. Selection = surface lift to `--panel-2` + 2px accent underline (`box-shadow: inset 0 -2px 0 var(--accent)`) — **never a left rail, never a filled pill**. IBM Plex Mono for paths/values/keys. Components: Button(primary=amber/ghost), Tab(active=underline), ListRow, RuleRow(+×)/AddRow(dashed) for per-path permission/env lists, SegmentedControl, StatusDot(ok/idle/busy), Label, Kbd, Icon(single-stroke 24-grid).

Note: `/design-sync` skill pushes repo→Claude Design (wrong direction here); this was a read-and-adopt via the DesignSync tool's get_file.
