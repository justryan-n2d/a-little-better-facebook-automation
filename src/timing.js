const START_DATE = '2026-10-07';
const EXPERIMENT_WEEKDAY = 3;
const BASELINE_HOUR = 9;
const EXPERIMENT_HOUR = 18;

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

function dateToDayNumber(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  const date = new Date(`${dateString}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  return {
    date,
    dayNumber: Math.floor(date.getTime() / 86400000)
  };
}

function getDayOfWeek(dateString) {
  return new Date(`${dateString}T12:00:00+08:00`).getUTCDay();
}

function getExperimentWeekOffset(dateString) {
  const start = dateToDayNumber(START_DATE).dayNumber;
  const current = dateToDayNumber(dateString).dayNumber;
  return Math.floor((current - start) / 7);
}

export function getTimingPlan(dateString) {
  const weekday = getDayOfWeek(dateString);
  const weekdayName = DAY_NAMES[weekday];

  if (dateToDayNumber(dateString).dayNumber < dateToDayNumber(START_DATE).dayNumber) {
    return {
      weekday: weekdayName,
      baselineHour: BASELINE_HOUR,
      experimentHour: EXPERIMENT_HOUR,
      selectedHour: BASELINE_HOUR,
      variant: 'baseline'
    };
  }

  if (weekday !== EXPERIMENT_WEEKDAY) {
    return {
      weekday: weekdayName,
      baselineHour: BASELINE_HOUR,
      experimentHour: EXPERIMENT_HOUR,
      selectedHour: BASELINE_HOUR,
      variant: 'baseline'
    };
  }

  const weekOffset = getExperimentWeekOffset(dateString);
  const isExperimentWeek = weekOffset % 2 === 0;

  return {
    weekday: weekdayName,
    baselineHour: BASELINE_HOUR,
    experimentHour: EXPERIMENT_HOUR,
    selectedHour: isExperimentWeek ? EXPERIMENT_HOUR : BASELINE_HOUR,
    variant: isExperimentWeek ? 'experiment' : 'baseline'
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
