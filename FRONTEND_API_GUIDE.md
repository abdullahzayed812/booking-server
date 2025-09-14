# Frontend Development Guide for Booking App API

**Version: 2.0**

## 1. Overview

This document outlines the backend API for the Booking App, a multi-tenant medical appointment scheduling system. It is intended for a frontend developer (or an AI agent) to build the client-side application.

The backend is built with Node.js, Express, and TypeScript. It follows a domain-driven structure and exposes a RESTful API for managing users, patients, doctors, appointments, and more.

### 1.1. Key Architectural Concepts

*   **Multi-Tenancy:** The system is designed to serve multiple tenants (e.g., different hospitals or clinics). All API requests that deal with tenant-specific data **must** include a `X-Tenant-ID` header.
*   **Role-Based Access Control (RBAC):** Access to endpoints is restricted based on user roles (`ADMIN`, `DOCTOR`, `PATIENT`).
*   **Authentication:** Authentication is handled via JSON Web Tokens (JWT).
*   **RESTful Principles:** The API adheres to REST principles, using standard HTTP methods and status codes.
*   **Real-time Updates:** WebSockets are used for real-time communication, such as appointment status changes and notifications.

## 2. Core Data Types

Here are the core TypeScript types that are used throughout the API.

```typescript
// src/shared/types/common.types.ts

export enum UserRole {
  ADMIN = "admin",
  DOCTOR = "doctor",
  PATIENT = "patient",
}

export enum AppointmentStatus {
  SCHEDULED = "scheduled",
  CONFIRMED = "confirmed",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  NO_SHOW = "no_show",
}

export interface BaseEntity {
  id: string; // UUID
  tenant_id: string; // UUID
  created_at: Date;
  updated_at: Date;
}

export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: Date;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
}

export interface Patient extends BaseEntity {
  userId: string;
  medicalRecordNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: string;
  allergies?: string;
  medicalHistory?: string;
}

export interface Doctor extends BaseEntity {
  userId: string;
  specialization: string;
  licenseNumber?: string;
  bio?: string;
  consultationFee?: number;
  consultationDuration: number; // in minutes
  isAcceptingAppointments: boolean;
}

export interface Appointment extends BaseEntity {
  doctorId: string;
  patientId: string;
  appointmentDate: Date;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  status: AppointmentStatus;
  reasonForVisit?: string;
  notes?: string;
  cancellationReason?: string;
}

export interface MedicalNote extends BaseEntity {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  chiefComplaint?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  medications?: string;
}
```

## 3. Authentication

Authentication is token-based. For all protected API requests, the `accessToken` must be included in the `Authorization` header as a Bearer token.

`Authorization: Bearer <accessToken>`

### 3.1. Auth Endpoints (`/api/v1/auth`)

*   #### `POST /register`
    Creates a new user account (typically for patients).

    **Request Body:**
    ```typescript
    interface RegisterPayload {
      email: string;
      password: string; // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
      firstName: string;
      lastName: string;
      phone?: string;
      role: "PATIENT" | "DOCTOR" | "ADMIN";
    }
    ```

    **Response (201 Created):**
    ```json
    { "success": true, "message": "User registered successfully" }
    ```

*   #### `POST /login`
    Authenticates a user and returns tokens.

    **Request Body:**
    ```typescript
    interface LoginPayload {
      email: string;
      password: string;
    }
    ```

    **Response (200 OK):**
    ```typescript
    interface LoginResponse {
      accessToken: string;
      refreshToken: string;
      user: User;
    }
    ```

*   #### `POST /refresh`
    Obtains a new `accessToken` using a `refreshToken`.

    **Request Body:**
    ```typescript
    interface RefreshTokenPayload {
      refreshToken: string;
    }
    ```

    **Response (200 OK):**
    ```typescript
    interface RefreshTokenResponse {
      accessToken: string;
    }
    ```

*   #### `GET /me`
    Retrieves the profile of the currently authenticated user.

    **Response (200 OK):**
    ```typescript
    // Returns the User object
    ```

## 4. API Endpoints

All API endpoints are prefixed with `/api/v1` and require authentication and a `X-Tenant-ID` header.

### 4.1. Patients (`/patients`)

*   #### `GET /`
    Get a list of patients. (Admin/Doctor only)

    **Query Parameters:**
    ```typescript
    interface QueryPatientsParams {
      searchTerm?: string;
      page?: number; // default 1
      limit?: number; // default 20
      sortBy?: "firstName" | "lastName" | "createdAt";
      sortOrder?: "asc" | "desc";
    }
    ```

    **Response (200 OK):**
    ```typescript
    interface GetPatientsResponse {
      patients: Patient[];
      total: number;
    }
    ```

*   #### `GET /:id`
    Get a specific patient's profile.

    **Response (200 OK):**
    ```typescript
    // Returns the Patient object with user details
    interface PatientWithUser extends Patient, User {}
    ```

*   #### `PUT /:id`
    Update a patient's profile information.

    **Request Body:**
    ```typescript
    interface UpdatePatientPayload {
      medicalRecordNumber?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      bloodType?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
      allergies?: string;
      medicalHistory?: string;
    }
    ```

### 4.2. Doctors (`/doctors`)

*   #### `GET /`
    Get a list of doctors.

    **Query Parameters:**
    ```typescript
    interface QueryDoctorsParams {
      specialization?: string;
      isAcceptingAppointments?: boolean;
      page?: number;
      limit?: number;
    }
    ```

    **Response (200 OK):**
    ```typescript
    interface GetDoctorsResponse {
      doctors: Doctor[];
      total: number;
    }
    ```

*   #### `GET /:id`
    Get a specific doctor's profile.

    **Response (200 OK):**
    ```typescript
    // Returns the Doctor object with user details
    interface DoctorWithUser extends Doctor, User {}
    ```

*   #### `GET /:id/availability`
    Get a doctor's weekly schedule.

    **Response (200 OK):**
    ```typescript
    interface AvailabilitySlot {
        dayOfWeek: number; // 0 (Sun) to 6 (Sat)
        startTime: string; // HH:mm
        endTime: string; // HH:mm
    }

    type DoctorAvailabilityResponse = AvailabilitySlot[];
    ```

### 4.3. Appointments (`/appointments`)

*   #### `POST /`
    Create a new appointment.

    **Request Body:**
    ```typescript
    interface CreateAppointmentPayload {
      doctorId: string;
      patientId?: string; // Required if user is not a patient
      appointmentDate: string; // YYYY-MM-DD
      startTime: string; // HH:mm
      endTime: string; // HH:mm
      reasonForVisit?: string;
    }
    ```

    **Response (201 Created):**
    ```typescript
    // Returns the newly created Appointment object with details
    interface AppointmentWithDetails extends Appointment {
      doctorName: string;
      patientName: string;
    }
    ```

*   #### `GET /doctors/:doctorId/available-slots`
    Get available appointment slots for a doctor.

    **Query Parameters:**
    ```typescript
    interface AvailableSlotsParams {
      date: string; // YYYY-MM-DD
      duration: number; // in minutes
    }
    ```

    **Response (200 OK):**
    ```typescript
    interface TimeSlot {
        start: string; // ISO 8601 format
        end: string; // ISO 8601 format
    }

    type AvailableSlotsResponse = TimeSlot[];
    ```

*   #### `POST /:id/cancel`
    Cancel an appointment.

    **Request Body:**
    ```typescript
    interface CancelAppointmentPayload {
      reason: string;
    }
    ```

    **Response (200 OK):**
    ```json
    { "success": true, "message": "Appointment cancelled successfully" }
    ```

## 5. WebSocket Events

The WebSocket server provides real-time updates. The client should connect and listen for:

*   **`appointment_updated`**: Fired when an appointment is created, updated, or cancelled. The payload is the updated `Appointment` object.
*   **`notification`**: Fired for new notifications (e.g., appointment reminders). The payload is a `Notification` object.