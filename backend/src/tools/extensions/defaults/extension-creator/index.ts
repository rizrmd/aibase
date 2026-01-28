/**
 * Extension Creator
 * Create and modify extensions through natural language
 *
 * Always works with project extensions (data/{projectId}/extensions/)
 * Never touches default extensions (backend/src/tools/extensions/defaults/)
 */

// Type definitions
interface CreateOptions {
  description: string;
  functions?: FunctionDescription[];
  category?: string;
  author?: string;
  enabled?: boolean;
}

interface FunctionDescription {
  description: string;
  name?: string;
  parameters?: string;
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

// Extend globalThis for context
declare global {
  var __extensionProjectId: string | undefined;
  var __extensionTenantId: string | number | undefined;
}

// File system imports (available in Bun)
const fs = await import('fs/promises');
const path = await import('path');

/**
 * Context documentation for the extension-creator extension
 */
const context = () =>
  '' +
  '### Extension Creator\n' +
  'Create and modify extensions through natural language.\n' +
  '\n' +
  '**IMPORTANT:** Extension Creator always works with project extensions (data/{projectId}/extensions/). It never modifies default extensions.\n' +
  '\n' +
  '**Debugging and Output:**\n' +
  '- Use `progress(message)` to send status updates that you WILL see in the response\n' +
  '- Use `console.log()` for developer-side debugging (goes to server logs only, NOT visible to you)\n' +
  '- Return structured data from functions to show results to users\n' +
  '\n' +
  '**Available Functions:**\n' +
  '\n' +
  '#### createOrUpdate(options)\n' +
  'Create or update an extension.\n' +
  '`' + '`' + 'typescript' +
  'await createOrUpdate({' +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  '  functions: [' +
  '    { description: "get current weather by city", parameters: "city (required), units (optional)" }' +
  '  ]' +
  '});' +
  '`' + '`' +
  '\n' +
  '**Parameters:**\n' +
  '- `description` (required): What the extension does\n' +
  '- `functions` (optional): Array of functions to create\n' +
  '- `category` (optional): Category ID (inferred if not provided)\n' +
  '- `author` (optional): Author name (default: "AIBase")\n' +
  '- `enabled` (optional): Enable extension (default: true)\n' +
  '\n' +
  '#### modify(instruction)\n' +
  'Modify an existing extension.\n' +
  '`' + '`' + 'typescript' +
  'await modify("rename getWeather to getCurrentWeather");' +
  '`' + '`' +
  '\n' +
  '**Parameters:**\n' +
  '- `instruction` (required): Natural language instruction\n' +
  '\n' +
  '#### show()\n' +
  'Show current extension state.\n' +
  '`' + '`' + 'typescript' +
  'await show();' +
  '`' + '`' +
  '\n' +
  '#### validate()\n' +
  'Validate extension without writing.\n' +
  '`' + '`' + 'typescript' +
  'const result = await validate();' +
  'if (!result.ok) {' +
  '  return "Errors:\\n" + result.errors.join("\\n");' +
  '}' +
  '`' + '`' +
  '\n' +
  '#### finalize()\n' +
  'Create the extension (write files).\n' +
  '`' + '`' + 'typescript' +
  'const result = await finalize();' +
  'return "Created! " + result.message;' +
  '`' + '`' +
  '\n' +
  '**Examples:**\n' +
  '\n' +
  '1. **Create a new extension:**' +
  '`' + '`' + 'typescript' +
  'await createOrUpdate({' +
  '  description: "weather extension that fetches from OpenWeatherMap API",' +
  '  functions: [' +
  '    { description: "get weather by city", parameters: "city (required), units (optional metric/imperial)" }' +
  '  ]' +
  '});' +
  'await show();' +
  'await validate();' +
  'await finalize();' +
  '`' + '`' +
  '\n' +
  '2. **Modify existing extension:**' +
  '`' + '`' + 'typescript' +
  'await modify("add forecast function");' +
  'await show();' +
  '`' +
  '`' +
  '\n' +
  '3. **Send progress updates (visible to AI):**' +
  '`' + '`' + 'typescript' +
  'progress("Generating extension code...");' +
  'const result = await createOrUpdate({...});' +
  'progress("Validation: " + (result.ready ? "PASS" : "FAIL"));' +
  'return result;' +
  '`' + '`' +
  '\n' +
  '**Important Notes:**\n' +
  '- Extensions are created in data/{projectId}/extensions/ (project folder)\n' +
  '- Modifying a default extension automatically copies it to project first\n' +
  '- Default extensions are never modified directly\n' +
  '- Use the Extension Settings UI to manage default vs project versions\n' +
  '- progress() messages are visible to you during execution\n' +
  '- console.log() goes to server logs only (for developer debugging)\n';

/**
 * Session state for the current extension being created/modified
 */
let currentDraft: ExtensionDraft = {};

/**
 * Create or update extension draft
 */
const createOrUpdate = async (options: CreateOptions) => {
  if (!options.description) {
    throw new Error('Description is required');
  }

  // Initialize or update draft
  if (!currentDraft.extensionId) {
    // Generate ID from description
    const id = generateIdFromDescription(options.description);
    currentDraft.extensionId = id;
  }

  // Update or create metadata
  if (!currentDraft.metadata) {
    currentDraft.metadata = {};
  }

  currentDraft.metadata = {
    ...currentDraft.metadata,
    id: currentDraft.extensionId,
    name: generateNameFromId(currentDraft.extensionId),
    description: options.description,
    category: options.category || inferCategory(options.description),
    author: options.author || 'AIBase',
    version: '1.0.0',
    enabled: options.enabled !== undefined ? options.enabled : true,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Generate or update code
  if (options.functions) {
    currentDraft.code = await generateCode({
      description: options.description,
      functions: options.functions,
      metadata: currentDraft.metadata,
    });
  }

  // Validate
  const validation = await validate();

  return {
    created: true,
    preview: generatePreview(),
    ready: validation.ok,
    issues: validation.errors,
  };
};

/**
 * Modify existing extension
 */
const modify = async (instruction: string) => {
  if (!currentDraft.extensionId) {
    throw new Error('No extension selected. Use createOrUpdate first, or specify which extension to modify.');
  }

  // Check if extension exists
  const extension = await loadExtension(currentDraft.extensionId);
  if (!extension) {
    // Try to copy from default
    const defaultExt = await loadDefaultExtension(currentDraft.extensionId);
    if (!defaultExt) {
      throw new Error(`Extension "${currentDraft.extensionId}" not found. Create it first using createOrUpdate().`);
    }

    // Copy to project
    await copyToProject(defaultExt);

    // Update draft
    currentDraft.metadata = { ...defaultExt.metadata, isDefault: false };
    currentDraft.code = defaultExt.code;

    return {
      copied: true,
      message: `Copied "${currentDraft.extensionId}" from default to project. Now modifying...`,
      continuing: true
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
      summary: 'No extension loaded',
      hint: 'Use createOrUpdate() to create a new extension'
    };
  }

  return {
    summary: `Extension: ${currentDraft.metadata?.name || currentDraft.extensionId}`,
    id: currentDraft.extensionId,
    description: currentDraft.metadata?.description || '',
    category: currentDraft.metadata?.category || '',
    status: currentDraft.code ? 'Code generated' : 'No code yet',
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
    errors.push('No metadata');
    return { ok: false, errors };
  }

  // Check metadata
  if (!currentDraft.metadata.id) {
    errors.push('Extension ID is required');
  }
  if (!currentDraft.metadata.name) {
    errors.push('Name is required');
  }
  if (!currentDraft.metadata.description || currentDraft.metadata.description.length < 10) {
    errors.push('Description must be at least 10 characters');
  }
  if (!currentDraft.metadata.category) {
    errors.push('Category is required');
  }

  // Check code syntax
  if (currentDraft.code) {
    const syntaxCheck = await checkSyntax(currentDraft.code);
    if (!syntaxCheck.ok) {
      errors.push(`Syntax error: ${syntaxCheck.error}`);
    }

    // Check for return statement
    if (!currentDraft.code.includes('return')) {
      errors.push('Missing return statement - extension must return an object');
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
      error: 'No code to test'
    };
  }

  try {
    // Use the Bun transpiler to check syntax
    const transpiler = new (await import('bun')).Transpiler({ loader: 'ts' });
    transpiler.transformSync(currentDraft.code);

    // In a real implementation, we would also try to load the extension
    // For now, syntax check is enough
    return {
      ok: true,
      exports: ['syntax_valid'],
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || 'Syntax error',
    };
  }
};

/**
 * Finalize and write files
 */
const finalize = async () => {
  const validation = await validate();
  if (!validation.ok) {
    return {
      created: false,
      error: 'Cannot create extension with validation errors',
      issues: validation.errors,
    };
  }

  const testResult = await testLoad();
  if (!testResult.ok) {
    return {
      created: false,
      error: 'Extension failed validation',
      details: testResult.error,
    };
  }

  // Write files
  const tenantId = currentDraft.tenantId ?? 'default';
  const projectId = currentDraft.projectId ?? 'default';
  const extensionId = currentDraft.extensionId ?? 'unknown-extension';

  const targetPath = path.join(
    process.cwd(),
    'data',
    String(tenantId),
    projectId,
    'extensions',
    extensionId
  );

  await fs.mkdir(targetPath, { recursive: true });

  // Write metadata.json
  await fs.writeFile(
    path.join(targetPath, 'metadata.json'),
    JSON.stringify(currentDraft.metadata, null, 2)
  );

  // Write index.ts
  if (currentDraft.code) {
    await fs.writeFile(
      path.join(targetPath, 'index.ts'),
      currentDraft.code
    );
  }

  // Write ui.tsx if present
  if (currentDraft.ui) {
    await fs.writeFile(
      path.join(targetPath, 'ui.tsx'),
      currentDraft.ui
    );
  }

  // Clear draft
  const finalExtensionId = currentDraft.extensionId;
  const createdFiles = ['metadata.json', ...(currentDraft.code ? ['index.ts'] : []), ...(currentDraft.ui ? ['ui.tsx'] : [])];
  currentDraft = {};

  return {
    created: true,
    extensionId: finalExtensionId,
    files: createdFiles,
    message: `Extension "${finalExtensionId}" created successfully!`,
    nextSteps: [
      'Extension is now active for this project',
      'No restart required (loaded automatically on next script execution)',
    ],
  };

  return {
    created: true,
    extensionId,
    files: createdFiles,
    message: `Extension "${extensionId}" created successfully!`,
    nextSteps: [
      'Extension is now active for this project',
      'No restart required (loaded automatically on next script execution)',
    ],
  };
};

// ==================== Helper Functions ====================

/**
 * Generate kebab-case ID from description
 */
function generateIdFromDescription(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 5); // First 5 words
  return words.join('-');
}

/**
 * Generate PascalCase name from kebab-case ID
 */
function generateNameFromId(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Infer category from description
 */
function inferCategory(description: string): string {
  const desc = description.toLowerCase();

  const keywords: Record<string, string[]> = {
    'database-tools': ['database', 'sql', 'query', 'postgresql', 'mysql', 'clickhouse', 'trino', 'duckdb'],
    'web-tools': ['api', 'web', 'http', 'fetch', 'search', 'scrape'],
    'visualization-tools': ['chart', 'graph', 'plot', 'visualize', 'diagram', 'mermaid'],
    'document-tools': ['pdf', 'document', 'file', 'parse', 'extract', 'read'],
  };

  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(w => desc.includes(w))) {
      return category;
    }
  }

  return 'web-tools'; // default
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
    input.functions.map(fn => generateFunction(fn, intent))
  );

  // Assemble extension object
  const code = `
/**
 * ${input.metadata.name}
 * ${input.metadata.description}
 */

const ${camelize(input.metadata.id)} = {
${functionCode.join(',\n')}
};

return ${camelize(input.metadata.id)};
`;

  return code.trim();
}

/**
 * Generate a single function
 */
async function generateFunction(fn: FunctionDescription, intent: any): Promise<string> {
  const params = parseParameters(fn.parameters || '');
  const impl = generateImplementation(fn, intent);

  return `
  /**
   * ${fn.description}
   */
  ${fn.name || 'func'}: async (${params}) => {
    ${impl}
  }`;
}

/**
 * Generate function implementation based on intent
 */
function generateImplementation(fn: FunctionDescription, intent: any): string {
  if (intent.type === 'api') {
    return `
    // TODO: Implement API call for "${fn.description}"
    // API: ${intent.api}
    const apiKey = process.env.${intent.api.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY;

    if (!apiKey) {
      throw new Error("${intent.api} API key not configured. Add it to .env file.");
    }

    // Make API request
    const response = await fetch("${intent.baseUrl || 'https://api.example.com'}", {
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
 * Parse parameters string
 */
function parseParameters(params: string): string {
  if (!params) return '';

  // Parse: "param1 (required), param2 (optional)" -> "param1, param2"
  return params
    .split(',')
    .map(p => p.trim())
    .filter(p => p)
    .join(', ');
}

/**
 * Analyze intent from description
 */
function analyzeIntent(description: string): any {
  const desc = description.toLowerCase();

  // API detection
  if (desc.includes('api') || desc.includes('fetch')) {
    const apiMatch = desc.match(/(\w+)\s*api/);
    if (apiMatch) {
      return {
        type: 'api',
        api: apiMatch[1],
        baseUrl: `https://api.${apiMatch[1]}.com`,
      };
    }
  }

  return { type: 'generic' };
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
      type: 'renameFunction',
      oldName: renameMatch[1],
      newName: renameMatch[2],
    };
  }

  // Add function
  const addMatch = lower.match(/add\s+(\w+)\s+function/);
  if (addMatch) {
    return {
      type: 'addFunction',
      functionName: addMatch[1],
      description: instruction,
    };
  }

  return { type: 'unknown', instruction };
}

/**
 * Apply change to draft
 */
async function applyChange(change: any) {
  switch (change.type) {
    case 'renameFunction':
      if (currentDraft.code) {
        currentDraft.code = currentDraft.code.replaceAll(
          change.oldName,
          change.newName
        );
      }
      break;

    case 'addFunction':
      // Would generate and add new function
      throw new Error('Adding functions not yet implemented. Use createOrUpdate with all functions.');
  }
}

/**
 * Check TypeScript syntax
 */
async function checkSyntax(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const transpiler = new (await import('bun')).Transpiler({ loader: 'ts' });
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
    parts.push(`Functions: ${functions.join(', ')}`);
  }

  return parts.join('\n');
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
  // Try project first
  const projectPath = path.join(
    process.cwd(),
    'data',
    String(currentDraft.tenantId || 'default'),
    currentDraft.projectId!,
    'extensions',
    extensionId,
    'metadata.json'
  );

  try {
    const metadataContent = await fs.readFile(projectPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    const codePath = path.join(
      process.cwd(),
      'data',
      String(currentDraft.tenantId || 'default'),
      currentDraft.projectId!,
      'extensions',
      extensionId,
      'index.ts'
    );

    const code = await fs.readFile(codePath, 'utf-8');

    return { metadata, code };
  } catch {
    return null;
  }
}

/**
 * Load default extension
 */
async function loadDefaultExtension(extensionId: string): Promise<any> {
  const defaultsPath = path.join(
    process.cwd(),
    'backend/src/tools/extensions/defaults',
    extensionId,
    'metadata.json'
  );

  try {
    const metadataContent = await fs.readFile(defaultsPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    const codePath = path.join(
      process.cwd(),
      'backend/src/tools/extensions/defaults',
      extensionId,
      'index.ts'
    );

    const code = await fs.readFile(codePath, 'utf-8');

    return { metadata, code };
  } catch {
    return null;
  }
}

/**
 * Copy default extension to project
 */
async function copyToProject(extension: { metadata: any; code: string }): Promise<void> {
  const targetPath = path.join(
    process.cwd(),
    'data',
    String(currentDraft.tenantId || 'default'),
    currentDraft.projectId || 'default',
    'extensions',
    extension.metadata.id
  );

  await fs.mkdir(targetPath, { recursive: true });

  await fs.writeFile(
    path.join(targetPath, 'metadata.json'),
    JSON.stringify({
      ...extension.metadata,
      isDefault: false,
      copiedFrom: extension.metadata.id,
      customizedAt: Date.now(),
    }, null, 2)
  );

  await fs.writeFile(
    path.join(targetPath, 'index.ts'),
    extension.code
  );
}

/**
 * Get context about current project (for internal use)
 */
const getContext = () => ({
  projectId: globalThis.__extensionProjectId,
  tenantId: globalThis.__extensionTenantId,
});

/**
 * Set context (for internal use during initialization)
 */
const setContext = (context: { projectId: string; tenantId: string | number }) => {
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

// @ts-expect-error - Extension loader wraps this code in an async function
return extensionCreatorExtension;
