import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Quiz completions are anonymous (tied to a quiz, never to a customer),
  // so we hold no customer-identifying data to export for this request.
  return new Response();
};
