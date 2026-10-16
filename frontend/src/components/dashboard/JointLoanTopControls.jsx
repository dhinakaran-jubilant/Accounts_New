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
	onExport,
	onNewLoan,
	totalLoans = 0,
	selectedAccount = 'ALL',
	onSelectAccount,
	accounts = [],
	isAdmin = false,
	roleFilter = 'primary', // 'primary' | 'secondary'
	onRoleFilterChange,
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

			{/* 3. Sync/Refresh Button */}
			<button
				type="button"
				onClick={onRefresh}
				disabled={isRefreshing}
				className="h-9 inline-flex items-center gap-1.5 px-3 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs transition-all cursor-pointer select-none disabled:opacity-60"
				title="Refresh database records"
			>
				<span className={`material-symbols-outlined text-[17px] ${isRefreshing ? 'animate-spin text-primary' : ''}`}>
					refresh
				</span>
				<span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
			</button>
		</div>
	);
}
