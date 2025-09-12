import { BaseEntity } from "./common.types";

// Tenant interface
export interface Tenant extends BaseEntity {
  name: string;
  subdomain: string;
  settings: TenantSettings;
  isActive: boolean;
  deletedAt?: Date;
}

// Tenant settings interface
export interface TenantSettings {
  timezone: string;
  businessHours: {
    start: string; // HH:mm format
    end: string; // HH:mm format
  };
  appointmentDuration: number; // minutes
  features: TenantFeature[];
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    companyName?: string;
  };
  notifications?: {
    emailReminders: boolean;
    smsReminders: boolean;
    reminderMinutes: number[];
  };
  integration?: {
    emailProvider?: "smtp" | "sendgrid" | "mailgun";
    smsProvider?: "twilio" | "vonage";
    paymentProvider?: "stripe" | "paypal";
  };
  security?: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    sessionTimeout: number; // minutes
    maxLoginAttempts: number;
    lockoutDuration: number; // minutes
  };
}

// Available tenant features
export enum TenantFeature {
  APPOINTMENTS = "appointments",
  MEDICAL_NOTES = "medical_notes",
  NOTIFICATIONS = "notifications",
  ANALYTICS = "analytics",
  PAYMENT_PROCESSING = "payment_processing",
  VIDEO_CALLS = "video_calls",
  PRESCRIPTION_MANAGEMENT = "prescription_management",
  PATIENT_PORTAL = "patient_portal",
  MULTI_LOCATION = "multi_location",
  CUSTOM_BRANDING = "custom_branding",
}

// Tenant creation data
export interface CreateTenantData {
  name: string;
  subdomain: string;
  settings?: Partial<TenantSettings>;
  adminUser: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  };
}

// Tenant update data
export interface UpdateTenantData {
  name?: string;
  subdomain?: string;
  settings?: Partial<TenantSettings>;
  isActive?: boolean;
}

// Tenant subscription plans (for future use)
export enum SubscriptionPlan {
  BASIC = "basic",
  PROFESSIONAL = "professional",
  ENTERPRISE = "enterprise",
}

export interface TenantSubscription {
  id: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: "active" | "canceled" | "past_due" | "trialing";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  features: TenantFeature[];
  limits: {
    maxDoctors: number;
    maxPatients: number;
    maxAppointmentsPerMonth: number;
    storageLimit: number; // in MB
  };
}

// Tenant analytics data
export interface TenantAnalytics {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalAppointments: number;
    totalPatients: number;
    totalDoctors: number;
    appointmentsByStatus: Record<string, number>;
    appointmentsBySpecialization: Record<string, number>;
    revenue?: number;
    averageRating?: number;
  };
}

// Tenant context for requests
export interface TenantContext {
  tenant: Tenant;
  subscription?: TenantSubscription;
  analytics?: TenantAnalytics;
}

// Default tenant settings
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  timezone: "UTC",
  businessHours: {
    start: "09:00",
    end: "17:00",
  },
  appointmentDuration: 30,
  features: [TenantFeature.APPOINTMENTS, TenantFeature.MEDICAL_NOTES, TenantFeature.NOTIFICATIONS],
  notifications: {
    emailReminders: true,
    smsReminders: false,
    reminderMinutes: [60, 1440], // 1 hour and 1 day
  },
  security: {
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: true,
    },
    sessionTimeout: 480, // 8 hours
    maxLoginAttempts: 5,
    lockoutDuration: 15, // 15 minutes
  },
};
