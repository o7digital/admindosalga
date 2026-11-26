// Show saved products before doing any import work. Focus, visibility and timer
// events can arrive together; share one refresh instead of queuing imports.
export function createCatalogueRefresher({ loadProducts, importProducts, loadStatus }) {
  let pending;
  return () => {
    if (!pending) {
      pending = (async () => {
        await loadProducts();
        const result = await importProducts();
        if (result.importedCount > 0) await loadProducts();
        await loadStatus();
      })().finally(() => { pending = null; });
    }
    return pending;
  };
}
