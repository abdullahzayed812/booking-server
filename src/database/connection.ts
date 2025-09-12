// Re-export database connection for convenience
export { db } from "@/shared/config/database";

// Database utility functions
import { db } from "@/shared/config/database";
import { createModuleLogger } from "@/shared/config/logger";

const moduleLogger = createModuleLogger("Database");

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await db.query("SELECT 1 as test");
    moduleLogger.info("Database connection test successful");
    return true;
  } catch (error: any) {
    moduleLogger.error("Database connection test failed:", error);
    return false;
  }
};

// Get database information
export const getDatabaseInfo = async (): Promise<any> => {
  try {
    const [version] = await db.query("SELECT VERSION() as version");
    const [status] = await db.query('SHOW STATUS LIKE "Threads_connected"');
    const [processlist] = await db.query("SHOW PROCESSLIST");

    return {
      version: version.version,
      connections: status.Value,
      processes: processlist.length,
    };
  } catch (error: any) {
    moduleLogger.error("Failed to get database info:", error);
    throw error;
  }
};

// Check if tables exist
export const checkTables = async (): Promise<{ table: string; exists: boolean }[]> => {
  const requiredTables = [
    "tenants",
    "users",
    "doctors",
    "patients",
    "appointments",
    "doctor_availability",
    "availability_overrides",
    "medical_notes",
    "notifications",
    "audit_logs",
    "user_sessions",
  ];

  const results = [];

  for (const table of requiredTables) {
    try {
      await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
      results.push({ table, exists: true });
    } catch (error) {
      results.push({ table, exists: false });
    }
  }

  return results;
};
