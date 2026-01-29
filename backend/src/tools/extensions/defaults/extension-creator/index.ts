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
  mode?: "replace" | "merge";
  finalize?: boolean;
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
  finalize?: boolean;
  extensionId?: string;
  id?: string;
}

interface CreateOrUpdateControl {
  finalize?: boolean;
  mode?: "replace" | "merge";
}

interface ExtensionSnapshot {
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
  "**⚠️ EXTENSION NAMING CONVENTION:**\n" +
  "- Extension IDs MUST be a SINGLE WORD (no hyphens/spaces)\n" +
  "- Good: \`weather\`, \`webSearch\`, \`dataParser\`, \`apiClient\`\n" +
  "- Bad: \`web-search\`, \`data-parser\`, \`my-extension\`\n" +
  "- Namespace is auto-generated: \`weather\` → called as \`weather.function()\`\n" +
  "- Multi-word descriptions become camelCase: \"web search\" → \`webSearch\`\n" +
  "\n" +
  "**Debugging and Output:**\n" +
  "- Use `progress(message)` to send status updates that you WILL see in the response\n" +
  "- Use `console.log()` for developer-side debugging (goes to server logs only, NOT visible to you)\n" +
  "- Return structured data from functions to show results to users\n" +
  "\n" +
  "**Available Functions:**\n" +
  "\n" +
  "#### createOrUpdate(options, control?)\n" +
  "Create or update an extension (staging by default).\n" +
  "`" +
  "`" +
  "typescript" +
  "await createOrUpdate({" +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  "  functions: [" +
  '    { description: "get current weather by city", parameters: "city (required), units (optional)" }' +
  "  ]" +
  "}, { finalize: false, mode: \"replace\" });" +
  "`" +
  "`" +
  "\n" +
  "**Parameters:**\n" +
  "- `description` (required): What the extension does (used to generate one-word ID)\n" +
  "- `functions` (optional): Array of functions to create\n" +
  "- `ui` (optional): ui.tsx source for message/inspector UI\n" +
  "- `id` / `extensionId` (optional): Force extension ID (kebab-case)\n" +
  "- `dependencies` (optional): { frontend: { pkg: version }, backend: { pkg: version } }\n" +
  "- `frontendDependencies` (optional): Array or map of frontend packages (normalized into metadata.dependencies.frontend)\n" +
  "- `category` (optional): Category ID (inferred if not provided)\n" +
  '- `author` (optional): Author name (default: "AIBase")\n' +
  "- `enabled` (optional): Enable extension (default: true)\n" +
  "- `mode` (optional): \"replace\" | \"merge\" (default: \"replace\")\n" +
  "- `finalize` (optional): Write files immediately (default: false)\n" +
  "\n" +
  "**Control (2nd argument):**\n" +
  "- `mode` (optional): \"replace\" | \"merge\" (default: \"replace\")\n" +
  "- `finalize` (optional): Write files immediately (default: false)\n" +
  "\n" +
  "#### modify(input)\n" +
  "Modify an existing extension.\n" +
  "`" +
  "`" +
  "typescript" +
  'await modify({ extensionId: "my-extension", instruction: "rename getWeather to getCurrentWeather" });' +
  "\n" +
  "await modify({ extensionId: \"my-extension\", instruction: \"rename getWeather to getCurrentWeather\", finalize: true });" +
  "`" +
  "`" +
  "\n" +
  "**Parameters:**\n" +
  "- `instruction` (required): Natural language instruction\n" +
  "- `extensionId` (required): Target extension ID\n" +
  "- `finalize` (optional): Write files immediately (default: true)\n" +
  "\n" +
  "#### show(extensionId)\n" +
  "Show current staging state for an extension.\n" +
  "`" +
  "`" +
  "typescript" +
  "await show({ extensionId: \"my-extension\" });" +
  "`" +
  "`" +
  "\n" +
  "#### validate(extensionId)\n" +
  "Validate staging without writing.\n" +
  "`" +
  "`" +
  "typescript" +
  "const result = await validate({ extensionId: \"my-extension\" });" +
  "if (!result.ok) {" +
  '  return "Errors:\\n" + result.errors.join("\\n");' +
  "}" +
  "`" +
  "`" +
  "\n" +
  "#### finalize(extensionId)\n" +
  "Create the extension (swap staging to active).\n" +
  "`" +
  "`" +
  "typescript" +
  "const result = await finalize({ extensionId: \"my-extension\" });" +
  'return "Created! " + result.message;' +
  "`" +
  "`" +
  "\n" +
  "**Examples:**\n" +
  "\n" +
  "1. **Create a weather extension:**" +
  "`" +
  "`" +
  "typescript" +
  "const result = await createOrUpdate({" +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  "  functions: [" +
  '    { description: "get weather by city", parameters: "city (required), units (optional metric/imperial)" }' +
  "  ]" +
  "}, { finalize: false });" +
  "await validate({ extensionId: result.extensionId });" +
  "await finalize({ extensionId: result.extensionId });" +
  "`" +
  "`" +
  "\n" +
  "2. **Create a web search extension (multi-word):**" +
  "`" +
  "`" +
  "typescript" +
  "await createOrUpdate({" +
  '  description: "webSearch for finding current information",' +
  "  functions: [" +
  '    { description: "search the web", parameters: "query (required)" }' +
  "  ]" +
  "});" +
  "// Creates 'webSearch' extension (camelCase from description)" +
  "`" +
  "`" +
  "\n" +
  "3. **Modify existing extension:**" +
  "`" +
  "`" +
  "typescript" +
  'await modify({ extensionId: "weather-extension", instruction: "rename getWeather to getCurrentWeather", finalize: true });' +
  "`" +
  "`" +
  "\n" +
  "4. **Send progress updates (visible to AI):**" +
  "`" +
  "`" +
  "typescript" +
  'progress("Generating extension code...");' +
  "const result = await createOrUpdate({...}, { finalize: false });" +
  'progress("Validation: " + (result.ready ? "PASS" : "FAIL"));' +
  "return result;" +
  "`" +
  "`" +
  "\n" +
  "**Important Notes:**\n" +
  "- Extension IDs are auto-generated from description as ONE WORD\n" +
  "- Multi-word descriptions become camelCase: \"data parser\" → \`dataParser\`\n" +
  "- Extensions are created in data/projects/{tenantId}/{projectId}/extensions/ (project folder)\n" +
  "- Modifying a default extension automatically copies it to project first\n" +
  "- Default extensions are never modified directly\n" +
  "- Use the Extension Settings UI to manage default vs project versions\n" +
  "- progress() messages are visible to you during execution\n" +
  "- console.log() goes to server logs only (for developer debugging)\n" +
  "- Staging is the source of truth: createOrUpdate()/modify() write staging, show()/validate()/finalize() read staging\n" +
  "- **Do NOT use the file tool to create/modify extensions** (it writes to conversation files)\n" +
  "- Use finalize({ extensionId }) or createOrUpdate(..., { finalize: true }) to write extension files\n" +
  "\n" +
  "**Validation Feedback Loop (MANDATORY):**\n" +
  "- After any createOrUpdate()/modify(), ALWAYS call validate({ extensionId }).\n" +
  "- If validate() returns errors:\n" +
  "  1) Fix the staging snapshot with createOrUpdate()/modify() using the errors as guidance.\n" +
  "  2) validate() again.\n" +
  "  3) Repeat until ok, then finalize().\n" +
  "- NEVER call finalize() when validate() is failing.\n" +
  "- If repeated attempts fail (e.g., 3 tries), return the validation errors to the user instead of finalizing.\n" +
  "\n" +
  "**UI Components (ui.tsx):**\n" +
  "- If the extension needs a custom UI (message UI and/or inspector UI), provide `ui` in createOrUpdate().\n" +
  "- Add UI metadata in `metadata`:\n" +
  "  - messageUI: { componentName: \"MyExtensionMessage\", visualizationType: \"my-extension\", uiFile: \"ui.tsx\" }\n" +
  "  - inspectionUI: { tabLabel: \"Details\", componentName: \"MyExtensionInspector\", uiFile: \"ui.tsx\", showByDefault: true }\n" +
  "- Message UI must export a named component `${PascalCaseId}Message` (e.g., show-chart -> ShowChartMessage).\n" +
  "- Inspector UI should be the default export (e.g., export default function MyExtensionInspector()).\n" +
  "- If you need npm packages for UI, declare them in metadata.dependencies.frontend and access them via window.libs.\n" +
  "  Example metadata.dependencies.frontend: { \"some-ui-lib\": \"^1.0.0\" }\n" +
  "  Example ui.tsx usage: const ReactECharts = window.libs.ReactECharts; const echarts = window.libs.echarts;\n";

const LOCK_TTL_MS = 60_000;
const MAX_BACKUPS = 3;

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

async function writeToStaging(snapshot: ExtensionSnapshot): Promise<string> {
  const fs = await import("fs/promises");
  const path = await import("path");
  if (!snapshot.extensionId || !snapshot.projectId || !snapshot.tenantId) {
    throw new Error("Staging context is incomplete");
  }
  const basePath = await getExtensionsBasePath(snapshot.tenantId, snapshot.projectId);
  const stagingPath = path.join(basePath, ".staging", snapshot.extensionId);

  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.mkdir(stagingPath, { recursive: true });

  await fs.writeFile(
    path.join(stagingPath, "metadata.json"),
    JSON.stringify(snapshot.metadata, null, 2),
  );

  if (snapshot.code) {
    await fs.writeFile(path.join(stagingPath, "index.ts"), snapshot.code);
  }

  if (snapshot.ui) {
    await fs.writeFile(path.join(stagingPath, "ui.tsx"), snapshot.ui);
  }

  return stagingPath;
}

async function cleanupStaging(projectId: string, tenantId: string | number, extensionId: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const stagingPath = path.join(basePath, ".staging", extensionId);
  await fs.rm(stagingPath, { recursive: true, force: true });
}

async function loadStagingSnapshot(
  projectId: string,
  tenantId: string | number,
  extensionId: string,
): Promise<ExtensionSnapshot | null> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const stagingPath = path.join(basePath, ".staging", extensionId);

  try {
    const metadataContent = await fs.readFile(
      path.join(stagingPath, "metadata.json"),
      "utf-8",
    );
    const metadata = JSON.parse(metadataContent);

    let code: string | undefined;
    let ui: string | undefined;

    try {
      code = await fs.readFile(path.join(stagingPath, "index.ts"), "utf-8");
    } catch {
      // code is optional
    }

    try {
      ui = await fs.readFile(path.join(stagingPath, "ui.tsx"), "utf-8");
    } catch {
      // ui is optional
    }

    return {
      metadata,
      code,
      ui,
      projectId,
      tenantId,
      extensionId,
    };
  } catch {
    return null;
  }
}

async function validateSnapshot(snapshot: ExtensionSnapshot): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!snapshot.metadata) {
    errors.push("No metadata");
    return { ok: false, errors };
  }

  if (!snapshot.metadata.id) {
    errors.push("Extension ID is required");
  }
  if (!snapshot.metadata.name) {
    errors.push("Name is required");
  }
  if (!snapshot.metadata.description || snapshot.metadata.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }
  if (!snapshot.metadata.category) {
    errors.push("Category is required");
  }

  if ((snapshot.metadata.messageUI || snapshot.metadata.inspectionUI) && !snapshot.ui) {
    errors.push("UI metadata provided but ui.tsx is missing");
  }

  if (snapshot.code) {
    const syntaxCheck = await checkSyntax(snapshot.code);
    if (!syntaxCheck.ok) {
      errors.push(`Syntax error: ${syntaxCheck.error}`);
    }

    if (!snapshot.code.includes("return")) {
      errors.push("Missing return statement - extension must return an object");
    }
  }

  return { ok: errors.length === 0, errors };
}

async function testLoadSnapshot(snapshot: ExtensionSnapshot): Promise<{ ok: boolean; error?: string; exports?: string[] }> {
  if (!snapshot.code) {
    return {
      ok: false,
      error: "No code to test",
    };
  }

  try {
    const transpiler = new (await import("bun")).Transpiler({ loader: "ts" });
    transpiler.transformSync(snapshot.code);

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
}

function generatePreviewFromSnapshot(snapshot: ExtensionSnapshot): string {
  const parts: string[] = [];

  if (snapshot.metadata) {
    parts.push(`ID: ${snapshot.metadata.id}`);
    parts.push(`Name: ${snapshot.metadata.name}`);
    parts.push(`Category: ${snapshot.metadata.category}`);
  }

  if (snapshot.code) {
    const functions = extractFunctions(snapshot.code);
    parts.push(`Functions: ${functions.join(", ")}`);
  }

  return parts.join("\n");
}

async function cleanupBackups(projectId: string, tenantId: string | number, extensionId: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const backupDir = path.join(basePath, ".bak");

  let entries: string[] = [];
  try {
    entries = await fs.readdir(backupDir);
  } catch {
    return;
  }

  const prefix = `${extensionId}-`;
  const backups = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({
      name,
      timestamp: Number(name.slice(prefix.length)) || 0,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const toRemove = backups.slice(MAX_BACKUPS);
  for (const entry of toRemove) {
    await fs.rm(path.join(backupDir, entry.name), { recursive: true, force: true });
  }
}

async function atomicSwap(projectId: string, tenantId: string | number, extensionId: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const basePath = await getExtensionsBasePath(tenantId, projectId);
  const stagingPath = path.join(basePath, ".staging", extensionId);
  const targetPath = path.join(basePath, extensionId);
  const backupDir = path.join(basePath, ".bak");
  const backupPath = path.join(backupDir, `${extensionId}-${Date.now()}`);

  await fs.mkdir(backupDir, { recursive: true });

  let hasBackup = false;
  try {
    await fs.rename(targetPath, backupPath);
    hasBackup = true;
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    await fs.rename(stagingPath, targetPath);
  } catch (error) {
    if (hasBackup) {
      try {
        await fs.rename(backupPath, targetPath);
      } catch {
        // If rollback fails, surface original error
      }
    }
    throw error;
  }

  await cleanupBackups(projectId, tenantId, extensionId);
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
 * Create or update extension snapshot
 */
const createOrUpdate = async (options: CreateOptions, control?: CreateOrUpdateControl) => {
  const mode = control?.mode ?? options.mode ?? "replace";
  const finalizeFlag = control?.finalize ?? options.finalize ?? false;
  const { projectId, tenantId } = getRuntimeContext();

  let extensionId = options.extensionId || options.id;
  let baseSnapshot: ExtensionSnapshot | null = null;

  if (mode === "merge" && extensionId) {
    baseSnapshot = await loadExtension(projectId, tenantId, extensionId);
    if (!baseSnapshot) {
      const defaultSnapshot = await loadDefaultExtension(extensionId);
      if (defaultSnapshot) {
        baseSnapshot = {
          ...defaultSnapshot,
          projectId,
          tenantId,
          extensionId,
        };
      }
    }
  }

  const baseMetadata = baseSnapshot?.metadata || {};
  const baseDescription =
    options.description ||
    options.metadata?.description ||
    baseMetadata.description ||
    options.name ||
    baseMetadata.name ||
    "";

  if (!extensionId) {
    if (!baseDescription) {
      throw new Error("Description is required");
    }
    extensionId = generateIdFromDescription(options.name || baseDescription);
  }

  const description = options.description || options.metadata?.description || baseMetadata.description;
  if (!description) {
    throw new Error("Description is required");
  }

  const normalizedDeps = normalizeDependencyConfig(
    options.dependencies,
    options.frontendDependencies,
    options.metadata?.dependencies ?? (mode === "merge" ? baseMetadata.dependencies : undefined),
  );

  const metadata = {
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

  let code = mode === "merge" ? baseSnapshot?.code : undefined;
  if (options.code) {
    code = options.code;
  } else if (options.functions) {
    const functionsArray = normalizeFunctionsArray(options.functions);
    code = await generateCode({
      description,
      functions: functionsArray,
      metadata,
    });
  }

  let ui = mode === "merge" ? baseSnapshot?.ui : undefined;
  if (options.ui) {
    ui = normalizeUIContent(options.ui);
  }

  if (!ui) {
    const shouldGenerate = shouldGenerateUI(description, metadata, normalizedDeps);
    if (shouldGenerate) {
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
  }

  const snapshot: ExtensionSnapshot = {
    metadata,
    code,
    ui,
    projectId,
    tenantId,
    extensionId,
  };

  await acquireExtensionLock(projectId, tenantId, extensionId);
  try {
    await writeToStaging(snapshot);
    const validation = await validateSnapshot(snapshot);

    if (finalizeFlag) {
      if (!validation.ok) {
        return {
          success: false,
          ready: false,
          issues: validation.errors,
          preview: generatePreviewFromSnapshot(snapshot),
          extensionId,
          message: "Validation failed. Not finalized.",
          nextAction:
            "Fix the staging snapshot with createOrUpdate/modify using issues, then validate() again before finalize().",
        };
      }

      const finalizeResult = await finalize({ extensionId, projectId, tenantId, withLock: false });
      return {
        success: finalizeResult.created,
        ready: validation.ok,
        issues: validation.errors,
        preview: generatePreviewFromSnapshot(snapshot),
        extensionId: finalizeResult.extensionId,
        files: finalizeResult.files,
        message: finalizeResult.message,
        path: `data/projects/${tenantId}/${projectId}/extensions/${finalizeResult.extensionId}/`,
      };
    }

    return {
      success: true,
      ready: validation.ok,
      issues: validation.errors,
      preview: generatePreviewFromSnapshot(snapshot),
      extensionId,
      message: validation.ok
        ? "Staging updated. Call finalize() to write files."
        : "Staging has validation issues. Fix and retry.",
      ...(validation.ok
        ? {}
        : {
            nextAction:
              "Fix the staging snapshot with createOrUpdate/modify using issues, then validate() again before finalize().",
          }),
      path: `data/projects/${tenantId}/${projectId}/extensions/${extensionId}/`,
    };
  } finally {
    await releaseExtensionLock(projectId, tenantId, extensionId);
  }
};

/**
 * Modify existing extension
 */
const modify = async (input: string | ModifyOptions) => {
  const opts = typeof input === "string" ? { instruction: input } : input;
  const finalizeFlag = opts.finalize ?? true;
  const extensionId = opts.extensionId || opts.id;
  if (!extensionId) {
    throw new Error("extensionId is required to modify an extension");
  }
  if (!opts.instruction) {
    throw new Error("instruction is required to modify an extension");
  }

  const { projectId, tenantId } = getRuntimeContext();

  await acquireExtensionLock(projectId, tenantId, extensionId);
  try {
    let base = await loadExtension(projectId, tenantId, extensionId);
    let copiedFromDefault = false;

    if (!base) {
      const defaultExt = await loadDefaultExtension(extensionId);
      if (!defaultExt) {
        throw new Error(
          `Extension "${extensionId}" not found. Create it first using createOrUpdate().`,
        );
      }

      base = defaultExt;
      copiedFromDefault = true;
    }

    const snapshot: ExtensionSnapshot = {
      metadata: copiedFromDefault ? { ...base.metadata, isDefault: false } : base.metadata,
      code: base.code,
      ui: base.ui,
      projectId,
      tenantId,
      extensionId,
    };

    const change = parseChangeInstruction(opts.instruction);
    await applyChange(change, snapshot);

    await writeToStaging(snapshot);
    const validation = await validateSnapshot(snapshot);

    if (finalizeFlag && validation.ok) {
      const finalizeResult = await finalize({ extensionId, projectId, tenantId, withLock: false });
      return {
        success: finalizeResult.created,
        modified: true,
        preview: generatePreviewFromSnapshot(snapshot),
        ready: validation.ok,
        issues: validation.errors,
        extensionId: finalizeResult.extensionId,
        files: finalizeResult.files,
        message: finalizeResult.message,
      };
    }

    return {
      success: true,
      modified: true,
      preview: generatePreviewFromSnapshot(snapshot),
      ready: validation.ok,
      issues: validation.errors,
      extensionId,
      message: finalizeFlag
        ? "Validation failed. Not finalized."
        : "Staging updated. Call finalize() to write files.",
      ...(validation.ok
        ? {}
        : {
            nextAction:
              "Fix the staging snapshot with createOrUpdate/modify using issues, then validate() again before finalize().",
          }),
    };
  } finally {
    await releaseExtensionLock(projectId, tenantId, extensionId);
  }
};

/**
 * Show current state
 */
const show = async (input?: string | { extensionId?: string; id?: string }) => {
  const extensionId =
    typeof input === "string" ? input : input?.extensionId || input?.id;
  if (!extensionId) {
    return {
      summary: "No extension selected",
      hint: "Provide extensionId to show staging state",
    };
  }

  const { projectId, tenantId } = getRuntimeContext();
  const snapshot = await loadStagingSnapshot(projectId, tenantId, extensionId);
  if (!snapshot) {
    return {
      summary: `No staging data for "${extensionId}"`,
      hint: "Use createOrUpdate() to create or update staging data",
    };
  }

  return {
    summary: `Extension: ${snapshot.metadata?.name || extensionId}`,
    id: extensionId,
    description: snapshot.metadata?.description || "",
    category: snapshot.metadata?.category || "",
    status: snapshot.code ? "Code generated" : "No code yet",
    hasUI: !!snapshot.ui,
    preview: generatePreviewFromSnapshot(snapshot),
  };
};

/**
 * Validate extension
 */
const validate = async (input?: string | { extensionId?: string; id?: string }) => {
  const extensionId =
    typeof input === "string" ? input : input?.extensionId || input?.id;
  if (!extensionId) {
    return {
      ok: false,
      errors: ["extensionId is required to validate staging"],
      nextAction: "Provide extensionId to validate staging.",
    };
  }

  const { projectId, tenantId } = getRuntimeContext();
  const snapshot = await loadStagingSnapshot(projectId, tenantId, extensionId);
  if (!snapshot) {
    return {
      ok: false,
      errors: [`No staging data found for "${extensionId}"`],
      nextAction: "Use createOrUpdate() or modify() to create staging data first.",
    };
  }

  return await validateSnapshot(snapshot);
};

/**
 * Test load extension (dry run)
 */
const testLoad = async (input?: string | { extensionId?: string; id?: string }) => {
  const extensionId =
    typeof input === "string" ? input : input?.extensionId || input?.id;
  if (!extensionId) {
    return { ok: false, error: "extensionId is required to test staging" };
  }

  const { projectId, tenantId } = getRuntimeContext();
  const snapshot = await loadStagingSnapshot(projectId, tenantId, extensionId);
  if (!snapshot) {
    return { ok: false, error: `No staging data found for "${extensionId}"` };
  }

  return await testLoadSnapshot(snapshot);
};

/**
 * Finalize and write files
 */
const finalize = async (input?: {
  extensionId?: string;
  id?: string;
  projectId?: string;
  tenantId?: string | number;
  withLock?: boolean;
}) => {
  const extensionId = input?.extensionId || input?.id;
  if (!extensionId) {
    return { created: false, error: "extensionId is required to finalize" };
  }

  const runtime = getRuntimeContext();
  const projectId = input?.projectId || runtime.projectId;
  const tenantId = input?.tenantId ?? runtime.tenantId;
  const withLock = input?.withLock ?? true;

  const snapshot = await loadStagingSnapshot(projectId, tenantId, extensionId);
  if (!snapshot) {
    return {
      created: false,
      error: `No staging data found for "${extensionId}"`,
    };
  }

  const validation = await validateSnapshot(snapshot);
  if (!validation.ok) {
    return {
      created: false,
      error: "Cannot create extension with validation errors",
      issues: validation.errors,
      nextAction:
        "Fix the staging snapshot with createOrUpdate/modify using issues, then validate() again before finalize().",
    };
  }

  const testResult = await testLoadSnapshot(snapshot);
  if (!testResult.ok) {
    return {
      created: false,
      error: "Extension failed validation",
      details: testResult.error,
    };
  }

  if (withLock) {
    await acquireExtensionLock(projectId, tenantId, extensionId);
  }

  try {
    await atomicSwap(projectId, tenantId, extensionId);

    if (snapshot.ui) {
      await invalidateExtensionUICache(extensionId, projectId, tenantId);
    }
  } catch (error) {
    await cleanupStaging(projectId, tenantId, extensionId);
    throw error;
  } finally {
    if (withLock) {
      await releaseExtensionLock(projectId, tenantId, extensionId);
    }
  }

  const createdFiles = [
    "metadata.json",
    ...(snapshot.code ? ["index.ts"] : []),
    ...(snapshot.ui ? ["ui.tsx"] : []),
  ];

  return {
    created: true,
    extensionId,
    files: createdFiles,
    message: `Extension "${extensionId}" created successfully!`,
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
 * Apply change to staging snapshot
 */
async function applyChange(change: any, snapshot: ExtensionSnapshot) {
  switch (change.type) {
    case "renameFunction":
      if (snapshot.code) {
        // Use split/join instead of replaceAll for broader compatibility
        snapshot.code = snapshot.code.split(
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
  createOrUpdate,
  modify,
  show,
  validate,
  finalize,
  setContext,
};

export default extensionCreatorExtension;

// Export for CommonJS environment (esbuild friendly)
if (typeof module !== "undefined" && module.exports) {
  module.exports = extensionCreatorExtension;
}
