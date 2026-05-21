import React from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  setPage: (page: number | ((prev: number) => number)) => void;
}

export default function Pagination({ page, totalPages, totalItems, perPage, setPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const maxPagesToShow = 5;
  let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
  let endPage = startPage + maxPagesToShow - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="pagination">
      <span>{(page - 1) * perPage + 1}–{Math.min(page * perPage, totalItems)} / {totalItems}개</span>
      <div className="pagination-buttons">
        <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => typeof p === 'number' ? p - 1 : p - 1)}>이전</button>
        {pages.map(p => (
          <button
            key={p}
            className={`pagination-btn ${p === page ? 'active' : ''}`}
            onClick={() => setPage(p)}
          >
            {p}
          </button>
        ))}
        <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => typeof p === 'number' ? p + 1 : p + 1)}>다음</button>
      </div>
    </div>
  );
}
