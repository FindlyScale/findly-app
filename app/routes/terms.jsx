// Public page - no auth, linked from the App Store listing. Update
// SUPPORT_EMAIL when the dedicated support address exists.
const SUPPORT_EMAIL = "nicosgabriel1999@gmail.com";
const EFFECTIVE_DATE = "July 17, 2026";

export const meta = () => [{ title: "Terms of Service — Findly" }];

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
};

export default function Terms() {
  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>Terms of Service</h1>
      <div style={styles.meta}>
        Findly — Product Finder Quiz · Effective {EFFECTIVE_DATE} · Contact:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </div>

      <p style={styles.p}>
        These Terms of Service (&quot;Terms&quot;) govern your use of the Findly app
        (&quot;the App&quot;) for Shopify. By installing or using the App you agree to these
        Terms.
      </p>

      <h2 style={styles.h2}>1. The service</h2>
      <p style={styles.p}>
        Findly lets you build product-recommendation quizzes for your Shopify storefront,
        match shopper answers to your products, and view analytics about quiz performance.
        Features vary by plan as described on the App&apos;s Plans page and the Shopify App
        Store listing.
      </p>

      <h2 style={styles.h2}>2. Accounts and eligibility</h2>
      <p style={styles.p}>
        You must have a valid Shopify store and the authority to install apps on it. You are
        responsible for everything configured through your store&apos;s access to the App,
        including quiz content you publish to your storefront.
      </p>

      <h2 style={styles.h2}>3. Plans, billing and trials</h2>
      <p style={styles.p}>
        The App offers a free plan and paid subscription plans. Paid plans are billed
        through Shopify&apos;s billing system on a recurring 30-day basis, at the prices
        shown on the Plans page at the time of subscription. Free trials, where offered,
        convert automatically to a paid subscription at the end of the trial unless you
        downgrade or uninstall before the trial ends. You can upgrade, downgrade or cancel
        at any time from the App&apos;s Plans page or by uninstalling the App. Refunds are
        handled in accordance with Shopify&apos;s billing policies. If you downgrade,
        features exclusive to higher plans stop applying; your quiz data is not deleted on
        downgrade.
      </p>

      <h2 style={styles.h2}>4. Acceptable use</h2>
      <p style={styles.p}>
        You agree not to use the App to publish content that is unlawful, misleading,
        infringing, or harmful, and not to attempt to disrupt, reverse engineer, or gain
        unauthorized access to the App or its infrastructure.
      </p>

      <h2 style={styles.h2}>5. Your content</h2>
      <p style={styles.p}>
        Quizzes, questions, answers and translations you create remain yours. You grant us
        the limited right to store and display them solely to operate the App for your
        store.
      </p>

      <h2 style={styles.h2}>6. Availability and changes</h2>
      <p style={styles.p}>
        We aim to keep the App available at all times but do not guarantee uninterrupted
        operation. We may update, change or discontinue features, and will use reasonable
        efforts to give notice of material changes. We may update these Terms; the current
        version always applies, and continued use after changes take effect constitutes
        acceptance.
      </p>

      <h2 style={styles.h2}>7. Disclaimer of warranties</h2>
      <p style={styles.p}>
        The App is provided &quot;as is&quot; and &quot;as available&quot;, without
        warranties of any kind, express or implied, including fitness for a particular
        purpose and non-infringement. We do not warrant any particular sales results,
        conversion rates or revenue outcomes from using the App.
      </p>

      <h2 style={styles.h2}>8. Limitation of liability</h2>
      <p style={styles.p}>
        To the maximum extent permitted by law, our total liability for any claims arising
        out of or relating to the App is limited to the amounts you paid for the App in the
        three (3) months preceding the event giving rise to the claim. We are not liable for
        indirect, incidental, special or consequential damages, or for loss of profits,
        revenue or data.
      </p>

      <h2 style={styles.h2}>9. Termination</h2>
      <p style={styles.p}>
        You may stop using the App at any time by uninstalling it. We may suspend or
        terminate access for breach of these Terms. Upon uninstall, your data is deleted as
        described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 style={styles.h2}>10. Governing law</h2>
      <p style={styles.p}>
        These Terms are governed by the laws of Romania, without regard to conflict-of-law
        rules. Disputes will be resolved in the courts of that jurisdiction.
      </p>

      <h2 style={styles.h2}>11. Contact</h2>
      <p style={styles.p}>
        Questions about these Terms:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </main>
  );
}
