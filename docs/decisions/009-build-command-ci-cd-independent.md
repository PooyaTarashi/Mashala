# ADR-009 — Mashala defines build behavior, not CI/CD

**Status:** Accepted

## Decision
Mashala should provide conventional project commands such as:

- `mashala dev`
- `mashala build`
- `mashala start`

The environment in which `mashala build` runs is chosen by the developer.

## Consequences
Local builds, GitHub Actions, GitLab CI, Docker builds, and hosting-provider builders are all valid.
CI/CD orchestration and deployment-provider abstraction are outside the thesis scope.
