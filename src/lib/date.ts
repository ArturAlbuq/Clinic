export const CLINIC_TIMEZONE = "America/Manaus";

function getClinicUtcOffsetMinutes(date: Date = new Date()) {
  const utcMs = date.getTime();
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    Number(localParts.find((p) => p.type === type)?.value ?? "0");

  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return Math.round((localMs - utcMs) / 60_000);
}

export const CLINIC_UTC_OFFSET_MINUTES = getClinicUtcOffsetMinutes();

type DateLike = Date | string | number;

type ClinicDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLINIC_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLINIC_TIMEZONE,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

function toDate(value: DateLike) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      const [, year, month, day] = match;
      return clinicLocalDateToUtcDate({
        day: Number(day),
        hour: 12,
        month: Number(month),
        year: Number(year),
      });
    }
  }

  return new Date(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getClinicDateParts(value: DateLike = new Date()): ClinicDateParts {
  const date = toDate(value);
  const offsetMinutes = getClinicUtcOffsetMinutes(date);
  const clinicDate = new Date(date.getTime() + offsetMinutes * 60 * 1000);

  return {
    year: clinicDate.getUTCFullYear(),
    month: clinicDate.getUTCMonth() + 1,
    day: clinicDate.getUTCDate(),
    hour: clinicDate.getUTCHours(),
    minute: clinicDate.getUTCMinutes(),
    second: clinicDate.getUTCSeconds(),
    millisecond: clinicDate.getUTCMilliseconds(),
  };
}

export function clinicLocalDateToUtcDate(
  parts: Partial<ClinicDateParts> & Pick<ClinicDateParts, "year" | "month" | "day">,
) {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const millisecond = parts.millisecond ?? 0;

  // First approximation using the module-level offset (avoids cold start cost).
  // Then refine with the actual offset for that approximate UTC instant so DST
  // transitions (if the IANA database ever adds them for this timezone) are
  // handled correctly.
  const approxUtcMs =
    Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond) -
    CLINIC_UTC_OFFSET_MINUTES * 60_000;

  const refinedOffsetMinutes = getClinicUtcOffsetMinutes(new Date(approxUtcMs));

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond) -
      refinedOffsetMinutes * 60_000,
  );
}

export function shiftClinicDate(
  value: DateLike,
  unit: "day" | "month" | "year",
  amount: number,
) {
  const parts = getClinicDateParts(value);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));

  if (unit === "day") {
    shifted.setUTCDate(shifted.getUTCDate() + amount);
  }

  if (unit === "month") {
    shifted.setUTCMonth(shifted.getUTCMonth() + amount);
  }

  if (unit === "year") {
    shifted.setUTCFullYear(shifted.getUTCFullYear() + amount);
  }

  return clinicLocalDateToUtcDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 12,
  });
}

export function formatClock(value: string) {
  return timeFormatter.format(new Date(value));
}

export function formatDate(value: DateLike) {
  return dateFormatter.format(toDate(value));
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatMonthYear(value: DateLike) {
  return monthYearFormatter.format(toDate(value));
}

export function formatMinuteLabel(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value} min`;
}

export function formatDateInputValue(value: DateLike) {
  const parts = getClinicDateParts(value);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function parseDateInput(value?: string) {
  if (!value) {
    return new Date();
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date();
  }

  const [, year, month, day] = match;
  return clinicLocalDateToUtcDate({
    day: Number(day),
    hour: 12,
    month: Number(month),
    year: Number(year),
  });
}

export function getClinicQuarter(value: DateLike) {
  return Math.floor((getClinicDateParts(value).month - 1) / 3) + 1;
}

export function getClinicYear(value: DateLike) {
  return getClinicDateParts(value).year;
}
