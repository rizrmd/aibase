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
  description?: string;
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

interface ModifyOptions extends CreateOptions {}

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
  '' +
  '### Extension Creator\n' +
  'Create and modify extensions through natural language.\n' +
  '\n' +
  '**IMPORTANT:** Extension Creator always works with project extensions (data/projects/{tenantId}/{projectId}/extensions/). It never modifies default extensions.\n' +
  '\n' +
  '**⚠️ EXTENSION NAMING CONVENTION:**\n' +
  '- Extension IDs MUST be a SINGLE WORD (no hyphens/spaces)\n' +
  '- Good: \`weather\`, \`webSearch\`, \`dataParser\`, \`apiClient\`\n' +
  '- Bad: \`web-search\`, \`data-parser\`, \`my-extension\`\n' +
  '- Namespace is auto-generated: \`weather\` → called as \`weather.function()\`\n' +
  '- Multi-word descriptions become camelCase: \"web search\" → \`webSearch\`\n' +
  '\n' +
  '**Debugging and Output:**\n' +
  '- Use `progress(message)` to send status updates that you WILL see in the response\n' +
  '- Use `console.log()` for developer-side debugging (goes to server logs only, NOT visible to you)\n' +
  '- Return structured data from functions to show results to users\n' +
  '- On failure, results include `stage`, `issues`, and `nextAction` to guide fixes\n' +
  '\n' +
  '**Available Functions:**\n' +
  '\n' +
  '#### create(options)\n' +
  'Create an extension (immediately active).\n' +
  '`' +
  '`' +
  'typescript' +
  'await extensionCreator.create({' +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  '  functions: [' +
  '    { description: "get current weather by city", parameters: "city (required), units (optional)" }' +
  '  ]' +
  '});' +
  '`' +
  '`' +
  '\n' +
  '**Parameters:**\n' +
  '- `description` (required): What the extension does (used to generate one-word ID)\n' +
  '- `functions` (optional): Array of functions to create\n' +
  '- `ui` (optional): ui.tsx source for message/inspector UI\n' +
  '- `id` / `extensionId` (optional): Force extension ID (kebab-case)\n' +
  '- **Recommended:** Always pass `extensionId` to keep a stable ID across retries\n' +
  '- If you retry, **reuse the same `extensionId`** (do not invent a new one)\n' +
  '- `dependencies` (optional): { frontend: { pkg: version }, backend: { pkg: version } }\n' +
  '- `frontendDependencies` (optional): Array or map of frontend packages (normalized into metadata.dependencies.frontend)\n' +
  '- `category` (optional): Category ID (inferred if not provided)\n' +
  '- `author` (optional): Author name (default: "AIBase")\n' +
  '- `enabled` (optional): Enable extension (default: true)\n' +
  '\n' +
  '#### modify(options)\n' +
  'Modify an existing extension (same options as create).\n' +
  '`' +
  '`' +
  'typescript' +
  'await extensionCreator.modify({ extensionId: "my-extension", description: "update weather extension", code: "..." });' +
  '`' +
  '`' +
  '\n' +
  '**Parameters:**\n' +
  '- `extensionId` (required): Target extension ID\n' +
  '\n' +
  '**Examples:**\n' +
  '\n' +
  '1. **Create a weather extension:**' +
  '`' +
  '`' +
  'typescript' +
  'const result = await extensionCreator.create({' +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  '  functions: [' +
  '    { description: "get weather by city", parameters: "city (required), units (optional metric/imperial)" }' +
  '  ]' +
  '});' +
  'if (!result.success) return result;' +
  '`' +
  '`' +
  '\n' +
  '2. **Create a web search extension (multi-word):**' +
  '`' +
  '`' +
  'typescript' +
  'await extensionCreator.create({' +
  '  description: "webSearch for finding current information",' +
  '  functions: [' +
  '    { description: "search the web", parameters: "query (required)" }' +
  '  ]' +
  '});' +
  '// Creates \`webSearch\` extension (camelCase from description)' +
  '`' +
  '`' +
  '\n' +
  '3. **Modify existing extension:**' +
  '`' +
  '`' +
  'typescript' +
  'await extensionCreator.modify({ extensionId: "weather-extension", description: "update weather extension", functions: [ { description: "get current weather by city", parameters: "city (required)" } ] });' +
  '`' +
  '`' +
  '\n' +
  '4. **Send progress updates (visible to AI):**' +
  '`' +
  '`' +
  'typescript' +
  'progress("Generating extension code...");' +
  'const result = await extensionCreator.create({...});' +
  'progress("Result: " + (result.success ? "SUCCESS" : "FAILED"));' +
  'return result;' +
  '`' +
  '`' +
  '\n' +
  '**Important Notes:**\n' +
  '- Extension IDs are auto-generated from description as ONE WORD\n' +
  '- Multi-word descriptions become camelCase: "data parser" → \`dataParser\`\n' +
  '- If an extension already exists, **use modify() instead of create()**\n' +
  '- To avoid accidental new IDs, **always pass the same `extensionId`** on create/modify\n' +
  '- If the user request is the same or similar, **do not create a new ID**; modify the existing extension\n' +
  '- Call functions via \`extensionCreator.create(...)\` and \`extensionCreator.modify(...)\`\n' +
  '- Extensions are created in data/projects/{tenantId}/{projectId}/extensions/ (project folder)\n' +
  '- Modifying a default extension automatically copies it to project first\n' +
  '- Default extensions are never modified directly\n' +
  '- Use the Extension Settings UI to manage default vs project versions\n' +
  '- progress() messages are visible to you during execution\n' +
  '- console.log() goes to server logs only (for developer debugging)\n' +
  '- create()/modify() apply changes immediately (no staging)\n' +
  '- Validation runs after writing; if it fails, the extension may be invalid until fixed\n' +
  '- **Do NOT use the file tool to create/modify extensions** (it writes to conversation files)\n' +
  '\n' +
  '**Validation & Error Handling:**\n' +
  '- create()/modify() return structured errors with `issues`, `stage`, and `nextAction` when something fails\n' +
  '- Use those details to fix inputs and retry (no separate validate/finalize steps)\n' +
  '\n' +
  '**UI Components (ui.tsx):**\n' +
  '- If the extension needs a custom UI (message UI and/or inspector UI), provide `ui` in create().\n' +
  '- Avoid backticks inside the ui string; use regular quotes in <style> or strings.\n' +
  '- UI code should NOT use import/JSX; use `window.libs.React.createElement` and `window.libs["package-name"]` instead.\n' +
  '- Add UI metadata in `metadata`:\n' +
  '  - messageUI: { componentName: "MyExtensionMessage", visualizationType: "my-extension", uiFile: "ui.tsx" }\n' +
  '  - inspectionUI: { tabLabel: "Details", componentName: "MyExtensionInspector", uiFile: "ui.tsx", showByDefault: true }\n' +
  '- Message UI must export a named component `${PascalCaseId}Message` (e.g., show-chart -> ShowChartMessage).\n' +
  '- Inspector UI should be the default export (e.g., export default function MyExtensionInspector()).\n' +
  '- If you need npm packages for UI, declare them in metadata.dependencies.frontend and access them via window.libs.\n' +
  '  Example metadata.dependencies.frontend: { "some-ui-lib": "^1.0.0" }\n' +
  '  Example ui.tsx usage: const ReactECharts = window.libs.ReactECharts; const echarts = window.libs.echarts;\n';

const LOCK_TTL_MS = 60_000;

function getRuntimeContext(): { projectId: string; tenantId: string | number } {
  return {
    projectId: (globalThis as any).projectId || globalThis.__extensionProjectId || "default",
    tenantId: (globalThis as any).tenantId || globalThis.__extensionTenantId || "default",
  };
}

async function getExtensionsBasePath(tenantId: string | number, projectId: string): Promise<string> {
  const path = await import("path");
  return path.join(
    process.cwd(),
    "data",
    "projects",
    String(tenantId),
    projectId,
    "extensions",
  );
}

async function acquireExtensionLock(projectId: string, tenantId: string | number, extensionId: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const lockDir = path.join(basePath, ".lock");
  const lockPath = path.join(lockDir, `${extensionId}.lock`);

  await fs.mkdir(lockDir, { recursive: true });

  const payload = JSON.stringify(
    { extensionId, acquiredAt: Date.now(), pid: process.pid },
    null,
    2,
  );

  try {
    await fs.writeFile(lockPath, payload, { flag: "wx" });
    return;
  } catch (error: any) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }

  try {
    const existing = await fs.readFile(lockPath, "utf-8");
    const data = JSON.parse(existing);
    if (data?.acquiredAt && Date.now() - data.acquiredAt > LOCK_TTL_MS) {
      await fs.unlink(lockPath).catch(() => {});
      await fs.writeFile(lockPath, payload, { flag: "wx" });
      return;
    }
  } catch {
    // ignore parse/read errors; fall through to locked error
  }

  throw new Error(`Extension "${extensionId}" is locked by another operation`);
}

async function releaseExtensionLock(projectId: string, tenantId: string | number, extensionId: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const lockPath = path.join(basePath, ".lock", `${extensionId}.lock`);
  await fs.unlink(lockPath).catch(() => {});
}

async function writeExtensionFiles(input: {
  metadata: any;
  code?: string;
  ui?: string;
  projectId: string;
  tenantId: string | number;
  extensionId: string;
}): Promise<{ path: string; files: string[] }> {
  const fs = await import("fs/promises");
  const path = await import("path");
  if (!input.extensionId || !input.projectId || input.tenantId === undefined) {
    throw new Error("Write context is incomplete");
  }
  const basePath = await getExtensionsBasePath(input.tenantId, input.projectId);
  const targetPath = path.join(basePath, input.extensionId);

  await fs.mkdir(basePath, { recursive: true });

  try {
    await fs.mkdir(targetPath, { recursive: true });

    await fs.writeFile(
      path.join(targetPath, "metadata.json"),
      JSON.stringify(input.metadata, null, 2),
    );

    if (input.code) {
      await fs.writeFile(path.join(targetPath, "index.ts"), input.code);
    }

    if (input.ui) {
      await fs.writeFile(path.join(targetPath, "ui.tsx"), input.ui);
    }
  } catch (error) {
    throw error;
  }

  const files = [
    "metadata.json",
    ...(input.code ? ["index.ts"] : []),
    ...(input.ui ? ["ui.tsx"] : []),
  ];

  return { path: targetPath, files };
}

async function validateExtension(input: { metadata: any; code?: string; ui?: string }): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!input.metadata) {
    errors.push("No metadata");
    return { ok: false, errors };
  }

  if (!input.metadata.id) {
    errors.push("Extension ID is required");
  }
  if (!input.metadata.name) {
    errors.push("Name is required");
  }
  if (!input.metadata.description || input.metadata.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }
  if (!input.metadata.category) {
    errors.push("Category is required");
  }

  if ((input.metadata.messageUI || input.metadata.inspectionUI) && !input.ui) {
    errors.push("UI metadata provided but ui.tsx is missing");
  }

  if (input.code) {
    const syntaxCheck = await checkSyntax(input.code);
    if (!syntaxCheck.ok) {
      errors.push(`Syntax error: ${syntaxCheck.error}`);
    }

    if (!input.code.includes("return")) {
      errors.push("Missing return statement - extension must return an object");
    }
  }

  return { ok: errors.length === 0, errors };
}

function generatePreview(metadata: any, code?: string): string {
  const parts: string[] = [];

  if (metadata) {
    parts.push(`ID: ${metadata.id}`);
    parts.push(`Name: ${metadata.name}`);
    parts.push(`Category: ${metadata.category}`);
  }

  if (code) {
    const functions = extractFunctions(code);
    parts.push(`Functions: ${functions.join(", ")}`);
  }

  return parts.join("\n");
}

async function invalidateExtensionUICache(extensionId: string, projectId: string, tenantId: string | number): Promise<void> {
  try {
    const { clearExtensionCache } = await import("../../../../server/extension-ui-handler");
    await clearExtensionCache(extensionId, projectId, tenantId);
  } catch {
    // Non-fatal if cache clear fails
  }
}

/**
 * Error helpers
 */
function normalizeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || "Unknown error",
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  try {
    const serialized = JSON.stringify(error);
    return { message: serialized ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

function buildFailureResult(input: {
  action: "create" | "modify";
  stage: string;
  error: unknown;
  extensionId?: string;
  projectId?: string;
  tenantId?: string | number;
  metadata?: any;
  code?: string;
  issues?: string[];
  message?: string;
  nextAction?: string;
  warning?: string;
}) {
  const normalized = normalizeError(input.error);
  const preview = input.metadata ? generatePreview(input.metadata, input.code) : undefined;
  const path = input.extensionId && input.projectId && input.tenantId !== undefined
    ? `data/projects/${input.tenantId}/${input.projectId}/extensions/${input.extensionId}/`
    : undefined;

  const result = {
    success: false,
    ready: false,
    action: input.action,
    stage: input.stage,
    error: normalized.message,
    errorType: normalized.name,
    issues: input.issues,
    extensionId: input.extensionId,
    preview,
    path,
    message: input.message ?? `Operation failed during "${input.stage}".`,
    nextAction: input.nextAction ?? (input.issues?.length
      ? "Fix the issues above and retry the same call."
      : "Review the error details and retry with corrected inputs."),
    warning: input.warning,
    debug: {
      projectId: input.projectId,
      tenantId: input.tenantId,
      errorStack: normalized.stack,
    },
  };

  console.error(`[ExtensionCreator] ${input.action} failed`, {
    stage: input.stage,
    extensionId: input.extensionId,
    error: normalized,
    issues: input.issues,
    preview,
  });

  return result;
}

function buildValidationFailure(input: {
  action: "create" | "modify";
  issues: string[];
  extensionId?: string;
  projectId?: string;
  tenantId?: string | number;
  metadata: any;
  code?: string;
  postWrite?: boolean;
}) {
  const preview = generatePreview(input.metadata, input.code);
  const message = input.postWrite
    ? "Validation failed after writing files. Extension may be invalid."
    : "Validation failed. No files were written.";
  const result = {
    success: false,
    ready: false,
    action: input.action,
    stage: "validate",
    issues: input.issues,
    extensionId: input.extensionId,
    preview,
    path: input.extensionId && input.projectId && input.tenantId !== undefined
      ? `data/projects/${input.tenantId}/${input.projectId}/extensions/${input.extensionId}/`
      : undefined,
    message,
    nextAction: input.postWrite
      ? "Fix the validation issues and call modify() to overwrite with a valid version."
      : "Fix the validation issues and retry the same call.",
    warning: input.postWrite ? "Files were written before validation." : undefined,
  };

  console.warn(`[ExtensionCreator] ${input.action} validation failed`, {
    extensionId: input.extensionId,
    issues: input.issues,
    preview,
    postWrite: input.postWrite,
  });

  return result;
}

/**
 * Create extension (immediately active)
 */
const create = async (options: CreateOptions) => {
  const { projectId, tenantId } = getRuntimeContext();

  let extensionId = options.extensionId || options.id;
  let metadata: any | undefined;
  let code: string | undefined;
  let ui: string | undefined;
  const warnings: string[] = [];
  let lockAcquired = false;
  let stage = "prepare";

  try {
    const baseMetadata: Record<string, any> = {};
    const baseDescription =
      options.description ||
      options.metadata?.description ||
      options.name ||
      "";

    if (!extensionId) {
      if (!baseDescription) {
        throw new Error("Description is required");
      }
      extensionId = generateIdFromDescription(options.name || baseDescription);
    }

    const description = options.description || options.metadata?.description;
    if (!description) {
      throw new Error("Description is required");
    }

    stage = "checkExists";
    const existingProject = await loadExtension(projectId, tenantId, extensionId);
    if (existingProject) {
      return buildFailureResult({
        action: "create",
        stage,
        error: new Error(`Extension "${extensionId}" already exists in the project.`),
        extensionId,
        projectId,
        tenantId,
        issues: [`Extension "${extensionId}" already exists. Use modify() to update it.`],
      });
    }

    const existingDefault = await loadDefaultExtension(extensionId);
    if (existingDefault) {
      return buildFailureResult({
        action: "create",
        stage,
        error: new Error(`Extension "${extensionId}" already exists as a default extension.`),
        extensionId,
        projectId,
        tenantId,
        issues: [`Extension "${extensionId}" exists in defaults. Use modify() to override it in the project.`],
      });
    }

    stage = "normalize";
    const normalizedDeps = normalizeDependencyConfig(
      options.dependencies,
      options.frontendDependencies,
      options.metadata?.dependencies,
    );

    metadata = {
      ...baseMetadata,
      ...options.metadata,
      id: extensionId,
      name: options.name || baseMetadata.name || generateNameFromId(extensionId),
      description,
      category: options.category || baseMetadata.category || inferCategory(description),
      author: options.author || baseMetadata.author || "AIBase",
      version: options.version || baseMetadata.version || "1.0.0",
      enabled: options.enabled !== undefined ? options.enabled : (baseMetadata.enabled ?? true),
      isDefault: false,
      createdAt: baseMetadata.createdAt || Date.now(),
      updatedAt: Date.now(),
      ...(normalizedDeps ? { dependencies: normalizedDeps } : {}),
    };

    const shouldAutoGenerateUI = shouldGenerateUI(description, metadata, normalizedDeps);
    let uiProvided = false;
    let uiInvalid = false;

    if (options.ui) {
      const normalizedUI = normalizeUIContent(options.ui);
      const uiCheck = analyzeUIContent(normalizedUI);
      if (!uiCheck.valid) {
        uiInvalid = true;
        warnings.push(...uiCheck.reasons.map((reason) => `UI ignored: ${reason}`));
      } else {
        const runtime = normalizeUIRuntime(normalizedUI, {
          extensionId,
          messageComponentName: metadata?.messageUI?.componentName,
          inspectorComponentName: metadata?.inspectionUI?.componentName,
        });
        ui = runtime.ui;
        warnings.push(...runtime.warnings);
        uiProvided = true;
      }
    }

    if (uiInvalid) {
      if (metadata?.messageUI) delete metadata.messageUI;
      if (metadata?.inspectionUI) delete metadata.inspectionUI;
    }

    const wantsUI =
      uiProvided ||
      shouldAutoGenerateUI ||
      Boolean(metadata?.messageUI || metadata?.inspectionUI);

    if (options.code) {
      code = options.code;
    } else if (options.functions) {
      stage = "generateCode";
      const functionsArray = normalizeFunctionsArray(options.functions);
      code = await generateCode({
        description,
        functions: functionsArray,
        metadata,
        returnArgs: wantsUI,
        visualizationType: metadata?.messageUI?.visualizationType || metadata?.id,
      });
    }
    if (!code) {
      code = generateEmptyCode(metadata);
    }

    if (!ui && wantsUI) {
      const uiResult = generateDefaultUI({
        description,
        metadata,
        dependencies: normalizedDeps,
      });
      ui = uiResult.ui;
      if (uiResult.messageUI && !metadata.messageUI) {
        metadata.messageUI = uiResult.messageUI;
      }
      if (uiResult.inspectionUI && !metadata.inspectionUI) {
        metadata.inspectionUI = uiResult.inspectionUI;
      }
    }

    stage = "lock";
    await acquireExtensionLock(projectId, tenantId, extensionId);
    lockAcquired = true;

    stage = "checkExists";
    const existingAfterLock = await loadExtension(projectId, tenantId, extensionId);
    if (existingAfterLock) {
      return buildFailureResult({
        action: "create",
        stage,
        error: new Error(`Extension "${extensionId}" already exists in the project.`),
        extensionId,
        projectId,
        tenantId,
        issues: [`Extension "${extensionId}" already exists. Use modify() to update it.`],
      });
    }

    stage = "write";
    const writeResult = await writeExtensionFiles({
      metadata,
      code,
      ui,
      projectId,
      tenantId,
      extensionId,
    });

    stage = "validate_disk";
    const disk = await loadExtension(projectId, tenantId, extensionId);
    if (!disk) {
      return buildFailureResult({
        action: "create",
        stage,
        error: new Error("Failed to reload extension after write."),
        extensionId,
        projectId,
        tenantId,
        metadata,
        code,
        issues: [
          "Extension files may have been written but could not be reloaded.",
          "Do NOT create a new extension ID; use modify() with the SAME extensionId to fix.",
        ],
        message: "Reload after write failed; files may already exist on disk.",
        nextAction: "Call modify() with the same extensionId to fix the written files (do not create a new ID).",
        warning: "Write succeeded but reload failed.",
      });
    }

    const validation = await validateExtension({
      metadata: disk.metadata,
      code: disk.code,
      ui: disk.ui,
    });
    if (!validation.ok) {
      return buildValidationFailure({
        action: "create",
        issues: validation.errors,
        extensionId,
        projectId,
        tenantId,
        metadata: disk.metadata,
        code: disk.code,
        postWrite: true,
      });
    }

    stage = "cache";
    if (ui) {
      await invalidateExtensionUICache(extensionId, projectId, tenantId);
    }

    return {
      success: true,
      ready: true,
      issues: [],
      extensionId,
      files: writeResult.files,
      preview: generatePreview(metadata, code),
      message: `Extension "${extensionId}" written successfully.`,
      path: `data/projects/${tenantId}/${projectId}/extensions/${extensionId}/`,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (error) {
    return buildFailureResult({
      action: "create",
      stage,
      error,
      extensionId,
      projectId,
      tenantId,
      metadata,
      code,
    });
  } finally {
    if (lockAcquired && extensionId) {
      await releaseExtensionLock(projectId, tenantId, extensionId);
    }
  }
};

/**
 * Modify existing extension
 */
const modify = async (input: ModifyOptions | string) => {
  if (typeof input === "string") {
    return buildFailureResult({
      action: "modify",
      stage: "input",
      error: new Error("modify() now expects an options object (same shape as create)."),
    });
  }

  const opts = input;
  const extensionId = opts.extensionId || opts.id || opts.metadata?.id;

  if (!extensionId) {
    return buildFailureResult({
      action: "modify",
      stage: "input",
      error: new Error("extensionId is required to modify an extension"),
    });
  }

  if (opts.metadata?.id && opts.metadata.id !== extensionId) {
    return buildFailureResult({
      action: "modify",
      stage: "input",
      error: new Error("metadata.id must match extensionId"),
      extensionId,
      issues: ["metadata.id must match extensionId"],
    });
  }

  const { projectId, tenantId } = getRuntimeContext();
  let metadata: any | undefined;
  let code: string | undefined;
  let ui: string | undefined;
  const warnings: string[] = [];
  let lockAcquired = false;
  let stage = "lock";
  let base: any;
  let copiedFromDefault = false;

  try {
    await acquireExtensionLock(projectId, tenantId, extensionId);
    lockAcquired = true;

    stage = "loadBase";
    base = await loadExtension(projectId, tenantId, extensionId);

    if (!base) {
      stage = "loadDefault";
      const defaultExt = await loadDefaultExtension(extensionId);
      if (!defaultExt) {
        throw new Error(
          `Extension "${extensionId}" not found. Create it first using create().`,
        );
      }

      base = defaultExt;
      copiedFromDefault = true;
    }

    const baseMetadata: Record<string, any> = base.metadata || {};
    const description =
      opts.description ||
      opts.metadata?.description ||
      baseMetadata.description;

    if (!description) {
      throw new Error("Description is required");
    }

    stage = "normalize";
    const normalizedDeps = normalizeDependencyConfig(
      opts.dependencies,
      opts.frontendDependencies,
      opts.metadata?.dependencies ?? baseMetadata.dependencies,
    );

    metadata = {
      ...baseMetadata,
      ...opts.metadata,
      id: extensionId,
      name: opts.name || baseMetadata.name || generateNameFromId(extensionId),
      description,
      category: opts.category || baseMetadata.category || inferCategory(description),
      author: opts.author || baseMetadata.author || "AIBase",
      version: opts.version || baseMetadata.version || "1.0.0",
      enabled: opts.enabled !== undefined ? opts.enabled : (baseMetadata.enabled ?? true),
      isDefault: false,
      createdAt: baseMetadata.createdAt || Date.now(),
      updatedAt: Date.now(),
      ...(normalizedDeps ? { dependencies: normalizedDeps } : {}),
    };

    const shouldAutoGenerateUI = shouldGenerateUI(description, metadata, normalizedDeps);
    let uiProvided = false;
    let uiInvalid = false;

    code = base.code;
    if (opts.code) {
      code = opts.code;
    } else if (opts.functions) {
      stage = "generateCode";
      const functionsArray = normalizeFunctionsArray(opts.functions);
      const wantsUIForCode =
        shouldAutoGenerateUI || Boolean(metadata?.messageUI || metadata?.inspectionUI || opts.ui);
      code = await generateCode({
        description,
        functions: functionsArray,
        metadata,
        returnArgs: wantsUIForCode,
        visualizationType: metadata?.messageUI?.visualizationType || metadata?.id,
      });
    }
    if (!code) {
      code = generateEmptyCode(metadata);
    }

    ui = base.ui;
    if (opts.ui) {
      const normalizedUI = normalizeUIContent(opts.ui);
      const uiCheck = analyzeUIContent(normalizedUI);
      if (!uiCheck.valid) {
        uiInvalid = true;
        warnings.push(...uiCheck.reasons.map((reason) => `UI ignored: ${reason}`));
      } else {
        const runtime = normalizeUIRuntime(normalizedUI, {
          extensionId,
          messageComponentName: metadata?.messageUI?.componentName,
          inspectorComponentName: metadata?.inspectionUI?.componentName,
        });
        ui = runtime.ui;
        warnings.push(...runtime.warnings);
        uiProvided = true;
      }
    }

    if (uiInvalid && !ui) {
      if (metadata?.messageUI) delete metadata.messageUI;
      if (metadata?.inspectionUI) delete metadata.inspectionUI;
    }

    const wantsUI =
      uiProvided ||
      shouldAutoGenerateUI ||
      Boolean(metadata?.messageUI || metadata?.inspectionUI);

    if (!ui && wantsUI) {
      const uiResult = generateDefaultUI({
        description,
        metadata,
        dependencies: normalizedDeps,
      });
      ui = uiResult.ui;
      if (uiResult.messageUI && !metadata.messageUI) {
        metadata.messageUI = uiResult.messageUI;
      }
      if (uiResult.inspectionUI && !metadata.inspectionUI) {
        metadata.inspectionUI = uiResult.inspectionUI;
      }
    }

    stage = "write";
    const writeResult = await writeExtensionFiles({
      metadata: copiedFromDefault ? { ...metadata, isDefault: false } : metadata,
      code,
      ui,
      projectId,
      tenantId,
      extensionId,
    });

    stage = "validate_disk";
    const disk = await loadExtension(projectId, tenantId, extensionId);
    if (!disk) {
      return buildFailureResult({
        action: "modify",
        stage,
        error: new Error("Failed to reload extension after write."),
        extensionId,
        projectId,
        tenantId,
        metadata,
        code,
        issues: [
          "Extension files may have been written but could not be reloaded.",
          "Do NOT create a new extension ID; retry modify() with the SAME extensionId.",
        ],
        message: "Reload after write failed; files may already exist on disk.",
        nextAction: "Retry modify() with the same extensionId to fix the written files.",
        warning: "Write succeeded but reload failed.",
      });
    }

    const validation = await validateExtension({
      metadata: disk.metadata,
      code: disk.code,
      ui: disk.ui,
    });
    if (!validation.ok) {
      return buildValidationFailure({
        action: "modify",
        issues: validation.errors,
        extensionId,
        projectId,
        tenantId,
        metadata: disk.metadata,
        code: disk.code,
        postWrite: true,
      });
    }

    stage = "cache";
    if (ui || base.ui) {
      await invalidateExtensionUICache(extensionId, projectId, tenantId);
    }

    return {
      success: true,
      modified: true,
      ready: true,
      issues: [],
      extensionId,
      files: writeResult.files,
      preview: generatePreview(metadata, code),
      message: `Extension "${extensionId}" updated successfully.`,
      path: `data/projects/${tenantId}/${projectId}/extensions/${extensionId}/`,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (error) {
    return buildFailureResult({
      action: "modify",
      stage,
      error,
      extensionId,
      projectId,
      tenantId,
      metadata,
      code,
    });
  } finally {
    if (lockAcquired) {
      await releaseExtensionLock(projectId, tenantId, extensionId);
    }
  }
};

// ==================== Helper Functions ====================

/**
 * Normalize functions to array format
 * Handles both array format [{name, description, parameters}]
 * and object format {getWeather: {name, description, parameters}}
 */
function normalizeFunctionsArray(functions: FunctionDescription[] | Record<string, FunctionDescription>): FunctionDescription[] {
  const list = Array.isArray(functions)
    ? functions
    : Object.entries(functions).map(([key, fn]) => ({
        ...fn,
        name: fn.name || key,
      }));

  const used = new Set<string>();
  return list.map((fn) => ({
    ...fn,
    name: ensureFunctionName(fn, used),
  }));
}

/**
 * Generate one-word ID from description
 * Extension IDs must be a single word (no hyphens) for namespace consistency
 */
function generateIdFromDescription(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, 3); // First 3 words

  // For multi-word descriptions, use camelCase: "web search" → "webSearch"
  if (words.length > 1) {
    return words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }

  // Single word
  return words[0] || "extension";
}

/**
 * Generate PascalCase name from ID
 */
function generateNameFromId(id: string): string {
  return id
    .split(/(?=[A-Z])/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ensureFunctionName(fn: FunctionDescription, used: Set<string>): string {
  const fromName = normalizeIdentifier(fn.name || "");
  const fromDesc = normalizeIdentifier(deriveNameFromDescription(fn.description));
  const base = fromName || fromDesc || "func";
  const unique = makeUniqueIdentifier(base, used);
  used.add(unique);
  return unique;
}

function deriveNameFromDescription(description: string): string {
  if (!description) return "";
  const words = description
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return toCamelCase(words.join(" "));
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isValidIdentifier(trimmed)) return trimmed;
  const camel = toCamelCase(trimmed);
  if (!camel) return "";
  return isValidIdentifier(camel) ? camel : coerceIdentifier(camel);
}

function makeUniqueIdentifier(base: string, used: Set<string>): string {
  let name = coerceIdentifier(base);
  let counter = 2;
  while (used.has(name)) {
    name = `${base}${counter}`;
    name = coerceIdentifier(name);
    counter += 1;
  }
  return name;
}

function coerceIdentifier(value: string): string {
  let name = value.replace(/[^a-zA-Z0-9_$]/g, "");
  if (!name) return "func";
  if (!/^[A-Za-z_$]/.test(name)) {
    name = `fn${name}`;
  }
  return name;
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function toCamelCase(value: string): string {
  const parts = value
    .replace(/['"`]/g, "")
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean);
  const [first, ...rest] = parts;
  if (!first) return "";
  return (
    first.toLowerCase() +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")
  );
}

/**
 * Normalize dependency config from multiple input shapes
 */
function normalizeDependencyConfig(
  deps?: DependencyConfig,
  frontendDeps?: string[] | Record<string, string>,
  metadataDeps?: DependencyConfig
): DependencyConfig | undefined {
  const merged: Required<DependencyConfig> = {
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

  const hasFrontend = Object.keys(merged.frontend).length > 0;
  const hasBackend = Object.keys(merged.backend).length > 0;

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

function normalizeUIContent(ui: string | Record<string, string>): string {
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

function generateDefaultUI(input: {
  description?: string;
  metadata?: Record<string, any>;
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

function buildGenericUI(
  messageComponent: string,
  inspectorComponent: string,
  extensionId: string,
): string {
  return `const React = window.libs.React;

export function ${messageComponent}({ toolInvocation }) {
  return React.createElement(
    "div",
    { className: "flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm" },
    React.createElement("div", { className: "text-sm font-semibold" }, "${extensionId}"),
    React.createElement(
      "div",
      { className: "text-xs text-muted-foreground" },
      "Message UI for ${extensionId}."
    )
  );
}

export default function ${inspectorComponent}({ data, error }) {
  if (error) {
    return React.createElement(
      "div",
      { className: "p-4 text-sm text-red-600 dark:text-red-400" },
      error
    );
  }

  return React.createElement(
    "div",
    { className: "p-4 text-sm" },
    React.createElement("div", { className: "font-semibold mb-2" }, "Inspector"),
    React.createElement(
      "pre",
      { className: "text-xs whitespace-pre-wrap" },
      JSON.stringify(data ?? {}, null, 2)
    )
  );
}
`;
}

function shouldGenerateUI(
  description?: string,
  metadata?: Record<string, any>,
  dependencies?: DependencyConfig,
): boolean {
  if (metadata?.messageUI || metadata?.inspectionUI || metadata?.uiConfig) return true;
  if (metadata?.extensionType === "ui") return true;
  if (dependencies?.frontend && Object.keys(dependencies.frontend).length > 0) return true;

  if (!description) return false;
  const desc = description.toLowerCase();
  const uiHints = [
    "ui",
    "interface",
    "dashboard",
    "panel",
    "visual",
    "visualize",
    "chart",
    "graph",
    "table",
    "diagram",
    "renderer",
    "viewer",
    "preview",
    "inspector",
  ];

  return uiHints.some((hint) => desc.includes(hint));
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
  returnArgs?: boolean;
  visualizationType?: string;
}): Promise<string> {
  const intent = analyzeIntent(input.description);

  // Generate functions
  const functionCode = await Promise.all(
    input.functions.map((fn) =>
      generateFunction(fn, intent, input.returnArgs, input.visualizationType),
    ),
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
  returnArgs?: boolean,
  visualizationType?: string,
): Promise<string> {
  const params = parseParameters(fn.parameters || "");
  const paramNames = parseParameterNames(fn.parameters || "");
  const impl = generateImplementationWithParams(
    fn,
    intent,
    paramNames,
    returnArgs,
    visualizationType,
  );

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
  return generateImplementationWithParams(fn, intent, [], false);
}

function generateImplementationWithParams(
  fn: FunctionDescription,
  intent: any,
  paramNames: string[],
  returnArgs?: boolean,
  visualizationType?: string,
): string {
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

  if (returnArgs) {
    const argsObject = paramNames.length > 0 ? `{ ${paramNames.join(", ")} }` : "{}";
    const vizType = visualizationType || "";
    const vizBlock = vizType
      ? `
    const toolCallId = \`viz_${vizType}_\${Date.now()}_\${Math.random().toString(36).slice(2, 9)}\`;
    return {
      args: ${argsObject},
      __visualization: {
        type: "${vizType}",
        toolCallId,
        args: ${argsObject}
      }
    };
  `
      : `
    return { args: ${argsObject} };
  `;
    return vizBlock;
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
    // Normalize common patterns like "origin: {x, y}" -> "origin"
    const normalized = params.replace(/[:=]\s*\{[^}]*\}/g, "");

    // Parse: "param1 (required), param2 optional" -> "param1, param2"
    return normalized
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p)
      .map((p) => {
        // Remove parenthetical hints and trailing optional/required tokens
        let cleaned = p
          .replace(/\([^)]*\)/g, " ")
          .replace(/\b(optional|required)\b/gi, " ")
          .trim();

        // Remove stop-words or fillers
        cleaned = cleaned.replace(/\b(and|or|etc|etc\.|with|without)\b/gi, " ").trim();

        // Drop trailing fragments like "-" or ":" and strip extra tokens
        cleaned = cleaned.replace(/[-:]+$/g, "").trim();

        const match = cleaned.match(/^([A-Za-z_$][\w$]*)/);
        return match ? match[1] : "";
      })
      .filter((p) => p)
      .join(", ");
  }

  // Handle OpenAI format: {type: "object", properties: {...}, required: [...]}
  if (params.properties && typeof params.properties === "object") {
    return Object.keys(params.properties)
      .map((key) => {
        const match = key.match(/^([A-Za-z_$][\w$]*)/);
        return match ? match[1] : "";
      })
      .filter((p) => p)
      .join(", ");
  }

  return "";
}

function parseParameterNames(params: string | any): string[] {
  if (!params) return [];
  if (typeof params === "string") {
    const normalized = params.replace(/[:=]\s*\{[^}]*\}/g, "");
    return normalized
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p)
      .map((p) =>
        p
          .replace(/\([^)]*\)/g, " ")
          .replace(/\b(optional|required)\b/gi, " ")
          .replace(/\b(and|or|etc|etc\.|with|without)\b/gi, " ")
          .replace(/[-:]+$/g, "")
          .trim(),
      )
      .map((p) => {
        const match = p.match(/^([A-Za-z_$][\w$]*)/);
        return match ? match[1] : undefined;
      })
      .filter((p): p is string => Boolean(p));
  }

  if (params.properties && typeof params.properties === "object") {
    return Object.keys(params.properties)
      .map((key) => {
        const match = key.match(/^([A-Za-z_$][\w$]*)/);
        return match ? match[1] : undefined;
      })
      .filter((p): p is string => Boolean(p));
  }

  return [];
}

function analyzeUIContent(ui: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (/(^|\n)\s*import\s+/m.test(ui)) {
    reasons.push("UI contains import statements (not supported at runtime).");
  }
  if (/<\s*[A-Za-z]/.test(ui) && !/React\.createElement/.test(ui)) {
    reasons.push("UI appears to use JSX (use React.createElement with window.libs.React).");
  }
  return { valid: reasons.length === 0, reasons };
}

function normalizeUIRuntime(
  ui: string,
  options?: {
    extensionId?: string;
    messageComponentName?: string;
    inspectorComponentName?: string;
  },
): { ui: string; warnings: string[] } {
  let updated = ui.trim();
  const warnings: string[] = [];

  const hasReactBinding = /const\s+React\s*=\s*window\.libs\.React\s*;/.test(updated);
  const usesReact = /\bReact\./.test(updated);
  if (usesReact && !hasReactBinding) {
    updated = `const React = window.libs.React;\n\n${updated}`;
    warnings.push("UI normalized: injected window.libs.React binding.");
  }

  const usesDataProps = /function\s+\w+\s*\(\s*\{\s*data\s*\}\s*\)/.test(updated)
    || /export\s+default\s+function\s+\w+\s*\(\s*\{\s*data\s*\}\s*\)/.test(updated);
  const usesToolInvocation = /\btoolInvocation\b/.test(updated);
  if (usesDataProps && !usesToolInvocation) {
    updated = `const __extractData = (toolInvocation) => toolInvocation?.result?.args ?? toolInvocation?.result ?? {};\n\n${updated}`;
    updated = updated.replace(/\(\s*\{\s*data\s*\}\s*\)/g, "({ toolInvocation })");
    updated = updated.replace(/\bconst\s+\{\s*([^\}]*?)\s*\}\s*=\s*data\s*;/g, "const { $1 } = __extractData(toolInvocation);");
    updated = updated.replace(/\bdata\b/g, "__extractData(toolInvocation)");
    warnings.push("UI normalized: mapped data props to toolInvocation.result.args.");
  }

  const exportResult = ensureUIExports(updated, options);
  updated = exportResult.ui;
  warnings.push(...exportResult.warnings);

  return { ui: updated, warnings };
}

function ensureUIExports(
  ui: string,
  options?: {
    extensionId?: string;
    messageComponentName?: string;
    inspectorComponentName?: string;
  },
): { ui: string; warnings: string[] } {
  let updated = ui.trim();
  const warnings: string[] = [];

  const extensionId = options?.extensionId?.trim();
  const derivedMessageName = extensionId ? `${toPascalCase(extensionId)}Message` : undefined;
  const messageName = options?.messageComponentName?.trim() || derivedMessageName;

  if (messageName) {
    const hasExport =
      new RegExp(`export\\s+(?:default\\s+)?(?:function|const|class)\\s+${messageName}\\b`).test(updated) ||
      new RegExp(`export\\s*\\{[^}]*\\b${messageName}\\b[^}]*\\}`).test(updated);
    const hasDeclaration =
      new RegExp(`function\\s+${messageName}\\b`).test(updated) ||
      new RegExp(`(?:const|let|var)\\s+${messageName}\\b`).test(updated) ||
      new RegExp(`class\\s+${messageName}\\b`).test(updated);
    const hasWindowBinding =
      new RegExp(`window\\.libs\\.${messageName}\\b`).test(updated) ||
      new RegExp(`window\\.libs\\[\\s*['"]${messageName}['"]\\s*\\]`).test(updated);

    if (!hasExport) {
      if (hasDeclaration) {
        updated += `\n\nexport { ${messageName} };`;
        warnings.push(`UI normalized: exported ${messageName} for message UI.`);
      } else if (hasWindowBinding) {
        updated += `\n\nconst ${messageName} = window.libs["${messageName}"];\nexport { ${messageName} };`;
        warnings.push(`UI normalized: exported ${messageName} from window.libs.`);
      }
    }
  }

  if (derivedMessageName && messageName && derivedMessageName !== messageName) {
    const hasDerivedExport =
      new RegExp(`export\\s+(?:default\\s+)?(?:function|const|class)\\s+${derivedMessageName}\\b`).test(updated) ||
      new RegExp(`export\\s*\\{[^}]*\\b${derivedMessageName}\\b[^}]*\\}`).test(updated);

    if (!hasDerivedExport) {
      const canAlias =
        new RegExp(`function\\s+${messageName}\\b`).test(updated) ||
        new RegExp(`(?:const|let|var)\\s+${messageName}\\b`).test(updated) ||
        new RegExp(`export\\s*\\{[^}]*\\b${messageName}\\b[^}]*\\}`).test(updated);

      if (canAlias) {
        updated += `\n\nexport { ${messageName} as ${derivedMessageName} };`;
        warnings.push(`UI normalized: aliased ${messageName} as ${derivedMessageName} for message UI.`);
      }
    }
  }

  return { ui: updated, warnings };
}

function generateEmptyCode(metadata: any): string {
  const name = metadata?.name || metadata?.id || "Extension";
  const description = metadata?.description || "";
  return `
/**
 * ${name}
 * ${description}
 */

const extension = {};

return extension;
`.trim();
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
 * Extract function names from code
 */
function extractFunctions(code: string): string[] {
  const matches = code.matchAll(/(\w+)\s*:\s*async\s*\(/g);
  return Array.from(matches)
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
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
async function loadExtension(
  projectId: string,
  tenantId: string | number,
  extensionId: string,
): Promise<any> {
  const fs = await import('fs/promises');
  const path = await import('path');
  // Try project first - correct path: data/projects/{tenantId}/{projectId}/extensions/{extensionId}
  const projectPath = path.join(
    process.cwd(),
    "data",
    "projects",
    String(tenantId),
    projectId,
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
      String(tenantId),
      projectId,
      "extensions",
      extensionId,
      "index.ts",
    );

    const code = await fs.readFile(codePath, "utf-8");

    let ui: string | undefined;
    try {
      const uiPath = path.join(
        process.cwd(),
        "data",
        "projects",
        String(tenantId),
        projectId,
        "extensions",
        extensionId,
        "ui.tsx",
      );
      ui = await fs.readFile(uiPath, "utf-8");
    } catch {
      // UI is optional
    }

    return { metadata, code, ui };
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

    let ui: string | undefined;
    try {
      const uiPath = path.join(
        process.cwd(),
        "backend/src/tools/extensions/defaults",
        extensionId,
        "ui.tsx",
      );
      ui = await fs.readFile(uiPath, "utf-8");
    } catch {
      // UI is optional
    }

    return { metadata, code, ui };
  } catch {
    return null;
  }
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
};

// Export the extension
const extensionCreatorExtension = {
  create,
  modify,
  setContext,
};

export default extensionCreatorExtension;

// Export for CommonJS environment (esbuild friendly)
if (typeof module !== "undefined" && module.exports) {
  module.exports = extensionCreatorExtension;
}
