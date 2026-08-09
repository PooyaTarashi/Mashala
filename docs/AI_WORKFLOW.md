# AI-Assisted Project Workflow

## Source of truth

**GitHub repository files are the canonical project state.**

AI chats are working sessions. Important accepted outcomes must be written back into repository documentation or ADRs.

## Roles

### ChatGPT Project — project brain
Use for:
- scope discussion;
- architecture questions;
- thesis reasoning;
- ambiguity resolution;
- weekly planning;
- reviewing whether a proposed feature is scope creep;
- summarizing accepted decisions.

Do not rely on chat memory alone. Ask it to ground answers in current project files.

### Codex — primary coding worker
Use for:
- focused implementation tasks;
- code review;
- tests;
- refactors;
- repository-aware changes.

Codex should follow `AGENTS.md`.

### Jules — secondary/autonomous coding worker
Use for:
- isolated GitHub issues;
- independent PRs;
- bounded implementation/review tasks.

Do not have Codex and Jules concurrently modify the same feature branch.

### GitHub
Use for:
- code;
- authoritative docs;
- ADRs;
- issues;
- branches;
- PR review;
- history.

## Decision workflow

```text
IDEA
  ↓
DISCUSSION
  ↓
PROPOSED DECISION
  ↓
ACCEPTED?
  ├─ no → leave as note/open question
  └─ yes
       ↓
      ADR
       ↓
 update PROJECT/SCOPE/ARCHITECTURE if necessary
       ↓
 GitHub issue
       ↓
 implementation
```

## Rule for ChatGPT sessions

At the start of architecture/project-management chats, say:

> Read the authoritative project documents first. Distinguish accepted decisions from open questions. If an idea conflicts with an accepted ADR, point that out before recommending implementation.

## Rule for coding tasks

A good coding prompt includes:

- issue/goal;
- files/docs to read;
- acceptance criteria;
- explicit out-of-scope items;
- tests to run.

Avoid prompts like “build the whole Mashala project.”
