import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Any of these params means Shopify admin is loading us embedded (e.g.
  // the merchant clicked the app's name in the sidebar) - go straight to
  // the real app Home instead of showing this public landing page inside
  // the admin iframe.
  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded")
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Findly - a product-finder quiz for your store</h1>
        <p className={styles.text}>
          Ask a few quick questions, match shoppers to the right products, and let them add
          to cart without ever leaving the quiz.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Build in minutes.</strong> No code - write your questions and answers,
            tag them to products, and see a live preview as you go.
          </li>
          <li>
            <strong>Fits your theme.</strong> Send shoppers to your own search results, or
            show matched products right inside the quiz with Add to cart.
          </li>
          <li>
            <strong>See what converts.</strong> Track views, completions, and revenue per
            quiz, right from your dashboard.
          </li>
        </ul>
        <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
