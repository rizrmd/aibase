# Extension Documentation

## Overview

Extensions in AIBase are modular, project-scoped plugins that extend the LLM's capabilities. They can provide custom script functions, file processing, and custom UI components loaded from the backend using a plugin architecture.

### Backend Plugin Architecture (Production)

AIBase uses a **full backend plugin system** where all extension UI components are loaded dynamically from the backend:

```
Frontend (window.libs)          Backend Extension UI
├── React                      └── show-chart/ui.tsx
├── ReactDOM                       ├── show-table/ui.tsx
├── echarts                       └── show-mermaid/ui.tsx
├── ReactECharts
└── mermaid
```

**Key Concepts:**

1. **Backend Bundling**: Extension UI files are bundled with esbuild on-demand
2. **External Dependencies**: React and visualization libraries are loaded in frontend and exposed via `window.libs`
3. **Dynamic Loading**: Frontend fetches bundled UI from `/api/extensions/:id/ui`
4. **Priority System**: Project-specific UI overrides global defaults

### Development vs Production Mode

| Mode | Environment Variable | Source Location | Use Case |
|------|---------------------|-----------------|----------|
| Development | `USE_DEFAULT_EXTENSIONS=true` | `backend/src/tools/extensions/defaults/` | Hot-reload during development |
| Production | `USE_DEFAULT_EXTENSIONS=false` (default) | `data/{projectId}/extensions/` | Per-project customization, deployment |

### Security Model

Extensions are executed in **isolated worker threads** for security:

**Worker Isolation:**
- Each extension runs in a separate worker process
- No access to main process memory or global state
- Cannot affect other extensions or the server
- Crashes in extension code don't crash the server

**Resource Limits:**
- Memory: 512MB per worker
- CPU Time: 30 seconds per evaluation
- Automatic termination on timeout

**Security Boundaries:**
- File system access: Blocked (unless explicitly allowed)
- Network access: Available (for fetch, APIs)
- Global state: Isolated per worker
- Inter-extension communication: Controlled via hook registry

**Worker Lifecycle:**
```
Main Thread              Worker Thread
    │                         │
    │  ┌─────────────────┐   │
    │  │ Extension Code   │──▶│  Isolated execution
    │  └─────────────────┘   │  with resource limits
    │                         │
    ◀────────────────────────┘
         Result returned
```

Workers are cached per extension and reused for subsequent evaluations.

## Debug Logging

Extensions support debug mode for detailed logging during development and troubleshooting.

### Backend Debug Logging

When debug mode is enabled (`debug: true` in metadata), backend execution logs are captured automatically:

```json
{
  "id": "my-extension",
  "debug": true
}
```

**What gets logged:**
- Extension load failures
- Evaluation errors with stack traces
- Dependency loading issues
- Worker execution errors

**Viewing logs:**
1. Go to Extensions Settings page
2. Click the Debug badge on an extension
3. Select "Backend" tab
4. View color-coded logs (ERROR=red, WARN=yellow, INFO=blue)

**Log storage:**
- Up to 100 most recent logs stored in `metadata.json`
- Logs include timestamp, level, message, and optional data
- Cleared when debug mode is disabled

### Frontend Debug Logging

Extension UI components (`ui.tsx`) can log their own errors and warnings using the `extensionLogger` utility:

```typescript
import { extensionLogger } from '@/lib/extension-logger';

export function MyExtensionMessage({ toolInvocation }) {
  useEffect(() => {
    try {
      // ... component logic
    } catch (error) {
      extensionLogger.error(
        'my-extension',
        'Failed to render visualization',
        { error: error.message, stack: error.stack }
      );
    }
  }, []);

  return <div>...</div>;
}
```

**Logger methods:**
- `extensionLogger.error(id, message, data?)` - Log errors
- `extensionLogger.warn(id, message, data?)` - Log warnings
- `extensionLogger.info(id, message, data?)` - Log info
- `extensionLogger.debug(id, message, data?)` - Log debug messages

**Viewing frontend logs:**
1. Go to Extensions Settings page
2. Click the Debug badge on an extension
3. Select "Frontend" tab
4. View logs from UI components

**Frontend log storage:**
- Stored in memory (per-session)
- Up to 100 logs per extension
- Cleared on page refresh

### API Endpoints

#### Toggle Debug Mode
```PATCH /api/projects/{projectId}/extensions/{extensionId}/debug```

Request:
```json
{ "debug": true }
```

#### Get Debug Logs
```GET /api/projects/{projectId}/extensions/{extensionId}/debug```

Response:
```json
{
  "data": {
    "logs": [
      {
        "timestamp": 1738000000000,
        "level": "error",
        "message": "Failed to load extension",
        "data": { "stack": "..." }
      }
    ]
  }
}
```

## Extension Structure

An extension consists of the following files:

```
my-extension/
├── metadata.json    # Extension metadata (required)
├── index.ts         # TypeScript implementation (required)
└── ui.tsx          # React UI components (optional)
```

### metadata.json

Required metadata file describing the extension:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "description": "Brief description of what it does",
  "author": "Your Name",
  "version": "1.0.0",
  "category": "my-category",
  "enabled": true,
  "isDefault": false,
  "createdAt": 1704067200000,
  "updatedAt": 1704067200000,
  "debug": false
}
```

**Optional fields:**
- `debug` (boolean) - Enable detailed logging for troubleshooting (default: false)
- `dependencies` (object) - Declare npm package dependencies (see [Dynamic Dependencies](#dynamic-dependencies-system))
- `examples` (array) - Provide usage examples for LLM context
- `messageUI` (object) - Custom message UI component
- `inspectionUI` (object) - Custom inspection panel tab
- `fileExtraction` (object) - File extraction capabilities

### index.ts

TypeScript implementation. Must export a default object with functions:

```typescript
const myExtension = {
  myFunction: async (options: { param: string }) => {
    return { result: `Hello ${options.param}` };
  }
};
return myExtension; // Required return statement
```

**Backend Logging:**

Errors and logs from backend execution are automatically captured when debug mode is enabled:

```typescript
const myExtension = {
  myFunction: async (options: { param: string }) => {
    // Errors are automatically logged when debug mode is enabled
    if (!options.param) {
      throw new Error('Parameter is required'); // Captured in debug logs
    }

    console.log('Processing:', options.param); // Also captured

    return { result: `Hello ${options.param}` };
  }
};
return myExtension;
```

All errors thrown in extension code are automatically logged to `debugLogs` in metadata when `debug: true`.

### ui.tsx (Optional)

React components for custom UI. Loaded from backend and uses `window.libs` for dependencies.

**Automatic Debug Logging:**

All `console.log/error/warn/debug` calls in extension UI components are automatically captured when debug mode is enabled. Logs are sent to the backend and stored in the extension's metadata, making them accessible to the AI for troubleshooting.

```typescript
// ui.tsx
export default function MyExtensionMessage({ toolInvocation }) {
  useEffect(() => {
    console.log('Extension UI loaded'); // Automatically captured!

    try {
      doSomething();
    } catch (error) {
      console.error('Operation failed:', error); // Captured with full error details
    }
  }, []);

  return <div>...</div>;
}
```

**Log Storage & Access:**
- Logs stored in `metadata.json` under `debugLogs` array
- Each log has: `timestamp`, `level`, `message`, `source` ('ui' or 'worker'), `data`
- View logs in Extensions Settings → Click Debug badge → Frontend/Backend tabs
- Max 100 logs per extension (oldest removed when limit reached)
- Only stored when `debug: true` is enabled in metadata

**For the AI:**
When an extension fails, the AI can review the debug logs from both frontend (UI component errors) and backend (worker execution errors) to diagnose and fix issues.

## Priority System for Extension UI

Extension UI components are loaded with a priority system:

### 1. Project-Specific Extensions (Highest Priority)

```
data/{projectId}/extensions/{extensionId}/ui.tsx
```

Custom UI for a specific project. Overrides global default.

**Example:**
```typescript
// data/project-A/extensions/show-chart/ui.tsx
export default function ShowChartInspector({ data }) {
  // Custom dark theme for project A
  return <div className="custom-dark">{/* ... */}</div>;
}
```

### 2. Global Default Extensions (Fallback)

```
backend/src/tools/extensions/defaults/{extensionId}/ui.tsx
```

Default UI used when no project-specific override exists.

**Example:**
```typescript
// backend/src/tools/extensions/defaults/show-chart/ui.tsx
export default function ShowChartInspector({ data }) {
  // Standard chart UI
  return <div className="chart">{/* ... */}</div>;
}
```

### Loading Priority

When loading UI for extension `show-chart` in `project-A`:

1. Check: `data/project-A/extensions/show-chart/ui.tsx`
2. If exists → Use project-specific UI
3. If not → Use `backend/src/tools/extensions/defaults/show-chart/ui.tsx`

### API Endpoint

```typescript
// Default UI (global)
GET /api/extensions/show-chart/ui

// Project-specific UI
GET /api/extensions/show-chart/ui?projectId=project-A&tenantId=1
```

## Backend Plugin System

### window.libs Architecture

`window.libs` is a global registry of libraries available to extension UI components.

**Base Libraries (Always Available):**

These are pre-loaded in `frontend/src/main.tsx` and always available:

```typescript
// frontend/src/main.tsx
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';
import mermaid from 'mermaid';

if (typeof window !== 'undefined') {
  (window as any).libs = {
    React,
    ReactDOM: { createRoot },
    echarts,
    ReactECharts,
    mermaid,
  };
}
```

**Dynamic Libraries (Extension-Specific):**

Extensions declare additional dependencies in `metadata.json`:

```json
{
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0",
      "plotly.js-dist-min": "^2.27.0"
    }
  }
}
```

These are automatically loaded when the extension UI is fetched and added to `window.libs`.

**Available Libraries:**

| Library | Source | Available |
|---------|--------|-----------|
| React, ReactDOM | Pre-loaded | Always |
| echarts | Pre-loaded | Always |
| ReactECharts | Pre-loaded | Always |
| mermaid | Pre-loaded | Always |
| d3 | Dynamic | When declared |
| plotly.js-dist-min | Dynamic | When declared |
| *Any npm package* | Dynamic | When declared |

### Extension UI Using window.libs

Extension UI components access libraries from `window.libs`:

```typescript
// backend/src/tools/extensions/defaults/show-chart/ui.tsx

// Get ReactECharts from window.libs
declare const window: {
  libs: {
    React: any;
    ReactDOM: any;
    ReactECharts: any;
    echarts: any;
    mermaid: any;
  };
};

const ReactECharts = window.libs.ReactECharts;

export default function ShowChartInspector({ data }) {
  return (
    <div>
      <ReactECharts option={chartOption} />
    </div>
  );
}
```

### esbuild Configuration

Backend uses esbuild with external dependencies:

```typescript
// backend/src/server/extension-ui-handler.ts
const result = await esbuild.build({
  entryPoints: [uiPath],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'esm',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'echarts',
    'echarts-for-react',
    'mermaid'
  ],  // Exclude shared deps - loaded from frontend window.libs
  write: false,
});
```

## Custom UI Components

Extensions provide React components for two contexts:

### Component Types

#### 1. Inspector Component (Default Export)

Full-featured UI for the inspection dialog:

```typescript
// ui.tsx
export default function MyExtensionInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h4 className="font-semibold">Results</h4>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

#### 2. Message Component (Named Export)

Simplified UI for inline chat messages:

```typescript
// ui.tsx
export function MyExtensionMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      {/* Simplified inline UI */}
    </div>
  );
}
```

### Naming Convention

Component names follow extension ID naming:

| Extension ID | Inspector (default) | Message (named) |
|--------------|---------------------|-----------------|
| `show-chart` | `ShowChartInspector` | `ShowChartMessage` |
| `image-search` | `ImageSearchInspector` | `ImageSearchMessage` |
| `my-extension` | `MyExtensionInspector` | `MyExtensionMessage` |

Pattern: `{ExtensionId}` → `{PascalCaseId}Inspector` / `{PascalCaseId}Message`

### TypeScript Interfaces

```typescript
// Inspector props (default export)
interface InspectorProps {
  data?: {
    [key: string]: any;  // Extension-specific data
  };
  error?: string;
}

// Message props (named export)
interface MessageProps {
  toolInvocation: {
    toolCallId: string;
    result: {
      [key: string]: any;
    };
  };
}
```

## Using Visualization Libraries

### ECharts (show-chart)

```typescript
declare const window: {
  libs: {
    React: any;
    ReactECharts: any;
    echarts: any;
  };
};

const ReactECharts = window.libs.ReactECharts;

export function ShowChartMessage({ toolInvocation }) {
  const { series, xAxis } = toolInvocation.result.args;

  const option = {
    xAxis: { type: 'category', data: xAxis },
    series: [{ type: 'bar', data: series }]
  };

  return (
    <div className="h-[300px]">
      <ReactECharts option={option} />
    </div>
  );
}
```

### Mermaid (show-mermaid)

```typescript
const mermaid = window.libs.mermaid;

export function ShowMermaidMessage({ toolInvocation }) {
  const { code } = toolInvocation.result.args;

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false });
    mermaid.render('mermaid-diagram', code);
  }, [code]);

  return <div id="mermaid-diagram" />;
}
```

## Dynamic Dependencies System

Extensions can declare their own npm package dependencies in `metadata.json`. The system automatically loads these packages from npm—no external CDN requests.

### Frontend vs Backend Dependencies

| Aspect | Frontend Dependencies | Backend Dependencies |
|--------|----------------------|----------------------|
| **Used in** | `ui.tsx` components | `index.ts` code |
| **Field** | `dependencies.frontend` | `dependencies.backend` |
| **Target** | Browser | Bun runtime |
| **Access** | `window.libs.packageName` | `deps.packageName` |
| **Bundling** | ESM bundle | Direct module import |
| **Cache** | Disk + HTTP | Disk only |

### How It Works

#### Frontend Dependencies (UI Components)

```
┌─────────────────────┐
│ Extension UI        │
│  (ui.tsx)           │
│                     │
│ dependencies: {     │
│   "d3": "^7.9.0"   │
│ }                   │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│ Frontend fetches bundle     │
│  → POST /dependencies/bundle│
│  → Receives bundled JS      │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ window.libs.d3 available    │
└──────────────────────────────┘
```

#### Backend Dependencies (Extension Code)

```
┌─────────────────────┐
│ Extension Code       │
│  (index.ts)          │
│                     │
│ dependencies: {     │
│   "lodash": "^4.17" │
│ }                   │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│ Extension loader             │
│  → Loads modules with Bun   │
│  → Imports from npm         │
│  → Caches in memory         │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ deps.lodash available       │
└──────────────────────────────┘
```

### Declaring Dependencies

Add `dependencies.frontend` to your `metadata.json`:

```json
{
  "id": "custom-viz",
  "name": "Custom D3 Visualization",
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0",
      "d3-scale-chromatic": "^3.1.0"
    }
  }
}
```

### Using Dependencies in UI

Access dynamically-loaded packages from `window.libs`:

```typescript
// ui.tsx
declare const window: {
  libs: {
    React: any;
    d3: any;  // Dynamically loaded
  };
};

const React = window.libs.React;
const d3 = window.libs.d3;

export function CustomVizMessage({ toolInvocation }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current)
      .append('svg')
      .attr('width', 400)
      .attr('height', 300);

    // Create visualization...
  }, [toolInvocation]);

  return <div ref={ref} />;
}
```

### Backend Dependencies (Extension Code)

Backend dependencies are loaded when the extension code runs and injected as the `deps` object.

#### Example: Data Processing with Lodash

```json
// metadata.json
{
  "id": "data-processor",
  "name": "Data Processor",
  "dependencies": {
    "backend": {
      "lodash": "^4.17.21",
      "date-fns": "^3.0.0"
    }
  }
}
```

```typescript
// index.ts
const dataProcessor = {
  groupBy: async (options: { data: any[]; field: string }) => {
    // Access lodash from deps
    const { groupBy } = deps.lodash;

    const grouped = groupBy(options.data, options.field);

    // Format dates with date-fns (use string key for packages with hyphens)
    const { format } = deps['date-fns'];
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    return {
      grouped,
      processedAt: timestamp
    };
  }
};

return dataProcessor;
```

#### Example: CSV Processing

```json
// metadata.json
{
  "id": "csv-processor",
  "name": "CSV Processor",
  "dependencies": {
    "backend": {
      "csv-parse": "^5.5.0"
    }
  }
}
```

```typescript
// index.ts
const csvProcessor = {
  parse: async (options: { csv: string }) => {
    // Access csv-parse from deps (use string key for hyphenated package name)
    const { parse } = deps['csv-parse'];

    const records = parse(options.csv, {
      columns: true,
      skip_empty_lines: true
    });

    return {
      records: records,
      count: records.length
    };
  }
};

return csvProcessor;
```

**Important notes for backend dependencies:**
- Use `deps.packageName` for normal package names (e.g., `deps.lodash`)
- Use `deps['package-name']` for packages with hyphens (e.g., `deps['csv-parse']`)
- Dependencies are loaded once when extension is first evaluated
- Modules are cached in memory for the lifetime of the server process
- All npm packages that work in Bun are supported

### API Endpoints

#### Bundle Dependencies

```
POST /api/extensions/dependencies/bundle
```

Request body:
```json
{
  "dependencies": {
    "d3": "^7.9.0",
    "plotly.js-dist-min": "^2.27.0"
  }
}
```

Returns bundled JavaScript code as text/javascript.

#### Get Extension Metadata

```
GET /api/extensions/{extensionId}/metadata?projectId={projectId}&tenantId={tenantId}
```

Returns extension metadata including dependencies:
```json
{
  "id": "custom-viz",
  "name": "Custom D3 Visualization",
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0"
    }
  }
}
```

### Caching

Dependencies are cached in multiple layers:

1. **Memory cache**: Fastest access during server runtime
2. **Disk cache**: Persistent across server restarts in `data/cache/extension-deps/`
3. **HTTP cache**: 24-hour cache header on bundle responses

Cache keys are: `{packageName}@{version}.js`

**Cache persistence**: Bundles are cached indefinitely until manually cleared:
- `DELETE /api/extensions/dependencies/cache` - Clear all
- `DELETE /api/extensions/dependencies/cache?name=d3&version=7.9.0` - Clear specific package

### Supported Package Types

| Package Type | Support | Notes |
|--------------|---------|-------|
| ESM modules | ✅ Full | Recommended |
| CommonJS | ⚠️ Partial | Bundled via Bun |
| UMD builds | ✅ Full | Works well |
| CSS imports | ❌ Not yet | Planned |
| WASM modules | ⚠️ Experimental | May work |

### Performance Considerations

**First Load:**
- Packages bundled on-demand (~500ms-2s depending on package size)
- Subsequent loads use cache (~10ms)

**Bundle Sizes:**
- Small utilities (Lodash): ~100KB bundled
- Visualization libs (D3): ~500KB bundled
- Heavy libs (Plotly): ~3MB bundled

**Best Practices:**
1. Pin specific versions (e.g., `"7.9.0"` not `"^7.9.0"`) for reproducibility
2. Prefer tree-shakeable ESM packages
3. Avoid duplicate dependencies across extensions (shared cache)
4. Use smaller alternatives when possible (e.g., `date-fns` vs `moment`)

### Examples

#### D3.js Visualization

```json
// metadata.json
{
  "id": "d3-chart",
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0"
    }
  }
}
```

```typescript
// ui.tsx
const d3 = window.libs.d3;

export function D3ChartMessage({ toolInvocation }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const data = toolInvocation.result.args.data;

    const svg = d3.select(ref.current)
      .append('svg')
      .attr('width', 500)
      .attr('height', 300);

    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', 5);
  }, []);

  return <div ref={ref} />;
}
```

#### Plotly Charts

```json
// metadata.json
{
  "id": "plotly-viz",
  "dependencies": {
    "frontend": {
      "plotly.js-dist-min": "^2.27.0"
    }
  }
}
```

```typescript
// ui.tsx
const Plotly = window.libs['plotly.js-dist-min'];

export function PlotlyMessage({ toolInvocation }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const { data, layout } = toolInvocation.result.args;

    Plotly.newPlot(ref.current, data, layout, {
      responsive: true,
      displayModeBar: false
    });
  }, []);

  return <div ref={ref} style={{ width: '100%', height: '400px' }} />;
}
```

#### Multiple Dependencies

```json
// metadata.json
{
  "id": "advanced-viz",
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0",
      "d3-scale": "^4.0.2",
      "d3-scale-chromatic": "^3.1.0",
      "topojson-client": "^3.1.0"
    }
  }
}
```

All packages bundled together in a single request and cached separately.

### Troubleshooting

**Package not loading:**
1. Check browser console for bundling errors
2. Verify package name and version are correct
3. Ensure package has browser-compatible exports
4. Check backend logs for bundling failures

**Cache issues:**
- Restart server to clear memory cache
- Delete `data/cache/extension-deps/` to clear disk cache
- Use `?_cache=timestamp` URL param to bypass HTTP cache

**Performance issues:**
- First load is always slower (bundling)
- Subsequent loads should be fast (cached)
- Consider pre-bundling common packages on server startup

## Metadata Reference

Complete reference of all `ExtensionMetadata` properties:

### Basic Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier (kebab-case, matches folder name) |
| `name` | `string` | Yes | Display name shown in UI |
| `description` | `string` | Yes | What the extension does |
| `author` | `string` | No | Who created it |
| `version` | `string` | Yes | Semantic version (e.g., "1.0.0") |
| `category` | `string` | No | Category ID for grouping (e.g., "database-tools") |
| `enabled` | `boolean` | Yes | Whether the extension is active |
| `isDefault` | `boolean` | Yes | Whether it came from defaults |
| `createdAt` | `number` | Yes | Unix timestamp in milliseconds |
| `updatedAt` | `number` | Yes | Unix timestamp in milliseconds |

### Advanced Properties

#### dependencies: `DependencyConfig`

Declare npm packages that your extension needs. Packages are automatically bundled and served from your backend (no external CDN requests).

```typescript
interface DependencyConfig {
  frontend?: Record<string, string>;  // Package -> version (e.g., "d3": "^7.9.0")
  backend?: Record<string, string>;   // Reserved for future use
}
```

**Example:**
```json
{
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0",
      "plotly.js-dist-min": "^2.27.0"
    }
  }
}
```

**How it works:**
1. When extension UI is loaded, backend bundles the declared packages using Bun
2. Bundles are cached in `data/cache/extension-deps/`
3. Frontend fetches bundled code from `/api/extensions/dependencies/bundle`
4. Bundled code is executed and exposes packages to `window.libs`

**Supported packages:**
- Any npm package with browser-compatible ESM exports
- Visualization libraries (D3, Plotly, Victory, etc.)
- Utility libraries (Lodash, date-fns, etc.)
- Data processing libraries (Arrow, DataFrame, etc.)

#### examples: `ExampleEntry[]`

Rich examples for LLM context. Format:

```typescript
interface ExampleEntry {
  title: string;          // Example title
  description?: string;   // Optional description
  code: string;           // TypeScript code example
  result?: string;        // Optional result description
}
```

#### fileExtraction: `FileExtractionConfig`

Declare support for automatic file processing:

```typescript
interface FileExtractionConfig {
  supportedTypes: string[];      // File extensions: ['pdf', 'docx', 'xlsx']
  outputFormat: 'markdown' | 'text';
}
```

#### messageUI: `MessageUIConfig` (DEPRECATED)

UI components are now auto-discovered from `ui.tsx` exports. This field is no longer needed.

#### inspectionUI: `InspectionUIConfig` (DEPRECATED)

UI components are now auto-discovered from `ui.tsx` exports. This field is no longer needed.

## Core Features

### Script Functions

Define callable functions in the exported object. They become available to the LLM in script execution:

```typescript
const myExtension = {
  // Single function - flattened to top-level scope
  query: async (options: { sql: string }) => {
    return { results: [] };
  },

  // Multiple functions - use namespace
  query: async (options) => { /* ... */ },
  connect: async (options) => { /* ... */ }
};
```

**Namespace behavior** (kebab-case to camelCase):
- Single function: `my-extension` → `myExtension()`
- Multiple functions: `my-extension` → `myExtension.query()`, `myExtension.connect()`

### Context Generation

The `context()` function generates AI documentation. Two approaches:

#### 1. Custom Context (Recommended)

Export a `context()` function for full control:

```typescript
const context = () => `
### My Extension

Query CSV files using SQL.

#### myExtension.query(options)
Execute SQL query.

\`\`\`typescript
await myExtension.query({
  sql: "SELECT * FROM 'data.csv' LIMIT 10"
});
\`\`\`

**Parameters:**
- \`sql\` (required): SQL query string

**Returns:**
- \`data\`: Result rows
- \`rowCount\`: Number of rows
`;
```

#### 2. Auto-Generated Context

If no `context()` is exported, AIBase analyzes the code:
- Extracts function signatures
- Parses parameters and return types
- Generates basic usage examples

### Hook System

Register callbacks for events using the hook registry:

```typescript
// Access hook registry from global argument
const myExtension = {
  myFunction: async (options) => { /* ... */ }
};

// Register hook (must be before return statement)
if (typeof extensionHookRegistry !== 'undefined') {
  extensionHookRegistry.registerHook(
    'afterFileUpload',
    'my-extension',
    async (context) => {
      const { fileName, filePath, fileType } = context;
      // Process file...
      return { description: 'Processed successfully' };
    }
  );
}

return myExtension;
```

#### Hook Types

| Hook Type | Context Interface | Description |
|-----------|-------------------|-------------|
| `afterFileUpload` | `FileUploadContext` | Called after file upload |

## UI Caching and Performance

### Cache Strategy

Extension UI is cached with ETag support:

```typescript
// First request
GET /api/extensions/show-chart/ui
→ 200 OK + ETag: "abc123..."

// Subsequent requests
GET /api/extensions/show-chart/ui
→ 304 Not Modified (if cached)

// Forced refresh
GET /api/extensions/show-chart/ui
→ Returns fresh content if source changed
```

### Cache Invalidation

Cache is invalidated when:
- Source file (`ui.tsx`) is modified (mtime-based)
- Manually cleared via `clearBackendComponentCache()`
- Server restart (in-memory cache cleared)

## Examples

### Database Tools

- **duckdb**: Query CSV, Excel, Parquet, JSON with SQL
- **postgresql**: PostgreSQL queries with connection pooling
- **clickhouse**: ClickHouse analytics database
- **trino**: Distributed SQL queries

All include inspection UI showing query results, execution time, and database-specific stats.

### Document Processing

- **pdf-document**: PDF text extraction
- **excel-document**: Excel file processing
- **word-document**: Word document text extraction
- **powerpoint-document**: PowerPoint presentation extraction
- **image-document**: Image analysis with vision models (needs UI)

### Visualization

- **show-chart**: Interactive charts (bar, line, pie, scatter) using ECharts
- **show-table**: Data table display
- **show-mermaid**: Mermaid diagram rendering
- **peek**: Quick data inspection with pagination

### Web Tools

- **web-search**: Web search functionality with Brave API
- **image-search**: Image search with thumbnails

## Development Workflow

### Creating a New Extension

1. **Create directory** in `backend/src/tools/extensions/defaults/my-extension/`

2. **Write metadata.json**:
```bash
backend/src/tools/extensions/defaults/my-extension/metadata.json
```

3. **Write index.ts**:
```typescript
const context = () => `### My Extension\n...`;

const myExtension = {
  myFunction: async (options) => {
    return { result: 'success' };
  }
};

return myExtension;
```

4. **Write ui.tsx** (optional):
```typescript
export default function MyExtensionInspector({ data, error }) {
  // Inspector UI
}

export function MyExtensionMessage({ toolInvocation }) {
  // Message UI
}
```

5. **Test in development mode**:
```bash
USE_DEFAULT_EXTENSIONS=true bun run backend/src/server/index.ts
```

### Testing Extension UI

1. Start backend with `USE_DEFAULT_EXTENSIONS=true`
2. Create a new conversation
3. Call extension function:
```typescript
const result = await myExtension.myFunction({ param: 'value' });
return result;
```
4. Click on result to open inspection dialog
5. Verify custom UI renders correctly

### Deployment

For production, extensions are copied to `data/{projectId}/extensions/`:

```bash
# Automatic on first project access
# Manual reset via API
POST /api/projects/{projectId}/extensions/reset
```

## API Endpoints

### Extension Management

#### List Extensions
```
GET /api/projects/{projectId}/extensions
```
Returns all extensions for a project.

#### Get Extension
```
GET /api/projects/{projectId}/extensions/{extensionId}
```
Returns a specific extension.

#### Create Extension
```
POST /api/projects/{projectId}/extensions
```
Body:
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "description": "Description",
  "code": "const ext = { ... }; return ext;",
  "category": "my-category",
  "enabled": true
}
```

#### Update Extension
```
PUT /api/projects/{projectId}/extensions/{extensionId}
```
Body: Same as create (all fields optional).

#### Delete Extension
```
DELETE /api/projects/{projectId}/extensions/{extensionId}
```

#### Toggle Extension
```
POST /api/projects/{projectId}/extensions/{extensionId}/toggle
```
Toggles the `enabled` state.

#### Reset to Defaults
```
POST /api/projects/{projectId}/extensions/reset
```
Deletes all project extensions and copies defaults.

### Extension UI

#### Get Extension UI
```
GET /api/extensions/{extensionId}/ui
GET /api/extensions/{extensionId}/ui?projectId={projectId}&tenantId={tenantId}
```
Returns bundled React component code.

**Response:**
- Content-Type: `application/javascript; charset=utf-8`
- ETag header for caching
- 304 Not Modified if cached

#### Get Extension Metadata
```
GET /api/extensions/{extensionId}/metadata?projectId={projectId}&tenantId={tenantId}
```
Returns extension metadata including declared dependencies.

**Response:**
```json
{
  "id": "custom-viz",
  "name": "Custom D3 Visualization",
  "description": "...",
  "version": "1.0.0",
  "dependencies": {
    "frontend": {
      "d3": "^7.9.0"
    }
  }
}
```

#### Bundle Dependencies
```
POST /api/extensions/dependencies/bundle
```
Bundle declared npm packages. Returns bundled JavaScript code.

**Request:**
```json
{
  "dependencies": {
    "d3": "^7.9.0",
    "plotly.js-dist-min": "^2.27.0"
  }
}
```

**Response:**
- Content-Type: `application/javascript; charset=utf-8`
- Cache-Control: `public, max-age=86400` (24 hours)
- Bundled code as text body

## Best Practices

### Extension Development

1. **Namespace design**: Use kebab-case IDs (`my-extension`) that become camelCase namespaces (`myExtension`)
2. **Error handling**: Always throw descriptive `Error` objects
3. **Type safety**: Define TypeScript interfaces for options/returns
4. **Context quality**: Provide rich `context()` for better LLM usage
5. **Hook cleanup**: Hooks automatically cleaned up on extension unload

### UI Development

1. **Use window.libs**: Always access React/ECharts/Mermaid from `window.libs`
2. **Dual exports**: Provide both Inspector (default) and Message (named) components
3. **Naming**: Follow `{ExtensionId}Inspector` / `{ExtensionId}Message` pattern
4. **Error states**: Handle `error` prop gracefully
5. **Loading states**: Show loading indicators for async operations
6. **Responsive**: Use Tailwind classes for responsive design
7. **Dark mode**: Support both light and dark themes

### Debugging & Logging

1. **Enable debug mode**: Set `"debug": true` in `metadata.json` during development
2. **Use console logging**: All `console.log/error/warn/debug` calls are automatically captured
   - Backend: Logged to `debugLogs` in metadata
   - Frontend UI: Also logged to `debugLogs` (when debug mode enabled)
3. **View logs**: Go to Extensions Settings → Click Debug badge → View Frontend/Backend tabs
4. **Log levels**: Use appropriate levels (error for failures, warn for issues, info for progress)
5. **Error context**: Include helpful data in console calls for easier troubleshooting
6. **AI debugging**: Logs are accessible to the AI for automatic error diagnosis and fixes

**Example debugging workflow:**
```typescript
// In ui.tsx
export default function MyExtensionMessage({ toolInvocation }) {
  useEffect(() => {
    console.log('Component mounted, props:', toolInvocation);

    try {
      const result = processData(toolInvocation.result.args);
      console.log('Processing successful:', result);
    } catch (error) {
      console.error('Processing failed:', {
        error: error.message,
        stack: error.stack,
        args: toolInvocation.result.args
      });
    }
  }, [toolInvocation]);

  return <div>...</div>;
}
```

### Performance

1. **Lazy loading**: Message UI should be lightweight
2. **Caching**: Leverage backend UI caching
3. **Pre-bundling**: Server pre-bundles UI on startup for faster first load
4. **External deps**: Never bundle React/viz libs - use window.libs

## Key Files Referenced

- **`extension-loader.ts`**: Loading, compiling, executing extensions
- **`extension-context.ts`**: AI context generation from metadata and code
- **`extension-hooks.ts`**: Hook system implementation
- **`extension-storage.ts`**: Storage layer (metadata, code persistence)
- **`extension-ui-handler.ts`**: UI bundling and serving with esbuild
- **`dependency-bundler.ts`**: Dynamic npm package bundler using Bun
- **`defaults/*/`**: Example extension implementations
- **`../../server/extensions-handler.ts`**: REST API endpoints
- **`../../server/extension-dependency-handler.ts`**: Dependency bundling API endpoints
- **`frontend/src/main.tsx`**: window.libs initialization
- **`frontend/src/lib/extension-dependency-loader.ts`**: Frontend dependency loading logic
- **`frontend/src/components/ui/chat/tools/extension-component-registry.tsx`**: Dynamic component loading
