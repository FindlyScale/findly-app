-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCatalog" (
    "shop" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "collections" TEXT NOT NULL DEFAULT '[]',
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "ShopCatalog_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Find your perfect product',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "collectionHandle" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#111111',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#111111',
    "borderColor" TEXT NOT NULL DEFAULT '#e1e1e1',
    "borderWidth" INTEGER NOT NULL DEFAULT 1,
    "borderRadius" INTEGER NOT NULL DEFAULT 12,
    "maxWidth" TEXT NOT NULL DEFAULT '480px',
    "customCss" TEXT NOT NULL DEFAULT '',
    "fontFamily" TEXT NOT NULL DEFAULT 'inherit',
    "questionFontSize" INTEGER NOT NULL DEFAULT 20,
    "answerFontSize" INTEGER NOT NULL DEFAULT 15,
    "cartNoticeBackgroundColor" TEXT NOT NULL DEFAULT '#111111',
    "cartNoticeTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "cartNoticeBorderColor" TEXT NOT NULL DEFAULT '#111111',
    "cartNoticeBorderWidth" INTEGER NOT NULL DEFAULT 0,
    "cartNoticeBorderRadius" INTEGER NOT NULL DEFAULT 8,
    "cartNoticeFullWidth" BOOLEAN NOT NULL DEFAULT false,
    "placementMode" TEXT NOT NULL DEFAULT 'auto',
    "resultsMode" TEXT NOT NULL DEFAULT 'redirect',
    "tagMatchMode" TEXT NOT NULL DEFAULT 'any',
    "addToCartBehavior" TEXT NOT NULL DEFAULT 'link',
    "popupDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "popupShowCloseButton" BOOLEAN NOT NULL DEFAULT true,
    "popupAlwaysOnHomepage" BOOLEAN NOT NULL DEFAULT false,
    "popupFrequencyMinutes" INTEGER NOT NULL DEFAULT 1440,
    "popupButtonPosition" TEXT NOT NULL DEFAULT 'left',
    "popupButtonBackgroundColor" TEXT NOT NULL DEFAULT '#111111',
    "popupButtonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "inlineShowMode" TEXT NOT NULL DEFAULT 'immediate',
    "bannerColumns" INTEGER NOT NULL DEFAULT 3,
    "bannerMaxProducts" INTEGER NOT NULL DEFAULT 8,
    "bannerButtonType" TEXT NOT NULL DEFAULT 'add-to-cart',
    "bannerShowQuantity" BOOLEAN NOT NULL DEFAULT false,
    "bannerContentAlign" TEXT NOT NULL DEFAULT 'left',
    "bannerImageAspect" TEXT NOT NULL DEFAULT 'square',
    "bannerImageWidth" INTEGER NOT NULL DEFAULT 220,
    "bannerImageHeight" INTEGER NOT NULL DEFAULT 220,
    "bannerWidth" TEXT NOT NULL DEFAULT '',
    "bannerTitleMaxLines" INTEGER NOT NULL DEFAULT 2,
    "bannerTitleColor" TEXT NOT NULL DEFAULT '#111111',
    "bannerPriceColor" TEXT NOT NULL DEFAULT '#111111',
    "bannerTitleFontSize" INTEGER NOT NULL DEFAULT 14,
    "bannerPriceFontSize" INTEGER NOT NULL DEFAULT 13,
    "bannerButtonBackgroundColor" TEXT NOT NULL DEFAULT '#111111',
    "bannerButtonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "priceFormat" TEXT NOT NULL DEFAULT 'auto',
    "priceCustomSymbol" TEXT NOT NULL DEFAULT '',
    "priceSymbolPosition" TEXT NOT NULL DEFAULT 'after',
    "textFindingMatches" TEXT NOT NULL DEFAULT 'Finding your matches…',
    "textError" TEXT NOT NULL DEFAULT 'Something went wrong. Please try again.',
    "textProgress" TEXT NOT NULL DEFAULT 'Question {current} of {total}',
    "textFloatingButton" TEXT NOT NULL DEFAULT 'Take the quiz',
    "textNoResults" TEXT NOT NULL DEFAULT 'No matches found.',
    "textAddToCart" TEXT NOT NULL DEFAULT 'Add to cart',
    "textAddingToCart" TEXT NOT NULL DEFAULT 'Adding…',
    "textAddedToCart" TEXT NOT NULL DEFAULT 'Added',
    "textViewCart" TEXT NOT NULL DEFAULT 'View cart →',
    "textViewProduct" TEXT NOT NULL DEFAULT 'View product',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tag" TEXT,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizCompletion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "answerIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizView" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAddToCart" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAddToCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizConversion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quiz_shop_idx" ON "Quiz"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "QuizConversion_orderId_key" ON "QuizConversion"("orderId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizCompletion" ADD CONSTRAINT "QuizCompletion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizView" ADD CONSTRAINT "QuizView_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAddToCart" ADD CONSTRAINT "QuizAddToCart_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizConversion" ADD CONSTRAINT "QuizConversion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

