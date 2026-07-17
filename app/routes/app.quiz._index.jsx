import { useEffect } from "react";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, isBillingTest, getMaxQuizzes } from "../shopify.server";
import prisma from "../db.server";
import { syncShopCatalog, getShopCatalog } from "../models/shopCatalog.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);

  const [quizzes, { appSubscriptions }, catalog] = await Promise.all([
    prisma.quiz.findMany({
      where: { shop: session.shop },
      orderBy: { title: "asc" },
      include: { _count: { select: { questions: true, completions: true } } },
    }),
    billing.check({ isTest: isBillingTest }),
    getShopCatalog(session.shop),
  ]);

  return {
    quizzes,
    maxQuizzes: getMaxQuizzes(appSubscriptions),
    tagCount: catalog.tags.length,
    collectionCount: catalog.collections.length,
    syncedAt: catalog.syncedAt,
  };
};

export const action = async ({ request }) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync-store") {
    const { tags, collections } = await syncShopCatalog(admin, session.shop);
    return { ok: true, synced: { tagCount: tags.length, collectionCount: collections.length } };
  }

  if (intent === "create") {
    const quiz = await prisma.quiz.create({
      data: { shop: session.shop, title: "New quiz" },
    });
    return redirect(`/app/quiz/${quiz.id}`);
  }

  const id = formData.get("id");
  const quiz = await prisma.quiz.findFirst({ where: { id, shop: session.shop } });
  if (!quiz) return { ok: false };

  if (intent === "toggle-publish") {
    if (!quiz.published) {
      const { appSubscriptions } = await billing.check({ isTest: isBillingTest });
      const maxQuizzes = getMaxQuizzes(appSubscriptions);
      const publishedCount = await prisma.quiz.count({
        where: { shop: session.shop, published: true },
      });
      if (publishedCount >= maxQuizzes) {
        return {
          ok: false,
          error: `Your plan allows up to ${maxQuizzes} published quiz${maxQuizzes === 1 ? "" : "es"} at once. Unpublish one first, or upgrade on the Plans page.`,
        };
      }
    }
    await prisma.quiz.update({ where: { id }, data: { published: !quiz.published } });
  } else if (intent === "delete") {
    await prisma.quiz.delete({ where: { id } });
  } else if (intent === "reset-stats") {
    // Wipes every stat record for this quiz (views, completions, add to
    // carts, revenue) - the quiz itself and its questions stay untouched.
    await prisma.$transaction([
      prisma.quizView.deleteMany({ where: { quizId: id } }),
      prisma.quizCompletion.deleteMany({ where: { quizId: id } }),
      prisma.quizAddToCart.deleteMany({ where: { quizId: id } }),
      prisma.quizConversion.deleteMany({ where: { quizId: id } }),
    ]);
    return { ok: true, statsReset: true };
  } else if (intent === "duplicate") {
    const full = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: { include: { answers: true } } },
    });
    // eslint-disable-next-line no-unused-vars
    const { id: _id, shop: _shop, createdAt, updatedAt, questions, ...rest } = full;
    await prisma.quiz.create({
      data: {
        ...rest,
        shop: session.shop,
        title: `${full.title} (copy)`,
        published: false,
        questions: {
          create: questions.map((q, i) => ({
            text: q.text,
            position: i,
            answers: {
              create: q.answers.map((a, j) => ({
                text: a.text,
                tag: a.tag,
                minPrice: a.minPrice,
                maxPrice: a.maxPrice,
                position: j,
              })),
            },
          })),
        },
      },
    });
  }

  return { ok: true };
};

function formatSyncedAt(syncedAt) {
  if (!syncedAt) return "Never synced yet";
  const diffMs = Date.now() - new Date(syncedAt).getTime();
  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 1) return "Synced less than an hour ago";
  if (diffHours < 24) return `Synced ${diffHours}h ago`;
  return `Synced ${Math.round(diffHours / 24)}d ago`;
}

/* eslint-disable react/prop-types -- plain JS project, no prop-types
   package; props here are plain objects/values, not worth a schema. */
const CARD_BORDER = "1px solid #e1e3e5";
const LABEL_GRAY = "#6b7177";

function StatusPill({ published }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: 600,
        background: published ? "#e3f1e8" : "#f1f2f4",
        color: published ? "#108043" : "#6b7177",
        padding: "3px 10px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: published ? "#108043" : "#8c9196",
        }}
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}
/* eslint-enable react/prop-types */

const PLACEMENT_LABELS = {
  auto: "Homepage",
  collection: "Collection page",
  popup: "Popup",
  custom: "Custom",
};

export default function QuizDashboard() {
  const { quizzes, maxQuizzes, tagCount, collectionCount, syncedAt } = useLoaderData();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data?.statsReset) {
      shopify.toast.show("Quiz stats reset");
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (syncFetcher.data?.synced) {
      const { tagCount: t, collectionCount: c } = syncFetcher.data.synced;
      shopify.toast.show(`Store synced - found ${t} tags, ${c} collections`);
    }
  }, [syncFetcher.data, shopify]);

  const handleDelete = (id, title) => {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    fetcher.submit({ intent: "delete", id }, { method: "POST" });
  };

  const handleResetStats = (id, title) => {
    if (
      !window.confirm(
        `Reset all stats for "${title}"? Views, completions, add to carts and revenue history will be deleted permanently. The quiz itself stays.`,
      )
    ) {
      return;
    }
    fetcher.submit({ intent: "reset-stats", id }, { method: "POST" });
  };

  const publishedCount = quizzes.filter((q) => q.published).length;
  const isSyncing = syncFetcher.state !== "idle";

  return (
    <s-page heading="Quizzes">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: "create" }, { method: "POST" })}
      >
        Create quiz
      </s-button>
      <s-button
        slot="secondary-actions"
        {...(isSyncing ? { loading: true } : {})}
        onClick={() => syncFetcher.submit({ intent: "sync-store" }, { method: "POST" })}
      >
        Sync store
      </s-button>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
        {/* Summary strip */}
        <div
          style={{
            border: CARD_BORDER,
            borderRadius: "12px",
            background: "#ffffff",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            fontSize: "13px",
          }}
        >
          <div>
            <span style={{ fontWeight: 650 }}>
              {publishedCount} of {maxQuizzes}
            </span>{" "}
            published quizzes on your plan ·{" "}
            <s-link href="/app/plans">Compare plans</s-link>
          </div>
          <div style={{ color: LABEL_GRAY }}>
            {formatSyncedAt(syncedAt)} · {tagCount} tags · {collectionCount} collections in
            autocomplete
          </div>
        </div>

        {quizzes.length === 0 ? (
          <div
            style={{
              border: "1px dashed #c9cccf",
              borderRadius: "12px",
              padding: "48px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 650 }}>No quizzes yet</div>
            <div style={{ fontSize: "13px", color: LABEL_GRAY, maxWidth: "420px" }}>
              Create one, add a few questions, match them to your product tags, and publish
              it to show it on your storefront.
            </div>
            <s-button onClick={() => fetcher.submit({ intent: "create" }, { method: "POST" })}>
              Create your first quiz
            </s-button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                style={{
                  border: CARD_BORDER,
                  borderRadius: "12px",
                  background: "#ffffff",
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <s-link href={`/app/quiz/${quiz.id}`}>
                      <span style={{ fontSize: "14px", fontWeight: 650 }}>{quiz.title}</span>
                    </s-link>
                    <StatusPill published={quiz.published} />
                  </div>
                  <div style={{ fontSize: "12px", color: LABEL_GRAY, marginTop: "4px" }}>
                    {PLACEMENT_LABELS[quiz.placementMode] || quiz.placementMode}
                    {quiz.placementMode === "collection" &&
                      ` · ${quiz.collectionHandle || "collection not set"}`}
                    {" · "}
                    {quiz._count.questions} question{quiz._count.questions === 1 ? "" : "s"}
                    {" · "}
                    {quiz._count.completions} completion{quiz._count.completions === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <s-button
                    variant="tertiary"
                    onClick={() =>
                      fetcher.submit({ intent: "toggle-publish", id: quiz.id }, { method: "POST" })
                    }
                  >
                    {quiz.published ? "Unpublish" : "Publish"}
                  </s-button>
                  <s-button variant="secondary" href={`/app/quiz/${quiz.id}`}>
                    Edit
                  </s-button>
                  <s-button
                    variant="tertiary"
                    onClick={() =>
                      fetcher.submit({ intent: "duplicate", id: quiz.id }, { method: "POST" })
                    }
                  >
                    Duplicate
                  </s-button>
                  <s-button variant="tertiary" onClick={() => handleResetStats(quiz.id, quiz.title)}>
                    Reset stats
                  </s-button>
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => handleDelete(quiz.id, quiz.title)}
                  >
                    Delete
                  </s-button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
