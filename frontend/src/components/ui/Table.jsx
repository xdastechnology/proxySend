import React from 'react';
import Spinner from './Spinner';
import EmptyState from './EmptyState';

export default function Table({ columns, data, loading, emptyState, className = '' }) {
  return (
    <div className={`overflow-x-auto scrollbar-thin rounded-xl border border-surface-100 ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-50 border-b border-surface-100">
            {columns.map((col, i) => (
              <th
                key={i}
                className={`px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-50">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                <div className="flex justify-center">
                  <Spinner className="text-brand-500" />
                </div>
              </td>
            </tr>
          ) : !data || data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                {emptyState || (
                  <EmptyState title="No data" description="Nothing to show here yet." />
                )}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-surface-50/50 transition-colors">
                {columns.map((col, j) => (
                  <td key={j} className={`px-4 py-3 text-surface-700 ${col.cellClassName || ''}`}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
