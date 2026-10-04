const DAILY_HOUR = 16;

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

function validateDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  const date = new Date(`${dateString}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  return date;
}

function getDayOfWeek(dateString) {
  return validateDate(dateString).getUTCDay();
}

export function getTimingPlan(dateString) {
  const weekday = getDayOfWeek(dateString);

  return {
    weekday: DAY_NAMES[weekday],
    selectedHour: DAILY_HOUR,
    variant: 'standard'
  };
}

export function getTimingVariant(dateString) {
  return getTimingPlan(dateString).variant;
}

export function shouldPublishAtHour(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));

  const localDate = dateFormatter.format(date);
  return hour === getTimingPlan(localDate).selectedHour;
}
