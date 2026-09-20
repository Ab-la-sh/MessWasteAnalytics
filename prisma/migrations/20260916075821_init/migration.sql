-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DATA_COLLECTOR');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER');

-- CreateEnum
CREATE TYPE "WeekType" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('NORMAL', 'HOLIDAY', 'FESTIVAL', 'COLLEGE_EVENT', 'EXAM_PERIOD');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('KG', 'LITRES');

-- CreateEnum
CREATE TYPE "MenuTag" AS ENUM ('VEGETARIAN', 'NON_VEGETARIAN', 'FRIED', 'GRAVY', 'DRY', 'RICE_BASED', 'BREAD_BASED', 'SPICY', 'SWEET', 'DESSERT');

-- CreateTable
CREATE TABLE "messes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DATA_COLLECTOR',
    "messId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_slots" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "weekType" "WeekType" NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "mealSlot" "MealSlot" NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "pctGravyDishes" DOUBLE PRECISION NOT NULL,
    "hasBiryani" BOOLEAN NOT NULL DEFAULT false,
    "hasPaneer" BOOLEAN NOT NULL DEFAULT false,
    "hasEggBreakfast" BOOLEAN NOT NULL DEFAULT false,
    "hasDessert" BOOLEAN NOT NULL DEFAULT false,
    "hasDosa" BOOLEAN NOT NULL DEFAULT false,
    "hasParatha" BOOLEAN NOT NULL DEFAULT false,
    "tags" "MenuTag"[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealSlot" "MealSlot" NOT NULL,
    "weekType" "WeekType" NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "menuSlotId" TEXT,
    "plateWasteKg" DOUBLE PRECISION NOT NULL,
    "counterWasteKg" DOUBLE PRECISION NOT NULL,
    "packagingWasteKg" DOUBLE PRECISION NOT NULL,
    "totalWasteKg" DOUBLE PRECISION NOT NULL,
    "headcount" INTEGER NOT NULL,
    "quantityPrepared" DOUBLE PRECISION NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "totalIngredientCost" DOUBLE PRECISION NOT NULL,
    "wastePerPerson" DOUBLE PRECISION NOT NULL,
    "wastePercent" DOUBLE PRECISION NOT NULL,
    "temperatureC" DOUBLE PRECISION,
    "rainfallMm" DOUBLE PRECISION,
    "eventType" "EventType" NOT NULL DEFAULT 'NORMAL',
    "scheduleDeviation" BOOLEAN NOT NULL DEFAULT false,
    "deviationReason" TEXT,
    "deviationDescription" TEXT,
    "tags" "MenuTag"[],
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_daily" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "temperatureMaxC" DOUBLE PRECISION,
    "temperatureMinC" DOUBLE PRECISION,
    "temperatureMeanC" DOUBLE PRECISION,
    "precipitationMm" DOUBLE PRECISION,
    "rainMm" DOUBLE PRECISION,
    "humidityPercent" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "isWeekend" BOOLEAN NOT NULL DEFAULT false,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "holidayName" TEXT,
    "isQuizWeek" BOOLEAN NOT NULL DEFAULT false,
    "isExamWeek" BOOLEAN NOT NULL DEFAULT false,
    "isMajorEvent" BOOLEAN NOT NULL DEFAULT false,
    "eventName" TEXT,
    "weekType" "WeekType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messes_code_key" ON "messes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_messId_idx" ON "users"("messId");

-- CreateIndex
CREATE INDEX "menu_slots_messId_idx" ON "menu_slots"("messId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_slots_messId_weekType_dayOfWeek_mealSlot_key" ON "menu_slots"("messId", "weekType", "dayOfWeek", "mealSlot");

-- CreateIndex
CREATE INDEX "waste_records_messId_date_idx" ON "waste_records"("messId", "date");

-- CreateIndex
CREATE INDEX "waste_records_messId_dayOfWeek_mealSlot_weekType_idx" ON "waste_records"("messId", "dayOfWeek", "mealSlot", "weekType");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_messId_date_mealSlot_key" ON "waste_records"("messId", "date", "mealSlot");

-- CreateIndex
CREATE INDEX "weather_daily_messId_date_idx" ON "weather_daily"("messId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "weather_daily_messId_date_key" ON "weather_daily"("messId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_date_key" ON "calendar_days"("date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_messId_fkey" FOREIGN KEY ("messId") REFERENCES "messes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_slots" ADD CONSTRAINT "menu_slots_messId_fkey" FOREIGN KEY ("messId") REFERENCES "messes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_messId_fkey" FOREIGN KEY ("messId") REFERENCES "messes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_menuSlotId_fkey" FOREIGN KEY ("menuSlotId") REFERENCES "menu_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
