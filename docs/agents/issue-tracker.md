# Issue tracker: GitHub

Issues and specs live in GitHub Issues for
alexcatdad/eu-einvoice-canonical. Use the gh CLI with
--repo alexcatdad/eu-einvoice-canonical.

## Conventions

- Read issues with gh issue view, including body, labels and comments.
- List issues with gh issue list and appropriate state/label filters.
- Create issues with gh issue create; update with gh issue edit.
- Write multiline bodies to a temporary file and use --body-file.
- Apply configured labels with gh issue edit --add-label or --remove-label.
- Use native GitHub sub-issues and dependencies when available.
  Otherwise use explicit "Part of #N" and "Blocked by #N" references.

## Publication

Keep internal discussions in chat or explicitly approved private storage.
Before publishing content derived from an internal discussion, show a
sanitized draft in chat and obtain explicit approval of its exact wording
and destination. Publish only the approved content.

## Pull requests as a triage surface

PRs as a request surface: no.
