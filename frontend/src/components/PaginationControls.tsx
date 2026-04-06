import { GlassSelect } from "./GlassSelect";
import type { PaginatedResponse } from "../types";

type PaginationControlsProps<TItem> = {
  page: PaginatedResponse<TItem> | null;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const pageSizeOptions = [10, 20, 50];
const selectOptions = pageSizeOptions.map((option) => ({
  value: String(option),
  label: `${option} 条`,
}));

export function PaginationControls<TItem>({
  page,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps<TItem>) {
  const totalCount = page?.count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;
  const startIndex = totalCount ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = totalCount ? Math.min(currentPage * pageSize, totalCount) : 0;

  return (
    <div className="pagination-bar">
      <div className="pagination-summary">
        <strong>
          {startIndex}-{endIndex}
        </strong>
        <span> / 共 {totalCount} 条</span>
      </div>

      <div className="pagination-actions">
        <label className="pagination-size">
          <span>每页</span>
          <GlassSelect
            options={selectOptions}
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
          />
        </label>

        <button
          className="button-ghost"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          上一页
        </button>
        <span className="pagination-page-indicator">
          第 {currentPage} / {totalPages} 页
        </span>
        <button
          className="button-ghost"
          disabled={!page?.next}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
