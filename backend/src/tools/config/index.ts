/**
 * Tool configuration interface
 */
export interface ToolSettings {
  fileAccess: {
    allowedPaths: string[];
    maxFileSize: number;
    allowedExtensions: string[];
  };
  externalAPIs: {
    timeout: number;
    rateLimits: Record<string, number>;
    retryAttempts: number;
    retryDelay: number;
  };
  system: {
    enabled: boolean;
    monitoringInterval: number;
  };
  security: {
    enableSandbox: boolean;
    maxExecutionTime: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * API key configuration interface
 */
export interface APIKeyConfig {
  provider: string;
  keyEnvVar: string;
  required: boolean;
  description: string;
  documentation?: string;
}

/**
 * Tool-specific configuration interface
 */
export interface ToolConfig {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  dependencies: string[];
}

/**
 * Default API key configurations
 */
export const API_KEY_CONFIGS: APIKeyConfig[] = [
  {
    provider: 'openweathermap',
    keyEnvVar: 'OPENWEATHER_API_KEY',
    required: false,
    description: 'API key for OpenWeatherMap weather data',
    documentation: 'https://openweathermap.org/api'
  },
  {
    provider: 'google_search',
    keyEnvVar: 'GOOGLE_SEARCH_API_KEY',
    required: false,
    description: 'API key for Google Search integration',
    documentation: 'https://developers.google.com/custom-search/v1/introduction'
  },
  {
    provider: 'newsapi',
    keyEnvVar: 'NEWS_API_KEY',
    required: false,
    description: 'API key for News API integration',
    documentation: 'https://newsapi.org/docs'
  },
  {
    provider: 'openai',
    keyEnvVar: 'OPENAI_API_KEY',
    required: true,
    description: 'OpenAI API key for DALL-E image generation',
    documentation: 'https://platform.openai.com/docs/api-reference/images'
  }
];

/**
 * Get tool configuration from environment variables
 */
export const getToolConfig = (): ToolSettings => ({
  fileAccess: {
    allowedPaths: parseCommaSeparatedString(process.env.TOOL_ALLOWED_PATHS) || ['/tmp', '/var/tmp'],
    maxFileSize: parseInt(process.env.TOOL_MAX_FILE_SIZE || '10485760'), // 10MB default
    allowedExtensions: parseCommaSeparatedString(process.env.TOOL_ALLOWED_EXTENSIONS) || [
      '.txt', '.json', '.csv', '.md', '.log', '.xml', '.yaml', '.yml'
    ]
  },
  externalAPIs: {
    timeout: parseInt(process.env.TOOL_API_TIMEOUT || '30000'), // 30 seconds default
    rateLimits: {
      weather: parseInt(process.env.WEATHER_RATE_LIMIT || '60'), // per hour
      search: parseInt(process.env.SEARCH_RATE_LIMIT || '100'), // per hour
      news: parseInt(process.env.NEWS_RATE_LIMIT || '1000'), // per hour
      imagegen: parseInt(process.env.IMAGE_GENERATION_RATE_LIMIT || '10') // per hour
    },
    retryAttempts: parseInt(process.env.TOOL_API_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.TOOL_API_RETRY_DELAY || '1000') // milliseconds
  },
  system: {
    enabled: process.env.TOOL_SYSTEM_ENABLED === 'true',
    monitoringInterval: parseInt(process.env.TOOL_SYSTEM_MONITORING_INTERVAL || '60000') // 1 minute
  },
  security: {
    enableSandbox: process.env.TOOL_ENABLE_SANDBOX !== 'false', // default true
    maxExecutionTime: parseInt(process.env.TOOL_MAX_EXECUTION_TIME || '30000'), // 30 seconds
    logLevel: (process.env.TOOL_LOG_LEVEL as any) || 'info'
  }
});

/**
 * Check if required API keys are available
 */
export const validateAPIKeys = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];

  for (const config of API_KEY_CONFIGS) {
    if (config.required && !process.env[config.keyEnvVar]) {
      missing.push(`${config.provider} (${config.keyEnvVar})`);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
};

/**
 * Get available API keys
 */
export const getAvailableAPIKeys = (): string[] => {
  return API_KEY_CONFIGS
    .filter(config => process.env[config.keyEnvVar])
    .map(config => config.provider);
};

/**
 * Check if specific API key is available
 */
export const hasAPIKey = (provider: string): boolean => {
  const config = API_KEY_CONFIGS.find(c => c.provider === provider);
  return config ? !!process.env[config.keyEnvVar] : false;
};

/**
 * Get API key for provider
 */
export const getAPIKey = (provider: string): string | undefined => {
  const config = API_KEY_CONFIGS.find(c => c.provider === provider);
  return config ? process.env[config.keyEnvVar] : undefined;
};

/**
 * Parse comma-separated string from environment variable
 */
function parseCommaSeparatedString(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Tool-specific configurations
 */
export const getToolConfigs = (): ToolConfig[] => {
  const configEnv = process.env.TOOL_CONFIGS;
  if (!configEnv) return [];

  try {
    return JSON.parse(configEnv);
  } catch (error) {
    console.warn('Failed to parse TOOL_CONFIGS environment variable:', error);
    return [];
  }
};

/**
 * Get configuration for a specific tool
 */
export const getToolConfigByName = (toolName: string): ToolConfig | undefined => {
  const configs = getToolConfigs();
  return configs.find(config => config.name === toolName);
};

/**
 * Check if a tool is enabled
 */
export const isToolEnabled = (toolName: string): boolean => {
  const config = getToolConfigByName(toolName);
  if (config) {
    return config.enabled;
  }

  // Check environment variable fallback
  const envVar = `TOOL_${toolName.toUpperCase()}_ENABLED`;
  const envValue = process.env[envVar];
  if (envValue !== undefined) {
    return envValue === 'true';
  }

  // Default to enabled
  return true;
};

/**
 * Get tool-specific configuration
 */
export const getToolSpecificConfig = (toolName: string): Record<string, any> => {
  const config = getToolConfigByName(toolName);
  return config?.config || {};
};

/**
 * Validate tool configuration
 */
export const validateToolConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = getToolConfig();

  // Validate file access settings
  if (config.fileAccess.allowedPaths.length === 0) {
    errors.push('No allowed paths configured for file access');
  }

  if (config.fileAccess.maxFileSize <= 0) {
    errors.push('Invalid max file size configured');
  }

  if (config.fileAccess.allowedExtensions.length === 0) {
    errors.push('No allowed file extensions configured');
  }

  // Validate API settings
  if (config.externalAPIs.timeout <= 0) {
    errors.push('Invalid API timeout configured');
  }

  if (config.externalAPIs.retryAttempts < 0) {
    errors.push('Invalid retry attempts configured');
  }

  // Validate system settings
  if (config.system.monitoringInterval <= 0) {
    errors.push('Invalid monitoring interval configured');
  }

  // Validate security settings
  if (config.security.maxExecutionTime <= 0) {
    errors.push('Invalid max execution time configured');
  }

  if (!['debug', 'info', 'warn', 'error'].includes(config.security.logLevel)) {
    errors.push('Invalid log level configured');
  }

  // Validate API keys
  const apiKeyValidation = validateAPIKeys();
  if (!apiKeyValidation.valid) {
    errors.push(`Missing required API keys: ${apiKeyValidation.missing.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Export configuration summary
 */
export const exportConfigSummary = (): {
  toolConfig: ToolSettings;
  availableAPIKeys: string[];
  enabledTools: string[];
  validation: ReturnType<typeof validateToolConfig>;
} => {
  const toolConfigs = getToolConfigs();

  return {
    toolConfig: getToolConfig(),
    availableAPIKeys: getAvailableAPIKeys(),
    enabledTools: toolConfigs.filter(config => config.enabled).map(config => config.name),
    validation: validateToolConfig()
  };
};

/**
 * Environment variable helper for getting boolean value
 */
export const getEnvBoolean = (key: string, defaultValue: boolean = false): boolean => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

/**
 * Environment variable helper for getting number value
 */
export const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Environment variable helper for getting string array
 */
export const getEnvStringArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return parseCommaSeparatedString(value) || defaultValue;
};