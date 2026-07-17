import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Sent 48h after uninstall, once Shopify considers the deletion final -
  // purge everything tied to this shop. Question/Answer/QuizCompletion
  // cascade-delete through the Quiz relation.
  await db.quiz.deleteMany({ where: { shop } });
  await db.shopCatalog.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
