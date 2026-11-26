# Karen AI UI Design System (`apps/web`)

## Tokens (`apps/web/src/styles.css` & `tailwind.config.js`)
- **Surface & Background**: `--cream` (`#FAF7F0` light / `#111318` dark), `--surface` (`#FFFFFF` light / `#1A1E26` dark), `--ink` (`#0A0A0A` light / `#FAF7F0` dark), `--ink-muted` (`#4B5563` light / `#CBD5E1` dark).
- **Accents (WCAG AA >= 4.5:1 with `#0A0A0A` ink text)**: `--coral`, `--teal`, `--yellow`, `--mint`.
- **Borders & Shadows**: `2px`/`3px` `var(--border-ink)`, offset Neo-Brutalist shadows (`shadow-brutal`, `shadow-brutal-sm`), `2px` square-brutal radius (`rounded-brutal`).
- **Typography**: Self-hosted/system fallback stack (`Inter`, `JetBrains Mono`) without render-blocking `@import`; `16px` minimum input font size on mobile (`< 768px`) to prevent iOS Safari auto-zoom.

## Breakpoints & App Shell
- **Mobile (`<1024px`)**: Sticky slim `Topbar` with `env(safe-area-inset-top)`, `BottomNav` with 5 primary items (`Home`, `Karen`, `Inbox`, `Tasks`, `More`) + `env(safe-area-inset-bottom)`, `min-h-dvh` layout, and `44x44px` minimum touch targets (`@media (pointer: coarse)`).
- **Desktop (`>=1024px`)**: Persistent `Sidebar` + `Topbar` with Dark/Light theme toggle, Command Palette (`⌘K`), Notifications, and user avatar.
- **Dev Route**: `/design-system` showcases tokens and primitives (`PageHeader`, `SegmentedControl`, `BottomSheet`, `Skeleton`, buttons, inputs).
