# Tech Stack

| Layer       | Tech                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Runtime     | **Next.js 16** (App Router, React 19)                                                           |
| Language    | **TypeScript**                                                                                  |
| Backend     | **Convex** for database, functions, realtime, and storage                                       |
| Auth        | **better-auth** with `@convex-dev/better-auth`                                                  |
| UI          | **Tailwind CSS 4** + local `src/components/ui` primitives built from shadcn, Base UI, and Radix |
| Icons       | **Lucide React**                                                                                |
| Tooling     | ESLint 9 + Prettier 3 + Husky + Turbopack                                                       |
| Package Mgr | **pnpm**                                                                                        |

## Non-Functional Requirements

- **Security:** Organization-scoped permissions and authenticated access to operational workflows.
- **Scalability:** Stateless Next.js frontend paired with Convex-managed backend infrastructure.
- **Reliability:** Strong typing across client and backend boundaries, plus realtime consistency from Convex.
