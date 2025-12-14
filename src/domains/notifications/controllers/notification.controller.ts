import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../../../shared/types/common.types";
import { Notification } from "../models/notification.model";

// Mock data store for now, replacing with DB calls later
const notifications: Notification[] = [];

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        // In a real app, fetch from DB
        const userNotifications = notifications.filter((n) => n.userId === userId);

        const response: ApiResponse<Notification[]> = {
            success: true,
            data: userNotifications,
            message: "Notifications retrieved successfully",
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // In a real app, update DB
        const notification = notifications.find((n) => n.id === id && n.userId === userId);

        if (notification) {
            notification.isRead = true;
            notification.readAt = new Date();
        }

        const response: ApiResponse = {
            success: true,
            message: "Notification marked as read",
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // In a real app, delete from DB
        const index = notifications.findIndex((n) => n.id === id && n.userId === userId);
        if (index !== -1) {
            notifications.splice(index, 1);
        }

        const response: ApiResponse = {
            success: true,
            message: "Notification deleted successfully",
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};
