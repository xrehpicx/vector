# Design Patterns

This document provides concrete examples and patterns for building user interfaces in Vector.

## Accessibility

- All components must pass **WCAG 2.1 AA** for contrast.
- Use `aria-label` on icon-only buttons.
- Ensure the `tab-order` mirrors the visual order.
- Ensure touch targets are at least 44x44px on mobile devices.

## Issue Key Format System

- **Progressive Disclosure**: Disable action buttons until prerequisites are met. For example, disable the "Team-based" format option until a team is selected.
- **Smart Defaults**: The user-based format can be the default since the creator is always known.
- **Reset Logic**: When switching between mutually exclusive options (e.g., team vs. project), clear the incompatible selection.
- **Tooltips for Disabled States**: Use the `title` attribute to explain why an action is disabled.

## View Page Layout Pattern

Entity list pages should follow the pattern established by the **Issues Page** (`src/app/[orgSlug]/(main)/issues/page.tsx`).

```tsx
export default function EntityListPage() {
  // 1. Client component with state and Convex hooks
  const [activeFilter, setActiveFilter] = useState('all');
  const data = useQuery(api.entity.queries.list, {
    orgSlug,
    filter: activeFilter,
  });

  return (
    <div className='bg-background h-full'>
      {/* Header with filter tabs and create button */}
      <div className='border-b'>
        <div className='flex items-center justify-between p-1'>
          <div className='flex items-center gap-1'>{/* Filter tabs */}</div>
          <CreateEntityDialog />
        </div>
      </div>

      {/* Main content area */}
      <div className='flex-1'>
        <EntityTable entities={data} />
      </div>
    </div>
  );
}
```

This pattern keeps list views consistent and separates concerns between data fetching, state management, and rendering.
