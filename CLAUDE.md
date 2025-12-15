# Project Context
Prioritize readability and maintainability over clever one‑liners. Follow existing project patterns for Go (idiomatic gofmt) and frontend TypeScript/React conventions.

## About This Project
PayFlow is a payment-processing demo: a React frontend, a Go backend, Redis cache and PostgreSQL, packaged with Helm for k3d/kubernetes. It’s designed for RCA demos with configurable bug-injection knobs.

## Key Directories
- backend/ - Go backend (cmd/, internal packages, go.mod)
- frontend/ - React frontend (Node/TypeScript)
- helm/ - Helm chart(s) for payflow deployment
- .github/workflows/ - CI and release workflows
- VERSION - repo version file
- Makefile - local/demo automation targets

## Standards
- Type hints / typing requirements
  - Go: use modules, keep code gofmt-ed and build with Go 1.21 (CI uses go 1.21).
  - Frontend: TypeScript + React; prefer explicit types and avoid implicit any where possible.
- Linting rules
  - No project-specific linter config detected in repo root. Use:
    - backend: go fmt / go vet
    - frontend: npm run lint if a lint script exists; otherwise follow common ESLint/TSLint rules.
- Line length limits
  - No project-specific limit detected. Prefer <= 100 chars for readability.
- Import ordering conventions
  - Go: stdlib → external → internal.
  - TS/JS: node/core → external → absolute/project → relative.

## Common Commands
```bash
make help            # list Makefile targets and usage
make demo-baseline   # Phase 1: Build + import + deploy stable baseline (Makefile)
make demo-stable     # Commit stable, build + deploy (Makefile)
make demo-buggy      # Commit buggy, build + deploy (Makefile)
make demo-rca        # Start RCA investigation via API (Makefile)
make demo-rollback   # Rollback to Last Known Good (Makefile)
make demo-full       # Run full demo flow (Makefile)

# Backend build & tests (from CI)
cd backend
go mod tidy
go build -o pay
