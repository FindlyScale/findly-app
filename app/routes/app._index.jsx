import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, isBillingTest, getPlan, getMaxQuizzes } from "../shopify.server";
import prisma from "../db.server";

// Matches the `uid` in extensions/quiz-widget/shopify.extension.toml - both
// blocks/quiz.liquid (custom placement) and blocks/quiz-embed.liquid
// (auto/popup placement) live in that same extension, so they share the
// UID and are only told apart by block handle in the deep link.
const QUIZ_EXTENSION_UID = "d322af2c-4b13-f362-a34e-0a454251ab537b661e7f";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [quizzes, { appSubscriptions }, views30, completions30] = await Promise.all([
    prisma.quiz.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, published: true, placementMode: true },
    }),
    billing.check({ isTest: isBillingTest }),
    prisma.quizView.count({
      where: { quiz: { shop: session.shop }, createdAt: { gte: since } },
    }),
    prisma.quizCompletion.count({
      where: { quiz: { shop: session.shop }, createdAt: { gte: since } },
    }),
  ]);

  const plan = getPlan(appSubscriptions);
  const addBlockUrl = `https://${session.shop}/admin/themes/current/editor?template=index&addAppBlockId=${QUIZ_EXTENSION_UID}/quiz&target=newAppsSection`;
  const activateEmbedUrl = `https://${session.shop}/admin/themes/current/editor?context=apps`;

  return {
    quizCount: quizzes.length,
    publishedCount: quizzes.filter((q) => q.published).length,
    hasCustomQuiz: quizzes.some((q) => q.placementMode === "custom"),
    maxQuizzes: getMaxQuizzes(appSubscriptions),
    plan,
    planLabel: plan === "premium" ? "Premium" : plan === "standard" ? "Standard" : "Free",
    views30,
    completions30,
    addBlockUrl,
    activateEmbedUrl,
  };
};

/* eslint-disable react/prop-types -- plain JS project, no prop-types
   package; props here are plain objects/values, not worth a schema. */
const CARD_BORDER = "1px solid #e1e3e5";
const LABEL_GRAY = "#6b7177";

function Card({ children }) {
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
      {children}
    </div>
  );
}

function Step({ number, done, title, description, action }) {
  return (
    <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 700,
          background: done ? "#108043" : "#f1f2f4",
          color: done ? "#ffffff" : "#6b7177",
        }}
      >
        {done ? "✓" : number}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: done ? "line-through" : "none",
            color: done ? LABEL_GRAY : "inherit",
          }}
        >
          {title}
        </div>
        {!done && (
          <>
            <div style={{ fontSize: "13px", color: LABEL_GRAY, lineHeight: 1.4 }}>{description}</div>
            {action}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }) {
  return (
    <div
      style={{
        border: CARD_BORDER,
        borderRadius: "12px",
        background: "#ffffff",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
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
      <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: "12px", color: LABEL_GRAY }}>{hint}</div>}
    </div>
  );
}
/* eslint-enable react/prop-types */

export default function Index() {
  const {
    quizCount,
    publishedCount,
    hasCustomQuiz,
    maxQuizzes,
    plan,
    planLabel,
    views30,
    completions30,
    addBlockUrl,
    activateEmbedUrl,
  } = useLoaderData();

  const setupDone = publishedCount > 0;

  return (
    <s-page heading="Findly">
      <s-button slot="primary-action" href="/app/quiz">
        {quizCount ? "Manage quizzes" : "Create your first quiz"}
      </s-button>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
        {/* Greeting / status strip */}
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>
                {setupDone ? "Your quiz is live 🎉" : "Welcome to Findly"}
              </div>
              <div style={{ fontSize: "13px", color: LABEL_GRAY, marginTop: "4px" }}>
                {setupDone
                  ? "Shoppers are being guided to the right products. Check Analytics to see how it performs."
                  : "Guide every shopper to the right product with a quick quiz. Three steps and you're live."}
              </div>
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                background: plan === "free" ? "#f1f2f4" : "#e3f1e8",
                color: plan === "free" ? "#4a4a4a" : "#108043",
                padding: "4px 12px",
                borderRadius: "999px",
                whiteSpace: "nowrap",
              }}
            >
              {planLabel} plan
            </div>
          </div>
        </Card>

        {/* Setup checklist */}
        <Card>
          <div style={{ fontSize: "15px", fontWeight: 650 }}>Get set up</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <Step
              number={1}
              done={false}
              title="Enable Findly in your theme"
              description={
                "One-time setup: turn on the “Findly Quiz” app embed in the theme editor and hit Save there. This powers homepage, collection and popup placement."
              }
              action={
                <div>
                  <s-button variant="secondary" href={activateEmbedUrl} target="_blank">
                    Open App Embeds
                  </s-button>
                </div>
              }
            />
            <Step
              number={2}
              done={quizCount > 0}
              title="Build a quiz"
              description="Write a few questions, match answers to your product tags, and watch the live preview while you edit."
              action={
                <div>
                  <s-button variant="secondary" href="/app/quiz">
                    Open Quiz Builder
                  </s-button>
                </div>
              }
            />
            <Step
              number={3}
              done={publishedCount > 0}
              title="Publish it"
              description={'Hit "Publish quiz" in the editor and the quiz appears on your storefront.'}
            />
          </div>
          {hasCustomQuiz && (
            <div style={{ fontSize: "13px", color: LABEL_GRAY }}>
              You have a quiz set to Custom placement - also add the &quot;Findly Quiz&quot;
              block where you want it:{" "}
              <s-link href={addBlockUrl} target="_blank">
                open theme editor
              </s-link>
              .
            </div>
          )}
        </Card>

        {/* At a glance */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          <MiniStat
            label="Published quizzes"
            value={`${publishedCount} / ${maxQuizzes}`}
            hint={quizCount > publishedCount ? `${quizCount - publishedCount} in draft` : undefined}
          />
          <MiniStat label="Views · 30 days" value={views30} />
          <MiniStat label="Completions · 30 days" value={completions30} />
        </div>

        {/* Shortcuts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <Card>
            <div style={{ fontSize: "14px", fontWeight: 650 }}>Analytics</div>
            <div style={{ fontSize: "13px", color: LABEL_GRAY, flex: 1 }}>
              Views, completions, top answers, orders and revenue - per quiz, up to 12 months
              back.
            </div>
            <div>
              <s-button variant="tertiary" href="/app/analytics">
                View analytics
              </s-button>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: "14px", fontWeight: 650 }}>Plans</div>
            <div style={{ fontSize: "13px", color: LABEL_GRAY, flex: 1 }}>
              {plan === "premium"
                ? "You're on the top plan - every feature is unlocked."
                : plan === "standard"
                  ? "Upgrade to Premium for in-quiz results with Add to cart and revenue tracking."
                  : "Upgrade for popup placement, more quizzes, and in-quiz results with revenue tracking."}
            </div>
            <div>
              <s-button variant="tertiary" href="/app/plans">
                Compare plans
              </s-button>
            </div>
          </Card>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
