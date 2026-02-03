/**
 * Logger utility with environment-based log gating
 * Only logs in development or when VITE_DEBUG is enabled
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Check if we should enable logging
const isDev = import.meta.env.DEV;
const debugEnabled = import.meta.env.VITE_DEBUG === 'true';
const logLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'warn';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const shouldLog = (level: LogLevel): boolean => {
  // Always log errors in production
  if (level === 'error') return true;
  
  // In production without debug flag, only log warnings and errors
  if (!isDev && !debugEnabled) {
    return LOG_LEVELS[level] >= LOG_LEVELS.warn;
  }
  
  // In dev or with debug flag, respect the log level setting
  return LOG_LEVELS[level] >= LOG_LEVELS[logLevel];
};

/**
 * Development-only debug logging
 * Use for verbose output that should never appear in production
 */
export const debug = (context: string, ...args: unknown[]): void => {
  if (shouldLog('debug')) {
    console.debug(`[${context}]`, ...args);
  }
};

/**
 * Informational logging
 * Use for general operational messages
 */
export const info = (context: string, ...args: unknown[]): void => {
  if (shouldLog('info')) {
    console.info(`[${context}]`, ...args);
  }
};

/**
 * Warning logging
 * Use for recoverable issues or deprecation notices
 */
export const warn = (context: string, ...args: unknown[]): void => {
  if (shouldLog('warn')) {
    console.warn(`[${context}]`, ...args);
  }
};

/**
 * Error logging
 * Always logged - use for unexpected failures
 */
export const error = (context: string, ...args: unknown[]): void => {
  // Errors are always logged
  console.error(`[${context}]`, ...args);
};

/**
 * Generic log function with level parameter
 */
export const log = (level: LogLevel, context: string, ...args: unknown[]): void => {
  switch (level) {
    case 'debug':
      debug(context, ...args);
      break;
    case 'info':
      info(context, ...args);
      break;
    case 'warn':
      warn(context, ...args);
      break;
    case 'error':
      error(context, ...args);
      break;
  }
};

export const logger = {
  debug,
  info,
  warn,
  error,
  log,
};

export default logger;
