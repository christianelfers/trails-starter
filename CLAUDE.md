# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Pioneer Trails Starter - a modern web application framework for building client-side applications using React, TypeScript, and the Open Pioneer framework. Monorepo architecture with pnpm workspaces supporting apps, packages, and samples.

**Stack**: React 19, TypeScript (strict), Vite, Chakra UI v3, OpenLayers (maps), Vitest, pnpm workspaces

## Essential Commands

```bash
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # Production build to dist/www
pnpm test             # Run all tests with Vitest (watch mode)
pnpm test -- --run    # Run tests once (no watch)
pnpm test <pattern>   # Run tests matching pattern
pnpm check-types      # TypeScript type checking
pnpm lint             # ESLint (use --fix to auto-fix)
pnpm prettier         # Format code
pnpm clean            # Remove all dist directories
```

## Project Structure

```
src/
├── apps/           # Complete applications (entry points)
├── packages/       # Reusable components and services
├── samples/        # Example implementations
├── sites/          # Additional HTML sites
├── testing/        # Shared test utilities
└── index.html      # Main entry point
```

- **Apps**: Complete web applications, compiled to standalone deployments
- **Packages**: Reusable components with clear public APIs, can define services
- **Samples**: Demonstrate framework features, configured in `vite.config.ts` (`sampleSites` array)

## Package Architecture

Each package/app requires:

- `package.json` - Package metadata and dependencies
- `build.config.mjs` - Open Pioneer build configuration (services, i18n, entry points)

### build.config.mjs Structure

```javascript
import { defineBuildConfig } from "@open-pioneer/build-support";
export default defineBuildConfig({
    entryPoints: ["index"], // Public API modules
    i18n: ["en", "de"], // Supported locales (creates i18n/*.yaml)
    services: {
        MyService: {
            provides: "my-package.MyInterface",
            references: { dep: "other.Interface" }
        }
    },
    ui: { references: ["some.Interface"] } // Services needed by React components
});
```

### Service Implementation

Services are exported from `services.ts` (or custom `servicesModule`):

```typescript
export class MyService {
    constructor(options: ServiceOptions<{ dep: OtherInterface }>) {
        this.dep = options.references.dep;
    }
}
```

## Code Standards

### Required License Headers

All source files must start with:

```typescript
// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
```

### Style Rules

- Double quotes, semicolons always required
- 4 spaces indentation (2 for YAML)
- Max 100 character line length
- No relative imports between packages (`import/no-relative-packages`)
- Unused variables prefixed with `_`

### TypeScript

- Strict mode with `noUncheckedIndexedAccess`
- No non-null assertions (`!`) outside tests
- No explicit `any` outside tests

## Framework Patterns

### Open Pioneer Imports

```typescript
import { useIntl, useService, useServices, useProperties } from "open-pioneer:react-hooks";
```

### React Component Testing

```tsx
import { PackageContextProvider } from "@open-pioneer/test-utils/react";
render(
    <PackageContextProvider>
        <MyComponent />
    </PackageContextProvider>
);
```

### Internationalization (i18n)

**Setup**: Declare supported locales in `build.config.mjs`:

```javascript
export default defineBuildConfig({
    i18n: ["en", "de"] // First locale is the fallback
});
```

**File structure**: Create `i18n/<locale>.yaml` for each locale:

```yaml
# i18n/en.yaml
messages:
    greeting: "Hello {name}" # Interpolation with {variable}
    dialog:
        title: "Dialog Title" # Nested keys accessed as "dialog.title"
    items: "{count, plural, =0 {No items} one {# item} other {# items}}" # Plurals
    gender: "{g, select, male {Mr.} female {Ms.} other {}}" # Selection
```

**Usage in React components**:

```tsx
import { useIntl } from "open-pioneer:react-hooks";

function MyComponent() {
    const intl = useIntl();

    // Simple message
    intl.formatMessage({ id: "dialog.title" });

    // With interpolation
    intl.formatMessage({ id: "greeting" }, { name: "World" });

    // Plurals
    intl.formatMessage({ id: "items" }, { count: 5 });

    // Format numbers/dates (locale-aware)
    intl.formatNumber(1234.56, { style: "currency", currency: "EUR" });
    intl.formatDate(new Date(), { dateStyle: "full" });

    // Rich text with React elements
    intl.formatRichMessage({ id: "message" }, { element: <Tag>Hi</Tag> });
}
```

**Overriding messages** (apps only): Override package messages in app's `i18n/*.yaml`:

```yaml
overrides:
    some-package-name:
        message.id: "Custom replacement"
```

## Workspace & Dependencies

- Use `workspace:^` for local package references
- Use `catalog:` for external dependencies (versions in `pnpm-workspace.yaml`)
- Run `pnpm check-duplicates` to verify no unintended duplicate packages

## Testing

- Tests colocate with source (`.test.ts`, `.test.tsx`)
- Vitest with happy-dom environment
- Global setup in `src/testing/global-setup.ts` provides polyfills
- Use `@testing-library/react` and `@testing-library/user-event`
