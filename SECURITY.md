# Security Policy

Opaline is currently a public alpha.

## Reporting Security Issues

Please do not open a public issue for sensitive security problems.

For now, contact the maintainer privately through the contact channel listed on the repository profile or release page. If no private channel is available yet, open a minimal public issue asking for a private security contact without disclosing exploit details.

## Scope

Security-sensitive areas include:

- Local file access and workspace boundaries.
- Plugin and live script execution.
- AI provider configuration and API keys.
- Import/export behavior.
- Generated or published HTML.

## Current Alpha Notes

- Builds may be unsigned unless a release explicitly says otherwise.
- Third-party plugin behavior is experimental.
- Users should only install plugins and open workspaces they trust.
- API keys are user-provided and should be treated as secrets.
