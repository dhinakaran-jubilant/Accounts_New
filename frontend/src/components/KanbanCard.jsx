/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Individual loan card component rendered on the Kanban board showing borrower and status details.
*/

import React from 'react';

export default function KanbanCard({ card, onClick }) {
  return (
    <div
      onClick={() => onClick && onClick(card)}
      className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-space-sm group relative overflow-hidden ring-1 ring-slate-200/80 font-sans"
    >
      {/* Optional Top Accent Bar */}
      {card.topBarColor && (
        <div className={`absolute top-0 left-0 right-0 h-1 ${card.topBarColor}`}></div>
      )}

      {/* Card Header: Category & Avatar/Icon */}
      <div className={`flex items-center justify-between ${card.topBarColor ? 'pt-1' : ''}`}>
        <span
          className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ring-1 ${card.categoryColor}`}
        >
          {card.categoryHasDot && (
            <span className={`w-1.5 h-1.5 rounded-full ${card.dotColor || 'bg-primary'}`}></span>
          )}
          {card.category}
        </span>

        {card.initials && (
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ring-2 ring-white shadow-sm ${card.avatarBg}`}
          >
            {card.initials}
          </div>
        )}

        {card.iconRight && (
          <span className={`material-symbols-outlined text-[18px] ${card.iconRightColor || 'text-primary'}`}>
            {card.iconRight}
          </span>
        )}
      </div>

      {/* Company & Subtitle */}
      <div>
        <h4 className="font-bold text-[16px] text-slate-900 group-hover:text-primary transition-colors tracking-tight">
          {card.company}
        </h4>
        {card.description && (
          <div className="font-medium text-[12px] text-slate-500 mt-0.5">
            {card.description}
          </div>
        )}
      </div>

      {/* Amount & Loan Terms Box */}
      <div className="bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-1 ring-1 ring-slate-100">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="font-extrabold text-[18px] text-slate-900 leading-none">
              {card.amount}
            </span>
            {card.termType && (
              <span className="font-medium text-[12px] text-slate-500 ml-1.5">
                {card.termType}
              </span>
            )}
          </div>
          {card.rateOrScore && (
            <span className={`text-[12px] ${card.rateColor || 'font-bold text-slate-700'}`}>
              {card.rateOrScore}
            </span>
          )}
        </div>
        {card.detailLine && (
          <div className="font-regular text-[12px] text-secondary">
            {card.detailLine}
          </div>
        )}
      </div>

      {/* Optional Progress Bar (Doc Intake, Stress test, etc.) */}
      {card.progressLabel && (
        <div className="space-y-1">
          <div className="flex justify-between font-semibold text-[11px] text-slate-500">
            <span>{card.progressLabel}</span>
            <span className="text-slate-700">{card.progressValue}</span>
          </div>
          <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary-container h-full rounded-full transition-all duration-300"
              style={{ width: `${card.progressPercent || 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Optional Vote / Risk Alert Box */}
      {card.alertBox && (
        <div className="bg-primary/5 rounded-lg p-space-xs text-primary font-bold text-[12px] flex items-center gap-1.5 ring-1 ring-primary/20">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <polyline points="17 11 19 13 23 9" />
          </svg>
          <span>{card.alertBox.text}</span>
        </div>
      )}

      {/* Card Footer: Status, Session, Due Date */}
      <div className="flex items-center justify-between pt-1 font-medium text-[12px] text-slate-500">
        {/* Left footer status */}
        <div className="flex items-center gap-1.5">
          {card.hasPriorityDot && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
          )}
          {card.statusDot && (
            <span className={`w-2 h-2 rounded-full ${card.statusDot}`}></span>
          )}
          {card.statusIcon === 'refresh' && (
            <svg
              className="w-3.5 h-3.5 text-primary"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          )}
          {card.statusIcon === 'check-verified' && (
            <svg
              className="w-4 h-4 text-primary"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
          {card.statusIcon === 'bolt' && (
            <span className="material-symbols-outlined text-[16px] text-primary">bolt</span>
          )}
          {card.statusIcon === 'autorenew' && (
            <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
          )}
          {card.statusIcon === 'receipt_long' && (
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          )}
          {card.filesCount && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <svg
                className="w-3.5 h-3.5 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="font-semibold">{card.filesCount}</span>
            </div>
          )}
          {card.sessionText && (
            <div className="flex items-center gap-1.5 text-slate-900 font-bold">
              <svg
                className="w-3.5 h-3.5 text-primary"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{card.sessionText}</span>
            </div>
          )}
          {card.statusText && (
            <span className={card.statusColor || 'font-semibold text-slate-600'}>
              {card.statusText}
            </span>
          )}
        </div>

        {/* Right footer badge / date */}
        {card.dueDate && (
          <span className="font-semibold text-slate-600">{card.dueDate}</span>
        )}
        {card.updatedText && (
          <span className="font-medium text-slate-500">{card.updatedText}</span>
        )}
        {card.badgeRight && (
          <span className={`font-semibold ${card.badgeRight === 'High Priority' ? 'text-primary font-bold' : 'text-slate-600'}`}>
            {card.badgeRight}
          </span>
        )}
      </div>
    </div>
  );
}
