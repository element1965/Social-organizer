-- CreateTable
CREATE TABLE "translation_cache" (
    "id" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "translated" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "translation_cache_sourceHash_language_key" ON "translation_cache"("sourceHash", "language");
