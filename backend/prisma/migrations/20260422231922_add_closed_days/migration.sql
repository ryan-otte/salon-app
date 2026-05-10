-- CreateTable
CREATE TABLE "public"."ClosedDay" (
    "id" SERIAL NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ClosedDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosedDay_day_key" ON "public"."ClosedDay"("day");
