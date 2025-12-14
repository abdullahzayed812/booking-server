import { BaseEntity, NotificationType } from "../../../shared/types/common.types";

export interface Notification extends BaseEntity {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    isRead: boolean;
    data?: any;
    readAt?: Date;
}

export interface CreateNotificationDTO {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: any;
}
