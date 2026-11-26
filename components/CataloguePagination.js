export default function CataloguePagination({ page, pageCount, total, pageSize, onPage }) {
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return <nav className="catalogue-pagination" aria-label="Pagination des produits">
    <span role="status">{first}–{last} sur {total} produits</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <span>Page {page} / {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Suivant</button>
    </div>
  </nav>;
}
