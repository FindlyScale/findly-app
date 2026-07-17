import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { syncShopCatalog } from "./models/shopCatalog.server";

export const STANDARD_PLAN = "Findly Standard";
export const PREMIUM_PLAN = "Findly Premium";

// Three tiers. "free" is not a billing plan - it's simply the absence of a
// subscription, so installs work instantly with no paywall (which is what
// gets an app its first installs and reviews). The ladder:
//   Free     - 1 published quiz, homepage/collection placement, redirect
//              results, full design + translations + analytics.
//   Standard - 3 published quizzes, + popup placement w/ floating button.
//   Premium  - 10 published quizzes, + in-quiz results (Add to cart,
//              quantity, conversion/revenue tracking), custom placement
//              block, custom CSS.
export const PLAN_LIMITS = {
  free: { maxQuizzes: 1 },
  [STANDARD_PLAN]: { maxQuizzes: 3, trialDays: 3 },
  [PREMIUM_PLAN]: { maxQuizzes: 10, trialDays: 7 },
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  billing: {
    [STANDARD_PLAN]: {
      lineItems: [
        {
          amount: 14.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PREMIUM_PLAN]: {
      lineItems: [
        {
          amount: 29.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  hooks: {
    // Fires right after every OAuth completion - fresh installs and
    // reauths (e.g. after a scope update) alike. Not awaited on purpose:
    // the merchant shouldn't sit on the install redirect waiting for a
    // GraphQL sync, and a failed first sync just gets caught by the daily
    // staleness check on the next admin page load instead.
    afterAuth: async ({ session, admin }) => {
      syncShopCatalog(admin, session.shop).catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Findly: initial catalog sync failed", error);
      });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// eslint-disable-next-line no-undef
export const isBillingTest = process.env.NODE_ENV !== "production";

// A subscription still counts as "trialing" (not yet actually paying) if
// today falls within its trialDays window starting at createdAt.
export function isSubscriptionTrialing(subscription) {
  if (!subscription?.trialDays) return false;
  const trialEnd = new Date(subscription.createdAt);
  trialEnd.setDate(trialEnd.getDate() + subscription.trialDays);
  return new Date() < trialEnd;
}

// "free" | "standard" | "premium" - the single source of truth every
// feature gate derives from.
export function getPlan(appSubscriptions) {
  const subs = appSubscriptions || [];
  if (subs.some((s) => s.name === PREMIUM_PLAN)) return "premium";
  if (subs.some((s) => s.name === STANDARD_PLAN)) return "standard";
  return "free";
}

export function isPremiumPlan(appSubscriptions) {
  return getPlan(appSubscriptions) === "premium";
}

// Standard or Premium - gates the popup placement.
export function isPaidPlan(appSubscriptions) {
  return getPlan(appSubscriptions) !== "free";
}

export function getMaxQuizzes(appSubscriptions) {
  const plan = getPlan(appSubscriptions);
  if (plan === "premium") return PLAN_LIMITS[PREMIUM_PLAN].maxQuizzes;
  if (plan === "standard") return PLAN_LIMITS[STANDARD_PLAN].maxQuizzes;
  return PLAN_LIMITS.free.maxQuizzes;
}

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
