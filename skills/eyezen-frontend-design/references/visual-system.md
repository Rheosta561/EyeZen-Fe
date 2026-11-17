# EyeZen visual system and layout rules

This is the initial visual direction for the separate web application. Treat
values as a coherent starting token set; verify contrast with the implemented
font sizes and surfaces before shipping. Every palette value is a solid color.

## Brand expression

- Render the brand as the text wordmark `EYEZEN`, using a confident, clean
  sans-serif and modest tracking. No official logo asset was supplied; do not
  draw an eye icon, medical cross, or other mark and call it the logo.
- The product is clinical operations software. Keep the interface calm and
  precise, with clear statuses, strong typographic hierarchy, and a restrained
  teal accent. Make calendars, appointment queues, and approval states carry
  product character instead of decorative art.
- Do not use gradients anywhere: no gradient fills, text, borders, charts,
  shadows, illustrations, or blurred gradient backdrops. Use solid surfaces,
  borders, and restrained elevation.

## Semantic palette

Use these CSS custom properties as initial tokens and map them to shadcn
variables and Tailwind color utilities. Keep color roles semantic so dark mode
changes the value without changing component code.

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| `background` | `#F5F7F5` | `#101715` | App canvas |
| `surface` | `#FFFFFF` | `#18211E` | Cards, dialogs, menus |
| `surface-muted` | `#EDF2EF` | `#202B27` | Inputs, selected rows, secondary panels |
| `foreground` | `#17231F` | `#F2F6F3` | Primary text and icons |
| `muted-foreground` | `#52615A` | `#B4C0B9` | Supporting text; verify 4.5:1 for normal text |
| `border` | `#D6E0DA` | `#35423B` | Separators, outlines, control edges |
| `primary` | `#155F52` | `#75C5AF` | Main action, active nav, focus accent |
| `primary-foreground` | `#FFFFFF` | `#10231D` | Text/icons on primary buttons |
| `ring` | `#155F52` | `#75C5AF` | Visible keyboard focus outline |
| `destructive` | `#B42318` | `#FF8A80` | Destructive actions and errors |
| `warning` | `#8A5100` | `#F2BD62` | Overridable conflicts and attention |
| `success` | `#176B45` | `#7CCB9A` | Confirmed/published outcomes |
| `info` | `#315D84` | `#8EBCE5` | Informational states |

For status surfaces, use a pale solid tint in light mode and a darker solid tint
in dark mode with a readable status foreground. Never use color alone: pair
status color with text and, where helpful, an icon/shape. Check all text, icon,
focus, and disabled combinations with a contrast checker. Keep normal text at
4.5:1 or better and large text at 3:1 or better.

## Tailwind, shadcn, and component rules

- Use Tailwind utilities for page and component styling. Define the palette as
  semantic CSS custom properties in the Next.js global theme file, then expose
  them through Tailwind/shadcn color tokens. Do not add a second CSS framework
  or page-specific stylesheet system.
- Use shadcn/ui components for Button, Input, Label, Select, Checkbox, Switch,
  Textarea, Calendar/Date Picker, Table, Tabs, Badge, Card, Dropdown Menu,
  Dialog, Sheet, Alert Dialog, Tooltip, Toast/Sonner, Skeleton, and Form as
  appropriate. Keep shadcn accessibility semantics when adding product style.
- Use sentence case in labels and actions. Give buttons verbs and outcomes
  (“Publish roster”, “Approve leave”, “Cancel appointment”), not generic
  “Submit” or icon-only controls without accessible names.
- Reserve the primary color for the main action, selection, and focus. Use
  neutrals for most surfaces. Use status colors only for workflow meaning.
- Keep dense information legible: dates and times align consistently; tables
  have labeled columns; essential actions remain visible; secondary actions
  stay in menus. Allow responsive conversion into cards/list rows on narrow
  screens.
- Use visible keyboard focus, labels connected to fields, inline validation,
  accessible names, keyboard-operable menus/dialogs, and non-color status
  cues. Use `aria-live` only for meaningful async results.

## Light and dark appearance

- Both appearances are first-class. Use semantic theme variables; do not
  invert screenshots or simply turn white surfaces black.
- Default to the system preference and offer a clear user-selectable Light,
  Dark, and System preference in account/settings UI. Persist the choice using
  the Next.js theme provider (for example, a class-based `next-themes` setup).
- Avoid pure black and pure white for broad surfaces. Keep borders, selected
  rows, hover, disabled, focus, error, and status states separately tuned for
  both appearances.
- Test login, navigation, calendar/list, tables, all dialogs, forms, empty and
  error states, token decision page, and charts/status labels in both themes.

## Layout baseline

Desktop starting grid:

```text
┌──────────────┬──────────────────────────────────────────────┐
│ EYEZEN       │ Page title / date range      actions / user  │
│ Overview     ├──────────────────────────────────────────────┤
│ Role nav     │ Context / filters / scope                    │
│ Dept context │ Main work surface: calendar, queue, or form   │
│              │                                              │
│ Theme / help │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

- Sidebar width around 15–17rem expanded and 4.5rem collapsed; use a single
  content column or a primary/detail split where the workflow benefits.
- Keep page content at a readable max width, but let operational calendars and
  tables use the available viewport. Establish consistent spacing, alignments,
  and row heights across screens.
- Make the current role and department scope visible without taking over the
  work surface. For hospital-wide admins, use an explicit “All departments”
  state plus a department filter.
- Use a responsive breakpoint to convert the sidebar into a sheet; do not
  squeeze its labels into the page. On small screens, surface the current
  department and page title above the task content.
- Prefer shadcn table/list patterns with sticky headers only when they help
  maintain context. Use horizontal scrolling only for genuinely tabular data
  with a clear scroll cue.

## Motion and feedback

- Use Framer Motion for brief, purposeful transitions: route content entrance,
  opening a drawer/dialog, or confirming a newly completed workflow step.
- Do not animate every card, number, row, or navigation item. Avoid parallax,
  springy dashboards, continuous motion, or motion that delays a control.
- Respect `prefers-reduced-motion`; reduce transitions to immediate state
  changes or very short opacity changes. Motion must never be the only signal
  that data changed.
- Keep async operations explicit: pending action label/spinner, success or
  failure message, and preserved form values on recoverable errors. Prevent
  double submission while a mutation is pending.
