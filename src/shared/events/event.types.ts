// Domain event type definitions

export interface BaseEventData {
  [key: string]: any;
}

// User events
export interface UserCreatedEventData extends BaseEventData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface UserUpdatedEventData extends BaseEventData {
  userId: string;
  changes: {
    [field: string]: { old: any; new: any };
  };
}

export interface UserLoginEventData extends BaseEventData {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId: string;
}

// Appointment events
export interface AppointmentCreatedEventData extends BaseEventData {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reasonForVisit?: string;
}

export interface AppointmentUpdatedEventData extends BaseEventData {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  changes: {
    [field: string]: { old: any; new: any };
  };
  updatedBy: string;
}

export interface AppointmentCancelledEventData extends BaseEventData {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  cancellationReason?: string;
  cancelledBy: string;
}

export interface AppointmentConfirmedEventData extends BaseEventData {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  confirmedBy: string;
}

// Doctor events
export interface DoctorAvailabilityUpdatedEventData extends BaseEventData {
  doctorId: string;
  availabilityType: "weekly" | "override";
  changes: {
    added?: any[];
    removed?: any[];
    updated?: any[];
  };
}

export interface DoctorProfileUpdatedEventData extends BaseEventData {
  doctorId: string;
  changes: {
    [field: string]: { old: any; new: any };
  };
}

// Medical note events
export interface MedicalNoteCreatedEventData extends BaseEventData {
  noteId: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  hasConfidentialData: boolean;
}

// Notification events
export interface NotificationCreatedEventData extends BaseEventData {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  channels: string[];
  scheduledFor?: string;
  data?: any;
}

export interface NotificationSentEventData extends BaseEventData {
  notificationId: string;
  userId: string;
  channel: string;
  sentAt: string;
  success: boolean;
  error?: string;
}

// System events
export interface TenantCreatedEventData extends BaseEventData {
  tenantId: string;
  name: string;
  subdomain: string;
  createdBy?: string;
}

// Event data type union
export type EventData =
  | UserCreatedEventData
  | UserUpdatedEventData
  | UserLoginEventData
  | AppointmentCreatedEventData
  | AppointmentUpdatedEventData
  | AppointmentCancelledEventData
  | AppointmentConfirmedEventData
  | DoctorAvailabilityUpdatedEventData
  | DoctorProfileUpdatedEventData
  | MedicalNoteCreatedEventData
  | NotificationCreatedEventData
  | NotificationSentEventData
  | TenantCreatedEventData
  | BaseEventData;
