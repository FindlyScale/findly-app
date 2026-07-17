import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Cart attributes set via /cart/update.js at "Add to cart" time carry
  // through checkout onto the order as note_attributes.
  const noteAttributes = payload.note_attributes || [];
  const quizAttr = noteAttributes.find((a) => a.name === "findly_quiz_id");
  if (!quizAttr?.value) {
    return new Response();
  }

  const quiz = await prisma.quiz.findFirst({ where: { id: quizAttr.value, shop } });
  if (!quiz) {
    return new Response();
  }

  // upsert (keyed on the unique orderId) rather than create, since Shopify
  // can redeliver the same webhook more than once.
  await prisma.quizConversion.upsert({
    where: { orderId: String(payload.id) },
    update: {},
    create: {
      quizId: quiz.id,
      orderId: String(payload.id),
      amount: Number(payload.total_price) || 0,
      currencyCode: payload.currency || "USD",
    },
  });

  return new Response();
};
