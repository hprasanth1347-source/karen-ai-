# Karen AI UI QA Checklist

## Automated Checks
- `npm run check:contrast` — verifies all light & dark token pairs meet WCAG 2.2 AA (>= 4.5:1).
- `npm run typecheck` — verifies strict TypeScript across `@karen/web`, `@karen/api`, `@karen/worker`, `@karen/shared`.
- `npm run build` — verifies Vite production bundle & API compilation.

## Manual Cross-Device Checklist
1. **360px / 390px / 430px (iOS Safari & Android Chrome)**:
   - Verify no horizontal page scroll (`document.documentElement.scrollWidth <= window.innerWidth`).
   - Verify `BottomNav` stays pinned above home indicator (`env(safe-area-inset-bottom)`).
   - Tap inputs in Auth, Chat, Classroom Join — verify iOS does not auto-zoom (`16px` input font).
2. **Dark Mode**:
   - Toggle Sun/Moon in `Topbar` and reload — verify zero white flash on load and `<meta name="theme-color">` updates.
3. **Accessibility**:
   - Press `Tab` from top of page — verify `Skip to main content` link appears and focus moves to `#main-content`.
   - Verify `Escape` closes `BottomSheet`, `CommandPalette`, and `NotificationPanel`.
   - Test at `200%` browser zoom and with `prefers-reduced-motion: reduce`.
