import { BaseEntity } from "../../../shared/types/common.types";

export interface AnalyticsReport extends BaseEntity {
    type: string;
    data: any;
    period: string; // "daily", "weekly", "monthly"
    generatedAt: Date;
}
