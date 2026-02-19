import { getLogger, configure } from "log4js";

// Configure log4js
configure({
  appenders: {
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "%d{yyyy-MM-dd hh:mm:ss} [%p] %c: %m",
      },
    },
    file: {
      type: "file",
      filename: "logs/app.log",
      maxLogSize: 10485760, // 10MB
      backups: 5,
      layout: {
        type: "pattern",
        pattern: "%d{yyyy-MM-dd hh:mm:ss} [%p] %c: %m",
      },
    },
  },
  categories: {
    default: {
      appenders: ["console", "file"],
      level: "info",
    },
  },
});

// Export logger factory function
export const createLogger = (category: string) => {
  return getLogger(category);
};

// Export default logger
export const logger = getLogger("app");
