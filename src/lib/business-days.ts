export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return result;
}
