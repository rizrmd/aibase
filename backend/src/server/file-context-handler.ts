/**
 * File Context API Handler
 * HTTP endpoints for managing which files are included in LLM context
 */

import { FileContextStorage } from '../storage/file-context-storage';
import { ProjectStorage } from '../storage/project-storage';
import { createLogger } from '../utils/logger';

const logger = createLogger('FileContextAPI');

export interface FileContextData {
  fileContext: Record<string, boolean>;
  version: string;
  updatedAt: number;
}

/**
 * Get file context for a project
 * GET /api/projects/{projectId}/file-context
 */
export async function handleGetFileContext(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');

    // Expected: /api/projects/{projectId}/file-context
    const projectId = pathParts[3];

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Missing projectId' },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const tenantId = project.tenant_id ?? 'default';
    const fileContextStorage = FileContextStorage.getInstance();
    const fileContextData = await fileContextStorage.loadFileContext(projectId, tenantId);

    logger.info({ projectId, fileCount: Object.keys(fileContextData.files).length }, 'File context retrieved');

    return Response.json({
      success: true,
      data: {
        fileContext: fileContextData.files,
        version: fileContextData.version,
        updatedAt: fileContextData.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to get file context');
    return Response.json(
      { success: false, error: error.message || 'Failed to get file context' },
      { status: 500 }
    );
  }
}

/**
 * Set file in context
 * POST /api/projects/{projectId}/file-context
 * Body: { fileId: string, included: boolean }
 */
export async function handleSetFileContext(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');

    // Expected: /api/projects/{projectId}/file-context
    const projectId = pathParts[3];

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Missing projectId' },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { fileId, included } = body;

    if (!fileId || typeof included !== 'boolean') {
      return Response.json(
        { success: false, error: 'Missing fileId or included flag' },
        { status: 400 }
      );
    }

    const tenantId = project.tenant_id ?? 'default';
    const fileContextStorage = FileContextStorage.getInstance();

    await fileContextStorage.setFileInContext(fileId, included, projectId, tenantId);

    logger.info({ projectId, fileId, included }, 'File context updated');

    return Response.json({
      success: true,
      data: { fileId, included },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to set file context');
    return Response.json(
      { success: false, error: error.message || 'Failed to set file context' },
      { status: 500 }
    );
  }
}

/**
 * Bulk set files in context
 * PUT /api/projects/{projectId}/file-context
 * Body: { fileIds: string[], included: boolean }
 */
export async function handleBulkSetFileContext(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');

    // Expected: /api/projects/{projectId}/file-context
    const projectId = pathParts[3];

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Missing projectId' },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { fileIds, included } = body;

    if (!Array.isArray(fileIds) || typeof included !== 'boolean') {
      return Response.json(
        { success: false, error: 'Missing fileIds array or included flag' },
        { status: 400 }
      );
    }

    const tenantId = project.tenant_id ?? 'default';
    const fileContextStorage = FileContextStorage.getInstance();

    await fileContextStorage.bulkSetFilesInContext(fileIds, included, projectId, tenantId);

    logger.info({ projectId, fileCount: fileIds.length, included }, 'Bulk file context updated');

    return Response.json({
      success: true,
      data: { updatedCount: fileIds.length },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to bulk set file context');
    return Response.json(
      { success: false, error: error.message || 'Failed to bulk set file context' },
      { status: 500 }
    );
  }
}
