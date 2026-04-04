function getZhDateTimeParts(value: string | null) {
  if (!value) {
    return { date: "暂无", time: "" };
  }

  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, ".");

  const timePart = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return {
    date: datePart,
    time: timePart,
  };
}

export function formatDateTime(value: string | null) {
  const { date, time } = getZhDateTimeParts(value);
  return time ? `${date},${time}` : date;
}

export function formatDateTimeZh(value: string | null) {
  const { date, time } = getZhDateTimeParts(value);
  return time ? `${date} ${time}` : date;
}

export function formatDateTimeZhParts(value: string | null) {
  return getZhDateTimeParts(value);
}
