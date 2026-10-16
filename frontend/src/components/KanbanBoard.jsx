/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Interactive Kanban pipeline component organizing loans by servicing status with drag-and-drop support.
*/

import React from 'react';
import KanbanCard from './KanbanCard';

export default function KanbanBoard({
  columns,
  searchQuery = '',
  viewMode = 'kanban',
  onAddNewApplication,
  onCardClick,
}) {
  // Filter cards by search query
  const filteredColumns = columns.map((col) => {
    if (!searchQuery.trim()) return col;
    const query = searchQuery.toLowerCase();
    const filteredCards = col.cards.filter(
      (c) =>
        c.company.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query)) ||
        (c.category && c.category.toLowerCase().includes(query)) ||
        (c.amount && c.amount.toLowerCase().includes(query))
    );
    return {
      ...col,
      cards: filteredCards,
    };
  });

  if (viewMode === 'list') {
    return (
      <div className="w-full bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm ring-1 ring-slate-200/80 font-sans overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold text-[12px] uppercase tracking-wider">
              <th className="py-3 px-4">Borrower / Company</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Stage</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Terms / Score</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Target Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-regular text-[13px]">
            {filteredColumns.flatMap((col) =>
              col.cards.map((card) => (
                <tr
                  key={card.id}
                  onClick={() => onCardClick && onCardClick(card)}
                  className="hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{card.company}</div>
                    <div className="text-[12px] text-slate-500">{card.description}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block font-bold text-[11px] px-2.5 py-0.5 rounded-full ${card.categoryColor}`}>
                      {card.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{col.title}</td>
                  <td className="py-3 px-4 font-extrabold text-slate-900">{card.amount}</td>
                  <td className="py-3 px-4">
                    <span className={card.rateColor || 'text-slate-700'}>{card.rateOrScore || card.termType}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={card.statusColor || 'text-slate-700 font-semibold'}>
                      {card.statusText || 'Active'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 font-medium">
                    {card.dueDate || card.badgeRight || card.updatedText || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-space-lg font-sans">
      <div className="flex gap-gutter min-w-[1400px]">
        {filteredColumns.map((col) => (
          <div key={col.id} className="flex-1 min-w-[280px] max-w-[320px] flex flex-col gap-space-md">
            {/* Column Header */}
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="font-bold text-[17px] text-slate-900">
                  {col.title}
                </span>
                <span className="bg-surface-container text-slate-700 font-bold text-[11px] px-2 py-0.5 rounded-full ring-1 ring-slate-200">
                  {col.count < 10 ? `0${col.count}` : col.count}
                </span>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-800 transition-colors p-1"
                aria-label="Column options"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </button>
            </div>

            {/* Column Cards */}
            <div className="flex flex-col gap-space-md">
              {col.cards.map((card) => (
                <KanbanCard key={card.id} card={card} onClick={onCardClick} />
              ))}

              {/* Add New Application CTA in first column */}
              {col.showAddButton && (
                <button
                  type="button"
                  onClick={onAddNewApplication}
                  className="w-full py-3 bg-surface-container-lowest hover:bg-surface-container-low rounded-2xl flex items-center justify-center gap-1.5 font-bold text-[13px] text-slate-700 hover:text-slate-900 shadow-sm ring-1 ring-slate-200/80 transition-all active:scale-[0.98]"
                >
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <line x1="12" x2="12" y1="5" y2="19" />
                    <line x1="5" x2="19" y1="12" y2="12" />
                  </svg>
                  <span>Add New Application</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
