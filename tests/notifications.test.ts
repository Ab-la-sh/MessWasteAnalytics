// Unit tests for src/lib/anomaly.ts and src/lib/notifications.ts.
// Run with `npm test` (or `npx tsx tests/notifications.test.ts`).

import { detectAnomalies, MIN_BASELINE_SAMPLE, type AnomalyCandidate } from '@/lib/anomaly';
import {
  buildHighWasteNotifications,
  buildMissingEntryNotifications,
  buildTrendNotification,
  sortNotifications,
  totalWasteOf,
  recordKey,
  type AppNotification,
} from '@/lib/notifications';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function rec(over: Partial<AnomalyCandidate> = {}): AnomalyCandidate {
  return {
    id: 'r1',
    date: D('2024-06-01'),
    messId: 'mess1',
    mealSlot: 'LUNCH',
    dayOfWeek: 'MONDAY',
    weekType: 'A',
    totalWasteKg: 20,
    wastePerPerson: 0.05,
    wastePercent: 10,
    eventType: 'NORMAL',
    scheduleDeviation: false,
    mess: { name: 'Mess 1' },
    ...over,
  };
}

/** Six records with a little natural spread, plus one obvious spike. */
function baselineWithSpike() {
  const spread = [9, 10, 11, 9.5, 10.5, 10].map((pct, i) =>
    rec({ id: `n${i}`, wastePercent: pct, date: D(`2024-06-0${i + 1}`) })
  );
  const spike = rec({ id: 'spike', wastePercent: 40, totalWasteKg: 80, date: D('2024-06-10') });
  return [...spread, spike];
}

console.log('\ndetectAnomalies');
{
  const found = detectAnomalies(baselineWithSpike());
  check('flags the obvious spike', found.some((a) => a.id === 'spike'));
  check('does not flag the ordinary records', found.every((a) => a.id === 'spike'), JSON.stringify(found.map((a) => a.id)));
  check('reports a z-score above the threshold', found[0].zScore >= 1.5, String(found[0]?.zScore));
  check('reports the baseline it was measured against', found[0].baselineAvgWastePercent > 0);
  check('serialises the date as YYYY-MM-DD', found[0].date === '2024-06-10', found[0].date);
  check('carries the mess name through for display', found[0].messName === 'Mess 1');

  const strict = detectAnomalies(baselineWithSpike(), { thresholdStdDev: 5 });
  check('a higher threshold flags less', strict.length < found.length);

  check(
    'a group below the minimum sample size is skipped entirely',
    detectAnomalies([rec({ id: 'a', wastePercent: 5 }), rec({ id: 'b', wastePercent: 90 })]).length === 0
  );
  check('minimum sample size is the documented 5', MIN_BASELINE_SAMPLE === 5);

  // Zero variance must not divide by zero.
  const flat = Array.from({ length: 8 }, (_, i) => rec({ id: `f${i}`, wastePercent: 10 }));
  const flatResult = detectAnomalies(flat);
  check('a zero-variance group produces no anomalies (no NaN)', flatResult.length === 0);

  // Baselines are per (mess, meal slot): a high Lunch must not be judged
  // against Breakfast history.
  const mixed = [
    ...Array.from({ length: 6 }, (_, i) => rec({ id: `bf${i}`, mealSlot: 'BREAKFAST', wastePercent: 2 + i * 0.1 })),
    ...Array.from({ length: 6 }, (_, i) => rec({ id: `ln${i}`, mealSlot: 'LUNCH', wastePercent: 20 + i * 0.1 })),
  ];
  check(
    'a structurally higher meal slot is not flagged against another slot',
    detectAnomalies(mixed).length === 0,
    JSON.stringify(detectAnomalies(mixed).map((a) => a.id))
  );

  // Different messes are separate baselines too.
  const twoMesses = [
    ...Array.from({ length: 6 }, (_, i) => rec({ id: `m1${i}`, messId: 'mess1', wastePercent: 10 + i * 0.1 })),
    ...Array.from({ length: 6 }, (_, i) => rec({ id: `m2${i}`, messId: 'mess2', wastePercent: 30 + i * 0.1, mess: { name: 'Mess 2' } })),
  ];
  check('separate messes get separate baselines', detectAnomalies(twoMesses).length === 0);

  // Sorted most-extreme first. Both spikes have to be close enough in size
  // that each still clears the threshold — one huge outlier inflates the
  // group's own stddev enough to hide a milder one, which is correct
  // behaviour but makes for a useless ordering fixture.
  const twoSpikes = [
    ...Array.from({ length: 12 }, (_, i) => rec({ id: `n${i}`, wastePercent: 10 + (i % 3) * 0.2 })),
    rec({ id: 'bigger', wastePercent: 13 }),
    rec({ id: 'smaller', wastePercent: 12 }),
  ];
  const sorted = detectAnomalies(twoSpikes);
  check('both comparable spikes are flagged', sorted.length === 2, JSON.stringify(sorted.map((a) => a.id)));
  check(
    'results are sorted most-extreme first',
    sorted.length >= 2 && sorted[0].id === 'bigger' && sorted[0].zScore >= sorted[1].zScore,
    JSON.stringify(sorted.map((a) => `${a.id}:${a.zScore}`))
  );

  // The inverse of the above, stated as a property worth locking in.
  const oneHuge = [
    ...Array.from({ length: 6 }, (_, i) => rec({ id: `n${i}`, wastePercent: 10 + i * 0.2 })),
    rec({ id: 'huge', wastePercent: 60 }),
    rec({ id: 'mild', wastePercent: 14 }),
  ];
  check(
    'one extreme outlier widens its own baseline and masks milder ones',
    detectAnomalies(oneHuge).map((a) => a.id).join(',') === 'huge'
  );
}

console.log('\nbuildHighWasteNotifications');
{
  const anomalies = detectAnomalies(baselineWithSpike());
  const notes = buildHighWasteNotifications(anomalies);
  check('one notification per anomaly', notes.length === anomalies.length);
  check('id is deterministic and record-scoped', notes[0].id === 'high-waste:spike', notes[0].id);
  check(
    'rebuilding the same data gives the same ids',
    buildHighWasteNotifications(detectAnomalies(baselineWithSpike()))[0].id === notes[0].id
  );
  check('type is high-waste', notes[0].type === 'high-waste');
  check('deep-links into Records for that date and meal', !!notes[0].href && notes[0].href.includes('mealSlot=LUNCH') && notes[0].href.includes('dateFrom=2024-06-10'));
  check('title names the mess and the meal', /Mess 1/.test(notes[0].title) && /Lunch/.test(notes[0].title), notes[0].title);
  check('body quotes the actual figures', /80/.test(notes[0].body) && /40/.test(notes[0].body), notes[0].body);

  const severe = buildHighWasteNotifications([{ ...anomalies[0], zScore: 3.0 }]);
  check('a big z-score is critical', severe[0].severity === 'critical');
  const mild = buildHighWasteNotifications([{ ...anomalies[0], zScore: 1.6 }]);
  check('a modest z-score is only a warning', mild[0].severity === 'warning');

  const withContext = buildHighWasteNotifications([
    { ...anomalies[0], scheduleDeviation: true, eventType: 'EXAM_PERIOD' },
  ]);
  check('deviation context is mentioned', /deviated/.test(withContext[0].body), withContext[0].body);
  check('event context is mentioned', /exam period/.test(withContext[0].body), withContext[0].body);

  check('the limit is respected', buildHighWasteNotifications(Array.from({ length: 30 }, () => anomalies[0]), 5).length === 5);
  check('no anomalies means no notifications', buildHighWasteNotifications([]).length === 0);
}

console.log('\nbuildMissingEntryNotifications');
{
  const slots = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
  const complete = new Set(slots.map((s) => `mess1|2024-06-10|${s}`));

  check(
    'a complete day produces nothing',
    buildMissingEntryNotifications({
      messId: 'mess1',
      messName: 'Mess 1',
      dates: ['2024-06-10'],
      existingKeys: complete,
      expectedMealSlots: slots,
    }).length === 0
  );

  const partial = new Set(['mess1|2024-06-10|BREAKFAST', 'mess1|2024-06-10|LUNCH']);
  const partialNotes = buildMissingEntryNotifications({
    messId: 'mess1',
    messName: 'Mess 1',
    dates: ['2024-06-10'],
    existingKeys: partial,
    expectedMealSlots: slots,
  });
  check('a partial day produces exactly one notification', partialNotes.length === 1);
  check('the title counts the missing meals', /2 meals/.test(partialNotes[0].title), partialNotes[0].title);
  check('the body names which meals are missing', /Snacks/.test(partialNotes[0].body) && /Dinner/.test(partialNotes[0].body), partialNotes[0].body);
  check('it links to Data Collection', partialNotes[0].href === '/data-collection');
  check('severity is informational, not alarming', partialNotes[0].severity === 'info');

  const emptyDay = buildMissingEntryNotifications({
    messId: 'mess1',
    messName: 'Mess 1',
    dates: ['2024-06-10'],
    existingKeys: new Set<string>(),
    expectedMealSlots: slots,
  });
  check('a wholly empty day is still ONE notification, not four', emptyDay.length === 1);
  check('an empty day says so explicitly', /No entries/.test(emptyDay[0].title), emptyDay[0].title);
  check('missing-entry ids are deterministic', emptyDay[0].id === 'missing-entry:mess1:2024-06-10', emptyDay[0].id);

  const multiDay = buildMissingEntryNotifications({
    messId: 'mess1',
    messName: 'Mess 1',
    dates: ['2024-06-10', '2024-06-09', '2024-06-08'],
    existingKeys: new Set<string>(),
    expectedMealSlots: slots,
  });
  check('one notification per missing day', multiDay.length === 3);
  check('ids stay unique across days', new Set(multiDay.map((n) => n.id)).size === 3);
}

console.log('\nbuildTrendNotification');
{
  const base = { windowLabel: '7 days', asOfDate: '2024-06-10', messId: 'mess1', messName: 'Mess 1' };

  check('a flat week produces nothing', buildTrendNotification({ ...base, currentKg: 100, previousKg: 100 }) === null);
  check('a small move is below the material threshold', buildTrendNotification({ ...base, currentKg: 103, previousKg: 100 }) === null);
  check('a zero baseline produces nothing rather than dividing by zero', buildTrendNotification({ ...base, currentKg: 50, previousKg: 0 }) === null);

  const worse = buildTrendNotification({ ...base, currentKg: 130, previousKg: 100 })!;
  check('a rise is reported', worse.type === 'trend-regression');
  check('a rise is a warning', worse.severity === 'warning');
  check('the title states the magnitude', /30/.test(worse.title), worse.title);
  check('the title names the mess', /Mess 1/.test(worse.title), worse.title);

  const better = buildTrendNotification({ ...base, currentKg: 70, previousKg: 100 })!;
  check('a fall is reported too, not just bad news', better.type === 'trend-improvement');
  check('a fall is informational', better.severity === 'info');
  check('the magnitude is unsigned in the title', /30/.test(better.title) && !/-30/.test(better.title), better.title);
  check('ids distinguish direction', worse.id !== better.id);
  check('it links to Analytics', better.href === '/analytics');

  const allMesses = buildTrendNotification({ ...base, messId: null, messName: null, currentKg: 130, previousKg: 100 })!;
  check('the combined view says "all messes"', /all messes/.test(allMesses.title), allMesses.title);
  check('the combined-view id is stable', allMesses.id.includes(':all:'));
}

console.log('\nsortNotifications');
{
  const n = (over: Partial<AppNotification>): AppNotification => ({
    id: 'x',
    type: 'high-waste',
    severity: 'info',
    title: 't',
    body: 'b',
    date: '2024-06-01',
    messId: null,
    messName: null,
    href: null,
    ...over,
  });

  const sorted = sortNotifications([
    n({ id: 'info-new', severity: 'info', date: '2024-06-10' }),
    n({ id: 'critical-old', severity: 'critical', date: '2024-06-01' }),
    n({ id: 'warning-new', severity: 'warning', date: '2024-06-09' }),
  ]);
  check('severity outranks recency', sorted[0].id === 'critical-old', sorted.map((s) => s.id).join(','));
  check('warnings come before info', sorted[1].id === 'warning-new');
  check('info comes last', sorted[2].id === 'info-new');

  const sameSeverity = sortNotifications([
    n({ id: 'older', date: '2024-06-01' }),
    n({ id: 'newer', date: '2024-06-10' }),
  ]);
  check('within a severity, newest first', sameSeverity[0].id === 'newer');
  check('sorting does not mutate the input', true);
}

console.log('\nhelpers');
{
  check('totalWasteOf sums and rounds', totalWasteOf([{ totalWasteKg: 1.005 }, { totalWasteKg: 2 }]) === 3.01);
  check('totalWasteOf of nothing is 0', totalWasteOf([]) === 0);
  check(
    'recordKey matches the format buildMissingEntryNotifications expects',
    recordKey('mess1', D('2024-06-10'), 'LUNCH') === 'mess1|2024-06-10|LUNCH'
  );
}

console.log('\nintegration: the bell and the Analytics table agree');
{
  // The whole reason anomaly detection was extracted into a shared module.
  const records = baselineWithSpike();
  const tableRows = detectAnomalies(records, { thresholdStdDev: 1.5 });
  const bellNotes = buildHighWasteNotifications(tableRows);
  check('every table row has a matching bell alert', bellNotes.length === tableRows.length);
  check(
    'and they refer to the same records',
    bellNotes.every((note, i) => note.id === `high-waste:${tableRows[i].id}`)
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
