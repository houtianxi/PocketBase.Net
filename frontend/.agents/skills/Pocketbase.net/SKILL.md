---
ame: pocketbase.net
description: Repository-specific skill for building and iterating this PocketBase.net clone (frontend + backend). Use for API design/implementation, auth, collections/records flows, rules, admin UX alignment, and staged AI integration.
license: MIT
compatibility: Works with any agent in this repository.
allowed-tools:
	- "Read"
	- "Write"
	- "Bash"
metadata:
	owner: Pocketbase.net
	stack: "Frontend React + shadcn/ui + Tailwind, Backend .NET 10 + EF Core + SQL Server"
	language: "zh-CN + en"
---

# Pocketbase.net Skill

This skill defines how to execute feature work for this repository so the behavior and UX stay close to PocketBase while remaining compatible with the current codebase conventions.

## When To Apply

Apply this skill when the task involves one or more of the following:

- Implementing or refactoring backend API under `backend/`.
- Implementing or aligning frontend pages/components under `frontend/src/`.
- PocketBase-like capabilities: auth, users, collections, records, access rules, audit logs.
- API contract changes between frontend and backend.
- Stage-1/Stage-2 roadmap work and AI bootstrap integration.

## Core Objectives

- Keep `backend/` and `frontend/` independently runnable.
- Maintain API-first design so external clients can call endpoints directly.
- Match PocketBase-like interaction flow and admin usability where practical.
- Preserve shadcn/ui visual language and modern responsive UX.
- Prioritize secure defaults in auth, authorization, and data access rules.

## Inputs Expected From User

Capture these quickly before implementation (infer from repo when missing):

- Requested feature/scope and acceptance criteria.
- Affected module: auth, users, collections, records, AI, or UI.
- Whether this is additive, refactor, or bugfix.
- Environment constraints (dev/prod, SQL Server assumptions, migration expectations).

## Execution Workflow

Follow this sequence unless the user explicitly asks otherwise:

1. Read related contracts/controllers/services before editing.
2. Reuse existing patterns and naming in the current folder.
3. Update backend contracts first when API shape changes.
4. Implement backend logic (controller + service + persistence).
5. Align frontend `lib/api` and UI consumers with typed responses.
6. Run build/test/lint checks relevant to touched files.
7. Summarize changes, risks, and next actionable steps.

## Backend Rules (.NET 10 + EF Core + SQL Server)

- Keep DTOs/contracts in `backend/Contracts/` and avoid leaking EF entities directly.
- Place HTTP orchestration in controllers and business logic in services.
- Enforce auth and role/rule checks server-side even if frontend already checks.
- Use async EF Core queries and cancellation tokens where applicable.
- Add/update migrations only when schema changes are requested.
- Log security-sensitive operations to audit logs when possible.

## Frontend Rules (React + shadcn/ui + Tailwind)

- Centralize request logic in `frontend/src/lib/api.ts`.
- Keep components presentational; move request/state orchestration to page/container hooks.
- Reuse existing `frontend/src/components/ui/` primitives first.
- Keep forms and tables consistent with existing style and spacing tokens.
- Ensure mobile + desktop responsiveness and usable loading/error states.

## PocketBase-Like Feature Mapping

Use this capability map when implementing features:

- Auth: register/login/refresh/logout/me/profile update.
- Collections: create/update schema-like definitions and rule metadata.
- Records: CRUD, pagination/filter/sort, relation-friendly payloads.
- Rules: operation-level access checks (list/view/create/update/delete).
- Users/Admin: role-aware management and safe defaults.
- AI (early stage): conversational entrypoint and pluggable provider boundary.

## Definition Of Done

A task is complete only when all applicable checks pass:

- Build passes for touched project(s).
- No new lint/type errors in touched frontend files.
- API contract and frontend caller are synchronized.
- Basic happy-path and error-path are both handled.
- Output includes what changed, what remains, and validation status.

## Non-Goals (Unless User Asks)

- Rewriting architecture across the entire repo.
- Replacing existing UI system away from shadcn/ui.
- Introducing unrelated infrastructure/tooling churn.

## Example Prompts

- "在 backend 新增 PocketBase 风格的 records list 查询，支持 page/perPage/filter/sort，并同步前端调用。"
- "把 auth 刷新 token 流程补齐：后端 endpoint + 前端自动刷新拦截。"
- "按现有风格做一个 collections 管理页，支持新增、编辑、删除并展示 rule 字段。"
- "为 AIController 增加 provider 抽象，保留当前接口不破坏前端。"
- "帮我做一次前后端契约一致性检查，并修复不一致字段。"

## Collaboration Notes

- Keep edits minimal and local to the requested scope.
- If uncertain, prefer reading current code and deriving conventions over guessing.
- When blockers appear (missing dependency, ambiguous business rule), state the blocker and provide a concrete fallback.
 

 我想复刻pocketbase 版本，并按照你的要求不断迭代，
1：新建Pocketbase.net目录用于完整独立项目，并且frontend，用于保存前端项目，backend保存后端项目
2：前端采用：react+shadcn-ui+tailwind
3：后端采用：.net 10+EF，如果需要其它技术请自己加入
4:.agents/skills/pocketbase-best-practices是pocketbase skills
5：Pocketbase.net版本要实现Pocketbase主要功能，提供用户管理，实体创建，并且可以直接api 供外部其它页面前段直接调用。
6：实现前面提到第一阶段和第二阶段功能，
7：保证系统可以完整运行，页面漂亮美观,操作和用户体验和pocketbase 一样，风格符合shadcn-ui
8:接入AI开发初期版本，未来做深度集成。ai集成，前端使用@ant-design/x
8：相关技能参照.agents/skills目录下即可，如有必要，也可参照.trace下的skills，其它都不用参考。