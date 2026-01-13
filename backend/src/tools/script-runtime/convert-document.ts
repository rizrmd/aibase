import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

/**
 * Context documentation for convertDocument functionality
 */
export const context = async () => {
  return `### CONVERT DOCUMENT

**IMPORTANT: \`convertDocument\` is a script tool function available in your script execution environment, NOT a direct tool.**

You call \`convertDocument()\` directly within your TypeScript/JavaScript code - it is NOT invoked via tool use. Just use it like a regular async function.

Use convertDocument() to convert Markdown content to PDF or Word documents using Pandoc.

**Available:** convertDocument({ content, format, saveTo })

#### PARAMETERS

- content: Markdown content to convert (required)
- format: Output format - 'pdf' or 'docx' (required)
- saveTo: Filename to save the document (e.g., 'report.pdf', 'document.docx') (required)

#### EXAMPLE

\`\`\`typescript
// Convert markdown to PDF
const markdown = \`# My Report

## Introduction
This is a sample report with **bold** and *italic* text.

## Data
- Item 1
- Item 2
\`;

await convertDocument({
  content: markdown,
  format: 'pdf',
  saveTo: 'report.pdf'
});

// Convert to Word document
await convertDocument({
  content: markdown,
  format: 'docx',
  saveTo: 'document.docx'
});

return { document: 'created' };
\`\`\``;
};

/**
 * Convert document function factory
 */
export function createConvertDocumentFunction(cwd: string) {
  return async (args: {
    content: string;
    format: "pdf" | "docx";
    saveTo: string;
  }) => {
    const { content, format, saveTo } = args;

    // Validate format
    if (!["pdf", "docx"].includes(format)) {
      throw new Error(
        `Invalid format "${format}". Must be 'pdf' or 'docx'`
      );
    }

    // Ensure saveTo has correct extension
    const filename = saveTo.endsWith(`.${format}`)
      ? saveTo
      : `${saveTo}.${format}`;

    const outputPath = path.join(cwd, filename);

    try {
      // Create temporary markdown file
      const tempInput = path.join(cwd, `.temp_${Date.now()}.md`);
      await fs.writeFile(tempInput, content, "utf-8");

      // Build pandoc command
      const pandocArgs = [
        tempInput,
        "-o", outputPath,
        // PDF options
        ...(format === "pdf" ? [
          "--pdf-engine=xelatex",
          "-V", "geometry:margin=1in",
        ] : []),
      ];

      // Spawn pandoc process
      return new Promise((resolve, reject) => {
        const pandoc = spawn("pandoc", pandocArgs);

        let stderr = "";

        pandoc.on("error", (error) => {
          reject(
            new Error(
              `Failed to spawn pandoc: ${error.message}. Ensure pandoc is installed.`
            )
          );
        });

        pandoc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        pandoc.on("close", async (code) => {
          // Clean up temp file
          try {
            await fs.unlink(tempInput);
          } catch {
            // Ignore cleanup errors
          }

          if (code !== 0) {
            reject(
              new Error(
                `Pandoc conversion failed (exit code ${code}): ${stderr}`
              )
            );
            return;
          }

          resolve({
            status: "success",
            message: `Document converted to ${format.toUpperCase()}`,
            path: filename,
          });
        });
      });
    } catch (error: any) {
      throw new Error(`Document conversion failed: ${error.message}`);
    }
  };
}
