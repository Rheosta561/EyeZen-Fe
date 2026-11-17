---
name: eyezen-frontend-design
description: Design and implement the separate EyeZen staff web app in Next.js. Use for role-aware screens, navigation, layouts, design tokens, component implementation, and mapping EyeZen API workflows to UI. Enforces Tailwind CSS, shadcn/ui, Framer Motion, solid colors, and light/dark themes.
---

# EyeZen Frontend Design

Use this skill only for the separate EyeZen Next.js application. The current
EyeZen repository is backend-only. Do not create frontend files here unless the
user explicitly changes that boundary.

## Before designing or implementing

1. Read [role and layout context](references/roles-and-layout.md) and
   [API and workflow coverage](references/api-and-workflows.md). They define
   the product roles, department scope, implemented actions, and backend gaps.
2. For any screen or interaction design work, invoke the existing
   `apple-design` skill. Follow its current Apple HIG workflow and load the
   specific references needed for the view. Translate its platform principles
   to responsive web and shadcn/ui; do not imitate native iOS chrome.
3. Read [visual system](references/visual-system.md) when establishing or
   changing tokens, layout, theming, animation, or components.
4. Check the current backend routes/OpenAPI contract before presenting an
   action as available. If the endpoint does not exist or the caller's role is
   unauthorized, label it as future work or omit the control. Never simulate a
   successful backend operation with local-only state.

## Non-negotiable implementation constraints

- Use Next.js with TypeScript and Tailwind CSS for all frontend implementation.
- Use shadcn/ui and its accessible Radix primitives for common controls,
  overlays, menus, forms, tables, and feedback. Extend their variants through
  Tailwind classes and semantic tokens.
- Use Framer Motion for purposeful transitions. Respect reduced-motion
  preferences and keep all actions understandable without animation.
- Use solid colors only. No gradients, gradient text, gradient borders, or
  gradient imagery.
- Support both light and dark themes from the first implementation. Define
  semantic CSS-variable tokens and map them through Tailwind; test contrast in
  both themes. Do not hardcode one-off colors into page components.
- Brand the application with the text wordmark `EYEZEN`. No supplied logo
  artwork exists in this repository: do not invent an eye symbol or claim a
  generated mark is the official logo. A simple typographic wordmark is valid.
- Design for a clinical operations tool: clear hierarchy, precise dates and
  statuses, restrained density, predictable navigation, strong focus states,
  and clear confirmation for consequential actions.
- Treat API role checks as authoritative. Client-side role-aware navigation is
  for discoverability and must not be presented as a security boundary.

## Keep product context current

The role, scope, endpoint, and layout references are the shared source of
product context. If backend routes, permissions, schemas, or intentional scope
change, update the matching reference after verifying the current implementation
in the backend code/OpenAPI. Mark uncertain or missing capabilities as such;
do not silently fill gaps with invented workflows.

## Handover to the separate Next.js project

Copy this entire `eyezen-frontend-design` skill folder into the Next.js
project's `skills/` or configured Codex skill directory. Keep the references
with the skill so future UI work retains role, scope, API, and brand context.
