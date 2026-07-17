import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncShopCatalog, isCatalogStale } from "../models/shopCatalog.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // No forced plan gate: installing lands merchants straight in the app on
  // the Free tier (no subscription). Paid features are gated where they
  // live - quiz limits, popup placement, banner results - and the Plans
  // page handles upgrades.

  // Every /app/* page load doubles as the "once a day" catalog sync check -
  // no separate cron/worker needed. Not awaited: refreshing tags shouldn't
  // ever add latency to a page the merchant is actively trying to open,
  // it just quietly catches up before the *next* load.
  const catalog = await prisma.shopCatalog.findUnique({
    where: { shop: session.shop },
    select: { syncedAt: true },
  });
  if (isCatalogStale(catalog?.syncedAt)) {
    syncShopCatalog(admin, session.shop).catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Findly: daily catalog sync failed", error);
    });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/quiz">Quiz Builder</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/plans">Plans</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
