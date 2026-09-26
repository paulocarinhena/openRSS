-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_tag" (
    "tagId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_tag_pkey" PRIMARY KEY ("tagId","articleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_userId_name_key" ON "tag"("userId", "name");

-- CreateIndex
CREATE INDEX "article_tag_articleId_idx" ON "article_tag"("articleId");

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tag" ADD CONSTRAINT "article_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tag" ADD CONSTRAINT "article_tag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
