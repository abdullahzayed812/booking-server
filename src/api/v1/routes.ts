import { Router } from "express";
import { authRoutes } from "@/domains/auth";
// import { appointmentRoutes } from '@/domains/appointments';
// import { doctorRoutes } from '@/domains/doctors';
// import { patientRoutes } from '@/domains/patients';
// import { medicalNoteRoutes } from '@/domains/medical-notes';
// import { notificationRoutes } from '@/domains/notifications';
// import { analyticsRoutes } from '@/domains/analytics';

const router = Router();

// Mount domain routes
router.use("/auth", authRoutes);
// router.use('/appointments', appointmentRoutes);
// router.use('/doctors', doctorRoutes);
// router.use('/patients', patientRoutes);
// router.use('/medical-notes', medicalNoteRoutes);
// router.use('/notifications', notificationRoutes);
// router.use('/analytics', analyticsRoutes);

export default router;
