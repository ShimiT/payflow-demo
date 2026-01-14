# Project Context
Prioritize readability and simplicity over clever or dense one-liners. Prefer small, well-tested commits and use provided Makefile tasks for repeatable demo flows.

## About This Project
PayFlow is a production-grade demo that simulates payment processing with configurable bug-injection for RCA exercises. It uses a Go backend, a React frontend (Node/npm), and Helm/Kubernetes for deployment; primary purpose is demoing failure scenarios and rollback workflows.

## Key Directories
- `backend/` - Go server, cmd/, handlers, go.mod, unit tests.
- `frontend/` - React frontend (Node + npm), build scripts.
- `helm/` - Helm chart and values files (`values-buggy.yaml`, `values-lkg.yaml`).
- `.github/` - CI and release GitHub Actions workflows.
- `VERSION` - Release version file used by CI/release workflow.
- `Makefile` - Orchestrates demos, builds, imports, and deployments.

## Standards
- Go: CI uses Go 1.21 — keep module-based layout (go.mod
