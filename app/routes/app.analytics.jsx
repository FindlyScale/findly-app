import { useEffect } from "react";
import { useNavigate, useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Stats older than this are permanently pruned (see loader) - both to keep
// the tables small and because the UI promises "up to 12 months" of data.
const RETENTION_DAYS = 365;

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

// Buckets sized to the range so the chart always has a readable number of
// bars: daily up to a month, weekly up to a quarter, monthly for a year.
function buildTrend(completions, rangeDays, now) {
  const buckets = [];
  const byKey = {};

  if (rangeDays <= 31) {
    for (let i = rangeDays - 1; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const bucket = {
        key,
        label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: 0,
      };
      buckets.push(bucket);
      byKey[key] = bucket;
    }
    for (const completion of completions) {
      const key = completion.createdAt.toISOString().slice(0, 10);
      if (byKey[key]) byKey[key].count += 1;
    }
  } else if (rangeDays <= 92) {
    const start = new Date(now);
    start.setDate(start.getDate() - (rangeDays - 1));
    // Align to Monday so the weekly buckets are stable calendar weeks.
    start.setDate(start.getDate() - ((start.getUTCDay() + 6) % 7));
    for (let day = new Date(start); day <= now; day.setDate(day.getDate() + 7)) {
      const key = day.toISOString().slice(0, 10);
      const bucket = {
        key,
        label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: 0,
      };
      buckets.push(bucket);
      byKey[key] = bucket;
    }
    for (const completion of completions) {
      const day = new Date(completion.createdAt);
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      const key = day.toISOString().slice(0, 10);
      if (byKey[key]) byKey[key].count += 1;
    }
  } else {
    for (let i = 11; i >= 0; i -= 1) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = day.toISOString().slice(0, 7);
      const bucket = {
        key,
        label: day.toLocaleDateString("en-US", { month: "short" }),
        count: 0,
      };
      buckets.push(bucket);
      byKey[key] = bucket;
    }
    for (const completion of completions) {
      const key = completion.createdAt.toISOString().slice(0, 7);
      if (byKey[key]) byKey[key].count += 1;
    }
  }

  return buckets;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Rolling 12-month retention: anything older is deleted for good. Fire
  // and forget - pruning should never delay the page.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const shopFilter = { createdAt: { lt: cutoff }, quiz: { shop: session.shop } };
  Promise.all([
    prisma.quizView.deleteMany({ where: shopFilter }),
    prisma.quizCompletion.deleteMany({ where: shopFilter }),
    prisma.quizAddToCart.deleteMany({ where: shopFilter }),
    prisma.quizConversion.deleteMany({ where: shopFilter }),
  ]).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Findly: analytics retention cleanup failed", error);
  });

  const quizzes = await prisma.quiz.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });

  if (quizzes.length === 0) {
    return { hasQuiz: false };
  }

  const url = new URL(request.url);
  const requestedId = url.searchParams.get("quiz");
  const selected = quizzes.find((q) => q.id === requestedId) ?? quizzes[0];

  const rangeParam = url.searchParams.get("range");
  const rangeDays = RANGES.some((r) => r.value === rangeParam) ? Number(rangeParam) : 30;

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - rangeDays);
  // The same-length window immediately before the current one, for the
  // "vs previous period" deltas on the stat cards.
  const prevSince = new Date(since);
  prevSince.setDate(prevSince.getDate() - rangeDays);

  const inRange = { gte: since };
  const inPrev = { gte: prevSince, lt: since };

  const [
    views,
    completions,
    addToCarts,
    conversions,
    prevViews,
    prevCompletions,
    prevAddToCarts,
    prevConversions,
  ] = await Promise.all([
    prisma.quizView.count({ where: { quizId: selected.id, createdAt: inRange } }),
    prisma.quizCompletion.findMany({
      where: { quizId: selected.id, createdAt: inRange },
      select: { createdAt: true, answerIds: true },
    }),
    prisma.quizAddToCart.count({ where: { quizId: selected.id, createdAt: inRange } }),
    prisma.quizConversion.findMany({
      where: { quizId: selected.id, createdAt: inRange },
      select: { amount: true, currencyCode: true },
    }),
    prisma.quizView.count({ where: { quizId: selected.id, createdAt: inPrev } }),
    prisma.quizCompletion.count({ where: { quizId: selected.id, createdAt: inPrev } }),
    prisma.quizAddToCart.count({ where: { quizId: selected.id, createdAt: inPrev } }),
    prisma.quizConversion.count({ where: { quizId: selected.id, createdAt: inPrev } }),
  ]);

  const revenueByCurrency = {};
  let revenueTotal = 0;
  for (const conversion of conversions) {
    revenueByCurrency[conversion.currencyCode] =
      (revenueByCurrency[conversion.currencyCode] || 0) + conversion.amount;
    revenueTotal += conversion.amount;
  }

  const trend = buildTrend(completions, rangeDays, now);

  // Tally answer picks within the range.
  const answerCounts = {};
  for (const completion of completions) {
    let ids = [];
    try {
      ids = JSON.parse(completion.answerIds);
    } catch {
      ids = [];
    }
    for (const id of ids) {
      answerCounts[id] = (answerCounts[id] || 0) + 1;
    }
  }
  const topAnswerIds = Object.entries(answerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  const topAnswerRecords = await prisma.answer.findMany({
    where: { id: { in: topAnswerIds } },
    include: { question: { select: { text: true } } },
  });
  const topAnswers = topAnswerIds
    .map((id) => {
      const answer = topAnswerRecords.find((a) => a.id === id);
      if (!answer) return null;
      return { text: answer.text, questionText: answer.question.text, count: answerCounts[id] };
    })
    .filter(Boolean);

  return {
    hasQuiz: true,
    quizzes,
    selectedId: selected.id,
    selectedTitle: selected.title,
    rangeDays,
    views,
    completions: completions.length,
    addToCarts,
    orders: conversions.length,
    revenueTotal,
    revenueByCurrency,
    prev: {
      views: prevViews,
      completions: prevCompletions,
      addToCarts: prevAddToCarts,
      orders: prevConversions,
    },
    trend,
    topAnswers,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "reset") {
    const quizId = formData.get("quiz");
    const quiz = await prisma.quiz.findFirst({ where: { id: quizId, shop: session.shop } });
    if (!quiz) return { ok: false };
    await prisma.$transaction([
      prisma.quizView.deleteMany({ where: { quizId } }),
      prisma.quizCompletion.deleteMany({ where: { quizId } }),
      prisma.quizAddToCart.deleteMany({ where: { quizId } }),
      prisma.quizConversion.deleteMany({ where: { quizId } }),
    ]);
    return { ok: true, reset: true };
  }

  return { ok: false };
};

/* eslint-disable react/prop-types -- plain JS project, no prop-types
   package; props here are plain objects/values, not worth a schema. */
const CARD_BORDER = "1px solid #e1e3e5";
const LABEL_GRAY = "#6b7177";

function Card({ title, subtitle, children }) {
  return (
    <div
      style={{
        border: CARD_BORDER,
        borderRadius: "12px",
        background: "#ffffff",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {title && (
        <div>
          <div style={{ fontSize: "15px", fontWeight: 650 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: "13px", color: LABEL_GRAY, marginTop: "2px", lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Delta({ current, previous, suffix }) {
  if (previous === 0 || previous == null) {
    return <span style={{ fontSize: "12px", color: LABEL_GRAY }}>—</span>;
  }
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  return (
    <span
      style={{
        fontSize: "12px",
        fontWeight: 600,
        color: up ? "#108043" : "#d72c0d",
        whiteSpace: "nowrap",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(0)}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

function StatCard({ label, value, current, previous }) {
  return (
    <div
      style={{
        border: CARD_BORDER,
        borderRadius: "12px",
        background: "#ffffff",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: LABEL_GRAY,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <Delta current={current} previous={previous} />
    </div>
  );
}

function FunnelRow({ label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: LABEL_GRAY }}>
          {count} · {pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%
        </span>
      </div>
      <div style={{ height: "10px", background: "#f1f2f4", borderRadius: "5px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.max(pct, count > 0 ? 1.5 : 0)}%`,
            background: "#2a2a2a",
            borderRadius: "5px",
          }}
        />
      </div>
    </div>
  );
}

function TrendChart({ trend }) {
  const max = Math.max(...trend.map((b) => b.count), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "160px" }}>
        {trend.map((bucket) => (
          <div
            key={bucket.key}
            title={`${bucket.label}: ${bucket.count} completion${bucket.count === 1 ? "" : "s"}`}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${Math.max((bucket.count / max) * 100, bucket.count > 0 ? 4 : 2)}%`,
              background: bucket.count > 0 ? "#2a2a2a" : "#e8eaec",
              borderRadius: "4px 4px 0 0",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
          fontSize: "12px",
          color: LABEL_GRAY,
        }}
      >
        <span>{trend[0]?.label}</span>
        {trend.length > 2 && <span>{trend[Math.floor(trend.length / 2)]?.label}</span>}
        <span>{trend[trend.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function TopAnswers({ topAnswers }) {
  const max = Math.max(...topAnswers.map((a) => a.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {topAnswers.map((answer, index) => (
        <div key={index} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: LABEL_GRAY }}>{answer.questionText}</div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{answer.text}</div>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
              {answer.count}
            </div>
          </div>
          <div style={{ height: "8px", background: "#f1f2f4", borderRadius: "4px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(answer.count / max) * 100}%`,
                background: "#2a2a2a",
                borderRadius: "4px",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
/* eslint-enable react/prop-types */

export default function Analytics() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.reset) {
      shopify.toast.show("Analytics reset for this quiz");
    }
  }, [fetcher.data, shopify]);

  if (!data.hasQuiz) {
    return (
      <s-page heading="Analytics">
        <s-section>
          <s-paragraph>
            Build a quiz first on the <s-link href="/app/quiz">Quiz Builder</s-link> page -
            stats will show up here once visitors start taking it.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const {
    quizzes,
    selectedId,
    selectedTitle,
    rangeDays,
    views,
    completions,
    addToCarts,
    orders,
    revenueTotal,
    revenueByCurrency,
    prev,
    trend,
    topAnswers,
  } = data;

  const completionRate = views > 0 ? (completions / views) * 100 : 0;
  const prevCompletionRate = prev.views > 0 ? (prev.completions / prev.views) * 100 : 0;
  const revenueLines = Object.entries(revenueByCurrency);
  const isResetting = fetcher.state !== "idle";

  const handleReset = () => {
    if (
      !window.confirm(
        `Reset all analytics for "${selectedTitle}"? Views, completions, add to carts and revenue history will be deleted permanently.`,
      )
    ) {
      return;
    }
    fetcher.submit({ intent: "reset", quiz: selectedId }, { method: "POST" });
  };

  return (
    <s-page heading="Analytics">
      <s-button
        slot="secondary-actions"
        tone="critical"
        {...(isResetting ? { loading: true } : {})}
        onClick={handleReset}
      >
        Reset analytics
      </s-button>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
        {/* Controls */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", maxWidth: "340px" }}>
            <s-select
              label="Quiz"
              value={selectedId}
              onChange={(e) => navigate(`/app/analytics?quiz=${e.target.value}&range=${rangeDays}`)}
            >
              {quizzes.map((quiz) => (
                <s-option key={quiz.id} value={quiz.id}>
                  {quiz.title}
                </s-option>
              ))}
            </s-select>
          </div>
          <div style={{ flex: "1 1 180px", maxWidth: "240px" }}>
            <s-select
              label="Period"
              value={String(rangeDays)}
              onChange={(e) => navigate(`/app/analytics?quiz=${selectedId}&range=${e.target.value}`)}
            >
              {RANGES.map((range) => (
                <s-option key={range.value} value={range.value}>
                  {range.label}
                </s-option>
              ))}
            </s-select>
          </div>
        </div>

        {/* KPI cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          <StatCard label="Views" value={views} current={views} previous={prev.views} />
          <StatCard
            label="Completions"
            value={completions}
            current={completions}
            previous={prev.completions}
          />
          <StatCard
            label="Completion rate"
            value={`${completionRate.toFixed(1)}%`}
            current={completionRate}
            previous={prevCompletionRate}
          />
          <StatCard
            label="Added to cart"
            value={addToCarts}
            current={addToCarts}
            previous={prev.addToCarts}
          />
          <StatCard label="Orders" value={orders} current={orders} previous={prev.orders} />
          <StatCard
            label="Revenue"
            value={
              revenueLines.length === 0
                ? "—"
                : revenueLines.map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`).join(" · ")
            }
            current={revenueTotal}
            previous={null}
          />
        </div>

        {views === 0 && completions === 0 ? (
          <Card title="No activity in this period">
            <s-paragraph>
              Nothing recorded in the selected period yet. Try a longer period, or share the
              quiz with more visitors - stats appear here in real time.
            </s-paragraph>
          </Card>
        ) : (
          <>
            <Card title="Completions over time">
              <TrendChart trend={trend} />
            </Card>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              <Card
                title="Funnel"
                subtitle="How far visitors get, from first seeing the quiz to placing an order."
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <FunnelRow label="Views" count={views} total={views} />
                  <FunnelRow label="Completions" count={completions} total={views} />
                  <FunnelRow label="Added to cart" count={addToCarts} total={views} />
                  <FunnelRow label="Orders" count={orders} total={views} />
                </div>
                <div style={{ fontSize: "12px", color: LABEL_GRAY }}>
                  Add to cart and order tracking only applies to quizzes using the
                  &quot;Show results in the quiz&quot; results mode (Premium) - see the
                  Results tab.
                </div>
              </Card>

              <Card
                title="Most popular answers"
                subtitle="What shoppers picked in this period - a free look at what they actually want."
              >
                {topAnswers.length === 0 ? (
                  <s-paragraph>No completions in this period yet.</s-paragraph>
                ) : (
                  <TopAnswers topAnswers={topAnswers} />
                )}
              </Card>
            </div>
          </>
        )}

        <div style={{ fontSize: "12px", color: LABEL_GRAY }}>
          Stats are kept for 12 months - older data is removed automatically.
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
