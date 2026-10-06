import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contentBank } from './content.js';
import {
  getContentBankStatus,
  getExpirationWarning,
  getThresholdWarning
} from './maintenance.js';
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
  if (run.jobsChecked === true && Number(run.jobCount) === 0) {
    return { type: 'rerun-workflow', runId: run.id, reason: 'runner-provisioning-failure' };
  }

  if (failedJobNames.length > 0 && failedJobNames.every(name => name === 'record')) {
    return { type: 'rerun-failed-jobs', runId: run.id, reason: 'record-job-failure' };
  }

  return { type: 'alert', runId: run.id, reason: 'publish-job-failure' };
}

export function decideAnalyticsHealthAction({
  now,
  today,
  scheduleHour = 18,
  scheduleMinute = 0,
  graceMinutes = 120,
  analytics = {}
}) {
  const scheduleMs = toTime(
    `${today}T${String(scheduleHour).padStart(2, '0')}:${String(scheduleMinute).padStart(2, '0')}:00+08:00`
  );
  const nowMs = toTime(now);

  if (nowMs < scheduleMs + graceMinutes * 60_000) {
    return { type: 'wait', reason: 'before-analytics-grace-period' };
  }

  const runs = Array.isArray(analytics?.collectorRuns) ? analytics.collectorRuns : [];
  const latest = [...runs]
    .filter(run => run?.capturedDate)
    .sort((a, b) =>
      String(b.capturedDate).localeCompare(String(a.capturedDate)) ||
      String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''))
    )[0];

  if (!latest) {
    return { type: 'alert', reason: 'analytics-missing', capturedDate: null };
  }

  if (String(latest.capturedDate) !== today) {
    return {
      type: 'alert',
      reason: 'analytics-stale',
      capturedDate: latest.capturedDate
    };
  }

  if (Number(latest.successfulPosts || 0) === 0 && Number(latest.attemptedPosts || 0) > 0) {
    return {
      type: 'alert',
      reason: 'analytics-collection-zero',
      capturedDate: latest.capturedDate
    };
  }

  if (Number(latest.errorCount || 0) > 0) {
    return {
      type: 'alert',
      reason: 'analytics-partial',
      capturedDate: latest.capturedDate
    };
  }

  return { type: 'healthy', capturedDate: latest.capturedDate };
}

export function decideWatchdogAction({
  now,
  today,
  scheduleHour = 16,
  scheduleMinute = 0,
  graceMinutes = 60,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  runs = []
}) {
  const todayRuns = runs
    .filter(run => isFromDate(run, today))
    .filter(run => run?.event === 'schedule' || run?.event === 'repository_dispatch')
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at));

  const latestRun = todayRuns[0];

  if (latestRun) {
    if (isActive(latestRun)) {
      return {
        type: 'wait',
        reason: latestRun.event === 'repository_dispatch'
          ? 'recovery-run-active'
          : 'daily-run-active',
        runId: latestRun.id
      };
    }

    if (isSuccessful(latestRun)) {
      return { type: 'healthy', runId: latestRun.id };
    }

    if (latestRun.status === 'completed' && latestRun.conclusion === 'failure') {
      return resultForCompletedFailure(latestRun, maxAttempts);
    }

    return { type: 'alert', runId: latestRun.id, reason: 'daily-run-not-successful' };
  }

  const scheduleMs = toTime(
    today + 'T' + String(scheduleHour).padStart(2, '0') + ':' +
    String(scheduleMinute).padStart(2, '0') + ':00+08:00'
  );
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

function formatDateTimeManila(value) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(new Date(value));
}

function envIntList(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const values = raw
    .split(',')
    .map(item => Number.parseInt(item.trim(), 10))
    .filter(Number.isFinite);

  return values.length ? values : fallback;
}

async function readPostingHistory() {
  try {
    const path = resolve(process.env.HISTORY_PATH || 'data/posting-history.json');
    const content = await readFile(path, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.posts) ? parsed.posts : [];
  } catch (error) {
    console.warn(`Unable to read posting history for maintenance monitoring: ${error.message}`);
    return [];
  }
}

async function readGrowthAnalytics() {
  try {
    const path = resolve(process.env.ANALYTICS_PATH || 'data/growth-analytics.json');
    const content = await readFile(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Unable to read growth analytics for maintenance monitoring: ${error.message}`);
    return {};
  }
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

async function hasOpenIssue({ apiUrl, token, repository, title }) {
  const fullTitle = title.startsWith('[Facebook Watchdog]') ? title : `[Facebook Watchdog] ${title}`;
  const searchQuery = encodeURIComponent(`repo:${repository} is:issue is:open in:title ${fullTitle}`);
  const existing = await githubRequest({
    apiUrl,
    token,
    path: `/search/issues?q=${searchQuery}&per_page=1`
  });
  return Number(existing.total_count || 0) > 0;
}

async function createIssueIfMissing({ apiUrl, token, repository, title, body }) {
  const fullTitle = title.startsWith('[Facebook Watchdog]') ? title : `[Facebook Watchdog] ${title}`;
  if (await hasOpenIssue({ apiUrl, token, repository, title: fullTitle })) {
    console.log(`An open watchdog issue already exists for: ${fullTitle}`);
    return false;
  }

  await githubRequest({
    apiUrl,
    token,
    method: 'POST',
    path: `/repos/${repository}/issues`,
    body: { title: fullTitle, body: truncate(body) }
  });

  console.log(`Created watchdog maintenance issue: ${fullTitle}`);
  return true;
}

async function runMaintenanceChecks({ apiUrl, token, repository, now }) {
  const history = await readPostingHistory();
  const contentStatus = getContentBankStatus(contentBank, history);
  const contentThresholds = envIntList('WATCHDOG_CONTENT_ALERT_THRESHOLDS', [5]);

  console.log(
    `Content bank: ${contentStatus.remaining}/${contentStatus.total} unique posts remaining.`
  );

  const contentWarning = getThresholdWarning(contentStatus.remaining, contentThresholds);
  if (contentWarning) {
    const title = `Content bank low - ${contentStatus.remaining} posts left`;
    await createIssueIfMissing({
      apiUrl,
      token,
      repository,
      title,
      body: [
        'The A Little Better Facebook content bank is running low.',
        '',
        `Remaining unique posts: ${contentStatus.remaining}`,
        `Total unique posts: ${contentStatus.total}`,
        `Used unique posts: ${contentStatus.used}`,
        '',
        'Add more original content to src/content.js before the bank is exhausted.'
      ].join('\n')
    });
  }

  const analytics = await readGrowthAnalytics();
  const analyticsAction = decideAnalyticsHealthAction({
    now,
    today: todayInManila(new Date(now)),
    scheduleHour: envInt('WATCHDOG_ANALYTICS_SCHEDULE_HOUR', 18),
    scheduleMinute: envInt('WATCHDOG_ANALYTICS_SCHEDULE_MINUTE', 0),
    graceMinutes: envInt('WATCHDOG_ANALYTICS_GRACE_MINUTES', 120),
    analytics
  });

  if (analyticsAction.type === 'alert') {
    const title = analyticsAction.reason === 'analytics-missing'
      ? 'Growth analytics missing'
      : analyticsAction.reason === 'analytics-stale'
        ? `Growth analytics stale - last ${analyticsAction.capturedDate || 'unknown'}`
        : analyticsAction.reason === 'analytics-collection-zero'
          ? 'Growth analytics collected zero posts'
          : 'Growth analytics partially failed';

    await createIssueIfMissing({
      apiUrl,
      token,
      repository,
      title,
      body: [
        'The A Little Better growth analytics collector needs attention.',
        '',
        `Reason: ${analyticsAction.reason}`,
        `Expected analytics date: ${todayInManila(new Date(now))}`,
        `Latest captured date: ${analyticsAction.capturedDate || 'none'}`,
        '',
        'Check the Facebook Growth Analytics workflow and Meta Page access before relying on adaptive content decisions.'
      ].join('\n')
    });
  }

  const expiryValue = process.env.META_DATA_ACCESS_EXPIRES_AT?.trim();
  if (!expiryValue) {
    console.log('Meta data-access expiry monitoring is not configured yet.');
    return;
  }

  const tokenThresholds = envIntList('WATCHDOG_TOKEN_ALERT_THRESHOLDS', [7, 5, 2, 1, 0]);
  const warning = getExpirationWarning({
    now,
    expiresAt: expiryValue,
    thresholds: tokenThresholds
  });

  if (!warning) {
    console.log('Meta data-access expiry is not within the configured warning thresholds.');
    return;
  }

  const expiryText = formatDateTimeManila(warning.expiresAt);
  const daysText = warning.expired
    ? 'expired'
    : `${warning.daysLeft} ${warning.daysLeft === 1 ? 'day' : 'days'} left`;
  const title = warning.expired
    ? 'Meta data access - expired'
    : `Meta data access - ${warning.daysLeft} ${warning.daysLeft === 1 ? 'day' : 'days'} left`;

  await createIssueIfMissing({
    apiUrl,
    token,
    repository,
    title,
    body: [
      'The Meta access token data-access period needs attention.',
      '',
      `Status: ${daysText}`,
      `Data access expires: ${expiryText} (Asia/Manila)`,
      '',
      'The access token itself may show "Expires: Never" while data access has a separate expiration time. Check Meta Access Token Debugger and reauthorize or refresh the required access when needed.',
      '',
      'This reminder is based on the META_DATA_ACCESS_EXPIRES_AT repository variable.'
    ].join('\n')
  });
}

async function fetchWorkflowRuns({ apiUrl, token, repository, workflowFile, today }) {
  const encodedWorkflow = encodeURIComponent(workflowFile);
  const runsPayload = await githubRequest({
    apiUrl,
    token,
    path: '/repos/' + repository + '/actions/workflows/' + encodedWorkflow + '/runs?per_page=50'
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

    try {
      const jobsPayload = await githubRequest({
        apiUrl,
        token,
        path: '/repos/' + repository + '/actions/runs/' + run.id + '/jobs?per_page=100'
      });
      const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
      const failedJobs = jobs.filter(job => job.conclusion && job.conclusion !== 'success');

      runs.push({
        ...run,
        jobsChecked: true,
        jobCount: jobs.length,
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
    } catch (error) {
      console.warn(
        'Could not inspect jobs for workflow run ' + run.id + ': ' +
        (error instanceof Error ? error.message : String(error))
      );
      runs.push({
        ...run,
        jobsChecked: false,
        jobCount: null,
        failedJobNames: [],
        failedJobs: []
      });
    }
  }

  return runs;
}

async function dispatchRecovery({ apiUrl, token, repository, eventType, today, reason }) {
  await githubRequest({
    apiUrl,
    token,
    method: 'POST',
    path: '/repos/' + repository + '/dispatches',
    body: {
      event_type: eventType,
      client_payload: {
        recovery_date: today,
        reason
      }
    }
  });
}

async function createWorkflowAlert({
  apiUrl,
  token,
  repository,
  today,
  workflowName,
  action,
  runs
}) {
  const run = runs.find(item => item.id === action.runId) || {};
  const runUrl = run.html_url || ('https://github.com/' + repository + '/actions/runs/' + action.runId);
  const failedJobs = Array.isArray(run.failedJobs) ? run.failedJobs : [];
  const failedSummary = failedJobs.length
    ? failedJobs
        .map(job => '- ' + job.name + ': ' + (job.failedSteps.join(', ') || 'failed'))
        .join('\n')
    : '- Unable to determine failed job details.';

  const title = workflowName + ' attention needed - ' + today;
  await createIssueIfMissing({
    apiUrl,
    token,
    repository,
    title,
    body: truncate([
      'The A Little Better ' + workflowName + ' needs attention for ' + today + '.',
      '',
      'Reason: ' + action.reason,
      'Workflow run: ' + runUrl,
      'Run attempt: ' + (run.run_attempt ?? 'unknown'),
      '',
      'Failed jobs:',
      failedSummary,
      '',
      'The watchdog did not automatically re-publish after a real job failure because retrying an uncertain Facebook publish could create a duplicate post.',
      '',
      'Check the workflow logs and Facebook Page/API status, then close this issue after resolving it.'
    ].join('\n'))
  });
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const apiUrl = (process.env.GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/$/, '');

  if (!token) throw new Error('GITHUB_TOKEN is required.');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');

  const now = new Date();
  const today = todayInManila(now);

  const monitoredWorkflows = [
    {
      name: 'regular daily Facebook post',
      file: process.env.WATCHDOG_WORKFLOW_FILE?.trim() || '.github/workflows/daily-facebook-post.yml',
      scheduleHour: envInt('WATCHDOG_SCHEDULE_HOUR', 16),
      scheduleMinute: envInt('WATCHDOG_SCHEDULE_MINUTE', 0),
      graceMinutes: envInt('WATCHDOG_GRACE_MINUTES', 60),
      maxAttempts: envInt('WATCHDOG_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
      recoveryEvent: 'facebook_watchdog_recovery'
    },
    {
      name: 'Fresh News Facebook post',
      file: process.env.WATCHDOG_NEWS_WORKFLOW_FILE?.trim() || '.github/workflows/a-little-better-fresh-news.yml',
      scheduleHour: envInt('WATCHDOG_NEWS_SCHEDULE_HOUR', 11),
      scheduleMinute: envInt('WATCHDOG_NEWS_SCHEDULE_MINUTE', 0),
      graceMinutes: envInt('WATCHDOG_NEWS_GRACE_MINUTES', 60),
      maxAttempts: envInt('WATCHDOG_NEWS_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
      recoveryEvent: 'fresh_news_watchdog_recovery'
    }
  ];

  for (const workflow of monitoredWorkflows) {
    try {
      const runs = await fetchWorkflowRuns({
        apiUrl,
        token,
        repository,
        workflowFile: workflow.file,
        today
      });

      const action = decideWatchdogAction({
        now: now.toISOString(),
        today,
        scheduleHour: workflow.scheduleHour,
        scheduleMinute: workflow.scheduleMinute,
        graceMinutes: workflow.graceMinutes,
        maxAttempts: workflow.maxAttempts,
        runs
      });

      console.log(
        'Watchdog ' + today + ' ' + workflow.name + ': ' +
        action.type + ' (' + action.reason + ')' +
        (action.runId ? ' run=' + action.runId : '')
      );

      if (action.type === 'wait' || action.type === 'healthy') continue;

      if (action.type === 'rerun-workflow') {
        await githubRequest({
          apiUrl,
          token,
          method: 'POST',
          path: '/repos/' + repository + '/actions/runs/' + action.runId + '/rerun'
        });
        console.log('Requested full workflow rerun for ' + workflow.name + ' run ' + action.runId + '.');
        continue;
      }

      if (action.type === 'rerun-failed-jobs') {
        await githubRequest({
          apiUrl,
          token,
          method: 'POST',
          path: '/repos/' + repository + '/actions/runs/' + action.runId + '/rerun-failed-jobs'
        });
        console.log('Requested failed-job rerun for ' + workflow.name + ' run ' + action.runId + '.');
        continue;
      }

      if (action.type === 'dispatch') {
        await dispatchRecovery({
          apiUrl,
          token,
          repository,
          eventType: workflow.recoveryEvent,
          today,
          reason: action.reason
        });
        console.log('Dispatched ' + workflow.name + ' recovery workflow for ' + today + '.');
        continue;
      }

      await createWorkflowAlert({
        apiUrl,
        token,
        repository,
        today,
        workflowName: workflow.name,
        action,
        runs
      });
    } catch (error) {
      console.error(
        'Watchdog could not monitor ' + workflow.name + ': ' +
        (error instanceof Error ? error.stack || error.message : String(error))
      );
    }
  }

  try {
    await runMaintenanceChecks({
      apiUrl,
      token,
      repository,
      now: now.toISOString()
    });
  } catch (error) {
    console.error(
      'Watchdog maintenance checks failed, but workflow monitoring has already been processed: ' +
      (error instanceof Error ? error.stack || error.message : String(error))
    );
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
