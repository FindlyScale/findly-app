import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function serializeQuiz(quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    design: {
      accentColor: quiz.accentColor,
      backgroundColor: quiz.backgroundColor,
      textColor: quiz.textColor,
      borderColor: quiz.borderColor,
      borderWidth: quiz.borderWidth,
      borderRadius: quiz.borderRadius,
      maxWidth: quiz.maxWidth,
      customCss: quiz.customCss,
      fontFamily: quiz.fontFamily,
      questionFontSize: quiz.questionFontSize,
      answerFontSize: quiz.answerFontSize,
      cartNoticeBackgroundColor: quiz.cartNoticeBackgroundColor,
      cartNoticeTextColor: quiz.cartNoticeTextColor,
      cartNoticeBorderColor: quiz.cartNoticeBorderColor,
      cartNoticeBorderWidth: quiz.cartNoticeBorderWidth,
      cartNoticeBorderRadius: quiz.cartNoticeBorderRadius,
      cartNoticeFullWidth: quiz.cartNoticeFullWidth,
      bannerColumns: quiz.bannerColumns,
      bannerMaxProducts: quiz.bannerMaxProducts,
      bannerButtonType: quiz.bannerButtonType,
      bannerShowQuantity: quiz.bannerShowQuantity,
      bannerContentAlign: quiz.bannerContentAlign,
      bannerImageAspect: quiz.bannerImageAspect,
      bannerImageWidth: quiz.bannerImageWidth,
      bannerImageHeight: quiz.bannerImageHeight,
      bannerWidth: quiz.bannerWidth,
      bannerTitleMaxLines: quiz.bannerTitleMaxLines,
      bannerTitleColor: quiz.bannerTitleColor,
      bannerPriceColor: quiz.bannerPriceColor,
      bannerTitleFontSize: quiz.bannerTitleFontSize,
      bannerPriceFontSize: quiz.bannerPriceFontSize,
      bannerButtonBackgroundColor: quiz.bannerButtonBackgroundColor,
      bannerButtonTextColor: quiz.bannerButtonTextColor,
      priceFormat: quiz.priceFormat,
      priceCustomSymbol: quiz.priceCustomSymbol,
      priceSymbolPosition: quiz.priceSymbolPosition,
    },
    placement: {
      mode: quiz.placementMode,
      resultsMode: quiz.resultsMode,
      addToCartBehavior: quiz.addToCartBehavior,
      inlineShowMode: quiz.inlineShowMode,
      popupDelaySeconds: quiz.popupDelaySeconds,
      popupShowCloseButton: quiz.popupShowCloseButton,
      popupAlwaysOnHomepage: quiz.popupAlwaysOnHomepage,
      popupFrequencyMinutes: quiz.popupFrequencyMinutes,
      popupButtonPosition: quiz.popupButtonPosition,
      popupButtonBackgroundColor: quiz.popupButtonBackgroundColor,
      popupButtonTextColor: quiz.popupButtonTextColor,
    },
    text: {
      findingMatches: quiz.textFindingMatches,
      error: quiz.textError,
      progress: quiz.textProgress,
      floatingButton: quiz.textFloatingButton,
      noResults: quiz.textNoResults,
      addToCart: quiz.textAddToCart,
      addingToCart: quiz.textAddingToCart,
      addedToCart: quiz.textAddedToCart,
      viewCart: quiz.textViewCart,
      viewProduct: quiz.textViewProduct,
    },
    questions: quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
    })),
  };
}

// "auto" only matches the homepage; "collection" only matches its own
// collectionHandle's page. Both are inline (non-popup) placements, so they
// share the same "auto" slot in the response - the client doesn't need to
// know which one resolved, just that something should render inline.
// Ties between multiple quizzes eligible for the same slot go to the
// oldest (quizzes are pre-sorted by createdAt).
function resolveInline(quizzes, path) {
  if (path === "/") {
    const homepage = quizzes.find((q) => q.placementMode === "auto");
    if (homepage) return homepage;
  }
  return (
    quizzes.find(
      (q) =>
        q.placementMode === "collection" &&
        q.collectionHandle &&
        path.startsWith(`/collections/${q.collectionHandle}`),
    ) || null
  );
}

function resolveSitewide(quizzes, mode) {
  return quizzes.find((q) => q.placementMode === mode) || null;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json({ quizzes: { auto: null, popup: null, custom: null } });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "/";

  const quizzes = await prisma.quiz.findMany({
    where: { shop: session.shop, published: true },
    orderBy: { createdAt: "asc" },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: { answers: { orderBy: { position: "asc" } } },
      },
    },
  });

  const inline = resolveInline(quizzes, path);
  const popup = resolveSitewide(quizzes, "popup");
  const custom = resolveSitewide(quizzes, "custom");

  return Response.json({
    quizzes: {
      auto: inline ? serializeQuiz(inline) : null,
      popup: popup ? serializeQuiz(popup) : null,
      custom: custom ? serializeQuiz(custom) : null,
    },
  });
};
