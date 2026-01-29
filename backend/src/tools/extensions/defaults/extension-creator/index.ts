/**
 * Extension Creator
 * Create and modify extensions through natural language
 *
 * Always works with project extensions (data/projects/{tenantId}/{projectId}/extensions/)
 * Never touches default extensions (backend/src/tools/extensions/defaults/)
 */

// Export to make this file a module (fixes global augmentation TypeScript error)
export {};

// Type definitions
interface CreateOptions {
  description: string;
  functions?: FunctionDescription[] | Record<string, FunctionDescription>;
  code?: string;
  ui?: string | Record<string, string>;
  category?: string;
  author?: string;
  enabled?: boolean;
  name?: string;
  id?: string;
  extensionId?: string;
  version?: string;
  metadata?: Record<string, any>;
  dependencies?: DependencyConfig;
  frontendDependencies?: string[] | Record<string, string>;
}

interface FunctionDescription {
  description: string;
  name?: string;
  parameters?: string | {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface ModifyOptions {
  instruction: string;
}

interface ExtensionDraft {
  metadata?: any;
  code?: string;
  ui?: string;
  projectId?: string;
  tenantId?: string | number;
  extensionId?: string;
}

interface DependencyConfig {
  frontend?: Record<string, string>;
  backend?: Record<string, string>;
}

// Extend globalThis for context
declare global {
  var __extensionProjectId: string | undefined;
  var __extensionTenantId: string | number | undefined;
}

// File system imports (available in Bun)
// Imports removed to avoid top-level await in CJS output


/**
 * Context documentation for the extension-creator extension
 */
const context = () =>
  "" +
  "### Extension Creator\n" +
  "Create and modify extensions through natural language.\n" +
  "\n" +
  "**IMPORTANT:** Extension Creator always works with project extensions (data/projects/{tenantId}/{projectId}/extensions/). It never modifies default extensions.\n" +
  "\n" +
  "**Debugging and Output:**\n" +
  "- Use `progress(message)` to send status updates that you WILL see in the response\n" +
  "- Use `console.log()` for developer-side debugging (goes to server logs only, NOT visible to you)\n" +
  "- Return structured data from functions to show results to users\n" +
  "\n" +
  "**Available Functions:**\n" +
  "\n" +
  "#### createOrUpdate(options)\n" +
  "Create or update an extension.\n" +
  "`" +
  "`" +
  "typescript" +
  "await createOrUpdate({" +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  "  functions: [" +
  '    { description: "get current weather by city", parameters: "city (required), units (optional)" }' +
  "  ]" +
  "});" +
  "`" +
  "`" +
  "\n" +
  "**Parameters:**\n" +
  "- `description` (required): What the extension does\n" +
  "- `functions` (optional): Array of functions to create\n" +
  "- `ui` (optional): ui.tsx source for message/inspector UI\n" +
  "- `id` / `extensionId` (optional): Force extension ID (kebab-case)\n" +
  "- `dependencies` (optional): { frontend: { pkg: version }, backend: { pkg: version } }\n" +
  "- `frontendDependencies` (optional): Array or map of frontend packages (normalized into metadata.dependencies.frontend)\n" +
  "- `category` (optional): Category ID (inferred if not provided)\n" +
  '- `author` (optional): Author name (default: "AIBase")\n' +
  "- `enabled` (optional): Enable extension (default: true)\n" +
  "\n" +
  "#### modify(instruction)\n" +
  "Modify an existing extension.\n" +
  "`" +
  "`" +
  "typescript" +
  'await modify("rename getWeather to getCurrentWeather");' +
  "`" +
  "`" +
  "\n" +
  "**Parameters:**\n" +
  "- `instruction` (required): Natural language instruction\n" +
  "\n" +
  "#### show()\n" +
  "Show current extension state.\n" +
  "`" +
  "`" +
  "typescript" +
  "await show();" +
  "`" +
  "`" +
  "\n" +
  "#### validate()\n" +
  "Validate extension without writing.\n" +
  "`" +
  "`" +
  "typescript" +
  "const result = await validate();" +
  "if (!result.ok) {" +
  '  return "Errors:\\n" + result.errors.join("\\n");' +
  "}" +
  "`" +
  "`" +
  "\n" +
  "#### finalize()\n" +
  "Create the extension (write files).\n" +
  "`" +
  "`" +
  "typescript" +
  "const result = await finalize();" +
  'return "Created! " + result.message;' +
  "`" +
  "`" +
  "\n" +
  "**Examples:**\n" +
  "\n" +
  "1. **Create a new extension:**" +
  "`" +
  "`" +
  "typescript" +
  "await createOrUpdate({" +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  "  functions: [" +
  '    { description: "get weather by city", parameters: "city (required), units (optional metric/imperial)" }' +
  "  ]" +
  "});" +
  "await show();" +
  "await validate();" +
  "await finalize();" +
  "`" +
  "`" +
  "\n" +
  "2. **Modify existing extension:**" +
  "`" +
  "`" +
  "typescript" +
  'await modify("add forecast function");' +
  "await show();" +
  "`" +
  "`" +
  "\n" +
  "3. **Send progress updates (visible to AI):**" +
  "`" +
  "`" +
  "typescript" +
  'progress("Generating extension code...");' +
  "const result = await createOrUpdate({...});" +
  'progress("Validation: " + (result.ready ? "PASS" : "FAIL"));' +
  "return result;" +
  "`" +
  "`" +
  "\n" +
  "**Important Notes:**\n" +
  "- Extensions are created in data/projects/{tenantId}/{projectId}/extensions/ (project folder)\n" +
  "- Modifying a default extension automatically copies it to project first\n" +
  "- Default extensions are never modified directly\n" +
  "- Use the Extension Settings UI to manage default vs project versions\n" +
  "- progress() messages are visible to you during execution\n" +
  "- console.log() goes to server logs only (for developer debugging)\n" +
  "- **Do NOT use the file tool to create/modify extensions** (it writes to conversation files)\n" +
  "- Always use createOrUpdate()/finalize() to write extension files\n" +
  "\n" +
  "**UI Components (ui.tsx):**\n" +
  "- If the extension needs a custom UI (message UI and/or inspector UI), provide `ui` in createOrUpdate().\n" +
  "- Add UI metadata in `metadata`:\n" +
  "  - messageUI: { componentName: \"MyExtensionMessage\", visualizationType: \"my-extension\", uiFile: \"ui.tsx\" }\n" +
  "  - inspectionUI: { tabLabel: \"Details\", componentName: \"MyExtensionInspector\", uiFile: \"ui.tsx\", showByDefault: true }\n" +
  "- Message UI must export a named component `${PascalCaseId}Message` (e.g., show-chart -> ShowChartMessage).\n" +
  "- Inspector UI should be the default export (e.g., export default function MyExtensionInspector()).\n" +
  "- If you need npm packages for UI, declare them in metadata.dependencies.frontend and access them via window.libs.\n" +
  "  Example metadata.dependencies.frontend: { \"canvas-confetti\": \"^1.9.2\" }\n" +
  "  Example ui.tsx usage: const ReactECharts = window.libs.ReactECharts; const echarts = window.libs.echarts;\n";

/**
 * Session state for the current extension being created/modified
 */
let currentDraft: ExtensionDraft = {};

/**
 * Create or update extension draft
 */
const createOrUpdate = async (options: CreateOptions) => {
  if (!options.description) {
    throw new Error("Description is required");
  }

  // Get projectId and tenantId from global context (set by script-runtime)
  const projectId = (globalThis as any).projectId || "default";
  const tenantId = (globalThis as any).tenantId || "default";

  // Store in draft for later use
  currentDraft.projectId = projectId;
  currentDraft.tenantId = tenantId;

  // Initialize or update draft
  if (!currentDraft.extensionId) {
    // Generate ID from description or name
    const id = options.extensionId || options.id || generateIdFromDescription(options.name || options.description);
    currentDraft.extensionId = id;
  }

  // Update or create metadata
  if (!currentDraft.metadata) {
    currentDraft.metadata = {};
  }

  const normalizedDeps = normalizeDependencyConfig(
    options.dependencies,
    options.frontendDependencies,
    options.metadata?.dependencies
  );

  currentDraft.metadata = {
    ...currentDraft.metadata,
    ...options.metadata,
    id: currentDraft.extensionId,
    name: options.name || generateNameFromId(currentDraft.extensionId),
    description: options.description,
    category: options.category || inferCategory(options.description),
    author: options.author || "AIBase",
    version: options.version || "1.0.0",
    enabled: options.enabled !== undefined ? options.enabled : true,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(normalizedDeps ? { dependencies: normalizedDeps } : {}),
  };

  // Handle code parameter - use directly if provided
  if (options.code) {
    currentDraft.code = options.code;
  }
  // Generate code from functions if provided
  else if (options.functions) {
    // Convert object format to array if needed
    const functionsArray = normalizeFunctionsArray(options.functions);
    currentDraft.code = await generateCode({
      description: options.description,
      functions: functionsArray,
      metadata: currentDraft.metadata,
    });
  }

  if (options.ui) {
    currentDraft.ui = normalizeUIContent(options.ui);
  }
  if (!currentDraft.ui) {
    const shouldGenerate = shouldGenerateUI(options.description, currentDraft.metadata, normalizedDeps);
    if (shouldGenerate) {
      const uiResult = generateDefaultUI({
        description: options.description,
        metadata: currentDraft.metadata,
        dependencies: normalizedDeps,
      });
      currentDraft.ui = uiResult.ui;
      if (uiResult.messageUI && !currentDraft.metadata.messageUI) {
        currentDraft.metadata.messageUI = uiResult.messageUI;
      }
      if (uiResult.inspectionUI && !currentDraft.metadata.inspectionUI) {
        currentDraft.metadata.inspectionUI = uiResult.inspectionUI;
      }
    }
  }

  // Validate
  const validation = await validate();

  // Auto-finalize to write to disk
  const finalizeResult = await finalize();

  return {
    created: true,
    preview: generatePreview(),
    ready: validation.ok,
    issues: validation.errors,
    extensionId: finalizeResult.extensionId,
    files: finalizeResult.files,
    message: finalizeResult.message,
    path: `data/projects/${tenantId}/${projectId}/extensions/${currentDraft.extensionId}/`,
  };
};

/**
 * Modify existing extension
 */
const modify = async (instruction: string) => {
  // Get projectId and tenantId from global context (set by script-runtime)
  const projectId = (globalThis as any).projectId || "default";
  const tenantId = (globalThis as any).tenantId || "default";

  // Store in draft for later use
  currentDraft.projectId = projectId;
  currentDraft.tenantId = tenantId;

  if (!currentDraft.extensionId) {
    throw new Error(
      "No extension selected. Use createOrUpdate first, or specify which extension to modify.",
    );
  }

  // Check if extension exists
  const extension = await loadExtension(currentDraft.extensionId);
  if (!extension) {
    // Try to copy from default
    const defaultExt = await loadDefaultExtension(currentDraft.extensionId);
    if (!defaultExt) {
      throw new Error(
        `Extension "${currentDraft.extensionId}" not found. Create it first using createOrUpdate().`,
      );
    }

    // Copy to project
    await copyToProject(defaultExt);

    // Update draft
    currentDraft.metadata = { ...defaultExt.metadata, isDefault: false };
    currentDraft.code = defaultExt.code;

    return {
      copied: true,
      message: `Copied "${currentDraft.extensionId}" from default to project. Now modifying...`,
      continuing: true,
    };
  }

  // Apply modification based on instruction
  const change = parseChangeInstruction(instruction);
  await applyChange(change);

  // Validate after modification
  const validation = await validate();

  return {
    modified: true,
    preview: generatePreview(),
    ready: validation.ok,
    issues: validation.errors,
  };
};

/**
 * Show current state
 */
const show = () => {
  if (!currentDraft.extensionId) {
    return {
      summary: "No extension loaded",
      hint: "Use createOrUpdate() to create a new extension",
    };
  }

  return {
    summary: `Extension: ${currentDraft.metadata?.name || currentDraft.extensionId}`,
    id: currentDraft.extensionId,
    description: currentDraft.metadata?.description || "",
    category: currentDraft.metadata?.category || "",
    status: currentDraft.code ? "Code generated" : "No code yet",
    hasUI: !!currentDraft.ui,
    preview: generatePreview(),
  };
};

/**
 * Validate extension
 */
const validate = async () => {
  const errors: string[] = [];

  if (!currentDraft.metadata) {
    errors.push("No metadata");
    return { ok: false, errors };
  }

  // Check metadata
  if (!currentDraft.metadata.id) {
    errors.push("Extension ID is required");
  }
  if (!currentDraft.metadata.name) {
    errors.push("Name is required");
  }
  if (
    !currentDraft.metadata.description ||
    currentDraft.metadata.description.length < 10
  ) {
    errors.push("Description must be at least 10 characters");
  }
  if (!currentDraft.metadata.category) {
    errors.push("Category is required");
  }

  if (
    (currentDraft.metadata.messageUI || currentDraft.metadata.inspectionUI) &&
    !currentDraft.ui
  ) {
    errors.push("UI metadata provided but ui.tsx is missing");
  }

  // Check code syntax
  if (currentDraft.code) {
    const syntaxCheck = await checkSyntax(currentDraft.code);
    if (!syntaxCheck.ok) {
      errors.push(`Syntax error: ${syntaxCheck.error}`);
    }

    // Check for return statement
    if (!currentDraft.code.includes("return")) {
      errors.push("Missing return statement - extension must return an object");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

/**
 * Test load extension (dry run)
 */
const testLoad = async () => {
  if (!currentDraft.code) {
    return {
      ok: false,
      error: "No code to test",
    };
  }

  try {
    // Use the Bun transpiler to check syntax
    const transpiler = new (await import("bun")).Transpiler({ loader: "ts" });
    transpiler.transformSync(currentDraft.code);

    // In a real implementation, we would also try to load the extension
    // For now, syntax check is enough
    return {
      ok: true,
      exports: ["syntax_valid"],
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || "Syntax error",
    };
  }
};

/**
 * Finalize and write files
 */
const finalize = async () => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const validation = await validate();
  if (!validation.ok) {
    return {
      created: false,
      error: "Cannot create extension with validation errors",
      issues: validation.errors,
    };
  }

  const testResult = await testLoad();
  if (!testResult.ok) {
    return {
      created: false,
      error: "Extension failed validation",
      details: testResult.error,
    };
  }

  // Write files
  const tenantId = currentDraft.tenantId ?? "default";
  const projectId = currentDraft.projectId ?? "default";
  const extensionId = currentDraft.extensionId ?? "unknown-extension";

  // Correct path: data/projects/{tenantId}/{projectId}/extensions/{extensionId}
  const targetPath = path.join(
    process.cwd(),
    "data",
    "projects",
    String(tenantId),
    projectId,
    "extensions",
    extensionId,
  );

  await fs.mkdir(targetPath, { recursive: true });

  // Write metadata.json
  await fs.writeFile(
    path.join(targetPath, "metadata.json"),
    JSON.stringify(currentDraft.metadata, null, 2),
  );

  // Write index.ts
  if (currentDraft.code) {
    await fs.writeFile(path.join(targetPath, "index.ts"), currentDraft.code);
  }

  // Write ui.tsx if present
  if (currentDraft.ui) {
    await fs.writeFile(path.join(targetPath, "ui.tsx"), currentDraft.ui);
  }

  // Clear draft
  const finalExtensionId = currentDraft.extensionId;
  const createdFiles = [
    "metadata.json",
    ...(currentDraft.code ? ["index.ts"] : []),
    ...(currentDraft.ui ? ["ui.tsx"] : []),
  ];
  currentDraft = {};

  return {
    created: true,
    extensionId: finalExtensionId,
    files: createdFiles,
    message: `Extension "${finalExtensionId}" created successfully!`,
    nextSteps: [
      "Extension is now active for this project",
      "No restart required (loaded automatically on next script execution)",
    ],
  };
};

// ==================== Helper Functions ====================

/**
 * Normalize functions to array format
 * Handles both array format [{name, description, parameters}]
 * and object format {getWeather: {name, description, parameters}}
 */
function normalizeFunctionsArray(functions: FunctionDescription[] | Record<string, FunctionDescription>): FunctionDescription[] {
  if (Array.isArray(functions)) {
    return functions;
  }

  // Convert object to array
  return Object.entries(functions).map(([key, fn]) => ({
    ...fn,
    name: fn.name || key,
  }));
}

/**
 * Normalize dependency config from multiple input shapes
 */
function normalizeDependencyConfig(
  deps?: DependencyConfig,
  frontendDeps?: string[] | Record<string, string>,
  metadataDeps?: DependencyConfig
): DependencyConfig | undefined {
  const merged: DependencyConfig = {
    frontend: {},
    backend: {},
  };

  const normalizedMetadata = normalizeDependencyShape(metadataDeps);

  const normalizedFrontend = normalizeFrontendDependencies(frontendDeps);

  const sources = [normalizedMetadata, deps];
  for (const source of sources) {
    if (!source) continue;
    if (source.frontend) {
      Object.assign(merged.frontend, normalizeFrontendDependencies(source.frontend) || source.frontend);
    }
    if (source.backend) {
      Object.assign(merged.backend, source.backend);
    }
  }

  if (normalizedFrontend) {
    Object.assign(merged.frontend, normalizedFrontend);
  }

  const hasFrontend = merged.frontend && Object.keys(merged.frontend).length > 0;
  const hasBackend = merged.backend && Object.keys(merged.backend).length > 0;

  if (!hasFrontend && !hasBackend) {
    return undefined;
  }

  return merged;
}

function normalizeDependencyShape(
  deps?: DependencyConfig
): DependencyConfig | undefined {
  if (!deps) return undefined;

  const normalized: DependencyConfig = {};

  if (deps.frontend) {
    normalized.frontend = normalizeFrontendDependencies(deps.frontend) || deps.frontend;
  }
  if (deps.backend) {
    normalized.backend = deps.backend;
  }

  return normalized;
}

function normalizeFrontendDependencies(
  frontendDeps?: string[] | Record<string, string>
): Record<string, string> | undefined {
  if (!frontendDeps) return undefined;

  if (Array.isArray(frontendDeps)) {
    const result: Record<string, string> = {};
    for (const name of frontendDeps) {
      if (typeof name === "string" && name.trim()) {
        result[name.trim()] = "latest";
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return Object.keys(frontendDeps).length > 0 ? frontendDeps : undefined;
}

function normalizeUIContent(
  ui: string | Record<string, string>
): string {
  if (typeof ui === "string") {
    return ui;
  }

  if (ui["ui.tsx"]) {
    return ui["ui.tsx"];
  }

  const firstKey = Object.keys(ui)[0];
  if (firstKey && ui[firstKey]) {
    return ui[firstKey];
  }

  return "";
}

function shouldGenerateUI(
  description: string,
  metadata: any,
  dependencies?: DependencyConfig
): boolean {
  if (metadata?.messageUI || metadata?.inspectionUI) return true;
  if (metadata?.uiConfig || metadata?.extensionType === "ui") return true;

  const desc = description.toLowerCase();
  const uiHints = [
    "ui",
    "chat",
    "message",
    "visual",
    "widget",
    "component",
    "interface",
    "confetti",
    "chart",
    "table",
    "diagram",
    "mermaid",
    "graph",
  ];
  if (uiHints.some((hint) => desc.includes(hint))) {
    return true;
  }

  const frontendDeps = Object.keys(dependencies?.frontend || {});
  return frontendDeps.length > 0;
}

function generateDefaultUI(input: {
  description: string;
  metadata: any;
  dependencies?: DependencyConfig;
}): {
  ui: string;
  messageUI?: Record<string, any>;
  inspectionUI?: Record<string, any>;
} {
  const id = String(input.metadata?.id || "extension");
  const pascalId = toPascalCase(id);
  const messageComponent = `${pascalId}Message`;
  const inspectorComponent = `${pascalId}Inspector`;

  const frontendDeps = Object.keys(input.dependencies?.frontend || {});
  const isConfetti = frontendDeps.includes("canvas-confetti") || input.description.toLowerCase().includes("confetti");

  if (isConfetti) {
    return {
      ui: buildConfettiUI(messageComponent, inspectorComponent),
      messageUI: {
        componentName: messageComponent,
        visualizationType: id,
        uiFile: "ui.tsx",
      },
      inspectionUI: {
        tabLabel: "Confetti",
        componentName: inspectorComponent,
        uiFile: "ui.tsx",
        showByDefault: true,
      },
    };
  }

  return {
    ui: buildGenericUI(messageComponent, inspectorComponent, id),
    messageUI: {
      componentName: messageComponent,
      visualizationType: id,
      uiFile: "ui.tsx",
    },
    inspectionUI: {
      tabLabel: "Details",
      componentName: inspectorComponent,
      uiFile: "ui.tsx",
      showByDefault: true,
    },
  };
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildConfettiUI(messageComponent: string, inspectorComponent: string): string {
  return `import React, { useState } from "react";
import confetti from "canvas-confetti";

interface MessageProps {
  toolInvocation?: { result?: { args?: any } };
}

interface InspectorProps {
  data?: any;
  error?: string;
}

export function ${messageComponent}({ toolInvocation }: MessageProps) {
  const defaults = {
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 },
  };

  const trigger = () => {
    confetti(defaults);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-sm font-semibold">Confetti</div>
      <div className="text-xs text-muted-foreground">
        Click to celebrate in chat.
      </div>
      <button
        onClick={trigger}
        className="w-fit rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        Celebrate
      </button>
    </div>
  );
}

export default function ${inspectorComponent}({ data, error }: InspectorProps) {
  const [particleCount, setParticleCount] = useState(150);
  const [spread, setSpread] = useState(70);
  const [originY, setOriginY] = useState(0.6);

  const preview = () => {
    confetti({
      particleCount,
      spread,
      origin: { y: originY },
    });
  };

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm font-semibold">Confetti Settings</div>
      <div className="space-y-2 text-xs">
        <label className="flex flex-col gap-1">
          Particle Count: {particleCount}
          <input
            type="range"
            min={10}
            max={500}
            value={particleCount}
            onChange={(e) => setParticleCount(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          Spread: {spread}
          <input
            type="range"
            min={10}
            max={180}
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          Origin Y: {originY.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={originY}
            onChange={(e) => setOriginY(Number(e.target.value))}
          />
        </label>
      </div>
      <button
        onClick={preview}
        className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        Preview
      </button>
    </div>
  );
}
`;
}

function buildGenericUI(messageComponent: string, inspectorComponent: string, extensionId: string): string {
  return `import React from "react";

interface MessageProps {
  toolInvocation?: { result?: { args?: any } };
}

interface InspectorProps {
  data?: any;
  error?: string;
}

export function ${messageComponent}({ toolInvocation }: MessageProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-sm font-semibold">${extensionId}</div>
      <div className="text-xs text-muted-foreground">
        Message UI for ${extensionId}.
      </div>
    </div>
  );
}

export default function ${inspectorComponent}({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="p-4 text-sm">
      <div className="font-semibold mb-2">Inspector</div>
      <pre className="text-xs whitespace-pre-wrap">
{JSON.stringify(data ?? {}, null, 2)}
      </pre>
    </div>
  );
}
`;
}

/**
 * Generate kebab-case ID from description
 */
function generateIdFromDescription(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 5); // First 5 words
  return words.join("-");
}

/**
 * Generate PascalCase name from kebab-case ID
 */
function generateNameFromId(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Infer category from description
 */
function inferCategory(description: string): string {
  const desc = description.toLowerCase();

  const keywords: Record<string, string[]> = {
    "database-tools": [
      "database",
      "sql",
      "query",
      "postgresql",
      "mysql",
      "clickhouse",
      "trino",
      "duckdb",
    ],
    "web-tools": ["api", "web", "http", "fetch", "search", "scrape"],
    "visualization-tools": [
      "chart",
      "graph",
      "plot",
      "visualize",
      "diagram",
      "mermaid",
    ],
    "document-tools": ["pdf", "document", "file", "parse", "extract", "read"],
  };

  for (const [category, words] of Object.entries(keywords)) {
    if (words.some((w) => desc.includes(w))) {
      return category;
    }
  }

  return "web-tools"; // default
}

/**
 * Generate code from description and functions
 */
async function generateCode(input: {
  description: string;
  functions: FunctionDescription[];
  metadata: any;
}): Promise<string> {
  const intent = analyzeIntent(input.description);

  // Generate functions
  const functionCode = await Promise.all(
    input.functions.map((fn) => generateFunction(fn, intent)),
  );

  // Assemble extension object
  const code = `
/**
 * ${input.metadata.name}
 * ${input.metadata.description}
 */

const ${camelize(input.metadata.id)} = {
${functionCode.join(",\n")}
};

return ${camelize(input.metadata.id)};
`;

  return code.trim();
}

/**
 * Generate a single function
 */
async function generateFunction(
  fn: FunctionDescription,
  intent: any,
): Promise<string> {
  const params = parseParameters(fn.parameters || "");
  const impl = generateImplementation(fn, intent);

  return `
  /**
   * ${fn.description}
   */
  ${fn.name || "func"}: async (${params}) => {
    ${impl}
  }`;
}

/**
 * Generate function implementation based on intent
 */
function generateImplementation(fn: FunctionDescription, intent: any): string {
  if (intent.type === "api") {
    return `
    // TODO: Implement API call for "${fn.description}"
    // API: ${intent.api}
    const apiKey = process.env.${intent.api.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY;

    if (!apiKey) {
      throw new Error("${intent.api} API key not configured. Add it to .env file.");
    }

    // Make API request
    const response = await fetch("${intent.baseUrl || "https://api.example.com"}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${apiKey}\`
      },
      body: JSON.stringify({ /* parameters */ })
    });

    if (!response.ok) {
      throw new Error("API request failed: " + response.statusText);
    }

    return await response.json();
  `;
  }

  return `
    // TODO: Implement: ${fn.description}
    throw new Error("Not implemented yet");
  `;
}

/**
 * Parse parameters from string or OpenAI object format
 */
function parseParameters(params: string | any): string {
  if (!params) return "";

  // If already a string, parse old format
  if (typeof params === "string") {
    // Parse: "param1 (required), param2 (optional)" -> "param1, param2"
    return params
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p)
      .join(", ");
  }

  // Handle OpenAI format: {type: "object", properties: {...}, required: [...]}
  if (params.properties && typeof params.properties === "object") {
    return Object.keys(params.properties).join(", ");
  }

  return "";
}

/**
 * Analyze intent from description
 */
function analyzeIntent(description: string): any {
  const desc = description.toLowerCase();

  // API detection
  if (desc.includes("api") || desc.includes("fetch")) {
    const apiMatch = desc.match(/(\w+)\s*api/);
    if (apiMatch) {
      return {
        type: "api",
        api: apiMatch[1],
        baseUrl: `https://api.${apiMatch[1]}.com`,
      };
    }
  }

  return { type: "generic" };
}

/**
 * Parse change instruction
 */
function parseChangeInstruction(instruction: string) {
  const lower = instruction.toLowerCase();

  // Rename function
  const renameMatch = lower.match(/rename\s+(\w+)\s+to\s+(\w+)/);
  if (renameMatch) {
    return {
      type: "renameFunction",
      oldName: renameMatch[1],
      newName: renameMatch[2],
    };
  }

  // Add function
  const addMatch = lower.match(/add\s+(\w+)\s+function/);
  if (addMatch) {
    return {
      type: "addFunction",
      functionName: addMatch[1],
      description: instruction,
    };
  }

  return { type: "unknown", instruction };
}

/**
 * Apply change to draft
 */
async function applyChange(change: any) {
  switch (change.type) {
    case "renameFunction":
      if (currentDraft.code) {
        // Use split/join instead of replaceAll for broader compatibility
        currentDraft.code = currentDraft.code.split(
          change.oldName,
        ).join(change.newName);
      }
      break;

    case "addFunction":
      // Would generate and add new function
      throw new Error(
        "Adding functions not yet implemented. Use createOrUpdate with all functions.",
      );
  }
}

/**
 * Check TypeScript syntax
 */
async function checkSyntax(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transpiler = new (await import("bun")).Transpiler({ loader: "ts" });
    transpiler.transformSync(code);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

/**
 * Generate human-readable preview
 */
function generatePreview(): string {
  const parts: string[] = [];

  if (currentDraft.metadata) {
    parts.push(`ID: ${currentDraft.metadata.id}`);
    parts.push(`Name: ${currentDraft.metadata.name}`);
    parts.push(`Category: ${currentDraft.metadata.category}`);
  }

  if (currentDraft.code) {
    const functions = extractFunctions(currentDraft.code);
    parts.push(`Functions: ${functions.join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Extract function names from code
 */
function extractFunctions(code: string): string[] {
  const matches = code.match(/(\w+)\s*:\s*async\s*\(/g);
  return matches || [];
}

/**
 * Convert kebab-case to camelCase
 */
function camelize(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Load extension from project or default
 */
async function loadExtension(extensionId: string): Promise<any> {
  const fs = await import('fs/promises');
  const path = await import('path');
  // Try project first - correct path: data/projects/{tenantId}/{projectId}/extensions/{extensionId}
  const projectPath = path.join(
    process.cwd(),
    "data",
    "projects",
    String(currentDraft.tenantId || "default"),
    currentDraft.projectId!,
    "extensions",
    extensionId,
    "metadata.json",
  );

  try {
    const metadataContent = await fs.readFile(projectPath, "utf-8");
    const metadata = JSON.parse(metadataContent);

    const codePath = path.join(
      process.cwd(),
      "data",
      "projects",
      String(currentDraft.tenantId || "default"),
      currentDraft.projectId!,
      "extensions",
      extensionId,
      "index.ts",
    );

    const code = await fs.readFile(codePath, "utf-8");

    return { metadata, code };
  } catch {
    return null;
  }
}

/**
 * Load default extension
 */
async function loadDefaultExtension(extensionId: string): Promise<any> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const defaultsPath = path.join(
    process.cwd(),
    "backend/src/tools/extensions/defaults",
    extensionId,
    "metadata.json",
  );

  try {
    const metadataContent = await fs.readFile(defaultsPath, "utf-8");
    const metadata = JSON.parse(metadataContent);

    const codePath = path.join(
      process.cwd(),
      "backend/src/tools/extensions/defaults",
      extensionId,
      "index.ts",
    );

    const code = await fs.readFile(codePath, "utf-8");

    return { metadata, code };
  } catch {
    return null;
  }
}

/**
 * Copy default extension to project
 */
async function copyToProject(extension: {
  metadata: any;
  code: string;
}): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  // Correct path: data/projects/{tenantId}/{projectId}/extensions/{extensionId}
  const targetPath = path.join(
    process.cwd(),
    "data",
    "projects",
    String(currentDraft.tenantId || "default"),
    currentDraft.projectId || "default",
    "extensions",
    extension.metadata.id,
  );

  await fs.mkdir(targetPath, { recursive: true });

  await fs.writeFile(
    path.join(targetPath, "metadata.json"),
    JSON.stringify(
      {
        ...extension.metadata,
        isDefault: false,
        copiedFrom: extension.metadata.id,
        customizedAt: Date.now(),
      },
      null,
      2,
    ),
  );

  await fs.writeFile(path.join(targetPath, "index.ts"), extension.code);
}

/**
 * Get context about current project (for internal use)
 */
const getContext = () => ({
  projectId: (globalThis as any).projectId || globalThis.__extensionProjectId,
  tenantId: (globalThis as any).tenantId || globalThis.__extensionTenantId,
});

/**
 * Set context (for internal use during initialization)
 */
const setContext = (context: {
  projectId: string;
  tenantId: string | number;
}) => {
  globalThis.__extensionProjectId = context.projectId;
  globalThis.__extensionTenantId = context.tenantId;
  currentDraft.projectId = context.projectId;
  currentDraft.tenantId = context.tenantId;
};

// Export the extension
const extensionCreatorExtension = {
  createOrUpdate,
  modify,
  show,
  validate,
  finalize,
  setContext,
};

// Export for CommonJS environment (esbuild friendly)
module.exports = extensionCreatorExtension;
