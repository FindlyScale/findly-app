// Public page - no auth, linked from the App Store listing's Privacy
// Policy URL field.
const SUPPORT_EMAIL = "contactfindlyapp@gmail.com";
const EFFECTIVE_DATE = "July 17, 2026";

export const meta = () => [{ title: "Privacy Policy — Findly" }];

const styles = {
  page: {
    maxWidth: "720px",
    margin: "0 auto",
    padding: "48px 24px 96px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#1a1a1a",
    lineHeight: 1.65,
    fontSize: "15px",
  },
  h1: { fontSize: "28px", fontWeight: 800, margin: "0 0 4px" },
  meta: { color: "#6b7177", fontSize: "13px", marginBottom: "32px" },
  h2: { fontSize: "18px", fontWeight: 700, margin: "32px 0 8px" },
  p: { margin: "0 0 12px" },
  li: { margin: "0 0 8px" },
};

export default function Privacy() {
  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>Privacy Policy</h1>
      <div style={styles.meta}>
        Findly — Product Finder Quiz · Effective {EFFECTIVE_DATE} · Contact:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </div>

      <p style={styles.p}>
        This Privacy Policy describes how Findly (&quot;the App&quot;, &quot;we&quot;,
        &quot;us&quot;) collects, uses, and stores information when you install and use the
        App on your Shopify store.
      </p>

      <h2 style={styles.h2}>1. Information we collect</h2>
      <p style={styles.p}>When you install the App, we collect and store:</p>
      <ul>
        <li style={styles.li}>
          <strong>Store information</strong>: your store&apos;s myshopify.com domain and the
          API access credentials Shopify issues to the App. These are required for the App
          to function and are never shared with third parties.
        </li>
        <li style={styles.li}>
          <strong>Catalog data</strong>: a cached copy of your store&apos;s product tags and
          collection names, powering the suggestions in the quiz builder. It contains no
          customer data.
        </li>
        <li style={styles.li}>
          <strong>Quiz configuration</strong>: the quizzes, questions, answers, design
          settings and translations you create in the App.
        </li>
      </ul>
      <p style={styles.p}>
        When shoppers interact with a quiz on your storefront, we collect{" "}
        <strong>anonymous, aggregated statistics only</strong>: quiz views, completions, and
        which answers were selected. These records are never linked to a shopper&apos;s
        identity — we do not collect names, email addresses, IP addresses, or any other
        personal information about your customers. If you enable in-quiz results with
        conversion tracking, we record the order ID, order total and currency of orders
        attributed to a quiz. We do not store any customer details from those orders.
      </p>
      <p style={styles.p}>
        The storefront quiz widget uses the browser&apos;s localStorage for a single,
        non-identifying value: the time a popup quiz was last shown, used only to respect
        your popup frequency settings. No cookies are set and no cross-site tracking of any
        kind takes place.
      </p>

      <h2 style={styles.h2}>2. How we use information</h2>
      <p style={styles.p}>
        We use the information above solely to provide the App&apos;s features: displaying
        quizzes on your storefront, matching answers to your products, and showing you
        analytics about your own quizzes. We do not sell, rent, or share any data with third
        parties, and we do not use it for advertising.
      </p>

      <h2 style={styles.h2}>3. Data retention and deletion</h2>
      <ul>
        <li style={styles.li}>
          Quiz statistics are kept for a rolling <strong>12 months</strong>; older records
          are deleted automatically.
        </li>
        <li style={styles.li}>
          You can delete the statistics for any quiz at any time using the reset controls
          inside the App.
        </li>
        <li style={styles.li}>
          When you uninstall the App, Shopify notifies us, and 48 hours after uninstall we
          permanently delete all data associated with your store — quizzes, settings,
          statistics, catalog cache and credentials.
        </li>
      </ul>

      <h2 style={styles.h2}>4. GDPR and privacy requests</h2>
      <p style={styles.p}>
        The App implements all of Shopify&apos;s mandatory privacy webhooks. Because quiz
        statistics are anonymous and never linked to a customer, we hold no
        customer-identifiable data to export or erase in response to customer data
        requests. Store data erasure is handled as described in section 3. For any privacy
        question or request, contact us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2 style={styles.h2}>5. Where data is stored</h2>
      <p style={styles.p}>
        App data is stored on infrastructure provided by our hosting provider (Railway) and
        is protected by industry-standard security measures.
      </p>

      <h2 style={styles.h2}>6. Changes to this policy</h2>
      <p style={styles.p}>
        We may update this policy from time to time. Material changes will be reflected by
        an updated effective date at the top of this page. Continued use of the App after
        changes take effect constitutes acceptance of the revised policy.
      </p>
    </main>
  );
}
