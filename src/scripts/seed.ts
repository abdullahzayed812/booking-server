import { db } from "@/shared/config/database";
import { logger } from "@/shared/config/logger";
import { hashPassword } from "@/shared/utils/crypto";
import { UserRole } from "@/shared/types/common.types";

class DatabaseSeeder {
  async run(): Promise<void> {
    try {
      logger.info("🌱 Starting database seeding...");

      // Check if data already exists
      const existingTenants = await db.query("SELECT COUNT(*) as count FROM tenants");
      if (existingTenants[0].count > 0) {
        logger.info("📋 Database already contains data. Use --force to reseed.");
        return;
      }

      await this.seedTenants();
      await this.seedUsers();
      await this.seedDoctors();
      await this.seedPatients();
      await this.seedDoctorAvailability();
      await this.seedAppointments();

      logger.info("🎉 Database seeding completed successfully!");
    } catch (error: any) {
      logger.error("❌ Seeding failed:", error);
      process.exit(1);
    }
  }

  private async seedTenants(): Promise<void> {
    logger.info("📋 Seeding tenants...");

    const tenants = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Medical Center Demo",
        subdomain: "demo",
        settings: JSON.stringify({
          timezone: "America/New_York",
          businessHours: { start: "08:00", end: "18:00" },
          appointmentDuration: 30,
          features: ["appointments", "medical_notes", "notifications"],
        }),
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "City Health Clinic",
        subdomain: "cityhealth",
        settings: JSON.stringify({
          timezone: "America/Los_Angeles",
          businessHours: { start: "07:00", end: "19:00" },
          appointmentDuration: 45,
          features: ["appointments", "medical_notes", "notifications", "analytics"],
        }),
      },
    ];

    for (const tenant of tenants) {
      await db.query("INSERT INTO tenants (id, name, subdomain, settings) VALUES (?, ?, ?, ?)", [
        tenant.id,
        tenant.name,
        tenant.subdomain,
        tenant.settings,
      ]);
    }

    logger.info(`✅ Seeded ${tenants.length} tenants`);
  }

  private async seedUsers(): Promise<void> {
    logger.info("👥 Seeding users...");

    const users = [
      // Tenant 1 users
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "admin@demo.medicenter.com",
        password: "Admin123!",
        first_name: "System",
        last_name: "Administrator",
        role: UserRole.ADMIN,
        is_verified: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "dr.smith@demo.medicenter.com",
        password: "Doctor123!",
        first_name: "John",
        last_name: "Smith",
        phone: "+1-555-0101",
        role: UserRole.DOCTOR,
        is_verified: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440012",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "dr.johnson@demo.medicenter.com",
        password: "Doctor123!",
        first_name: "Sarah",
        last_name: "Johnson",
        phone: "+1-555-0102",
        role: UserRole.DOCTOR,
        is_verified: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440013",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "patient1@demo.medicenter.com",
        password: "Patient123!",
        first_name: "Alice",
        last_name: "Wilson",
        phone: "+1-555-0201",
        date_of_birth: "1985-06-15",
        role: UserRole.PATIENT,
        is_verified: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440014",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "patient2@demo.medicenter.com",
        password: "Patient123!",
        first_name: "Bob",
        last_name: "Davis",
        phone: "+1-555-0202",
        date_of_birth: "1978-03-22",
        role: UserRole.PATIENT,
        is_verified: true,
      },
    ];

    for (const user of users) {
      const hashedPassword = await hashPassword(user.password);

      await db.query(
        `INSERT INTO users (
          id, tenant_id, email, password_hash, first_name, last_name, 
          phone, date_of_birth, role, is_active, is_verified, 
          email_verified_at, last_login_at, password_changed_at, token_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.tenant_id,
          user.email,
          hashedPassword,
          user.first_name,
          user.last_name,
          user.phone || null,
          user.date_of_birth || null,
          user.role,
          true, // is_active
          user.is_verified,
          user.is_verified ? new Date() : null,
          null, // last_login_at
          new Date(), // password_changed_at
          0, // token_version
        ]
      );
    }

    logger.info(`✅ Seeded ${users.length} users`);
  }

  private async seedDoctors(): Promise<void> {
    logger.info("👨‍⚕️ Seeding doctors...");

    const doctors = [
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        specialization: "Internal Medicine",
        license_number: "MD123456",
        bio: "Dr. John Smith is an experienced internal medicine physician with over 15 years of practice.",
        consultation_fee: 150.0,
        consultation_duration: 30,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440012",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        specialization: "Cardiology",
        license_number: "MD789012",
        bio: "Dr. Sarah Johnson specializes in cardiovascular health and preventive cardiology.",
        consultation_fee: 200.0,
        consultation_duration: 45,
      },
    ];

    for (const doctor of doctors) {
      await db.query(
        `INSERT INTO doctors (
          id, tenant_id, specialization, license_number, bio, 
          consultation_fee, consultation_duration, is_accepting_appointments
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doctor.id,
          doctor.tenant_id,
          doctor.specialization,
          doctor.license_number,
          doctor.bio,
          doctor.consultation_fee,
          doctor.consultation_duration,
          true,
        ]
      );
    }

    logger.info(`✅ Seeded ${doctors.length} doctors`);
  }

  private async seedPatients(): Promise<void> {
    logger.info("🏥 Seeding patients...");

    const patients = [
      {
        id: "550e8400-e29b-41d4-a716-446655440013",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        medical_record_number: "MRN001",
        emergency_contact_name: "John Wilson",
        emergency_contact_phone: "+1-555-0301",
        blood_type: "A+",
        allergies: "Penicillin, Shellfish",
        medical_history: "Hypertension, managed with medication",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440014",
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        medical_record_number: "MRN002",
        emergency_contact_name: "Mary Davis",
        emergency_contact_phone: "+1-555-0302",
        blood_type: "O-",
        allergies: "None known",
        medical_history: "Diabetes Type 2, diet controlled",
      },
    ];

    for (const patient of patients) {
      await db.query(
        `INSERT INTO patients (
          id, tenant_id, medical_record_number, emergency_contact_name,
          emergency_contact_phone, blood_type, allergies, medical_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patient.id,
          patient.tenant_id,
          patient.medical_record_number,
          patient.emergency_contact_name,
          patient.emergency_contact_phone,
          patient.blood_type,
          patient.allergies,
          patient.medical_history,
        ]
      );
    }

    logger.info(`✅ Seeded ${patients.length} patients`);
  }

  private async seedDoctorAvailability(): Promise<void> {
    logger.info("📅 Seeding doctor availability...");

    const availabilities = [
      // Dr. Smith - Monday to Friday, 9 AM to 5 PM
      ...Array.from({ length: 5 }, (_, i) => ({
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        doctor_id: "550e8400-e29b-41d4-a716-446655440011",
        day_of_week: i + 1, // 1 = Monday
        start_time: "09:00:00",
        end_time: "17:00:00",
      })),
      // Dr. Johnson - Monday to Friday, 8 AM to 6 PM
      ...Array.from({ length: 5 }, (_, i) => ({
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        doctor_id: "550e8400-e29b-41d4-a716-446655440012",
        day_of_week: i + 1, // 1 = Monday
        start_time: "08:00:00",
        end_time: "18:00:00",
      })),
    ];

    for (const availability of availabilities) {
      await db.query(
        `INSERT INTO doctor_availability (
          tenant_id, doctor_id, day_of_week, start_time, end_time, is_active
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          availability.tenant_id,
          availability.doctor_id,
          availability.day_of_week,
          availability.start_time,
          availability.end_time,
          true,
        ]
      );
    }

    logger.info(`✅ Seeded ${availabilities.length} availability slots`);
  }

  private async seedAppointments(): Promise<void> {
    logger.info("📝 Seeding sample appointments...");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split("T")[0];

    const appointments = [
      {
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        doctor_id: "550e8400-e29b-41d4-a716-446655440011",
        patient_id: "550e8400-e29b-41d4-a716-446655440013",
        appointment_date: tomorrowStr,
        start_time: "10:00:00",
        end_time: "10:30:00",
        status: "confirmed",
        reason_for_visit: "Annual checkup",
      },
      {
        tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        doctor_id: "550e8400-e29b-41d4-a716-446655440012",
        patient_id: "550e8400-e29b-41d4-a716-446655440014",
        appointment_date: nextWeekStr,
        start_time: "14:00:00",
        end_time: "14:45:00",
        status: "scheduled",
        reason_for_visit: "Cardiology consultation",
      },
    ];

    for (const appointment of appointments) {
      await db.query(
        `INSERT INTO appointments (
          tenant_id, doctor_id, patient_id, appointment_date,
          start_time, end_time, status, reason_for_visit,
          notes, cancellation_reason, cancelled_by, cancelled_at, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appointment.tenant_id,
          appointment.doctor_id,
          appointment.patient_id,
          appointment.appointment_date,
          appointment.start_time,
          appointment.end_time,
          appointment.status,
          appointment.reason_for_visit,
          null, // notes
          null, // cancellation_reason
          null, // cancelled_by
          null, // cancelled_at
          appointment.status === "confirmed" ? new Date() : null, // confirmed_at
        ]
      );
    }
  }

  async clear(): Promise<void> {
    logger.info("🗑️ Clearing database...");

    const tables = [
      "medical_notes",
      "appointments",
      "availability_overrides",
      "doctor_availability",
      "notifications",
      "audit_logs",
      "user_sessions",
      "patients",
      "doctors",
      "users",
      "tenants",
    ];

    // Disable foreign key checks temporarily
    await db.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of tables) {
      try {
        await db.query(`DELETE FROM ${table}`);
        logger.info(`✅ Cleared table: ${table}`);
      } catch (error: any) {
        logger.warn(`⚠️ Could not clear table ${table}:`, error);
      }
    }

    // Re-enable foreign key checks
    await db.query("SET FOREIGN_KEY_CHECKS = 1");

    logger.info("🎉 Database cleared successfully!");
  }
}

// CLI handling
async function main() {
  const command = process.argv[2];
  const seeder = new DatabaseSeeder();

  switch (command) {
    case "run":
    case undefined:
      await seeder.run();
      break;
    case "clear":
      await seeder.clear();
      break;
    case "fresh":
      await seeder.clear();
      await seeder.run();
      break;
    default:
      logger.info("Usage: npm run seed [run|clear|fresh]");
      logger.info("  run   - Seed the database with sample data (default)");
      logger.info("  clear - Clear all data from database");
      logger.info("  fresh - Clear database and re-seed with fresh data");
      break;
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("Seed script failed:", error);
    process.exit(1);
  });
}
