// Main seed entry point — `npm run seed` (also runs automatically after
// `prisma migrate dev` via the `prisma.seed` field in package.json).
//
// Order matters: Mess -> Users -> CalendarDay -> WeatherDaily -> MenuSlot ->
// demo WasteRecord (the last two depend on CalendarDay/MenuSlot for context).
//
// Safe to re-run: Mess/User/MenuSlot/WasteRecord use upsert; CalendarDay/
// WeatherDaily use createMany({ skipDuplicates: true }) since they're pure
// reference data — if you change weather.csv or academic-calendar.csv and
// want the DB to pick up the new values, clear those two tables first
// (`npx prisma studio` or a quick `DELETE FROM weather_daily;`) and re-seed.

import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/auth';
import { IIT_MADRAS_LOCATION } from '../src/lib/constants';
import { formatDateOnly } from '../src/lib/date-utils';
import { loadMenuSlotSeedRows } from './seed-lib/menu';
import { loadWeatherSeedRows } from './seed-lib/weather';
import { loadCalendarSeedRows } from './seed-lib/calendar';
import { buildSeedUsers } from './seed-lib/users';
import { buildDemoRecords } from './seed-lib/demo-records';
import type { MenuTag } from '@prisma/client';

const MESSES = [
  { number: 1, name: 'Mess 1', code: 'M1' },
  { number: 2, name: 'Mess 2', code: 'M2' },
  { number: 3, name: 'Mess 3', code: 'M3' },
  { number: 4, name: 'Mess 4', code: 'M4' },
];

async function main() {
  console.log('--- MessWaste Analytics seed ---\n');

  // 1. Messes
  console.log('[1/6] Messes...');
  const messByCode = new Map<string, { id: string; code: string }>();
  for (const m of MESSES) {
    const mess = await prisma.mess.upsert({
      where: { code: m.code },
      update: {},
      create: {
        name: m.name,
        code: m.code,
        latitude: IIT_MADRAS_LOCATION.latitude,
        longitude: IIT_MADRAS_LOCATION.longitude,
        timezone: IIT_MADRAS_LOCATION.timezone,
      },
    });
    messByCode.set(m.code, mess);
  }
  console.log(`  done: ${MESSES.map((m) => m.code).join(', ')}`);

  // 2. Users
  console.log('[2/6] Users...');
  const seedUsers = buildSeedUsers(MESSES.map((m) => m.code));
  for (const u of seedUsers) {
    const passwordHash = await hashPassword(u.password);
    const messId = u.messCode ? messByCode.get(u.messCode)!.id : null;
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, name: u.name, role: u.role, messId },
      create: { email: u.email, passwordHash, name: u.name, role: u.role, messId },
    });
  }
  console.log(`  done: 1 Admin + ${MESSES.length} Data Collectors`);

  // 3. CalendarDay (institution-wide, one row per date)
  console.log('[3/6] Calendar (2024)...');
  const calendarRows = loadCalendarSeedRows();
  await prisma.calendarDay.createMany({
    data: calendarRows.map((r) => ({
      date: r.date,
      dayOfWeek: r.dayOfWeek,
      isWeekend: r.isWeekend,
      isHoliday: r.isHoliday,
      holidayName: r.holidayName,
      isQuizWeek: r.isQuizWeek,
      isExamWeek: r.isExamWeek,
      isMajorEvent: r.isMajorEvent,
      eventName: r.eventName,
      weekType: r.weekType,
    })),
    skipDuplicates: true,
  });
  const calendarByDate = new Map(calendarRows.map((r) => [formatDateOnly(r.date), r]));
  console.log(`  done: ${calendarRows.length} days`);

  // 4. WeatherDaily (same daily reading stored once per mess — see seed-lib/weather.ts)
  console.log('[4/6] Weather (2024, per mess)...');
  const weatherRows = loadWeatherSeedRows();
  for (const m of MESSES) {
    const messId = messByCode.get(m.code)!.id;
    await prisma.weatherDaily.createMany({
      data: weatherRows.map((r) => ({
        messId,
        date: r.date,
        temperatureMaxC: r.temperatureMaxC,
        temperatureMinC: r.temperatureMinC,
        temperatureMeanC: r.temperatureMeanC,
        precipitationMm: r.precipitationMm,
        rainMm: r.rainMm,
        humidityPercent: r.humidityPercent,
        source: r.source,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  done: ${weatherRows.length} days x ${MESSES.length} messes`);

  // 5. MenuSlot (per mess: 14 cycle days x 4 meal slots = 56 rows)
  console.log('[5/6] Menu slots...');
  // tagsBySlot is reused by the demo-records generator so demo WasteRecords
  // carry the same tags as their scheduled MenuSlot.
  const tagsBySlotByMess = new Map<string, Map<string, MenuTag[]>>();
  for (const m of MESSES) {
    const messId = messByCode.get(m.code)!.id;
    const rows = loadMenuSlotSeedRows(m.number, m.code);
    const tagsBySlot = new Map<string, MenuTag[]>();

    for (const row of rows) {
      await prisma.menuSlot.upsert({
        where: {
          messId_weekType_dayOfWeek_mealSlot: {
            messId,
            weekType: row.weekType,
            dayOfWeek: row.dayOfWeek,
            mealSlot: row.mealSlot,
          },
        },
        update: {
          itemCount: row.itemCount,
          pctGravyDishes: row.pctGravyDishes,
          hasBiryani: row.hasBiryani,
          hasPaneer: row.hasPaneer,
          hasEggBreakfast: row.hasEggBreakfast,
          hasDessert: row.hasDessert,
          hasDosa: row.hasDosa,
          hasParatha: row.hasParatha,
          tags: row.tags,
        },
        create: {
          messId,
          weekType: row.weekType,
          dayOfWeek: row.dayOfWeek,
          mealSlot: row.mealSlot,
          itemCount: row.itemCount,
          pctGravyDishes: row.pctGravyDishes,
          hasBiryani: row.hasBiryani,
          hasPaneer: row.hasPaneer,
          hasEggBreakfast: row.hasEggBreakfast,
          hasDessert: row.hasDessert,
          hasDosa: row.hasDosa,
          hasParatha: row.hasParatha,
          tags: row.tags,
        },
      });
      tagsBySlot.set(`${row.weekType}_${row.dayOfWeek}_${row.mealSlot}`, row.tags);
    }
    tagsBySlotByMess.set(m.code, tagsBySlot);
  }
  console.log(`  done: ${MESSES.length} messes x 56 slots`);

  // 6. Demo WasteRecord entries (trailing ~3 weeks of 2024-12, all 4 meal slots)
  console.log('[6/6] Demo waste records...');
  let recordCount = 0;
  for (const m of MESSES) {
    const messId = messByCode.get(m.code)!.id;
    const collector = await prisma.user.findUnique({ where: { email: `collector.${m.code.toLowerCase()}@messwaste.local` } });
    if (!collector) continue;

    const tagsBySlot = tagsBySlotByMess.get(m.code)!;
    const demoRows = buildDemoRecords(m.code, calendarByDate, tagsBySlot);

    for (const r of demoRows) {
      const menuSlot = await prisma.menuSlot.findUnique({
        where: {
          messId_weekType_dayOfWeek_mealSlot: {
            messId,
            weekType: r.weekType,
            dayOfWeek: r.dayOfWeek,
            mealSlot: r.mealSlot,
          },
        },
      });

      await prisma.wasteRecord.upsert({
        where: { messId_date_mealSlot: { messId, date: r.date, mealSlot: r.mealSlot } },
        update: {},
        create: {
          messId,
          date: r.date,
          mealSlot: r.mealSlot,
          weekType: r.weekType,
          dayOfWeek: r.dayOfWeek,
          menuSlotId: menuSlot?.id ?? null,
          plateWasteKg: r.plateWasteKg,
          counterWasteKg: r.counterWasteKg,
          packagingWasteKg: r.packagingWasteKg,
          totalWasteKg: r.totalWasteKg,
          headcount: r.headcount,
          quantityPrepared: r.quantityPrepared,
          quantityUnit: 'KG',
          totalIngredientCost: r.totalIngredientCost,
          wastePerPerson: r.wastePerPerson,
          wastePercent: r.wastePercent,
          temperatureC: null, // filled below from the WeatherDaily row just seeded
          rainfallMm: null,
          eventType: r.eventType,
          scheduleDeviation: r.scheduleDeviation,
          tags: r.tags,
          createdById: collector.id,
        },
      });
      recordCount += 1;
    }

    // Backfill temperatureC/rainfallMm from the WeatherDaily cache in one
    // pass (avoids one query per record above).
    const weatherByDate = await prisma.weatherDaily.findMany({ where: { messId } });
    const weatherMap = new Map(weatherByDate.map((w) => [formatDateOnly(w.date), w]));
    for (const r of demoRows) {
      const w = weatherMap.get(formatDateOnly(r.date));
      if (!w) continue;
      await prisma.wasteRecord.update({
        where: { messId_date_mealSlot: { messId, date: r.date, mealSlot: r.mealSlot } },
        data: { temperatureC: w.temperatureMeanC, rainfallMm: w.rainMm },
      });
    }
  }
  console.log(`  done: ${recordCount} demo records`);

  console.log('\n--- Seed complete ---');
  console.log('\nLogin credentials:');
  for (const u of seedUsers) {
    console.log(`  ${u.role.padEnd(15)} ${u.email.padEnd(32)} ${u.password}${u.messCode ? `  (${u.messCode})` : ''}`);
  }
  console.log('\nChange these before any real deployment.');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
