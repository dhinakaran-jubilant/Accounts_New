/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Top controls toolbar containing the modern role-aware account filter, quick overdue tabs, and sync controls.
*/

import React from 'react';
import AccountFilterDropdown from './AccountFilterDropdown';

export default function JointLoanTopControls({
	activeTab = 'all',
	onTabChange,
	onRefresh,
	isRefreshing = false,
	syncFeedback = null,
	lastSyncTime = null,
	onExport,
	onNewLoan,
	totalLoans = 0,
	selectedAccount = 'ALL',
	onSelectAccount,
	accounts = [],
	isAdmin = false,
	roleFilter = 'primary', // 'primary' | 'secondary'
	onRoleFilterChange,
	onOpenSyncedPopup,
	syncedCount = 0,
}) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			{/* 1. Primary / Secondary Role Tab Filter (Default: Primary) */}
			<div className="inline-flex items-center bg-slate-100 p-1 rounded-xl ring-1 ring-slate-200/60 shadow-2xs">
				<button
					type="button"
					onClick={() => onRoleFilterChange && onRoleFilterChange('primary')}
					className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
						roleFilter === 'primary'
							? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/50'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<span className="material-symbols-outlined text-[15px]">flag</span>
					<span>Primary</span>
				</button>
				<button
					type="button"
					onClick={() => onRoleFilterChange && onRoleFilterChange('secondary')}
					className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
						roleFilter === 'secondary'
							? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/50'
							: 'text-slate-600 hover:text-slate-900'
					}`}
				>
					<span className="material-symbols-outlined text-[15px]">group</span>
					<span>Secondary</span>
				</button>
			</div>

			{/* 2. Modern Account Filter (Settings.jsx style) */}
			<AccountFilterDropdown
				selectedAccount={selectedAccount}
				onSelectAccount={onSelectAccount}
				accounts={accounts}
				isAdmin={isAdmin}
				totalLoans={totalLoans}
				roleFilter={roleFilter}
			/>

			{/* 3. Unified Sync Button (DayBook Received Dates & Tally Payout Dates) */}
			<button
				type="button"
				onClick={onRefresh}
				disabled={isRefreshing}
				className={`inline-flex items-center gap-2 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl border border-slate-200 shadow-2xs transition-all active:scale-95 disabled:opacity-75 cursor-pointer select-none group ${
					lastSyncTime ? 'px-3 py-1.5' : 'h-9 px-3 text-xs'
				}`}
				title={lastSyncTime ? `Last synced: ${lastSyncTime} • Click to sync DayBook & Tally` : 'Sync DayBook & Tally'}
			>
				<span
					className={`material-symbols-outlined text-[17px] transition-transform ${
						isRefreshing ? 'animate-spin text-primary' : 'text-slate-500 group-hover:text-primary'
					}`}
				>
					sync
				</span>
				<div className="flex flex-col text-left leading-tight">
					<span className="font-bold text-[12px] whitespace-nowrap">
						{isRefreshing ? 'Syncing...' : syncFeedback || 'Sync'}
					</span>
					{lastSyncTime && (
						<span className="text-[9px] text-slate-400 font-medium whitespace-nowrap font-mono tracking-tight">
							{lastSyncTime}
						</span>
					)}
				</div>
			</button>
		</div>
	);
}
