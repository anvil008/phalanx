# Contributing to Phalanx

Thank you for your interest in contributing to Phalanx. We welcome bug reports, feature suggestions, documentation improvements, and code contributions.

## Development Workflow

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/anvil008/phalanx.git
   ```
2. Create a feature branch for your changes:
   ```bash
   git checkout -b my-feature
   ```

### Prerequisites & Verification

- **Prerequisites**: Node.js 22+ and npm.
- **Verification commands**:
  ```bash
  npm ci
  npm run typecheck
  npm run build
  ```

Before opening a pull request, verify that all checks pass locally.

### Commit Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (for example: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). Keep pull requests focused.

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin my-feature
   ```
2. Open a Pull Request against the `main` branch of `anvil008/phalanx`.
3. Complete the pull request template with a clear summary of your changes, motivation, and testing performed.
