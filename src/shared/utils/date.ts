import moment from "moment-timezone";
import { DateTimeSlot, TimeSlot, DayOfWeek } from "@/shared/types/common.types";

// Default timezone (can be overridden per tenant)
const DEFAULT_TIMEZONE = "UTC";

// Date formatting utilities
export const formatDate = (date: Date, format: string = "YYYY-MM-DD", timezone: string = DEFAULT_TIMEZONE): string => {
  return moment(date).tz(timezone).format(format);
};

export const formatDateTime = (
  date: Date,
  format: string = "YYYY-MM-DD HH:mm:ss",
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return moment(date).tz(timezone).format(format);
};

export const formatTime = (date: Date, format: string = "HH:mm", timezone: string = DEFAULT_TIMEZONE): string => {
  return moment(date).tz(timezone).format(format);
};

// Date parsing utilities
export const parseDate = (dateString: string, timezone: string = DEFAULT_TIMEZONE): Date => {
  return moment.tz(dateString, timezone).toDate();
};

export const parseDateTime = (dateTimeString: string, timezone: string = DEFAULT_TIMEZONE): Date => {
  return moment.tz(dateTimeString, timezone).toDate();
};

// Time utilities
export const parseTimeString = (timeString: string): { hours: number; minutes: number } => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return { hours, minutes };
};

export const timeStringToMinutes = (timeString: string): number => {
  const { hours, minutes } = parseTimeString(timeString);
  return hours * 60 + minutes;
};

export const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

// Date validation
export const isValidDate = (date: any): boolean => {
  return moment(date).isValid();
};

export const isValidTimeString = (timeString: string): boolean => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString);
};

// Date comparison
export const isSameDate = (date1: Date, date2: Date, timezone: string = DEFAULT_TIMEZONE): boolean => {
  return moment(date1).tz(timezone).isSame(moment(date2).tz(timezone), "day");
};

export const isDateInPast = (date: Date, timezone: string = DEFAULT_TIMEZONE): boolean => {
  return moment(date).tz(timezone).isBefore(moment().tz(timezone), "day");
};

export const isDateInFuture = (date: Date, timezone: string = DEFAULT_TIMEZONE): boolean => {
  return moment(date).tz(timezone).isAfter(moment().tz(timezone), "day");
};

export const isToday = (date: Date, timezone: string = DEFAULT_TIMEZONE): boolean => {
  return moment(date).tz(timezone).isSame(moment().tz(timezone), "day");
};

// Time slot utilities
export const createDateTimeSlot = (
  date: Date,
  timeSlot: TimeSlot,
  timezone: string = DEFAULT_TIMEZONE
): DateTimeSlot => {
  const startTime = parseTimeString(timeSlot.start);
  const endTime = parseTimeString(timeSlot.end);

  const start = moment(date)
    .tz(timezone)
    .hour(startTime.hours)
    .minute(startTime.minutes)
    .second(0)
    .millisecond(0)
    .toDate();

  const end = moment(date).tz(timezone).hour(endTime.hours).minute(endTime.minutes).second(0).millisecond(0).toDate();

  return { start, end };
};

export const getTimeSlotDuration = (timeSlot: TimeSlot): number => {
  const startMinutes = timeStringToMinutes(timeSlot.start);
  const endMinutes = timeStringToMinutes(timeSlot.end);
  return endMinutes - startMinutes;
};

export const timeSlotOverlaps = (slot1: TimeSlot, slot2: TimeSlot): boolean => {
  const start1 = timeStringToMinutes(slot1.start);
  const end1 = timeStringToMinutes(slot1.end);
  const start2 = timeStringToMinutes(slot2.start);
  const end2 = timeStringToMinutes(slot2.end);

  return start1 < end2 && start2 < end1;
};

export const dateTimeSlotOverlaps = (slot1: DateTimeSlot, slot2: DateTimeSlot): boolean => {
  return slot1.start < slot2.end && slot2.start < slot1.end;
};

// Day of week utilities
export const getDayOfWeek = (date: Date, timezone: string = DEFAULT_TIMEZONE): DayOfWeek => {
  return moment(date).tz(timezone).day() as DayOfWeek;
};

export const getDayName = (dayOfWeek: DayOfWeek): string => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dayOfWeek];
};

// Business day utilities
export const isBusinessDay = (date: Date, timezone: string = DEFAULT_TIMEZONE): boolean => {
  const dayOfWeek = getDayOfWeek(date, timezone);
  return dayOfWeek >= DayOfWeek.MONDAY && dayOfWeek <= DayOfWeek.FRIDAY;
};

export const getNextBusinessDay = (date: Date, timezone: string = DEFAULT_TIMEZONE): Date => {
  let nextDay = moment(date).tz(timezone).add(1, "day");

  while (!isBusinessDay(nextDay.toDate(), timezone)) {
    nextDay = nextDay.add(1, "day");
  }

  return nextDay.toDate();
};

export const addBusinessDays = (date: Date, days: number, timezone: string = DEFAULT_TIMEZONE): Date => {
  let result = moment(date).tz(timezone);
  let addedDays = 0;

  while (addedDays < days) {
    result = result.add(1, "day");
    if (isBusinessDay(result.toDate(), timezone)) {
      addedDays++;
    }
  }

  return result.toDate();
};

// Working hours utilities
export const isWithinWorkingHours = (time: string, startTime: string = "09:00", endTime: string = "17:00"): boolean => {
  const timeMinutes = timeStringToMinutes(time);
  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);

  return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
};

// Appointment scheduling utilities
export const generateTimeSlots = (
  startTime: string,
  endTime: string,
  duration: number = 30,
  gap: number = 0
): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);

  let currentMinutes = startMinutes;

  while (currentMinutes + duration <= endMinutes) {
    const slotEnd = currentMinutes + duration;

    slots.push({
      start: minutesToTimeString(currentMinutes),
      end: minutesToTimeString(slotEnd),
    });

    currentMinutes = slotEnd + gap;
  }

  return slots;
};

// Reminder scheduling
export const getAppointmentReminderTime = (appointmentDateTime: Date, minutesBefore: number = 30): Date => {
  return moment(appointmentDateTime).subtract(minutesBefore, "minutes").toDate();
};

// Timezone utilities
export const convertToTimezone = (date: Date, fromTimezone: string, toTimezone: string): Date => {
  return moment.tz(date, fromTimezone).tz(toTimezone).toDate();
};

export const getTimezoneOffset = (timezone: string): number => {
  return moment.tz(timezone).utcOffset();
};

// Age calculation
export const calculateAge = (birthDate: Date): number => {
  return moment().diff(moment(birthDate), "years");
};

// Date range utilities
export const getDateRange = (startDate: Date, endDate: Date): Date[] => {
  const dates: Date[] = [];
  let currentDate = moment(startDate);
  const lastDate = moment(endDate);

  while (currentDate.isSameOrBefore(lastDate)) {
    dates.push(currentDate.toDate());
    currentDate = currentDate.add(1, "day");
  }

  return dates;
};

export const getWeekDateRange = (date: Date, timezone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } => {
  const start = moment(date).tz(timezone).startOf("week").toDate();
  const end = moment(date).tz(timezone).endOf("week").toDate();
  return { start, end };
};

export const getMonthDateRange = (date: Date, timezone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } => {
  const start = moment(date).tz(timezone).startOf("month").toDate();
  const end = moment(date).tz(timezone).endOf("month").toDate();
  return { start, end };
};
