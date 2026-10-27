-- Feedback / review submissions with screenshots stored in the database.
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'CHANGE', 'IDEA');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'PLANNED', 'DONE', 'DECLINED');

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackImage" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_status_archivedAt_idx" ON "Feedback"("status", "archivedAt");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX "FeedbackImage_feedbackId_idx" ON "FeedbackImage"("feedbackId");
CREATE INDEX "FeedbackImage_createdAt_idx" ON "FeedbackImage"("createdAt");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackImage" ADD CONSTRAINT "FeedbackImage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
