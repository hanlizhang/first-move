# First Move — Contributor Guide

<!-- BEGIN:nextjs-agent-rules -->
## Next.js version guidance

This project may use a newer Next.js version than expected. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework code, and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product boundaries

- Build a responsive web MVP with Next.js, TypeScript, and Tailwind CSS.
- Keep user data on-device. Do not add authentication, a database, payments, native mobile code, system alarms, or app blocking.
- AI features are optional enhancements. Every AI action must have a clear manual path.
- Favor a small, accessible, mobile-first interface over platform complexity.

## Engineering conventions

- Use the Next.js App Router, strict TypeScript, functional React components, and Tailwind utilities.
- Keep domain logic separate from UI and make timers and reward calculations deterministic and testable.
- Persist structured state in local storage; use IndexedDB only if image/blob storage is truly needed.
- Do not retain toothbrush images by default. Explain any browser permissions at the point of use.
- Respect reduced motion, keyboard navigation, focus visibility, and sufficient color contrast.
- Run lint, type checks, tests, and a production build before marking implementation work complete.

## Environment and Git safety

- Read-only environment inspection is allowed. Prefer project-local dependencies; project-local npm installs and npm scripts are allowed when required by the current task.
- Before changing the global development environment, explain the detected problem, why a global change is necessary, the exact commands, affected files and directories, and rollback or uninstall steps.
- Do not run `brew cleanup`, `brew upgrade`, `sudo`, `chmod`, `chown`, remove global tools, or modify Git remotes, branches, commits, refs, or history without explicit approval.
- Never force-push. Do not commit or push automatically.
- Never store or commit `.env` files, API keys, passwords, or credentials.
- After each development task, summarize changed files, checks performed, and any changes outside the repository in no more than eight lines.

## Scope control

- Treat `PRD.md` as the product source of truth and `TASKS.md` as the delivery checklist.
- Do not introduce out-of-scope infrastructure without updating both documents and receiving approval.
