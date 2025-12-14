import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../../../shared/types/common.types";

export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Mock data
        const stats = {
            totalAppointments: 150,
            totalPatients: 45,
            totalDoctors: 12,
            revenue: 5000,
        };

        const response: ApiResponse = {
            success: true,
            data: stats,
            message: "Dashboard stats retrieved successfully",
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const getAppointmentTrends = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Mock data
        const trends = [
            { date: "2023-01-01", count: 5 },
            { date: "2023-01-02", count: 8 },
            { date: "2023-01-03", count: 12 },
        ];

        const response: ApiResponse = {
            success: true,
            data: trends,
            message: "Appointment trends retrieved successfully",
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};
