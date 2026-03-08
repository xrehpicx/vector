# Design System

This document defines the core visual and interaction principles of the Vector UI. The goal is a dense, efficient, and consistent experience inspired by modern operational tools such as Linear, while still matching the patterns already established in this repository.

## Navigation Philosophy

- **Compact and Efficient**: Navigation items are compact with minimal padding (`py-1.5 px-3`).
- **Icons and Labels**: Primary navigation relies on clear icons and short labels, with no descriptive text.
- **Hierarchy**: A clean visual hierarchy supports a maximum of 4-5 top-level destinations.

## Component System

- **UI primitives**: The app uses local primitives in `src/components/ui`, drawing from shadcn, Base UI, and Radix where appropriate.
- **Dense Variants**: We favor "dense" variants of components:
  - **Inputs**: `h-9`
  - **Buttons**: `size="sm"` (`h-9`) as default.
  - **Cards**: `p-4` padding.
- **Composition**: Variants are composed with `class-variance-authority` and classes are merged with `tailwind-merge`.

## Color System

- **Tailwind Tokens**: All colors must reference Tailwind theme tokens (e.g., `primary`, `secondary`, `muted`). Do not use hard-coded hex values.
- **Semantic Mapping**:
  - Success: `primary`
  - Warning: `yellow`
  - Error: `destructive`
- **Dark Mode**: Dark mode is supported automatically using Tailwind's `dark:` variant.

## Layout, Spacing, and Sizing

- **4px Grid**: Spacing and sizing are based on a 4px grid (e.g., `space-y-1`, `gap-2`).
- **Dense operational layout**: Detail pages and list views should stay compact and inline-first rather than card-heavy.
- **Dense Spacing**:
  - Form controls: `space-y-4`
  - Nav items: `space-y-1`

## Typography

- **Dense Scale**: The typography scale is adjusted for density.
  - Body text: `text-sm`
  - Secondary text: `text-xs`
  - Navigation text: `text-sm`
- **Font Weight**: `font-medium` for navigation items, `font-semibold` for card titles.

## Motion and Micro-interactions

- **Speed**: Animations are fast, between 120ms and 200ms.
- **Subtle Feedback**: Interactions provide subtle feedback.
  - Button press: `scale-[0.98]`
  - List hover: `bg-muted/30`
- **Progress Indicators**: Long-running operations (>400ms) display a thin, Linear-style progress bar at the top of the screen.
