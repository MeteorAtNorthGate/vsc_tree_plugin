# Tree Generator for VS Code

[English](./README.md) | [简体中文](./README.zh-CN.md)

---

**Tree Generator** is a lightweight, strictly-typed VS Code extension designed to generate clean, readable directory trees for complex projects. 
It features native `.gitignore` parsing, deep integration with the VS Code Explorer context menu, and custom syntax support for `.tree` files.

## Core Features

- **Context-Aware Generation:** Right-click any directory in the Explorer to generate a localized `tree.tree` file exactly where you need it.
- **Smart `.gitignore` Resolution:** Automatically traverses the directory tree upwards to locate and apply your `.gitignore` rules.
- **Heavy Folder Pruning:** Automatically truncates bulky directories (e.g., `node_modules`, `.git`, `.venv`) to their top-level representation, keeping the tree concise.
- **Native `.tree` Language Support:**
  - **Syntax Highlighting:** Semantic coloring for folders, files, tree connecting lines, and comments.
  - **Code Folding:** Native collapsible regions based on indentation depth.
  - **Quick Commenting:** Standard `Ctrl+/` (or `Cmd+/`) support for line comments (`#`).

## Usage

### Method 1: Context Menu (Recommended)
1. Open the VS Code Explorer.
2. Right-click on a target folder.
3. Select **"Generate Tree"** from the context menu.

### Method 2: Command Palette
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Execute **"Generate Tree File"**. This will target the current workspace root.

## Default Ignore Rules

In the absence of a `.gitignore` file, the extension applies a safe default configuration to prevent performance bottlenecks:
`['.git', '.venv', 'node_modules', '__pycache__', 'dist', 'build']`

## Local Development

To run this extension locally:

```bash
# 1. Install dependencies
pnpm install

# 2. Compile TypeScript
pnpm compile

# 3. Launch the Extension Development Host
# Press F5 in VS Code