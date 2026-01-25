/**
 * Extension Context Service
 * Generates AI context from extension metadata and code
 */

import { ExtensionStorage, type Extension, type ExampleEntry } from "../../storage/extension-storage";
import { CategoryStorage } from "../../storage/category-storage";

/**
 * Parse function signature from TypeScript code
 * Extracts function name, parameters, and return type
 */
function parseFunctionSignature(code: string, functionName: string): {
  name: string;
  params: string;
  returnType?: string;
} | null {
  // Try to match: async functionName(params): ReturnType
  // or: functionName(params): ReturnType
  const patterns = [
    new RegExp(`async\\s+${functionName}\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^\\n{]+))?`, 's'),
    new RegExp(`${functionName}\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^\\n{]+))?`, 's'),
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      return {
        name: functionName,
        params: match[1]?.trim() || '',
        returnType: match[2]?.trim() || 'Promise<any>',
      };
    }
  }

  return null;
}

/**
 * Generate TypeScript documentation comment from function signature
 */
function generateParamDocs(params: string): string {
  if (!params) return 'No parameters';

  // Parse parameter list: param1: type, param2: type
  const paramList = params.split(',').map(p => p.trim());
  const docs = paramList.map(param => {
    const [name, type] = param.split(':').map(s => s.trim());
    return `    - ${name || 'unknown'}: ${type || 'any'}`;
  }).filter(Boolean);

  return docs.length > 0 ? docs.join('\n') : 'No parameters';
}

/**
 * Extract examples from JSDoc comments in the code
 */
function extractExamplesFromJSDoc(code: string): ExampleEntry[] {
  const examples: ExampleEntry[] = [];

  // Match JSDoc blocks with @example tags
  // Pattern: /** ... @example ... */
  const jsDocPattern = /\/\*\*[\s\S]*?\*\//g;
  const matches = code.matchAll(jsDocPattern);

  for (const match of matches) {
    const comment = match[0];

    // Check if it contains @example
    if (comment.includes('@example')) {
      // Extract the example content
      const exampleMatch = comment.match(/@example\s+(.+?)(?=\s*\*\/|\s*@|\s*$)/s);
      if (exampleMatch) {
        const exampleContent = exampleMatch[1].trim();

        // Try to parse structured example
        // Format: @example Title - Description
        // ```typescript
        // code
        // ```
        // Result: ...
        const titleMatch = exampleContent.match(/^([^\n-]+)(?:\s*-\s*(.+?))?\s*\n([\s\S]+)/);
        if (titleMatch) {
          const title = titleMatch[1].trim();
          const description = titleMatch[2]?.trim();
          const body = titleMatch[3].trim();

          // Extract code block
          const codeBlockMatch = body.match(/```(?:typescript|ts|javascript|js)?\s*\n([\s\S]+?)```/);
          const code = codeBlockMatch ? codeBlockMatch[1].trim() : body;

          // Extract result if present
          const resultMatch = body.match(/(?:Result|Output):\s*(.+?)(?:\n|$)/i);
          const result = resultMatch ? resultMatch[1].trim() : undefined;

          examples.push({ title, description, code, result });
        }
      }
    }
  }

  return examples;
}

/**
 * Generate context for a single extension
 */
export function generateExtensionContext(extension: Extension): string {
  const { metadata, code } = extension;

  // Extract main export object name
  const exportMatch = code.match(/export\s+default\s+(\w+)/);
  const objectName = exportMatch ? exportMatch[1] : 'extension';

  // Find all function definitions in the extension object
  // Pattern: functionName: async (params) => { or functionName: (params) => {
  const functionMatches = code.matchAll(
    /(\w+)\s*:\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^,\n]+)?\s*=>/g
  );

  const functions = Array.from(functionMatches).map(match => match[1]);

  // Remove duplicates and filter out non-function properties
  const uniqueFunctions = [...new Set(functions)].filter(fn =>
    !['constructor', 'toString', 'valueOf'].includes(fn)
  );

  // Generate context header
  let context = `### ${metadata.name}\n\n`;
  context += `**ID**: \`${metadata.id}\`\n`;
  context += `**Category**: ${metadata.category || 'Uncategorized'}\n`;
  context += `**Description**: ${metadata.description}\n\n`;

  if (uniqueFunctions.length === 0) {
    context += `**Available Functions**: No functions found\n`;
    return context;
  }

  context += `**Available Functions**:\n\n`;

  // Generate documentation for each function
  for (const funcName of uniqueFunctions) {
    const sig = parseFunctionSignature(code, funcName);

    if (sig) {
      context += `**${funcName}**\n`;
      context += `\`\`\`typescript\n`;
      context += `${objectName}.${funcName}(${sig.params})${sig.returnType ? `: ${sig.returnType}` : ''}\n`;
      context += `\`\`\`\n\n`;
    } else {
      context += `**${funcName}**\n`;
      context += `\`\`\`typescript\n`;
      context += `${objectName}.${funcName}(...)\n`;
      context += `\`\`\`\n\n`;
    }
  }

  // Add usage example
  context += `**Usage Example**:\n`;
  context += `\`\`\`typescript\n`;
  if (uniqueFunctions.length > 0) {
    const firstFunc = uniqueFunctions[0];
    context += `// Call the extension function\n`;
    context += `const result = await ${objectName}.${firstFunc}({\n`;
    context += `  // parameters here\n`;
    context += `});\n`;
    context += `return result;\n`;
  } else {
    context += `// This extension has no callable functions\n`;
  }
  context += `\`\`\`\n`;

  // NEW: Add examples section
  const examples: ExampleEntry[] = metadata.examples || extractExamplesFromJSDoc(code);

  if (examples.length > 0) {
    context += `\n**Examples**:\n\n`;

    for (const example of examples) {
      context += `##### ${example.title}\n`;

      if (example.description) {
        context += `${example.description}\n\n`;
      }

      context += `\`\`\`typescript\n${example.code}\n\`\`\`\n`;

      if (example.result) {
        context += `**Result**: ${example.result}\n`;
      }

      context += `\n`;
    }
  }

  return context;
}

/**
 * Generate context for all enabled extensions in a project
 */
export async function generateExtensionsContext(projectId: string): Promise<string> {
  const extensionStorage = new ExtensionStorage();
  const categoryStorage = new CategoryStorage();
  const { ProjectStorage } = await import('../../storage/project-storage');
  const projectStorage = ProjectStorage.getInstance();

  // Get tenant_id for the project
  const project = projectStorage.getById(projectId);
  const tenantId = project?.tenant_id ?? 'default';

  // Get all enabled extensions
  const extensions = await extensionStorage.getEnabled(projectId, tenantId);

  if (extensions.length === 0) {
    return '';
  }

  // Group by category
  const categories = await categoryStorage.getAll(projectId, tenantId);
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  const grouped = new Map<string, Extension[]>();

  for (const ext of extensions) {
    const categoryId = ext.metadata.category || '';
    const categoryName = categoryMap.get(categoryId) || 'Uncategorized';
    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, []);
    }
    grouped.get(categoryName)!.push(ext);
  }

  // Generate context by category
  let context = '\n\n## 🧩 Project Extensions\n\n';
  context += `The following extensions are available in this project:\n\n`;

  for (const [category, exts] of grouped.entries()) {
    context += `### ${category}\n\n`;

    for (const ext of exts) {
      context += generateExtensionContext(ext);
    }
  }

  return context;
}
