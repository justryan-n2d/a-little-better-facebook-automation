const CATEGORY_BY_DAY = [
  'encouragement',
  'motivation',
  'mindset',
  'bible',
  'student-struggles',
  'self-improvement',
  'casual'
];

const POSTS = [
  {
    id: 'mindset-001',
    category: 'mindset',
    imageText: 'You do not need to have everything figured out.\nYou only need to take the next step.',
    caption: 'You do not need the whole plan today.\n\nTake the next small step. Then another. Progress can be quiet and still be real.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily reminders to keep going.\n\nWhat is one small step you can take today?'
  },
  {
    id: 'motivation-001',
    category: 'motivation',
    imageText: 'A bad day is not a bad life.\nStart again tomorrow. Or start again right now.',
    caption: 'One rough day does not erase all the progress you have made.\n\nRest when you need to. Reset when you can. Then keep moving.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nSend this to someone who needs a fresh start.'
  },
  {
    id: 'bible-001',
    category: 'bible',
    imageText: 'The World Said: “You have to be perfect.”\n\nThe Bible Said:\n“My grace is sufficient for you.”\n2 Corinthians 12:9',
    caption: 'You do not have to be perfect to be worthy of grace.\n\n“The World Said” vs. “The Bible Said”\nA Little Better is here to remind you that grace meets you where you are.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this for the days you feel like you are not enough.'
  },
  {
    id: 'student-001',
    category: 'student-struggles',
    imageText: 'You are not behind.\nYou are learning at your own pace.',
    caption: 'Some days you study for hours and still feel like you did not do enough.\n\nBe patient with yourself. Learning takes time, especially when life is already heavy.\n\nKeep going. You are doing more than you think.\n\n💛 Follow A Little Better for daily student encouragement.\n\nTag a student who needs this today.'
  },
  {
    id: 'self-001',
    category: 'self-improvement',
    imageText: 'You do not need a perfect routine.\nYou need a routine you can actually keep.',
    caption: 'Start small.\n\nTen minutes of reading. One page of notes. A short walk. One task finished.\n\nConsistency grows from actions you can repeat.\n\nA Little Better, not perfect.\n\n💛 Follow A Little Better for simple self-improvement reminders.\n\nWhat small habit are you building?'
  },
  {
    id: 'casual-001',
    category: 'casual',
    imageText: 'Maybe you are doing better than you think.\nYou just forgot to notice.',
    caption: 'You made it through things you once thought you could not handle.\n\nGive yourself a little credit today.\n\nA Little Better is not about becoming a different person overnight. It is about noticing the small wins too.\n\n💛 Follow A Little Better for daily reminders.\n\nWhat is one small win you are proud of?'
  },
  {
    id: 'encouragement-001',
    category: 'encouragement',
    imageText: 'Keep going.\nYour current chapter is not your final chapter.',
    caption: 'Things can change.\n\nThe season you are in right now is not the whole story. Keep doing what you can, even when progress feels slow.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nShare this with someone who needs hope today.'
  },
  {
    id: 'mindset-002',
    category: 'mindset',
    imageText: 'You can be proud of your progress\nand still want to grow more.',
    caption: 'Growth does not require hating who you are now.\n\nYou can appreciate how far you have come while still becoming better.\n\nA Little Better, not a whole new you.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat is one thing you have improved this year?'
  },
  {
    id: 'motivation-002',
    category: 'motivation',
    imageText: 'Do it tired.\nDo it scared.\nDo it imperfectly.\nJust keep moving.',
    caption: 'You do not need perfect confidence before you begin.\n\nSometimes courage looks like taking one small action while you are still nervous.\n\n💛 Follow A Little Better for daily motivation.\n\nSave this for a hard day.'
  },
  {
    id: 'bible-002',
    category: 'bible',
    imageText: 'The World Said: “You are alone.”\n\nThe Bible Said:\n“I will never leave you.”\nHebrews 13:5',
    caption: 'When life feels lonely, remember that faith is not built on having everything under control.\n\n“The World Said” vs. “The Bible Said”\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this reminder for later.'
  },
  {
    id: 'student-002',
    category: 'student-struggles',
    imageText: 'Your grade is a result.\nIt is not your identity.',
    caption: 'A score can tell you what happened on one test. It cannot tell your whole story.\n\nLearn from the result, make a plan, and keep going.\n\n💛 Follow A Little Better for daily student reminders.\n\nSend this to a friend who is stressed about grades.'
  },
  {
    id: 'self-002',
    category: 'self-improvement',
    imageText: 'Stop waiting to feel motivated.\nMake the first step tiny.',
    caption: 'Motivation does not always come before action. Sometimes action creates motivation.\n\nMake the first step so small that starting feels easy.\n\n💛 Follow A Little Better for simple self-improvement ideas.\n\nWhat is your tiny first step today?'
  },
  {
    id: 'casual-002',
    category: 'casual',
    imageText: 'It is okay to have a slow day.\nYou are still moving forward.',
    caption: 'Not every day needs to be productive, exciting, or impressive.\n\nSometimes the win is simply getting through the day and giving yourself room to breathe.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nSend this to someone who needs permission to slow down.'
  },
  {
    id: 'encouragement-002',
    category: 'encouragement',
    imageText: 'You have survived every hard day\nyou have faced so far.',
    caption: 'That does not mean every day will be easy. It means you have evidence that you can keep going.\n\nTake today one step at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nSave this for when today feels heavy.'
  }
];

export function getPhilippineDate(input = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(input);
}

function dateToIndex(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${date}`);
  return Math.floor(parsed.getTime() / 86400000);
}

export function getDailyPost(date = getPhilippineDate(), history = []) {
  const dayIndex = dateToIndex(date);
  const parsed = new Date(`${date}T00:00:00+08:00`);
  const dayCategory = CATEGORY_BY_DAY[parsed.getDay()];
  const usedIds = new Set(history.map(entry => entry.contentId).filter(Boolean));
  const candidates = POSTS.filter(post => post.category === dayCategory && !usedIds.has(post.id));
  const fallback = POSTS.filter(post => !usedIds.has(post.id));
  const pool = candidates.length ? candidates : fallback.length ? fallback : POSTS;
  const selected = pool[dayIndex % pool.length];
  return { date, contentId: selected.id, ...selected };
}

export const contentBank = POSTS;
