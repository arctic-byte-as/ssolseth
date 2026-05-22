# Best Practice GitHub Agent

This repository uses a persona-based collaboration agent setup to iterate on the Time Tracker app.

## Purpose
- Separate engineering and UX review into distinct persona manifests
- Align suggestions with the current single-page Time Tracker scope
- Keep iteration small, actionable, and focused on real user needs

## Files
- `.github/agents/best-practice-agent.yml` — coordination manifest for the agent set
- `.github/agents/engineering-lead.yml` — lead software engineer persona
- `.github/agents/ux-designer.yml` — UX designer persona

## How to use
1. Start by reviewing the `best-practice-agent.yml` coordination manifest.
2. Use `engineering-lead.yml` for maintainability, bug fixes, and code improvement recommendations.
3. Use `ux-designer.yml` for usability, accessibility, and interaction guidance.
4. Keep recommendations aligned with the current app: a browser-based Time Tracker with timer controls and session logging.

## Project scope
- A simple Time Tracker web app with:
  - a visible timer
  - start/stop and reset controls
  - a session name input
  - a local storage session log
- Current improvement areas include:
  - markup and style consistency
  - session persistence and delete handling
  - accessibility and control affordances

## Collaboration focus
- Engineering: fix broken behaviors, improve code structure, preserve simplicity
- UX: improve labels, feedback, readability, and session log clarity
- Iteration: make changes that are easy to review and validate on the existing page
