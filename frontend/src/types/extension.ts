/**
 * Extension type definitions
 */

export interface DebugLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export interface ExtensionMetadata {
  id: string;
  name: string;
  description: string;
  author?: string;
  version: string;
  category: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;

  // Error tracking
  errorCount?: number;
  lastError?: string;
  lastErrorAt?: number;
  hasError?: boolean;

  // Debug mode
  debug?: boolean;
  debugLogs?: DebugLogEntry[];
}

export interface Extension {
  metadata: ExtensionMetadata;
  code: string;

  // Source status
  source?: 'default' | 'project';
  hasProjectVersion?: boolean;
  hasDefaultVersion?: boolean;
}

export interface CreateExtensionData {
  id: string;
  name: string;
  description: string;
  author?: string;
  version?: string;
  category?: string;
  code: string;
  enabled?: boolean;
}

export interface UpdateExtensionData {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  code?: string;
  enabled?: boolean;
  category?: string;
}
