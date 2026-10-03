import { getLatestContentPerformance, performanceScore } from './analytics.js';
import { selectImageVariant } from './image.js';

const EXPLORATION_INTERVAL_DAYS = 4;

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
  },
  {"id":"encouragement-003","category":"encouragement","imageText":"You are allowed to take your time.\nSome things grow slowly for a reason.","caption":"You do not have to rush just because other people seem ahead.\n\nGive yourself time to learn, heal, build, and grow.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nWhat are you giving yourself more time to do?"},
  {"id":"encouragement-004","category":"encouragement","imageText":"You can start again.\nA fresh start does not need a new year.","caption":"You can reset in the middle of a bad week, a bad month, or even a bad day.\n\nOne better choice is still a new beginning.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily reminders.\n\nWhat would you like to restart today?"},
  {"id":"encouragement-005","category":"encouragement","imageText":"You do not need to be strong every minute.\nYou just need to keep choosing hope.","caption":"Some days feel heavier than others. That does not make you weak.\n\nRest when you need to, ask for help when you can, and keep a little hope with you.\n\n💛 Follow A Little Better for daily encouragement.\n\nSend this to someone who needs a little hope today."},
  {"id":"encouragement-006","category":"encouragement","imageText":"Small progress still counts.\nEven when nobody else notices.","caption":"Not every improvement is obvious from the outside.\n\nA better thought, a finished task, or one healthy choice can be meaningful progress.\n\nA Little Better, one small win at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nWhat small win did you have today?"},
  {"id":"encouragement-007","category":"encouragement","imageText":"You are more than the mistake you made.\nLearn. Adjust. Keep going.","caption":"Making a mistake does not cancel the good things in you.\n\nTake the lesson, make the next choice better, and keep moving forward.\n\n💛 Follow A Little Better for reminders that help you keep going.\n\nWhat lesson are you taking with you?"},
  {"id":"encouragement-008","category":"encouragement","imageText":"The day can be hard\nwithout your life being hopeless.","caption":"A difficult season can feel endless when you are inside it.\n\nBut a hard chapter is still only a chapter. Keep taking today one step at a time.\n\n💛 Follow A Little Better for daily encouragement.\n\nSave this for a day that feels heavy."},
  {"id":"encouragement-009","category":"encouragement","imageText":"You have permission to be proud\nof how far you have come.","caption":"You might still have goals ahead, and you can still be proud of the distance you have already traveled.\n\nGrowth is worth celebrating too.\n\n💛 Follow A Little Better for daily reminders.\n\nWhat is something you are proud of lately?"},
  {"id":"motivation-003","category":"motivation","imageText":"Start before you feel ready.\nClarity often comes after action.","caption":"Waiting until everything feels perfect can keep you stuck.\n\nTake one useful step first. You can adjust as you learn.\n\nA Little Better, one action at a time.\n\n💛 Follow A Little Better for daily motivation.\n\nWhat is one thing you can start today?"},
  {"id":"motivation-004","category":"motivation","imageText":"You do not need a huge move.\nYou need the next move.","caption":"Big goals become easier when you stop staring at the whole mountain.\n\nChoose the next task. Finish that. Then choose the next one.\n\n💛 Follow A Little Better for simple daily motivation.\n\nWhat is your next move?"},
  {"id":"motivation-005","category":"motivation","imageText":"Discipline is doing the small thing\nwhen your mood says later.","caption":"You will not feel motivated every day.\n\nA simple routine can carry you when motivation is low. Keep the promise you made to yourself, even in a small way.\n\n💛 Follow A Little Better for daily motivation.\n\nWhat small task are you putting off?"},
  {"id":"motivation-006","category":"motivation","imageText":"Five focused minutes\ncan be better than another hour of overthinking.","caption":"When starting feels difficult, make the first session tiny.\n\nFive focused minutes can break the wall between thinking and doing.\n\n💛 Follow A Little Better for daily motivation.\n\nWhat will you work on for five minutes?"},
  {"id":"motivation-007","category":"motivation","imageText":"Do not quit on a slow day.\nSlow is still forward.","caption":"Progress is not always fast or exciting.\n\nYou can move forward quietly and still get somewhere important.\n\nA Little Better, one step at a time.\n\n💛 Follow A Little Better for daily motivation.\n\nShare this with someone who is feeling stuck."},
  {"id":"motivation-008","category":"motivation","imageText":"You can be nervous\nand still take the step.","caption":"Confidence is not a requirement for every beginning.\n\nSometimes the brave choice is simply moving while you still feel unsure.\n\n💛 Follow A Little Better for daily motivation.\n\nWhat step are you nervous to take?"},
  {"id":"motivation-009","category":"motivation","imageText":"Protect your momentum.\nDo one useful thing today.","caption":"You do not need an impressive day. You need a day with at least one action that moves your life forward.\n\nKeep the momentum alive.\n\n💛 Follow A Little Better for simple motivation every day.\n\nWhat useful thing will you finish today?"},
  {"id":"mindset-003","category":"mindset","imageText":"Being behind is not a personality trait.\nYour timeline can be different.","caption":"Someone else's progress does not create a deadline for your life.\n\nFocus on what you can control and keep building from where you are.\n\nA Little Better, at your own pace.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat are you focusing on right now?"},
  {"id":"mindset-004","category":"mindset","imageText":"You can change your mind\nwithout changing your worth.","caption":"Learning something new sometimes means admitting that your old approach was not working.\n\nChanging direction can be growth, not failure.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat have you learned recently?"},
  {"id":"mindset-005","category":"mindset","imageText":"Not every thought deserves your trust.\nPause before you believe it.","caption":"A stressful thought can feel true simply because it is loud.\n\nPause. Check the facts. Then choose a kinder and more useful way to respond.\n\n💛 Follow A Little Better for simple mindset reminders.\n\nWhat thought do you need to question today?"},
  {"id":"mindset-006","category":"mindset","imageText":"Your current situation is real.\nIt is not your whole future.","caption":"It is okay to acknowledge what is hard without deciding that it will always be this way.\n\nLeave room for change.\n\nA Little Better, one day at a time.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat are you hoping can change?"},
  {"id":"mindset-007","category":"mindset","imageText":"You can want more\nwithout believing you are less.","caption":"Ambition does not have to come from self-hate.\n\nYou can improve because you care about your future, not because you think you are worthless now.\n\n💛 Follow A Little Better for healthier mindset reminders.\n\nWhat are you working toward?"},
  {"id":"mindset-008","category":"mindset","imageText":"A setback is information.\nUse it. Do not become it.","caption":"A plan that failed can still teach you something useful.\n\nLook at what happened, change what needs changing, and try again with better information.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat did your last setback teach you?"},
  {"id":"mindset-009","category":"mindset","imageText":"You do not have to win every day.\nYou just have to stay in the game.","caption":"Some days are for progress. Some days are for recovery.\n\nWhat matters is continuing to show up for the life you are building.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nWhat helps you keep showing up?"},
  {"id":"bible-003","category":"bible","imageText":"The World Said: “You are too weak.”\n\nThe Bible Said:\n“My strength is made perfect in weakness.”\n2 Corinthians 12:9","caption":"You do not have to pretend to be strong all the time.\n\n“The World Said” vs. “The Bible Said”\n\nFaith reminds us that weakness does not make us useless.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this for a day when you feel weak."},
  {"id":"bible-004","category":"bible","imageText":"The World Said: “Be afraid of tomorrow.”\n\nThe Bible Said:\n“Do not worry about tomorrow.”\nMatthew 6:34","caption":"It is easy to spend today worrying about problems that have not arrived yet.\n\n“The World Said” vs. “The Bible Said”\n\nTake today's step and trust God with tomorrow.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this when your mind feels overwhelmed."},
  {"id":"bible-005","category":"bible","imageText":"The World Said: “You need to control everything.”\n\nThe Bible Said:\n“Trust in the Lord with all your heart.”\nProverbs 3:5","caption":"Not everything is yours to control.\n\n“The World Said” vs. “The Bible Said”\n\nTrusting God can mean releasing the things you cannot carry alone.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nWhat do you need to place in God's hands?"},
  {"id":"bible-006","category":"bible","imageText":"The World Said: “You are forgotten.”\n\nThe Bible Said:\n“I have called you by name.”\nIsaiah 43:1","caption":"When you feel unseen, remember that your worth is not decided by how much attention you receive.\n\n“The World Said” vs. “The Bible Said”\n\nGod knows you and sees you.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this reminder for later."},
  {"id":"bible-007","category":"bible","imageText":"The World Said: “You must handle it alone.”\n\nThe Bible Said:\n“Cast all your anxiety on Him.”\n1 Peter 5:7","caption":"You were never meant to carry every worry by yourself.\n\n“The World Said” vs. “The Bible Said”\n\nBring your worries to God instead of carrying them alone.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nWhat worry are you praying about today?"},
  {"id":"bible-008","category":"bible","imageText":"The World Said: “There is no way forward.”\n\nThe Bible Said:\n“With God all things are possible.”\nMatthew 19:26","caption":"Sometimes your situation looks impossible from where you are standing.\n\n“The World Said” vs. “The Bible Said”\n\nFaith makes room for possibilities you cannot see yet.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nWhat are you trusting God for?"},
  {"id":"bible-009","category":"bible","imageText":"The World Said: “You have to earn peace.”\n\nThe Bible Said:\n“My peace I give you.”\nJohn 14:27","caption":"Peace is not always the result of having a perfect situation.\n\n“The World Said” vs. “The Bible Said”\n\nJesus offers peace even when life around you is uncertain.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this for a restless day."},
  {"id":"student-003","category":"student-struggles","imageText":"You can study hard\nand still have a hard subject.\nThat is not failure.","caption":"Some subjects take more time than others.\n\nNeeding another explanation, another practice set, or another try does not mean you are incapable.\n\n💛 Follow A Little Better for daily student encouragement.\n\nWhat subject are you working through right now?"},
  {"id":"student-004","category":"student-struggles","imageText":"One bad score\ncannot measure your full potential.","caption":"A disappointing grade can hurt, but it is not a final prediction of what you can become.\n\nUse the result as feedback, then keep learning.\n\n💛 Follow A Little Better for daily student reminders.\n\nWhat will you do differently on the next assessment?"},
  {"id":"student-005","category":"student-struggles","imageText":"You do not need to understand it all tonight.\nLearn one part first.","caption":"Difficult lessons become less overwhelming when you break them into smaller pieces.\n\nUnderstand one concept, then connect it to the next.\n\n💛 Follow A Little Better for daily student encouragement.\n\nWhat is one small concept you can study today?"},
  {"id":"student-006","category":"student-struggles","imageText":"Being tired of school\ndoes not mean you do not care.","caption":"You can love your goal and still feel exhausted by the work needed to reach it.\n\nRest does not make your dream less important.\n\n💛 Follow A Little Better for daily student encouragement.\n\nWhat helps you recharge after a long school day?"},
  {"id":"student-007","category":"student-struggles","imageText":"Your classmates are not your measuring stick.\nLearn at your pace.","caption":"Comparison can make a normal learning process feel like a race.\n\nFocus on your own understanding, your own progress, and your own next step.\n\n💛 Follow A Little Better for daily student reminders.\n\nWhat is one thing you understand better now?"},
  {"id":"student-008","category":"student-struggles","imageText":"Deadlines are stressful.\nBut panic is not a study plan.","caption":"When everything feels urgent, choose the next task and make a simple plan.\n\nYou do not have to solve the entire week at once.\n\n💛 Follow A Little Better for practical student encouragement.\n\nWhat is the first task on your list?"},
  {"id":"student-009","category":"student-struggles","imageText":"You are building a future\none assignment at a time.","caption":"The worksheet, project, exam, or presentation may feel small today, but each one is part of your journey.\n\nKeep doing the work in front of you.\n\n💛 Follow A Little Better for daily student reminders.\n\nWhat school task are you finishing today?"},
  {"id":"self-003","category":"self-improvement","imageText":"Make the good habit\neasier to start.","caption":"Put the book where you can see it. Prepare your clothes early. Keep your water nearby.\n\nSmall changes to your environment can make good habits easier to repeat.\n\n💛 Follow A Little Better for simple self-improvement ideas.\n\nWhat can you make easier today?"},
  {"id":"self-004","category":"self-improvement","imageText":"Do less.\nDo it consistently.\nThen build from there.","caption":"Trying to change everything at once can make consistency harder.\n\nChoose one habit, make it manageable, and let repetition do the work.\n\n💛 Follow A Little Better for simple self-improvement reminders.\n\nWhat one habit are you keeping simple?"},
  {"id":"self-005","category":"self-improvement","imageText":"A better routine\nstarts with one repeatable action.","caption":"You do not need an impressive morning routine.\n\nYou need one or two actions that fit your real life and can survive busy days.\n\n💛 Follow A Little Better for practical self-improvement reminders.\n\nWhat is one action you can repeat daily?"},
  {"id":"self-006","category":"self-improvement","imageText":"Protect your attention.\nNot everything deserves it.","caption":"Your time and focus are limited.\n\nNotice what keeps pulling your attention away from the things that matter, then make one small boundary.\n\n💛 Follow A Little Better for simple self-improvement ideas.\n\nWhat distraction are you reducing?"},
  {"id":"self-007","category":"self-improvement","imageText":"Rest is part of the routine.\nNot a reward for finishing everything.","caption":"You are a person, not a machine.\n\nPlanned rest can help you keep going without turning every day into a race against exhaustion.\n\n💛 Follow A Little Better for healthier self-improvement reminders.\n\nHow will you make room for rest today?"},
  {"id":"self-008","category":"self-improvement","imageText":"Track the habit,\nnot just the result.","caption":"Results can take time to appear.\n\nTracking the small actions you control can help you notice consistency before the big result arrives.\n\n💛 Follow A Little Better for practical self-improvement ideas.\n\nWhat habit would you like to track?"},
  {"id":"self-009","category":"self-improvement","imageText":"Improve your environment.\nYour habits will notice.","caption":"A messy workspace, constant notifications, or an inconvenient setup can make simple tasks harder.\n\nChange one thing around you that makes good choices easier.\n\n💛 Follow A Little Better for simple self-improvement reminders.\n\nWhat will you change around you?"},
  {"id":"casual-003","category":"casual","imageText":"Maybe today is not a productivity day.\nMaybe it is a breathe day.","caption":"You do not have to turn every quiet day into a self-improvement project.\n\nSometimes you just need to breathe, reset, and be present.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nWhat helps you feel a little lighter?"},
  {"id":"casual-004","category":"casual","imageText":"You survived another weird day.\nThat deserves at least a tiny smile.","caption":"Some days are confusing, stressful, funny, and exhausting all at once.\n\nTake the small win: you made it through.\n\n💛 Follow A Little Better for daily reminders.\n\nWhat was the funniest part of your day?"},
  {"id":"casual-005","category":"casual","imageText":"It is okay if your biggest plan today\nis simply getting through today.","caption":"Not every day needs a huge achievement.\n\nSometimes the best thing you can do is take care of yourself and keep the day moving.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nHow are you really doing today?"},
  {"id":"casual-006","category":"casual","imageText":"One day you will miss\nsome of the ordinary moments.","caption":"The random conversations, slow afternoons, and simple routines may feel small now.\n\nPay attention to them while they are here.\n\n💛 Follow A Little Better for reminders to notice the little things.\n\nWhat ordinary moment made you happy today?"},
  {"id":"casual-007","category":"casual","imageText":"You do not need an exciting life\nto have a meaningful one.","caption":"A meaningful life can look like quiet mornings, familiar people, small goals, and ordinary days.\n\nSimple does not mean empty.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nWhat simple thing are you grateful for?"},
  {"id":"casual-008","category":"casual","imageText":"Drink some water.\nStretch your shoulders.\nYou have been carrying a lot.","caption":"A tiny reset can help more than you expect.\n\nTake a breath, drink some water, relax your shoulders, and give yourself a minute.\n\n💛 Follow A Little Better for simple daily reminders.\n\nDid you take a little break today?"},
  {"id":"casual-009","category":"casual","imageText":"You are allowed to enjoy a small win\nwithout immediately chasing the next one.","caption":"Finish something, smile about it, and let the moment count.\n\nYou do not have to turn every win into another task.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nWhat small win are you celebrating today?"},
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
  const parsed = new Date(`${date}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${date}`);
  return Math.floor(parsed.getTime() / 86400000);
}

function recentContentIds(date, history, cooldownDays = 28) {
  const dayIndex = dateToIndex(date);

  return new Set(
    (Array.isArray(history) ? history : [])
      .filter(entry => entry?.contentId && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
      .filter(entry => {
        const entryIndex = dateToIndex(entry.date);
        const age = dayIndex - entryIndex;
        return age >= 0 && age < cooldownDays;
      })
      .map(entry => entry.contentId)
  );
}

function rankCandidates(candidates, performanceByContentId, dayIndex) {
  return candidates
    .map((post, index) => ({
      post,
      index,
      performance: performanceByContentId.get(post.id)
    }))
    .sort((a, b) => {
      const aHasPerformance = Number.isFinite(Number(a.performance));
      const bHasPerformance = Number.isFinite(Number(b.performance));

      if (aHasPerformance !== bHasPerformance) return aHasPerformance ? -1 : 1;
      if (aHasPerformance && Number(b.performance) !== Number(a.performance)) {
        return Number(b.performance) - Number(a.performance);
      }

      return ((a.index - (dayIndex % candidates.length)) + candidates.length) % candidates.length -
        ((b.index - (dayIndex % candidates.length)) + candidates.length) % candidates.length;
    })
    .map(item => item.post);
}

export function getContentExperimentMetadata(post = {}) {
  const imageText = String(post?.imageText || '');
  const caption = String(post?.caption || '');

  const firstLine = imageText.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
  const hookType = firstLine.startsWith('The World Said:')
    ? 'contrast'
    : /\?$/.test(firstLine)
      ? 'question'
      : /^(Start|Stop|Do|Keep|Protect|Take|Learn|Give|Focus|Try|Choose|Build|Make|Remember)\b/i.test(firstLine)
        ? 'imperative'
        : 'direct-statement';

  const captionLines = caption.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const finalLine = captionLines.at(-1) || '';
  const ctaType = /\bsave\b/i.test(finalLine)
    ? 'save'
    : /\bshare\b|\bsend\b/i.test(finalLine)
      ? 'share'
      : /\btag\b/i.test(finalLine)
        ? 'tag'
        : /\?$/.test(finalLine)
          ? 'question'
          : 'follow';

  const textLength = imageText.length <= 180 ? 'short' : imageText.length <= 320 ? 'medium' : 'long';
  return {
    hookType,
    ctaType,
    textLength,
    visualVariant: selectImageVariant({ contentId: post?.id })
  };
}

function selectCandidate(candidates, performanceByContentId, dayIndex) {
  const ranked = rankCandidates(candidates, performanceByContentId, dayIndex);
  const unmeasured = candidates.filter(post =>
    !Number.isFinite(Number(performanceByContentId.get(post.id)))
  );

  if (unmeasured.length && dayIndex % EXPLORATION_INTERVAL_DAYS === 0) {
    return unmeasured[dayIndex % unmeasured.length];
  }

  return ranked[0];
}

export function getDailyPost(date = getPhilippineDate(), history = [], analytics = {}) {
  const dayIndex = dateToIndex(date);
  const parsed = new Date(`${date}T12:00:00+08:00`);
  const dayCategory = CATEGORY_BY_DAY[parsed.getUTCDay()];
  const recentIds = recentContentIds(date, history);
  const performance = getLatestContentPerformance(analytics?.snapshots);

  const categoryCandidates = POSTS.filter(post =>
    post.category === dayCategory && !recentIds.has(post.id)
  );

  const fallback = POSTS.filter(post => !recentIds.has(post.id));
  const pool = categoryCandidates.length ? categoryCandidates : fallback.length ? fallback : POSTS;
  const performanceByContentId = new Map([...performance.entries()].map(([contentId, snapshot]) => [
    contentId,
    performanceScore(snapshot)
  ]));

  const selected = selectCandidate(pool, performanceByContentId, dayIndex);
  const unmeasured = pool.filter(post => !Number.isFinite(Number(performanceByContentId.get(post.id))));
  const selectionMode = dayIndex % EXPLORATION_INTERVAL_DAYS === 0 && unmeasured.length > 0 && !performanceByContentId.has(selected.id)
    ? 'explore'
    : 'exploit';

  return {
    date,
    contentId: selected.id,
    ...selected,
    experiment: {
      selectionMode,
      contentTraits: getContentExperimentMetadata(selected)
    }
  };
}

  {"id":"encouragement-010","category":"encouragement","imageText":"You can have a hard day\nand still be making progress.","caption":"A difficult day does not erase the work you have already done.\n\nGive yourself credit for continuing, even when today feels heavier than usual.\n\n💛 Follow A Little Better for daily encouragement.\n\nSave this for a hard day."},
  {"id":"encouragement-011","category":"encouragement","imageText":"Your pace is still a pace.\nKeep moving.","caption":"You do not need to move as fast as everyone else to be moving forward.\n\nTake the next step you can handle and let progress build from there.\n\n💛 Follow A Little Better for daily reminders to keep going.\n\nWhat is your next small step?"},
  {"id":"encouragement-012","category":"encouragement","imageText":"You are allowed to hope\nfor better days.","caption":"Hope does not mean ignoring what is hard. It means leaving room for things to change.\n\nKeep a little space in your heart for better days ahead.\n\n💛 Follow A Little Better for daily hope and encouragement.\n\nSend this to someone who needs a little hope."},

  {"id":"motivation-010","category":"motivation","imageText":"Start with what you can do today.","caption":"You may not control the whole situation, but you can choose one useful action today.\n\nDo that first. Let tomorrow handle tomorrow's next step.\n\n💛 Follow A Little Better for simple daily motivation.\n\nWhat can you do today?"},
  {"id":"motivation-011","category":"motivation","imageText":"One finished task\nbeats ten plans you never start.","caption":"Planning can feel productive, but action is what creates progress.\n\nChoose one task and finish it before adding another.\n\n💛 Follow A Little Better for daily motivation.\n\nWhat task are you finishing today?"},
  {"id":"motivation-012","category":"motivation","imageText":"What would change\nif you started today?","caption":"You do not need perfect timing to begin.\n\nA small start today can teach you more than another week of waiting.\n\n💛 Follow A Little Better for daily motivation.\n\nSave this as your reminder to start."},

  {"id":"mindset-010","category":"mindset","imageText":"You can outgrow\nwhat once felt comfortable.","caption":"Growth can feel strange because the old version of your life was familiar.\n\nNew habits and better choices may feel uncomfortable before they feel normal.\n\n💛 Follow A Little Better for healthier mindset reminders.\n\nWhat are you growing out of?"},
  {"id":"mindset-011","category":"mindset","imageText":"You do not have to prove\nyour worth every day.","caption":"Your value does not disappear because you had a quiet day or made a mistake.\n\nYou can keep growing without turning life into a constant test of your worth.\n\n💛 Follow A Little Better for daily mindset reminders.\n\nSave this for a day when you feel pressured."},
  {"id":"mindset-012","category":"mindset","imageText":"A calmer mind\ncan make a clearer choice.","caption":"When everything feels urgent, pause before reacting.\n\nA little space can help you think about what actually matters next.\n\n💛 Follow A Little Better for simple mindset reminders.\n\nWhat helps you slow down and think clearly?"},

  {"id":"bible-010","category":"bible","imageText":"The World Said: “You are not enough.”\n\nThe Bible Said:\n“I am fearfully and wonderfully made.”\nPsalm 139:14","caption":"Your worth is not decided by comparison, approval, or achievement.\n\n“The World Said” vs. “The Bible Said”\n\nRemember what Scripture says about how God made you.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nSave this reminder for later."},
  {"id":"bible-011","category":"bible","imageText":"The World Said: “Give up.”\n\nThe Bible Said:\n“Let us not grow weary in doing good.”\nGalatians 6:9","caption":"Some seasons take longer than you expected.\n\n“The World Said” vs. “The Bible Said”\n\nKeep doing the good you can do, even when results take time.\n\n💛 Follow A Little Better for faith and encouragement.\n\nShare this with someone who feels tired."},
  {"id":"bible-012","category":"bible","imageText":"The World Said: “You need all the answers.”\n\nThe Bible Said:\n“Your word is a lamp to my feet.”\nPsalm 119:105","caption":"You may not see the whole road yet.\n\n“The World Said” vs. “The Bible Said”\n\nSometimes faith gives you enough light for the next step, not the whole journey.\n\n💛 Follow A Little Better for more faith and encouragement.\n\nWhat step are you trusting God with today?"},

  {"id":"student-010","category":"student-struggles","imageText":"You can be a good student\nand still need rest.","caption":"Rest is part of learning, not the opposite of it.\n\nA tired mind does not always learn better just because you study longer.\n\n💛 Follow A Little Better for daily student encouragement.\n\nSend this to a student who needs a break."},
  {"id":"student-011","category":"student-struggles","imageText":"Ask the question.\nYou are not supposed to know everything.","caption":"Being confused is normal when you are learning something difficult.\n\nAsk for another example, another explanation, or another try.\n\n💛 Follow A Little Better for practical student reminders.\n\nWhat question are you afraid to ask?"},
  {"id":"student-012","category":"student-struggles","imageText":"A slow study session\nis still a study session.","caption":"Not every session will feel productive.\n\nEven a little progress can help you stay connected to your goal.\n\n💛 Follow A Little Better for daily student encouragement.\n\nSave this for your next difficult study day."},

  {"id":"self-010","category":"self-improvement","imageText":"Make the good choice\neasier to repeat.","caption":"Put your book where you can see it. Prepare your water bottle. Set a simple reminder.\n\nSmall changes to your environment can make good habits easier to continue.\n\n💛 Follow A Little Better for simple self-improvement ideas.\n\nWhat can you make easier today?"},
  {"id":"self-011","category":"self-improvement","imageText":"You do not need\nmore motivation.\nYou need fewer obstacles.","caption":"Sometimes the problem is not laziness. The starting point is simply too difficult.\n\nRemove one small obstacle and make the next action easier.\n\n💛 Follow A Little Better for practical self-improvement reminders.\n\nWhat obstacle can you remove today?"},
  {"id":"self-012","category":"self-improvement","imageText":"Improve one thing\nthen give yourself time to adjust.","caption":"Trying to change everything at once can make progress harder to keep.\n\nPick one area, practice it, and let consistency do its work.\n\n💛 Follow A Little Better for simple growth reminders.\n\nWhat one thing are you improving this month?"},

  {"id":"casual-010","category":"casual","imageText":"Maybe today\nyou just need a little peace.","caption":"Not every problem needs an immediate answer.\n\nTake a breath. Put down what can wait. Let yourself have a quiet moment.\n\n💛 Follow A Little Better for gentle daily reminders.\n\nSave this for a peaceful reminder."},
  {"id":"casual-011","category":"casual","imageText":"A tiny win\nis still a win.","caption":"You replied to the message. You finished the task. You got out of bed. You kept your promise to yourself.\n\nSmall wins deserve to be noticed too.\n\n💛 Follow A Little Better for daily reminders to notice the good.\n\nWhat is your tiny win today?"},
  {"id":"casual-012","category":"casual","imageText":"You do not need\na productive day to have a good day.","caption":"Some good days are full of progress. Others are simply full of rest, laughter, or time with people you care about.\n\nBoth can matter.\n\n💛 Follow A Little Better for gentle reminders every day.\n\nWhat made today a little better?"},
];

export const contentBank = POSTS;
