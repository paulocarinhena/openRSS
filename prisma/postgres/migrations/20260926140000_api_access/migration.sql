-- CreateTable
CREATE TABLE "api_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "feverKeyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_ref" (
    "id" SERIAL NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "article_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_ref" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,

    CONSTRAINT "api_ref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_token_secretHash_key" ON "api_token"("secretHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_token_feverKeyHash_key" ON "api_token"("feverKeyHash");

-- CreateIndex
CREATE INDEX "api_token_userId_idx" ON "api_token"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "article_ref_articleId_key" ON "article_ref"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "api_ref_kind_refId_key" ON "api_ref"("kind", "refId");

-- AddForeignKey
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_ref" ADD CONSTRAINT "article_ref_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: artigos existentes recebem ids na ordem em que chegaram.
INSERT INTO "article_ref" ("articleId") SELECT "id" FROM "article" ORDER BY "createdAt", "id";
