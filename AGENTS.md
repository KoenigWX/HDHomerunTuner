# AGENTS.md

This file defines expected behaviors and best practices for AI agents (e.g., OpenAI Codex, ChatGPT) contributing to this repository. The project was initially created using Codex within GitHub Codespaces, and ongoing development is expected to be AI-assisted.

## Overview

Agents working on this project should prioritize code quality, clarity, and maintainability. All changes must be verified syntactically and documented where applicable.

## Agent Responsibilities

* **Python Files**: After modifying or creating any Python file, validate syntax using:

  ```bash
  python -m py_compile <file>
  ```

* **JavaScript Files**: After modifying or creating JavaScript files, validate syntax using:

  ```bash
  node --check <file>
  ```

  Optionally, use ESLint for stricter standards:

  ```bash
  npx eslint <file>
  ```

* **Pull Requests**:

  * Include a clear, detailed summary of what changed and why.
  * Reference specific files or functions when applicable.
  * Highlight any potential areas for future improvement or cleanup — this is essential.
  * If adding new logic or fixing a bug, describe the testing or validation steps used.

* **Documentation**: Update README.md, inline comments, or any related documentation if the change affects usage or structure.

## Coding Conventions

* Use Python 3.x syntax.
* Use modern JavaScript (ES6+) features where appropriate.
* Favor clarity and readability over cleverness.
* Use descriptive variable/function names.

## Communication Style

When summarizing actions or responding in issues/PRs:

* Be concise but informative.
* Reference filenames or functions.
* Always include suggestions for improvement, refactor opportunities, or unhandled edge cases, even if out of scope.
