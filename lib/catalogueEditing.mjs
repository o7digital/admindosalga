// Keep the working list in place until the user explicitly asks to reclassify it.
// A successful publication can change both priority and filter membership.
export function retainCatalogueRows(products, matching, retainedIds = []) {
  const available = new Map(products.filter(product => !product.archived && product.status !== 'archived')
    .map(product => [product.id, product]));
  const retained = new Set(retainedIds);
  return [...retainedIds.flatMap(id => available.has(id) ? [available.get(id)] : []),
    ...matching.filter(product => !retained.has(product.id))];
}

export function createCatalogueReadGuard() {
  let revision = 0;
  return {
    changed: () => { revision++; },
    async read(load, apply) {
      const startedAt = revision;
      const products = await load();
      // A read started before a local save must not undo the save on arrival.
      if (revision === startedAt) apply(products);
    },
  };
}
