# CI/CD pipeline

Name: Ridaa Mirza
Enrollment No: 24BCS10394

The pipeline is [`final-project.yml`](final-project.yml) in this folder. This project has its own repo (`Ridaa10394/devops-project`), so the workflow sits at the repo root's `.github/workflows/` where GitHub picks it up, and it runs on every push and pull request to `main` (plus a manual `workflow_dispatch`):

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

I first built this project as a sub-folder of my course repo (`Ridaa10394/DevOps`), where the workflow needed a `paths:` filter and every path had a `final-devops-project/` prefix. When I moved it into its own repo I dropped both - everything now runs from the repo root.

Stages and what each one proves are described in the main README (CI/CD pipeline section).

The workflow passes `actionlint` (which also runs shellcheck on every `run:` block):

![actionlint](../../screenshots/25-actionlint-helm-lint.png)
