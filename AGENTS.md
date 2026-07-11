# Codex Operating Guide

## Core Rule

This PC is the primary development environment. GitHub is usually a sync, publish, or backup target.

Do not clone, delete, move, reset, or overwrite local repositories unless the user explicitly asks for that action.

## Repository Selection

Before deciding where to work, find and read the local `Canonical Repository Index.md` in the user's knowledge-base repository, then open the matching file under `repositories/` when it exists.

Use that index and its `repositories/` cards as the source of truth for repository candidates, duplicate copies, temporary workspaces, static-site routing, related repositories, and uncertain cases. Do not keep a separate hard-coded list of preferred project paths in this file.

If the index is missing or inaccessible, search local repositories first and report that the canonical index could not be checked.

## New Chat Startup Flow

When a task appears to involve an existing project or GitHub repository:

1. Check the current directory and whether it is a Git repository.
2. Check `git remote -v` and normalize the GitHub owner/repo name.
3. Find and read `Canonical Repository Index.md` from the local knowledge-base.
4. Open the matching repository card under `repositories/` if one exists, then compare any normal candidate with the current workspace.
5. If they differ, report both paths and ask whether to continue in the current workspace or switch to the canonical candidate.
6. Treat `D:\Codex\workspaces\` and date-based `Documents\Codex\` folders as temporary workspaces unless the index says they are the only known copy or the user chooses them.
7. Use `git clone` only as the last resort, after local search and user confirmation.

## Project Intake Checklist

Before making meaningful edits:

- Read the nearest `AGENTS.md`.
- Read `README*` and relevant `docs/`.
- Check `git status --short` and preserve existing user changes.
- For duplicate repositories, inspect the index and recent local changes before choosing.
- For uncertain rows in the index, report uncertainty instead of guessing.

## Static Site and Publish Folders

For static sites, GitHub Pages, portals, documentation sites, and web tools:

- Identify the actual public folder before editing: common names include `public/`, `docs/`, `dist/`, `site/`, `build/`, `_site/`, or a root `index.html`.
- Do not assume `docs/` is documentation source; it may be the published site root.
- Check `package.json`, `vite.config.*`, `mkdocs.yml`, `_config.yml`, and README for build or deploy rules.
- If the project is plain static HTML, do not introduce a build system unless requested.

## Git Workflow

- Local repositories are the working source unless the user says otherwise.
- GitHub is normally used for sync, backup, PRs, or public deployment.
- Do not commit or push unless requested or required by explicit project instructions.
- Before pulling, check for local modifications. If conflicts are possible, stop and report.
- Never clean up duplicate copies automatically. List cleanup candidates and ask separately.

## Knowledge Base and Obsidian

- The knowledge-base stores reusable writing context, Codex skills, shared state, and the canonical repository index.
- Obsidian vault repositories may contain personal source notes and app-generated `.obsidian` changes. Be conservative and avoid bulk rewriting existing notes.
- For generated drafts, prefer creating new files rather than overwriting existing notes.

## Reporting After Work

Finish by summarizing:

- Files changed.
- Which repository/workspace was used and why.
- Whether the canonical index was checked.
- Build/test/check commands run and results.
- Any duplicate, stale, dirty, or uncertain repository state that needs human attention.