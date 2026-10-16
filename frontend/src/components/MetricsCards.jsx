/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Summary metric cards component displaying portfolio totals, active loans, and performance stats.
*/

import React from 'react';
 
export default function MetricsCards({ metrics = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md font-sans">
      {metrics.map((m) => {
        if (m.isDark) {
          return (
            <div
              key={m.id}
              className="relative overflow-hidden bg-slate-900 text-white rounded-2xl p-space-lg shadow-md flex flex-col justify-between ring-1 ring-slate-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-widest text-slate-300">
                  {m.title}
                </span>
                {m.pulse && (
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
                )}
              </div>
              <div className="my-space-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-[0_2px_8px_rgba(255,92,0,0.4)]">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-[18px] text-white leading-tight">
                      {m.dateRange}
                    </div>
                    <div className="font-medium text-[12px] text-slate-400">
                      {m.stageName}
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary-container h-full rounded-full transition-all duration-500"
                  style={{ width: `${m.progress}%` }}
                ></div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={m.id}
            className="relative overflow-hidden bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow ring-1 ring-slate-200/80"
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${m.accentColor || 'bg-primary-container'}`}></div>
            <div className="flex items-start justify-between">
              <span className="font-bold text-[12px] uppercase tracking-wider text-slate-500">
                {m.title}
              </span>
              <div className={`w-8 h-8 rounded-full ${m.iconBg} flex items-center justify-center ${m.iconColor}`}>
                {m.iconType === 'receipt' && (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <rect height="13" rx="2" width="20" x="2" y="6" />
                    <path d="M2 10h20" />
                    <circle cx="17" cy="14" r="1.5" />
                  </svg>
                )}
                {m.iconType === 'search-user' && (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" x2="16.65" y1="21" y2="16.65" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                )}
                {m.iconType === 'clock' && (
                  <svg
                    className="w-4 h-4"
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
                )}
                {m.iconType === 'check-circle' && (
                  <svg
                    className="w-4 h-4"
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
              </div>
            </div>
            <div className="mt-space-md">
              <div className="font-extrabold text-[32px] text-slate-900 tracking-tight leading-none">
                {m.value}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {m.change && (
                  <span className={`font-bold text-[12px] ${m.changeColor || 'text-primary'}`}>
                    {m.change}
                  </span>
                )}
                {m.badge && (
                  <>
                    <span className={`w-2 h-2 rounded-full ${m.badge.dot}`}></span>
                    <span className="font-semibold text-[12px] text-slate-600">
                      {m.badge.text}
                    </span>
                  </>
                )}
                {m.subtext && (
                  <span className="font-medium text-[12px] text-slate-500">
                    {m.subtext}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
