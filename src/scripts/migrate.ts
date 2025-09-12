import { promises as fs } from "fs";
import path from "path";
import { db } from "@/shared/config/database";
import { logger } from "@/shared/config/logger";

interface Migration {
  id: number;
  filename: string;
  executed_at?: Date;
}

class MigrationRunner {
  private migrationsPath = path.join(__dirname, "../src/database/migrations");
  private tableName = "migrations";

  async run(): Promise<void> {
    try {
      logger.info("🔄 Starting database migrations...");

      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();

      // Get migration files
      const migrationFiles = await this.getMigrationFiles();

      // Get executed migrations
      const executedMigrations = await this.getExecutedMigrations();

      // Filter pending migrations
      const pendingMigrations = migrationFiles.filter((file) => !executedMigrations.some((m) => m.filename === file));

      if (pendingMigrations.length === 0) {
        logger.info("✅ No pending migrations found");
        return;
      }

      logger.info(`📋 Found ${pendingMigrations.length} pending migrations`);

      // Execute pending migrations
      for (const migrationFile of pendingMigrations) {
        await this.executeMigration(migrationFile);
      }

      logger.info("🎉 All migrations completed successfully!");
    } catch (error: any) {
      logger.error("❌ Migration failed:", error);
      process.exit(1);
    }
  }

  private async createMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_filename (filename)
      )
    `;

    await db.query(sql);
    logger.debug("Migrations table ready");
  }

  private async getMigrationFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files.filter((file) => file.endsWith(".sql")).sort(); // Ensure proper order
    } catch (error: any) {
      logger.error("Failed to read migrations directory:", error);
      throw error;
    }
  }

  private async getExecutedMigrations(): Promise<Migration[]> {
    try {
      return await db.query<Migration>(`SELECT * FROM ${this.tableName} ORDER BY id`);
    } catch (error: any) {
      // Table might not exist yet
      return [];
    }
  }

  private async executeMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsPath, filename);

    try {
      logger.info(`⚡ Executing migration: ${filename}`);

      // Read migration file
      const sqlContent = await fs.readFile(filePath, "utf-8");

      // Split by semicolon and filter out empty statements
      const statements = sqlContent
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      // Execute each statement in a transaction
      await db.transaction(async (connection) => {
        for (const statement of statements) {
          await db.executeTransaction(statement, [], connection);
        }

        // Record migration as executed
        await db.executeTransaction(`INSERT INTO ${this.tableName} (filename) VALUES (?)`, [filename], connection);
      });

      logger.info(`✅ Migration completed: ${filename}`);
    } catch (error: any) {
      logger.error(`❌ Migration failed: ${filename}`, error);
      throw error;
    }
  }

  async rollback(steps: number = 1): Promise<void> {
    try {
      logger.info(`🔄 Rolling back ${steps} migration(s)...`);

      const executedMigrations = await db.query<Migration>(`SELECT * FROM ${this.tableName} ORDER BY id DESC LIMIT ?`, [
        steps,
      ]);

      if (executedMigrations.length === 0) {
        logger.info("✅ No migrations to rollback");
        return;
      }

      for (const migration of executedMigrations) {
        await this.rollbackMigration(migration);
      }

      logger.info("🎉 Rollback completed successfully!");
    } catch (error: any) {
      logger.error("❌ Rollback failed:", error);
      process.exit(1);
    }
  }

  private async rollbackMigration(migration: Migration): Promise<void> {
    try {
      logger.info(`⚡ Rolling back migration: ${migration.filename}`);

      // Look for rollback file (e.g., 001_create_users.rollback.sql)
      const rollbackFilename = migration.filename.replace(".sql", ".rollback.sql");
      const rollbackFilePath = path.join(this.migrationsPath, rollbackFilename);

      try {
        const rollbackSql = await fs.readFile(rollbackFilePath, "utf-8");

        // Execute rollback in transaction
        await db.transaction(async (connection) => {
          const statements = rollbackSql
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0);

          for (const statement of statements) {
            await db.executeTransaction(statement, [], connection);
          }

          // Remove migration record
          await db.executeTransaction(`DELETE FROM ${this.tableName} WHERE id = ?`, [migration.id], connection);
        });

        logger.info(`✅ Rollback completed: ${migration.filename}`);
      } catch (error: any) {
        if ((error as any).code === "ENOENT") {
          logger.warn(`⚠️ No rollback file found for: ${migration.filename}`);
          logger.warn("Manual rollback may be required");
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      logger.error(`❌ Rollback failed: ${migration.filename}`, error);
      throw error;
    }
  }

  async status(): Promise<void> {
    try {
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();

      logger.info("📋 Migration Status:");
      logger.info(`Total migration files: ${migrationFiles.length}`);
      logger.info(`Executed migrations: ${executedMigrations.length}`);

      const pendingMigrations = migrationFiles.filter((file) => !executedMigrations.some((m) => m.filename === file));

      if (pendingMigrations.length > 0) {
        logger.info(`Pending migrations: ${pendingMigrations.length}`);
        pendingMigrations.forEach((file) => logger.info(`  - ${file}`));
      } else {
        logger.info("✅ All migrations are up to date");
      }
    } catch (error: any) {
      logger.error("❌ Failed to get migration status:", error);
      process.exit(1);
    }
  }
}

// CLI handling
async function main() {
  const command = process.argv[2];
  const migrationRunner = new MigrationRunner();

  switch (command) {
    case "up":
      await migrationRunner.run();
      break;
    case "down":
      const steps = parseInt(process.argv[3]) || 1;
      await migrationRunner.rollback(steps);
      break;
    case "status":
      await migrationRunner.status();
      break;
    default:
      logger.info("Usage: npm run migrate [up|down|status] [steps]");
      logger.info("  up     - Run pending migrations");
      logger.info("  down   - Rollback migrations (default: 1 step)");
      logger.info("  status - Show migration status");
      break;
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("Migration script failed:", error);
    process.exit(1);
  });
}
