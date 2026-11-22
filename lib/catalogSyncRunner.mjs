export async function syncCatalogSource({ source, fetchPage, savePage, start, checkpoint, finish, now = Date.now, budgetMs = 70000 }) {
  const started = now();
  let page = await start(source);
  const counts = { importedCount: 0, updatedCount: 0 };
  try {
    while (true) {
      const result = await fetchPage(page);
      const saved = await savePage(result.products);
      counts.importedCount += saved.importedCount;
      counts.updatedCount += saved.updatedCount;
      if (!result.hasMore) {
        await finish(source, 'complete', counts);
        return { source, status: 'complete', ...counts };
      }
      page++;
      await checkpoint(source, page);
      if (now() - started >= budgetMs) {
        await finish(source, 'partial', counts);
        return { source, status: 'partial', nextPage: page, ...counts };
      }
    }
  } catch (error) {
    const status = /access.*disabled|reactivat/i.test(error.message) ? 'blocked' : 'failed';
    const message = String(error.message).slice(0, 1000);
    await finish(source, status, { ...counts, message });
    return { source, status, message, ...counts };
  }
}
