import prisma from "../db.server";

const SYNC_STALE_MS = 24 * 60 * 60 * 1000; // once a day
const MAX_PAGES = 4; // 4 * 250 = up to 1000 tags/collections, plenty for any real store

const TAGS_QUERY = `#graphql
  query FindlyProductTags($first: Int!, $after: String) {
    productTags(first: $first, after: $after) {
      edges { node }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query FindlyCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      edges { node { handle title } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function fetchAllPages(admin, query, getConnection) {
  const results = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    // eslint-disable-next-line no-await-in-loop -- must paginate sequentially, each page needs the previous page's cursor
    const response = await admin.graphql(query, { variables: { first: 250, after } });
    // eslint-disable-next-line no-await-in-loop
    const { data } = await response.json();
    const connection = getConnection(data);
    if (!connection) break;
    results.push(...connection.edges.map((edge) => edge.node));
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return results;
}

export async function syncShopCatalog(admin, shop) {
  const [tags, collectionNodes] = await Promise.all([
    fetchAllPages(admin, TAGS_QUERY, (data) => data.productTags),
    fetchAllPages(admin, COLLECTIONS_QUERY, (data) => data.collections),
  ]);

  const collections = collectionNodes.map((c) => ({ handle: c.handle, title: c.title }));

  await prisma.shopCatalog.upsert({
    where: { shop },
    create: { shop, tags: JSON.stringify(tags), collections: JSON.stringify(collections), syncedAt: new Date() },
    update: { tags: JSON.stringify(tags), collections: JSON.stringify(collections), syncedAt: new Date() },
  });

  return { tags, collections };
}

export async function getShopCatalog(shop) {
  const row = await prisma.shopCatalog.findUnique({ where: { shop } });
  if (!row) return { tags: [], collections: [], syncedAt: null };
  return { tags: JSON.parse(row.tags), collections: JSON.parse(row.collections), syncedAt: row.syncedAt };
}

export function isCatalogStale(syncedAt) {
  if (!syncedAt) return true;
  return Date.now() - new Date(syncedAt).getTime() > SYNC_STALE_MS;
}
