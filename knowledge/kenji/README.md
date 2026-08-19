# Kenji Versioned Knowledge

This directory is the Git source of truth for Kenji AI knowledge content and safety policy.

## Operating model

- Git stores canonical knowledge, schema, routes, boundaries, and published cards.
- Pull requests are the review and approval gate.
- Workers may load only validated published cards.
- Internal admin pages may draft, preview, and propose changes, but must not become the final source of truth by themselves