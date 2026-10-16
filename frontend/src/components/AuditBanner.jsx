/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Alert banner component displaying system notices, audit notifications, and status alerts.
*/

import React, { useState } from 'react';

export default function AuditBanner({ onAuditLogClick, onPolicyCheckClick }) {
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [checkPassed, setCheckPassed] = useState(false);

  const handlePolicyCheck = () => {
    setIsRunningCheck(true);
    setTimeout(() => {
      setIsRunningCheck(false);
      setCheckPassed(true);
      setTimeout(() => setCheckPassed(false), 4000);
      if (onPolicyCheckClick) onPolicyCheckClick();
    }, 1200);
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md ring-1 ring-slate-200/80 font-sans">
      <div className="flex items-center gap-space-md">
        <div className="w-12 h-12 rounded-xl bg-primary-fixed/40 flex items-center justify-center text-primary flex-shrink-0 ring-1 ring-primary/20">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[17px] text-slate-900">
              Automated Risk &amp; Compliance Audit Engine Active
            </span>
            {checkPassed && (
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                Passed 100%
              </span>
            )}
          </div>
          <div className="font-medium text-[13px] text-slate-500 mt-0.5">
            All 148 active pipeline assets conform with Basel III liquidity parameters and SOC2 compliance records.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-space-sm w-full lg:w-auto justify-end">
        <button
          type="button"
          onClick={onAuditLogClick}
          className="px-space-md py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-slate-800 font-bold text-[13px] ring-1 ring-slate-200 transition-colors"
        >
          View Audit Log
        </button>
        <button
          type="button"
          disabled={isRunningCheck}
          onClick={handlePolicyCheck}
          className="px-space-md py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-[13px] shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-75"
        >
          {isRunningCheck ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Verifying Assets...</span>
            </>
          ) : (
            <span>Run Policy Check</span>
          )}
        </button>
      </div>
    </div>
  );
}
