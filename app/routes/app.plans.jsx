import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  authenticate,
  isBillingTest,
  getPlan,
  STANDARD_PLAN,
  PREMIUM_PLAN,
  PLAN_LIMITS,
} from "../shopify.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);

  const { appSubscriptions } = await billing.check({ isTest: isBillingTest });

  return {
    plan: getPlan(appSubscriptions),
    billingUrl: `https://${session.shop}/admin/settings/billing`,
  };
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const target = formData.get("plan");

  if (target === "free") {
    // Downgrading to Free = cancelling the subscription. Shopify prorates
    // nothing here on purpose - the merchant keeps the paid features until
    // the current billing cycle would have ended anyway per Shopify's own
    // subscription handling.
    const { appSubscriptions } = await billing.check({ isTest: isBillingTest });
    const subscription = appSubscriptions[0];
    if (subscription) {
      await billing.cancel({ subscriptionId: subscription.id, isTest: isBillingTest, prorate: false });
    }
    return { ok: true, cancelled: true };
  }

  const plan = target === "premium" ? PREMIUM_PLAN : STANDARD_PLAN;
  const { appSubscriptions } = await billing.check({ isTest: isBillingTest });
  const hasSubscription = appSubscriptions.length > 0;

  // Fresh Free->paid upgrades get the trial; switches between paid plans
  // don't (that would grant repeat trials forever).
  return billing.request({
    plan,
    isTest: isBillingTest,
    ...(hasSubscription ? {} : { trialDays: PLAN_LIMITS[plan].trialDays }),
  });
};

/* eslint-disable react/prop-types -- plain JS project, no prop-types
   package; props here are plain objects/values, not worth a schema. */
const CARD_BORDER = "1px solid #e1e3e5";
const LABEL_GRAY = "#6b7177";

function Feature({ children, muted }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}>
      <span style={{ color: muted ? "#c9cccf" : "#108043", fontWeight: 700, lineHeight: "18px" }}>
        {muted ? "—" : "✓"}
      </span>
      <span style={{ color: muted ? LABEL_GRAY : "inherit", lineHeight: "18px" }}>{children}</span>
    </div>
  );
}

function PlanCard({ name, price, trial, tagline, features, highlighted, current, cta }) {
  return (
    <div
      style={{
        position: "relative",
        border: highlighted ? "2px solid #2a2a2a" : CARD_BORDER,
        borderRadius: "16px",
        background: "#ffffff",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: 0,
      }}
    >
      {highlighted && (
        <div
          style={{
            position: "absolute",
            top: "-11px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2a2a2a",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "3px 12px",
            borderRadius: "999px",
            whiteSpace: "nowrap",
          }}
        >
          Most popular
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px", fontWeight: 700 }}>{name}</span>
        {current && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#108043",
              background: "#e3f1e8",
              padding: "2px 8px",
              borderRadius: "999px",
            }}
          >
            Current plan
          </span>
        )}
      </div>

      <div>
        <span style={{ fontSize: "32px", fontWeight: 800, lineHeight: 1 }}>{price}</span>
        <span style={{ fontSize: "13px", color: LABEL_GRAY }}> /month</span>
        <div style={{ fontSize: "12px", color: LABEL_GRAY, marginTop: "4px", minHeight: "16px" }}>
          {trial || " "}
        </div>
      </div>

      <div style={{ fontSize: "13px", color: LABEL_GRAY, lineHeight: 1.4 }}>{tagline}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
        {features.map((feature, index) => (
          <Feature key={index} muted={feature.muted}>
            {feature.text}
          </Feature>
        ))}
      </div>

      {cta}
    </div>
  );
}
/* eslint-enable react/prop-types */

export default function Plans() {
  const { plan, billingUrl } = useLoaderData();
  const fetcher = useFetcher();
  const isSwitching = fetcher.state !== "idle";

  const switchTo = (target) => {
    if (target === "free") {
      if (
        !window.confirm(
          "Downgrade to Free? Your subscription will be cancelled. Quizzes over the Free limit stay saved but extra published quizzes should be unpublished, and paid features (popup, in-quiz results) revert to Free behavior.",
        )
      ) {
        return;
      }
    }
    fetcher.submit({ plan: target }, { method: "POST" });
  };

  const button = (target, label, variant) => (
    <s-button
      variant={variant}
      onClick={() => switchTo(target)}
      {...(isSwitching ? { loading: true } : {})}
    >
      {label}
    </s-button>
  );

  return (
    <s-page heading="Plans">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "8px" }}>
        <div style={{ fontSize: "14px", color: LABEL_GRAY, maxWidth: "640px" }}>
          Start free, upgrade when you need more. Billing is handled securely by Shopify and
          you can change plans at any time.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
            alignItems: "stretch",
            paddingTop: "12px",
          }}
        >
          <PlanCard
            name="Free"
            price="$0"
            tagline="Everything you need to launch your first product-finder quiz."
            current={plan === "free"}
            features={[
              { text: "1 published quiz" },
              { text: "Tag & price-range matching" },
              { text: "Homepage & collection placement" },
              { text: "Full design controls & translations" },
              { text: "Analytics with 12-month history" },
              { text: "Popup placement", muted: true },
              { text: "In-quiz results & revenue tracking", muted: true },
            ]}
            cta={
              plan === "free" ? (
                <s-button disabled>Current plan</s-button>
              ) : (
                button("free", "Downgrade to Free", "tertiary")
              )
            }
          />

          <PlanCard
            name="Standard"
            price="$14.99"
            trial="3-day free trial"
            tagline="For stores ready to put the quiz in front of every visitor."
            current={plan === "standard"}
            features={[
              { text: "Everything in Free" },
              { text: "3 published quizzes" },
              { text: "Popup placement with floating button" },
              { text: "Popup timing & frequency controls" },
              { text: "In-quiz results & revenue tracking", muted: true },
            ]}
            cta={
              plan === "standard" ? (
                <s-button disabled>Current plan</s-button>
              ) : plan === "premium" ? (
                button("standard", "Downgrade to Standard", "tertiary")
              ) : (
                button("standard", "Start free trial", "secondary")
              )
            }
          />

          <PlanCard
            name="Premium"
            price="$29.99"
            trial="7-day free trial"
            tagline="Turn the quiz into a sales channel you can measure."
            highlighted
            current={plan === "premium"}
            features={[
              { text: "Everything in Standard" },
              { text: "10 published quizzes" },
              { text: "In-quiz results with Add to cart & quantity" },
              { text: "Conversion & revenue tracking per quiz" },
              { text: "Custom placement block (theme editor)" },
              { text: "Custom CSS" },
            ]}
            cta={
              plan === "premium" ? (
                <s-button disabled>Current plan</s-button>
              ) : (
                button("premium", plan === "free" ? "Start free trial" : "Upgrade to Premium", "primary")
              )
            }
          />
        </div>

        <div
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
          <div style={{ fontSize: "13px", color: LABEL_GRAY }}>
            Payment details and invoices live in your Shopify billing settings.
          </div>
          <s-button variant="tertiary" href={billingUrl} target="_blank">
            Open billing settings
          </s-button>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
