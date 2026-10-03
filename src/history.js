import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY_HISTORY = { version: 1, posts: [] };

export async function loadHistory(filePath) {
  try {
    await access(filePath, constants.F_OK);
  } catch {
    return { ...EMPTY_HISTORY, posts: [] };
  }

  const data = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(data.posts)) throw new Error(`Invalid history file: ${filePath}`);
  return { version: 1, posts: data.posts };
}

export async function saveHistory(filePath, history) {
  await mkdir(dirname(filePath), { recursive: true });
  const normalized = {
    version: 1,
    posts: history.posts.slice(-500)
  };
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

export function hasPostedOnDate(history, date) {
  return history.posts.some(post => post.date === date);
}

export function addPost(history, post) {
  return {
    version: 1,
    posts: [...history.posts, post]
  };
}
