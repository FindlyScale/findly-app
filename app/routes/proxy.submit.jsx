import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Hard ceiling regardless of what a quiz's bannerMaxProducts setting asks
// for, so a bad value in the DB can't turn into a runaway Storefront query.
const HARD_MAX_BANNER_PRODUCTS = 24;

// Escape single quotes so a tag value can never break out of the quoted
// string in Shopify's search query syntax.
const escapeTag = (tag) => tag.replace(/'/g, "\\'");

export const action = async ({ request }) => {
  const { session, storefront } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json({ mode: "redirect", redirectUrl: "/collections/all" }, { status: 200 });
  }

  const body = await request.json();
  const answerIds = Array.isArray(body.answerIds) ? body.answerIds : [];

  // Only trust tag values that belong to this shop's own quiz answers -
  // never take a tag string directly from the request body.
  const rawAnswers = await prisma.answer.findMany({
    where: {
      id: { in: answerIds },
      question: { quiz: { shop: session.shop } },
    },
    select: {
      id: true,
      tag: true,
      minPrice: true,
      maxPrice: true,
      question: { select: { quizId: true } },
    },
  });

  // With multiple quizzes per shop, answerIds should all belong to the same
  // one - if they don't (a broken client, or a crafted request), keep only
  // the answers matching the first quiz found instead of merging tags
  // across unrelated quizzes.
  const quizId = rawAnswers[0]?.question.quizId;
  const answers = rawAnswers.filter((a) => a.question.quizId === quizId);

  if (quizId) {
    await prisma.quizCompletion.create({
      data: { quizId, answerIds: JSON.stringify(answers.map((a) => a.id)) },
    });
  }

  const tags = [...new Set(answers.map((a) => a.tag).filter(Boolean))];
  const priceAnswers = answers.filter((a) => a.minPrice != null || a.maxPrice != null);

  if (!quizId || (tags.length === 0 && priceAnswers.length === 0)) {
    return Response.json({ mode: "redirect", redirectUrl: "/collections/all" });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { resultsMode: true, bannerMaxProducts: true, tagMatchMode: true },
  });

  // The quiz's tagMatchMode decides how the picked tags combine: "all"
  // AND-s them (a product must carry every tag), "any" OR-s them (at least
  // one tag counts - the broad default). A price answer is always an AND
  // filter on top - "Under $75" should narrow the tag matches down, not
  // pull in unrelated cheap products via OR.
  //
  // Shopify's search query syntax (the `q=` string, and the equivalent
  // GraphQL `query` argument) does NOT support price comparisons like
  // "variants.price:>=75" - that's silently treated as literal text and
  // matches nothing. Price range filtering only works through the
  // dedicated filter.v.price.gte/lte params on /search and /collections
  // pages, or - for banner mode, where we don't have that param mechanism
  // available - by filtering the fetched candidates ourselves using their
  // real price.
  const joiner = quiz?.tagMatchMode === "all" ? " AND " : " OR ";
  const tagQuery =
    tags.length > 0 ? tags.map((tag) => `tag:'${escapeTag(tag)}'`).join(joiner) : "*";

  if (quiz?.resultsMode === "banner") {
    const maxProducts = Math.min(Math.max(quiz.bannerMaxProducts || 8, 1), HARD_MAX_BANNER_PRODUCTS);
    // Fetch a bigger candidate pool when a price answer needs to filter the
    // results ourselves afterward - otherwise we'd fetch exactly
    // maxProducts and then throw some of them away for being out of range,
    // ending up with fewer than requested.
    const fetchCount = priceAnswers.length > 0 ? Math.min(maxProducts * 4, 250) : maxProducts;
    try {
      const response = await storefront.graphql(
        `#graphql
          query MatchedProducts($query: String!, $first: Int!) {
            products(first: $first, query: $query) {
              nodes {
                id
                title
                handle
                featuredImage {
                  url
                  altText
                }
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 1) {
                  nodes {
                    id
                    availableForSale
                  }
                }
              }
            }
          }`,
        { variables: { query: tagQuery, first: fetchCount } },
      );
      const body = await response.json();

      if (body.errors) {
        console.error("Storefront API returned errors:", JSON.stringify(body.errors));
      } else {
        let products = body.data.products.nodes.filter((p) => p.variants.nodes[0]?.availableForSale);

        for (const answer of priceAnswers) {
          products = products.filter((p) => {
            const amount = Number(p.priceRange.minVariantPrice.amount);
            if (answer.minPrice != null && amount < answer.minPrice) return false;
            if (answer.maxPrice != null && amount > answer.maxPrice) return false;
            return true;
          });
        }

        return Response.json({
          mode: "banner",
          quizId,
          products: products.slice(0, maxProducts).map((p) => ({
            id: p.id,
            title: p.title,
            handle: p.handle,
            image: p.featuredImage,
            price: p.priceRange.minVariantPrice,
            // /cart/add.js wants the plain numeric id, not the GraphQL GID.
            variantId: p.variants.nodes[0].id.split("/").pop(),
          })),
        });
      }
    } catch (error) {
      // Never let a banner-mode failure break the quiz entirely - fall
      // through to the redirect below instead.
      console.error("Banner results mode failed, falling back to redirect:", error);
    }
  }

  // Redirecting into the store's own native search results means the
  // matched products render with the merchant's own theme - product cards,
  // colors, "add to cart" buttons - instead of us trying to replicate an
  // arbitrary theme's design ourselves.
  let redirectUrl = `/search?q=${encodeURIComponent(tagQuery)}&type=product`;
  for (const answer of priceAnswers) {
    if (answer.minPrice != null) redirectUrl += `&filter.v.price.gte=${answer.minPrice}`;
    if (answer.maxPrice != null) redirectUrl += `&filter.v.price.lte=${answer.maxPrice}`;
  }
  return Response.json({ mode: "redirect", redirectUrl });
};
