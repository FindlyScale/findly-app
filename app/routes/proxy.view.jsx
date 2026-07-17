import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response();
  }

  const body = await request.json().catch(() => ({}));
  if (!body.quizId) {
    return new Response();
  }

  const quiz = await prisma.quiz.findFirst({
    where: { id: body.quizId, shop: session.shop, published: true },
    select: { id: true },
  });

  if (quiz) {
    await prisma.quizView.create({ data: { quizId: quiz.id } });
  }

  return new Response();
};
