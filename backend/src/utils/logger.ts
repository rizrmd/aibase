import pino from 'pino';
import { join } from 'path';
import { mkdir } from 'fs/promises';

// Get log level from environment variable (default: 'info')
const logLevel = process.env.LOG_LEVEL || 'info';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create logs directory if it doesn't exist
const logsDir = process.env.LOGS_DIR || './data/backend/logs';

// Ensure logs directory exists
mkdir(logsDir, { recursive: true }).catch(() => {});

// Log file paths
const logFile = join(logsDir, 'backend.log');
const errorLogFile = join(logsDir, 'backend-error.log');

// Configure pino with rotation support
const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
        destination: logFile,
        mkdir: true,
      },
    }
  : {
      targets: [
        {
          level: 'error',
          target: 'pino/file',
          options: {
            destination: errorLogFile,
            mkdir: true,
          },
        },
        {
          level: logLevel,
          target: 'pino/file',
          options: {
            destination: logFile,
            mkdir: true,
          },
        },
      ],
    };

export const logger = pino(
  {
    level: logLevel,
    formatters: {
      level: (label) => {
        return { level: label };
      },
      log(object) {
        // Add timestamp to all logs
        return { ...object, time: new Date().toISOString() };
      },
    },
    timestamp: false, // We add it in the formatter
    serializers: {
      error: pino.stdSerializers.err,
    },
  },
  pino.transport(transport as any)
);

// Create child loggers with context
export function createLogger(context: string) {
  return logger.child({ context });
}

// Export default logger
export default logger;
