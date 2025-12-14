import { Router } from "express";
import { getNotifications, markAsRead, deleteNotification } from "../controllers/notification.controller";
import { authenticateToken } from "../../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.get("/", getNotifications);
router.put("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export const notificationRoutes = router;
