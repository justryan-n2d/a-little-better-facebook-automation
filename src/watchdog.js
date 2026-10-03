export const DEFAULT_MAX_ATTEMPTS = 3;

const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

function toTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`Invalid date/time: ${value}`);
  return time;
}

function isActive(run) {
  return ACTIVE_STATUSES.has(run?.status);
}

function isSuccessful(run) {
  return run?.status === 'completed' && run?.conclusion === 'success';
}

function isFromDate(run, today) {
  try {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(run.created_at));
    return date === today;
  } catch {
    return false;
  }
}

function resultForCompletedFailure(run, maxAttempts) {
  if (run.run_attempt >= maxAttempts) {
    return { type: 'alert', runId: run.id, reason: 'max-retries-reached' };
  }

  const failedJobNames = Array.isArray(run.failedJobNames) ? run.failedJobNames : [];
  if (failedJobNames.length > 0 && failedJobNames.every(name => name === 'record')) {
    return { type: 'rerun-failed-jobs', runId: run.id, reason: 'record-job-failure' };
  }

  return { type: 'alert', runId: run.id, reason: 'publish-job-failure' };
}

export function decideWatchdogAction({
  now,
  today,
  scheduleHour = 9,
  scheduleMinute = 0,
  graceMinutes = 60,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  runs = []
}) {
  const todayRuns = runs
    .filter(run => isFromDate(run, today))
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at));

  const latestScheduled = todayRuns.filter(run => run.event === 'schedule')[0];
  const latestRecovery = todayRuns.filter(run => run.event === 'repository_dispatch')[0];

  if (latestScheduled) {
    if (isActive(latestScheduled)) {
      return { type: 'wait', reason: 'daily-run-active', runId: latestScheduled.id };
    }
    if (isSuccessful(latestScheduled)) {
      return { type: 'healthy', runId: latestScheduled.id };
    }
    if (latestScheduled.status === 'completed' && latestScheduled.conclusion === 'failure') {
      return resultForCompletedFailure(latestScheduled, maxAttempts);
    }
    return { type: 'alert', runId: latestScheduled.id, reason: 'daily-run-not-successful' };
  }

  if (latestRecovery) {
    if (isActive(latestRecovery)) {
      return { type: 'wait', reason: 'recovery-run-active', runId: latestRecovery.id };
    }
    if (isSuccessful(latestRecovery)) {
      return { type: 'healthy', runId: latestRecovery.id };
    }
    if (latestRecovery.status === 'completed' && latestRecovery.conclusion === 'failure') {
      return resultForCompletedFailure(latestRecovery, maxAttempts);
    }
    return { type: 'alert', runId: latestRecovery.id, reason: 'recovery-run-not-successful' };
  }

  const scheduleMs = toTime(`${today}T${String(scheduleHour).padStart(2, '0')}:${String(scheduleMinute).padStart(2, '0')}:00+08:00`);
  const nowMs = toTime(now);
  if (nowMs >= scheduleMs + graceMinutes * 60_000) {
    return { type: 'dispatch', reason: 'missing-daily-run' };
  }

  return { type: 'wait', reason: 'before-grace-period' };
}

function todayInManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function truncate(value, max = 7000) {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

async function githubRequest({ apiUrl, token, path, method = 'GET', body }) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { message: raw };
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${payload.message || raw || 'Unknown error'}`);
  }

  return payload;
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const workflowFile = process.env.WATCHDOG_WORKFLOW_FILE?.trim() || '.github/workflows/daily-facebook-post.yml';
  const apiUrl = (process.env.GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/$/, '');

  if (!token) throw new Error('GITHUB_TOKEN is required.');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');

  const now = new Date();
  const today = todayInManila(now);
  const graceMinutes = envInt('WATCHDOG_GRACE_MINUTES', 60);
  const maxAttempts = envInt('WATCHDOG_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
  const scheduleHour = envInt('WATCHDOG_SCHEDULE_HOUR', 9);
  const scheduleMinute = envInt('WATCHDOG_SCHEDULE_MINUTE', 0);
  const encodedWorkflow = encodeURIComponent(workflowFile);

  const runsPayload = await githubRequest({
    apiUrl,
    token,
    path: `/repos/${repository}/actions/workflows/${encodedWorkflow}/runs?per_page=50`
  });

  const rawRuns = Array.isArray(runsPayload.workflow_runs) ? runsPayload.workflow_runs : [];
  const relevantRuns = rawRuns.filter(run => {
    const runDate = todayInManila(new Date(run.created_at));
    return runDate === today && (run.event === 'schedule' || run.event === 'repository_dispatch');
  });

  const runs = [];
  for (const run of relevantRuns) {
    if (run.status !== 'completed' || run.conclusion === 'success') {
      runs.push(run);
      continue;
    }

    const jobsPayload = await githubRequest({
      apiUrl,
      token,
      path: `/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`
    });
    const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
    const failedJobs = jobs.filter(job => job.conclusion && job.conclusion !== 'success');

    runs.push({
      ...run,
      failedJobNames: failedJobs.map(job => job.name),
      failedJobs: failedJobs.map(job => ({
        name: job.name,
        html_url: job.html_url,
        failedSteps: Array.isArray(job.steps)
          ? job.steps
              .filter(step => step.conclusion && step.conclusion !== 'success')
              .map(step => step.name)
          : []
      }))
    });
  }

  const action = decideWatchdogAction({
    now: now.toISOString(),
    today,
    scheduleHour,
    scheduleMinute,
    graceMinutes,
    maxAttempts,
    runs
  });

  console.log(`Watchdog ${today}: ${action.type} (${action.reason})${action.runId ? ` run=${action.runId}` : ''}`);

  if (action.type === 'wait' || action.type === 'healthy') return;

  if (action.type === 'rerun-failed-jobs') {
    await githubRequest({
      apiUrl,
      token,
      method: 'POST',
      path: `/repos/${repository}/actions/runs/${action.runId}/rerun-failed-jobs`
    });
    console.log(`Requested rerun of failed jobs for run ${action.runId}.`);
    return;
  }

  if (action.type === 'dispatch') {
    await githubRequest({
      apiUrl,
      token,
      method: 'POST',
      path: `/repos/${repository}/dispatches`,
      body: {
        event_type: 'facebook_watchdog_recovery',
        client_payload: {
          recovery_date: today,
          reason: action.reason
        }
      }
    });
    console.log(`Dispatched Facebook recovery workflow for ${today}.`);
    return;
  }

  const run = runs.find(item => item.id === action.runId) || {};
  const runUrl = run.html_url || `https://github.com/${repository}/actions/runs/${action.runId}`;
  const failedJobs = Array.isArray(run.failedJobs) ? run.failedJobs : [];
  const failedSummary = failedJobs.length
    ? failedJobs
        .map(job => `- ${job.name}: ${job.failedSteps.join(', ') || 'failed'}`)
        .join('\n')
    : '- Unable to determine failed job details.';

  const searchQuery = encodeURIComponent(`repo:${repository} is:issue is:open in:title [Facebook Watchdog] ${today}`);
  const existing = await githubRequest({
    apiUrl,
    token,
    path: `/search/issues?q=${searchQuery}&per_page=1`
  });

  if (Number(existing.total_count || 0) > 0) {
    console.log(`An open watchdog issue already exists for ${today}.`);
    return;
  }

  const body = truncate([
    `The A Little Better Facebook automation needs attention for ${today}.`,
    '',
    `Reason: ${action.reason}`,
    `Workflow run: ${runUrl}`,
    `Run attempt: ${run.run_attempt ?? 'unknown'}`,
    '',
    'Failed jobs:',
    failedSummary,
    '',
    'The watchdog did not automatically re-publish because retrying an uncertain Facebook publish could create a duplicate post.',
    '',
    'Check the workflow logs, verify the Facebook Page/API status, then close this issue after resolving it.'
  ].join('\n'));

  await githubRequest({
    apiUrl,
    token,
    method: 'POST',
    path: `/repos/${repository}/issues`,
    body: {
      title: `[Facebook Watchdog] Attention needed - ${today}`,
      body
    }
  });

  console.log(`Created watchdog issue for ${today}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
