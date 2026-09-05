# Workstation Manager

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]()

**Workstation** is a native, lightweight desktop application built with [Tauri v2](https://tauri.app/) and vanilla web technologies designed to organize, configure, and orchestrate AI development workflows powered by [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview).

It provides a unified control center for managing project workspaces, editing project instructions (`CLAUDE.md`), authoring custom slash commands, subagents, and skills, configuring Model Context Protocol (MCP) servers, automating lifecycle hooks, and synchronizing project memories.

---

## Key Features

### 1. Workstation & Session Management
- **Directory-based Workspaces**: Register multiple repositories or project directories with friendly aliases.
- **One-Click CLI Launch**: Instantly spawn an interactive `claude` CLI terminal session initialized directly within the selected workstation directory.
- **Persistent Registration**: Registered workspaces are stored in your local application data directory without polluting project sources.

### 2. CLAUDE.md & Component Library
- **Integrated Markdown Editor**: Edit project-level `CLAUDE.md` files with real-time formatted preview (powered by Marked.js).
- **Reusable Component Snippets**: Maintain a centralized library of reusable prompt blocks, guidelines, and rules. Insert components directly into project `CLAUDE.md` files with a single click.

### 3. Custom Slash Commands (`.claude/commands/`)
- **Visual Command Builder**: Create and configure custom `.md` slash commands for project-level workflows.
- **Frontmatter Support**: Full YAML frontmatter support for `description`, `argument-hint`, `allowed-tools`, and model specification.
- **Central Repository**: Store standard commands centrally in Workstation and deploy them across any project repository.

### 4. Custom Subagents (`.claude/agents/`)
- **Agent Profile Management**: Define specialized subagents with custom roles, system prompts, allowed tools, and specific model choices.
- **Bi-directional Sync**: Maintain agent templates in the central app repository and copy them into `.claude/agents/` in selected workstations.

### 5. Model Context Protocol (MCP) Integration (`.mcp.json`)
- **Transport Flexibility**: Configure and inspect both `stdio` (command, arguments, environment variables) and `http` / `sse` (endpoint URL) MCP servers.
- **Non-destructive Updates**: Safely edit or upsert servers inside project `.mcp.json` files while preserving third-party and custom configuration keys.
- **Repository Templates**: Store frequently used MCP server presets and deploy them across multiple workstations.

### 6. Event Lifecycle Hooks (`.claude/settings.local.json`)
- **Automated Workflow Triggers**: Configure event hooks for events such as `PreToolUse`, `PostToolUse`, and `Stop`.
- **Structured Rule Editor**: Define matchers, shell commands, and execution timeouts with visual cards.
- **Native JSON Composition**: Automatically maps flat rule representations to Claude Code's nested hook schema.

### 7. Skill Management (`.claude/skills/`)
- **Frontmatter-Aware Editor**: Inspect and edit `SKILL.md` documents with automatic YAML frontmatter parsing and preservation.
- **Central Skill Store**: Manage reusable skill definitions and deploy them to project skill directories.

### 8. Project Memory & Auto-Reconciliation
- **Local Memory Directory**: Toggle project-local memory (`<workstation>/memory`) by managing `autoMemoryDirectory` in `.claude/settings.local.json`.
- **Global Memory Import**: Import project memories from Claude Code's default global project cache (`~/.claude/projects/<id>/memory`) with a single click.
- **Automated Index Reconciliation**: Background headless execution of Claude Code to automatically audit, reconcile, and sync `MEMORY.md` index links with the actual markdown files in the memory directory.

### 9. Per-Workstation Plugin Control
- **Global Discovery**: Automatically detects plugins installed in `~/.claude/plugins/installed_plugins.json`.
- **Local Toggles**: Selectively enable or disable specific plugins per workstation via `.claude/settings.local.json`.

### 10. Global Claude Settings
- **Central Configuration**: Dedicated modal to inspect and edit global Claude instructions (`~/.claude/CLAUDE.md`) and global memory files.

---

## User Interface Overview

Workstation utilizes a sleek, 3-panel docking layout:

```
+-------------------------------------------------------------------------+
| [Brand] Workstation  |  Global | Components | Skills | Commands | MCP ...   |
+-------------------------------------------------------------------------+
| CLAUDE.md  |  Skills  |  Memory  |  Plugins  |  Hooks  |  Commands  |  ...  |
+-------------------+-----------------------------+-----------------------+
|  Workstations     |  Editor Panel               |  Detail / Inspector   |
|                   |                             |                       |
|  * Project A [Run]|  - Real-time Markdown       |  - Component Picker   |
|  * Project B [Run]|    or YAML Frontmatter Form |  - Skill / Command    |
|  * Project C [Run]|  - Save & Live Preview      |    Store Sync         |
|                   |                             |  - Metadata Info      |
|  [+ Add Workst.]  |                             |                       |
+-------------------+-----------------------------+-----------------------+
```

1. **Left Panel (Workstations)**: Browse registered workstations, launch interactive CLI sessions, and manage workspace paths.
2. **Center Panel (Editor)**: Context-aware editor for markdown files, frontmatter forms, MCP definitions, and hooks.
3. **Right Panel (Detail / Inspector)**: Displays file metadata, quick-insertion components, and central repository templates.

---

## Architecture & Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/)
- **Core Backend**: Rust (2021 edition)
  - `tauri-plugin-dialog`: Native folder pickers.
  - `tauri-plugin-opener`: System file and URL opener integration.
  - `serde` / `serde_json`: Strongly typed JSON serialization for configurations and templates.
- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3
  - Lightweight and zero-bundle frontend.
  - [Marked.js](https://marked.js.org/): In-browser markdown parsing and preview.
- **Platform Packaging**: Windows NSIS installer target.

### Directory Structure

```
Workstation/
├── src/                        # Frontend Web Assets
│   ├── index.html              # Main application window
│   ├── main.js                 # Core frontend logic & event listeners
│   ├── panels.js               # Editor & detail panel orchestration
│   ├── cmdform.js              # Command, subagent, and MCP forms
│   ├── hookform.js             # Hook rule editor form
│   ├── store.js                # Central repository manager
│   ├── global.html / global.js # Global Claude settings modal
│   └── styles.css              # Modern dark/light theme styling
├── src-tauri/                  # Rust Backend
│   ├── src/
│   │   ├── main.rs             # Tauri application entry point
│   │   └── lib.rs              # Tauri command handlers & file operations
│   ├── Cargo.toml              # Rust crate dependencies
│   └── tauri.conf.json         # Tauri v2 configuration
├── data/                       # Default template repositories
│   ├── components.json         # Prompt component snippets
│   ├── hooks.json              # Hook templates
│   ├── mcp.json                # MCP server configurations
│   ├── skills.json             # Skill repository
│   ├── slashcommands.json      # Slash command templates
│   ├── subagents.json          # Subagent configurations
│   └── workstations.json       # Workstation registry
└── package.json                # Tauri CLI tooling
```

---

## Getting Started

### Prerequisites

Ensure the following tools are installed on your system:

1. **Node.js**: v18.0.0 or later (with npm).
2. **Rust & Cargo**: Latest stable Rust toolchain ([rustup.rs](https://rustup.rs/)).
3. **Claude Code CLI** (Optional, for session launch & memory reconciliation):
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/naga361111/WorkstationManager.git
   cd WorkstationManager
   ```

2. **Install frontend tooling**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

4. **Run backend test suite**:
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

### Production Build

To generate the standalone installer:

```bash
npm run tauri build
```

The installer bundle will be created under `src-tauri/target/release/bundle/nsis/`.

---

## Data Storage

Application data and central repositories are automatically stored in the standard OS application data directory:
- **Windows**: `%APPDATA%\com.workstation.app\data\`

Upon first launch, existing default templates from `data/` are copied over to this user directory for safe and persistent editing.

---

## Contributing

Contributions, bug reports, and feature requests are welcome! Feel free to check the issues page or submit a pull request.

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
