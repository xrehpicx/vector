# Using shadcn/ui and Local UI Primitives

Vector uses a mix of:

- shadcn-managed component files in `src/components/ui`
- local wrappers built on Base UI or Radix primitives
- product-specific composition patterns layered on top

## Adding New Components

If you need a new shadcn-managed component, use the current CLI:

```bash
pnpm dlx shadcn@latest add <component-name> --yes
```

Example:

```bash
pnpm dlx shadcn@latest add alert-dialog tabs --yes
```

The CLI reads `components.json` and places files in `src/components/ui`.

## Rules

1. Do not run `init`. The repository already has `components.json`.
2. Prefer existing local primitives before adding a new one.
3. Some UI components in `src/components/ui` are custom wrappers around Base UI or Radix, not direct shadcn output. Follow existing file patterns when editing them.
4. Import UI primitives from `@/components/ui/...`.
5. After adding or changing a component, run the app and lint the touched files.
