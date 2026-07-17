import { redirect } from "react-router";

// This used to be the forced plan-selection gate before installs became
// free-tier-first. Old links and stale sessions may still point here -
// forward them into the app (query string included, it carries the
// embedded-session params).
export const loader = async ({ request }) => {
  const { search } = new URL(request.url);
  throw redirect(`/app${search}`);
};
