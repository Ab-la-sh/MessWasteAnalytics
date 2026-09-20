// Unit tests for src/lib/prediction.ts.
// Run with `npm test` (or `npx tsx tests/prediction.test.ts`).
//
// These cover pure logic only — no database, no network, no fixtures to
// maintain. They run in well under a second, so there's no reason not to
// run them before every commit that touches the model.

import {
  predictWaste,
  recencyWeight,
  weightedMean,
  conditionFactor,
  selectBaseline,
  seasonalWeather,
  eventTypeFromCalendar,
  RECENCY_HALF_LIFE_DAYS,
  MIN_FACTOR,
  MAX_FACTOR,
  type PredictionSample,
  type PredictionTarget,
} from '@/lib/prediction';

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

function approx(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function sample(over: Partial<PredictionSample> = {}): PredictionSample {
  return {
    date: D('2024-06-01'),
    mealSlot: 'LUNCH',
    dayOfWeek: 'MONDAY',
    weekType: 'A',
    eventType: 'NORMAL',
    headcount: 400,
    totalWasteKg: 20,
    wastePerPerson: 0.05,
    temperatureC: 30,
    rainfallMm: 0,
    scheduleDeviation: false,
    menuFlags: null,
    ...over,
  };
}

function target(over: Partial<PredictionTarget> = {}): PredictionTarget {
  return {
    date: D('2024-07-01'),
    mealSlot: 'LUNCH',
    dayOfWeek: 'MONDAY',
    weekType: 'A',
    eventType: 'NORMAL',
    temperatureC: 30,
    rainfallMm: 0,
    scheduleDeviation: false,
    menuFlags: null,
    headcount: null,
    ...over,
  };
}

console.log('\nrecencyWeight');
{
  const asOf = D('2024-07-01');
  check('today weighs 1', approx(recencyWeight(asOf, asOf), 1));
  check(
    'one half-life weighs 0.5',
    approx(recencyWeight(D('2024-05-02'), asOf), 0.5, 1e-9),
    String(recencyWeight(D('2024-05-02'), asOf))
  );
  check('older records weigh less', recencyWeight(D('2024-01-01'), asOf) < recencyWeight(D('2024-06-01'), asOf));
  check('future-dated records are not boosted above 1', recencyWeight(D('2024-08-01'), asOf) === 1);
  check('half-life constant is the documented 60 days', RECENCY_HALF_LIFE_DAYS === 60);
}

console.log('\nweightedMean');
{
  check('equal weights match the plain mean', approx(weightedMean([1, 2, 3], [1, 1, 1]), 2));
  check('weights shift the result', approx(weightedMean([0, 10], [1, 3]), 7.5));
  check('empty input is 0', weightedMean([], []) === 0);
  check(
    'all-zero weights fall back to the plain mean instead of NaN',
    approx(weightedMean([2, 4], [0, 0]), 3)
  );
}

console.log('\nconditionFactor (shrinkage)');
{
  // 20 normal records at 0.05, plus rainy records at 0.10 (double).
  const normals = Array.from({ length: 20 }, () => sample());
  const oneRainy = [...normals, sample({ rainfallMm: 10, wastePerPerson: 0.1 })];
  const manyRainy = [
    ...normals,
    ...Array.from({ length: 20 }, () => sample({ rainfallMm: 10, wastePerPerson: 0.1 })),
  ];

  const asOf = D('2024-06-01');
  const w1 = oneRainy.map((s) => recencyWeight(s.date, asOf));
  const w2 = manyRainy.map((s) => recencyWeight(s.date, asOf));

  const single = conditionFactor(oneRainy, w1, (s) => (s.rainfallMm ?? 0) >= 2.5);
  const plenty = conditionFactor(manyRainy, w2, (s) => (s.rainfallMm ?? 0) >= 2.5);

  check('one supporting record barely moves the factor', single.factor < 1.2, `got ${single.factor}`);
  check('many supporting records move it much further', plenty.factor > single.factor, `${plenty.factor} vs ${single.factor}`);
  check('sample size is reported', single.sampleSize === 1 && plenty.sampleSize === 20);
  check(
    'no matching records means exactly no effect',
    conditionFactor(normals, normals.map(() => 1), (s) => s.eventType === 'FESTIVAL').factor === 1
  );

  // An extreme group must still be clamped.
  const extreme = [...normals, ...Array.from({ length: 50 }, () => sample({ eventType: 'FESTIVAL', wastePerPerson: 5 }))];
  const clamped = conditionFactor(extreme, extreme.map(() => 1), (s) => s.eventType === 'FESTIVAL');
  check('runaway factors are clamped to MAX_FACTOR', clamped.factor <= MAX_FACTOR, `got ${clamped.factor}`);
  check('clamp bounds are the documented ones', MIN_FACTOR === 0.6 && MAX_FACTOR === 1.7);
}

console.log('\nselectBaseline (tier fallback)');
{
  const tight = Array.from({ length: 5 }, () => sample());
  check('exact match uses the tightest tier', selectBaseline(tight, target())?.tier.tier === 'meal-day-week');

  // Same meal+day but the other week type only -> falls back one tier.
  const otherWeek = Array.from({ length: 5 }, () => sample({ weekType: 'B' }));
  check('thin exact match falls back to meal-day', selectBaseline(otherWeek, target())?.tier.tier === 'meal-day');

  // Same meal, different days -> falls back two tiers.
  const otherDays = Array.from({ length: 5 }, () => sample({ dayOfWeek: 'FRIDAY', weekType: 'B' }));
  check('falls back to meal when the day never matches', selectBaseline(otherDays, target())?.tier.tier === 'meal');

  // No lunches at all -> whole-mess tier.
  const otherMeals = Array.from({ length: 5 }, () => sample({ mealSlot: 'DINNER', dayOfWeek: 'FRIDAY', weekType: 'B' }));
  check('falls back to whole-mess as a last resort', selectBaseline(otherMeals, target())?.tier.tier === 'mess');

  check('no history at all returns null', selectBaseline([], target()) === null);
}

console.log('\npredictWaste');
{
  check('empty history returns null, not a guess', predictWaste([], target()) === null);

  // 10 identical Monday lunches: 0.05 kg/person, 400 diners = 20 kg.
  const steady = Array.from({ length: 10 }, (_, i) =>
    sample({ date: D(`2024-06-${String(i + 1).padStart(2, '0')}`) })
  );
  const p = predictWaste(steady, target())!;
  check('predicts the historical level when nothing varies', approx(p.predictedTotalWasteKg, 20, 0.5), `got ${p.predictedTotalWasteKg}`);
  check('per-person figure is carried through', approx(p.predictedWastePerPerson, 0.05, 0.005));
  check('headcount is inferred from history', p.expectedHeadcount === 400);
  check('headcountSource reports the inference', p.headcountSource === 'historical');
  check('no drivers fire when conditions are unremarkable', p.drivers.length === 0, JSON.stringify(p.drivers));
  check('range brackets the estimate', p.rangeLowKg <= p.predictedTotalWasteKg && p.rangeHighKg >= p.predictedTotalWasteKg);
  check('range is never negative', p.rangeLowKg >= 0);
  check('identical history still gets the minimum spread', p.rangeHighKg > p.predictedTotalWasteKg);

  // A provided headcount overrides the historical one.
  const withHc = predictWaste(steady, target({ headcount: 800 }))!;
  check('provided headcount is used', withHc.expectedHeadcount === 800);
  check('provided headcount is flagged as such', withHc.headcountSource === 'provided');
  check('kilograms scale with headcount', approx(withHc.predictedTotalWasteKg, p.predictedTotalWasteKg * 2, 0.6));

  // Rain should push the prediction up and show as a driver.
  const rainy = [
    ...steady,
    ...Array.from({ length: 12 }, (_, i) =>
      sample({ date: D(`2024-05-${String(i + 1).padStart(2, '0')}`), rainfallMm: 12, wastePerPerson: 0.09, mealSlot: 'DINNER' })
    ),
  ];
  const wet = predictWaste(rainy, target({ rainfallMm: 12 }))!;
  const dry = predictWaste(rainy, target({ rainfallMm: 0 }))!;
  check('rain raises the prediction', wet.predictedTotalWasteKg > dry.predictedTotalWasteKg);
  check('rain is surfaced as a named driver', wet.drivers.some((d) => d.key === 'rain'));
  check('driver impact is a signed percentage', wet.drivers.every((d) => approx(d.impactPct, (d.factor - 1) * 100, 0.6)));
  check('driver reports its sample size', wet.drivers.every((d) => d.sampleSize > 0));

  // Confidence responds to how much history is behind the baseline.
  const thin = predictWaste(steady.slice(0, 3), target())!;
  check('a thin baseline reports low confidence', thin.confidence === 'low', thin.confidence);
  const fat = predictWaste(
    Array.from({ length: 20 }, (_, i) => sample({ date: new Date(Date.UTC(2024, 4, i + 1)) })),
    target()
  )!;
  check('a deep baseline reports high confidence', fat.confidence === 'high', fat.confidence);

  // Baseline metadata is honest about where the number came from.
  check('baseline names its tier', p.baseline.tier === 'meal-day-week');
  check('baseline reports its sample size', p.baseline.sampleSize === 10);
  check('baseline label is human-readable', /Monday Lunch/.test(p.baseline.label), p.baseline.label);

  // Only records BEFORE the target should ever be passed in — verify the
  // model doesn't secretly depend on the target being in the future.
  const backTest = predictWaste(steady, target({ date: D('2024-06-11') }))!;
  check('back-testing a historical date still works', backTest.predictedTotalWasteKg > 0);

  // Menu flags only fire when the scheduled menu actually has them.
  const withBiryani = [
    ...steady,
    ...Array.from({ length: 12 }, (_, i) =>
      sample({
        date: D(`2024-04-${String(i + 1).padStart(2, '0')}`),
        mealSlot: 'DINNER',
        wastePerPerson: 0.09,
        menuFlags: { hasBiryani: true, hasPaneer: false, hasDessert: false },
      })
    ),
  ];
  const biryaniDay = predictWaste(
    withBiryani,
    target({ menuFlags: { hasBiryani: true, hasPaneer: false, hasDessert: false } })
  )!;
  const plainDay = predictWaste(
    withBiryani,
    target({ menuFlags: { hasBiryani: false, hasPaneer: false, hasDessert: false } })
  )!;
  check('a menu flag on the schedule fires its driver', biryaniDay.drivers.some((d) => d.key === 'hasBiryani'));
  check('an absent menu flag fires nothing', !plainDay.drivers.some((d) => d.key === 'hasBiryani'));
}

console.log('\nseasonalWeather');
{
  const rows = [
    { date: D('2023-11-05'), temperatureMeanC: 26, rainMm: 30 },
    { date: D('2023-11-20'), temperatureMeanC: 28, rainMm: 10 },
    { date: D('2023-06-05'), temperatureMeanC: 36, rainMm: 0 },
  ];
  const nov = seasonalWeather(rows, D('2024-11-12'));
  check('uses the same calendar month across years', approx(nov.temperatureC!, 27) && approx(nov.rainfallMm!, 20));
  const jun = seasonalWeather(rows, D('2024-06-15'));
  check('a different month gives a different normal', approx(jun.temperatureC!, 36));
  const none = seasonalWeather(rows, D('2024-02-01'));
  check('a month with no data falls back to the whole pool', none.temperatureC !== null);
  check('no rows at all yields nulls', seasonalWeather([], D('2024-01-01')).temperatureC === null);
  const nulls = seasonalWeather([{ date: D('2024-01-01'), temperatureMeanC: null, rainMm: null }], D('2024-01-05'));
  check('all-null readings yield nulls rather than 0', nulls.temperatureC === null && nulls.rainfallMm === null);
}

console.log('\neventTypeFromCalendar');
{
  const base = { isHoliday: false, isExamWeek: false, isQuizWeek: false, isMajorEvent: false };
  check('a plain day is NORMAL', eventTypeFromCalendar(base) === 'NORMAL');
  check('missing calendar data is NORMAL', eventTypeFromCalendar(null) === 'NORMAL');
  check('holiday wins', eventTypeFromCalendar({ ...base, isHoliday: true, isExamWeek: true }) === 'HOLIDAY');
  check('major event outranks exams', eventTypeFromCalendar({ ...base, isMajorEvent: true, isExamWeek: true }) === 'COLLEGE_EVENT');
  check('exam week maps to EXAM_PERIOD', eventTypeFromCalendar({ ...base, isExamWeek: true }) === 'EXAM_PERIOD');
  check('quiz week also maps to EXAM_PERIOD', eventTypeFromCalendar({ ...base, isQuizWeek: true }) === 'EXAM_PERIOD');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
