/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: 5-Card KPI metric strip displaying total principal, collections, outstanding balance, pending approval splits (sec/admin), and overdue exposure.
*/

import React from 'react';
import { formatCompactCurrency, formatIndianCurrency } from '../../utils/jointLoanUtils';

export default function JointLoanMetrics({ metrics, roleFilter = 'primary', onFilterByStatus, onNavigateToRequests }) {
	const isSecondary = roleFilter === 'secondary';

	const {
		totalVolume = 0,
		totalPrincipal = 0,
		activeVolume = 0,
		activeCount = 0,
		overdueCount = 0,
		overdueAmount = 0,
		totalCollected = 0,
		totalBalance = 0,
		pendingCount = 0,
		pendingSecCount = 0,
		pendingAdminCount = 0,
		closedCount = 0,
		recoveryRate = 0,
		totalLoansCount = 0,
		secondaryPrincipal = 0,
		secondaryCollected = 0,
		pendingFromPrimary = 0,
		pendingPayoutCount = 0,
		secondaryOverdue = 0,
		secondaryBalance = 0,
		settlementPendingAmount = 0,
		settlementPendingCount = 0,
		pendingApprovalAmount = 0,
		pendingApprovalCount = 0,
		upcomingAmount = 0,
		upcomingCount = 0,
		pendingByPrimaryAccount = [],
	} = metrics || {};

	return (
		<div className={`grid grid-cols-1 sm:grid-cols-2 ${isSecondary ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-space-md font-sans`}>
			{/* Metric 1: Total Principal / Secondary Capital */}
			<div
				onClick={() => onFilterByStatus && onFilterByStatus('ALL')}
				className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-slate-200/80 cursor-pointer group"
				title={isSecondary ? "Total Secondary Capital Invested Across Facilities" : "Total Joint Loan Principal Disbursed"}
			>
				<div className="flex items-start justify-between">
					<span className="font-bold text-[12px] uppercase tracking-wider text-slate-500">
						{isSecondary ? 'Secondary Capital' : 'Total Principal'}
					</span>
					<div className="w-9 h-9 rounded-xl bg-orange-50 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
						<span className="material-symbols-outlined text-[20px]">account_balance</span>
					</div>
				</div>
				<div className="mt-3">
					<div
						className="font-extrabold text-[26px] text-slate-900 tracking-tight leading-none"
						title={formatIndianCurrency(isSecondary ? (secondaryPrincipal || totalPrincipal) : (totalPrincipal || totalVolume))}
					>
						{formatCompactCurrency(isSecondary ? (secondaryPrincipal || totalPrincipal) : (totalPrincipal || totalVolume))}
					</div>
					<div className="flex items-center gap-1.5 mt-2.5">
						<span className="inline-flex items-center text-[10.5px] font-bold text-primary bg-orange-50 px-2 py-0.5 rounded-full ring-1 ring-orange-200">
							{totalLoansCount} {isSecondary ? (totalLoansCount === 1 ? 'Loan' : 'Loans') : (totalLoansCount === 1 ? 'Loan' : 'Loans')}
						</span>
						<span className="font-medium text-[11px] text-slate-500 truncate">
							{activeCount} Active • {closedCount} Closed
						</span>
					</div>
				</div>
			</div>

			{/* Metric 2: Total Collected / Payouts Received */}
			<div
				className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-slate-200/80 group"
				title={isSecondary ? "Secondary Payouts Received from Primary Accounts" : "Total Repayments Collected from Borrowers to Date"}
			>
				<div className="flex items-start justify-between">
					<span className="font-bold text-[12px] uppercase tracking-wider text-slate-500">
						{isSecondary ? 'Payouts Received' : 'Total Collected'}
					</span>
					<div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
						<span className="material-symbols-outlined text-[20px]">payments</span>
					</div>
				</div>
				<div className="mt-3">
					<div
						className="font-extrabold text-[26px] text-slate-900 tracking-tight leading-none"
						title={formatIndianCurrency(isSecondary ? (secondaryCollected ?? totalCollected) : totalCollected)}
					>
						{formatCompactCurrency(isSecondary ? (secondaryCollected ?? totalCollected) : totalCollected)}
					</div>
					<div className="flex items-center gap-1.5 mt-2.5">
						<span className="inline-flex items-center text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
							{recoveryRate}% {isSecondary ? 'Settled' : 'Recovery'}
						</span>
						<span className="font-medium text-[11px] text-slate-500 truncate">
							{isSecondary ? 'Settled from Primary' : 'Collected to Date'}
						</span>
					</div>
				</div>
			</div>

			{/* Metric 3: Settlement Pending (Primary) / Pending from Primary (Secondary) */}
			{isSecondary ? (
				<div
					className={`relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 group ${
						pendingFromPrimary > 0
							? 'ring-amber-300/80 bg-amber-50/25'
							: 'ring-slate-200/80'
					}`}
					title="Primary accounts have collected these EMIs from clients, but have not yet sent secondary payouts"
				>
					<div className="flex items-start justify-between">
						<span className="font-bold text-[12px] uppercase tracking-wider text-amber-900">
							Pending
						</span>
						<div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
							<span className="material-symbols-outlined text-[20px]">hourglass_top</span>
						</div>
					</div>
					<div className="mt-3">
						<div
							className="font-extrabold text-[26px] text-amber-950 tracking-tight leading-none"
							title={formatIndianCurrency(pendingFromPrimary)}
						>
							{formatCompactCurrency(pendingFromPrimary)}
						</div>
						<div className="flex items-center gap-1.5 mt-2.5">
							<span className="inline-flex items-center text-[10.5px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full ring-1 ring-amber-300">
								{pendingPayoutCount} {pendingPayoutCount === 1 ? 'EMI' : 'EMIs'} Due
							</span>
						</div>
					</div>
				</div>
			) : (
				<div
					className={`relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 group ${
						settlementPendingAmount > 0
							? 'ring-amber-300/80 bg-amber-50/25'
							: 'ring-slate-200/80'
					}`}
					title="Primary accounts received repayments from client, but have not yet settled secondary partners' share"
				>
					<div className="flex items-start justify-between">
						<span className="font-bold text-[12px] uppercase tracking-wider text-amber-900">
							Settlement Pending
						</span>
						<div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
							<span className="material-symbols-outlined text-[20px]">sync_problem</span>
						</div>
					</div>
					<div className="mt-3">
						<div
							className="font-extrabold text-[26px] text-amber-950 tracking-tight leading-none"
							title={formatIndianCurrency(settlementPendingAmount)}
						>
							{formatCompactCurrency(settlementPendingAmount)}
						</div>
						<div className="flex items-center gap-1.5 mt-2.5">
							<span className="inline-flex items-center text-[10.5px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full ring-1 ring-amber-300">
								{settlementPendingCount} {settlementPendingCount === 1 ? 'EMI' : 'EMIs'}
							</span>
							<span className="font-medium text-[11px] text-slate-600 truncate">
								Payout Not Filled
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Metric 4: Pending Approval (Primary only) */}
			{!isSecondary && (
				<div
					onClick={() => onNavigateToRequests && onNavigateToRequests()}
					className={`relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 cursor-pointer group hover:border-amber-400 ${
						pendingApprovalAmount > 0 || pendingCount > 0
							? 'ring-amber-300/80 bg-amber-50/15'
							: 'ring-slate-200/80'
					}`}
					title="Click to open Requests: Payout date filled, waiting for partner/admin approval"
				>
					<div className="flex items-start justify-between">
						<span className="font-bold text-[12px] uppercase tracking-wider text-amber-900 flex items-center gap-1">
							Pending Approval
						</span>
						<div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
							<span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
						</div>
					</div>
					<div className="mt-3">
						<div
							className="font-extrabold text-[26px] text-slate-900 tracking-tight leading-none"
							title={formatIndianCurrency(pendingApprovalAmount)}
						>
							{formatCompactCurrency(pendingApprovalAmount)}
						</div>
						<div className="flex items-center gap-1.5 mt-2.5">
							<span className="inline-flex items-center text-[10.5px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full ring-1 ring-amber-300">
								{pendingApprovalCount} {pendingApprovalCount === 1 ? 'EMI' : 'EMIs'}
							</span>
							<span className="font-medium text-[11px] text-slate-600 truncate">
								{pendingCount > 0 ? `${pendingCount} Req Waiting` : 'Awaiting Approval'}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Metric 5: Overdue Exposure / Client Overdue Share */}
			<div
				onClick={() => onFilterByStatus && onFilterByStatus('Overdue')}
				className={`relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 cursor-pointer group ${
					overdueCount > 0 ? 'ring-rose-300/80 bg-rose-50/20' : 'ring-slate-200/80'
				}`}
				title={isSecondary ? "Secondary share of client overdue installments" : "Click to filter facilities with overdue installments"}
			>
				<div className="flex items-start justify-between">
					<span className="font-bold text-[12px] uppercase tracking-wider text-rose-700">
						Client Overdue
					</span>
					<div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
						<span className="material-symbols-outlined text-[20px]">warning</span>
					</div>
				</div>
				<div className="mt-3">
					<div className="font-extrabold text-[26px] text-rose-950 tracking-tight leading-none">
						{formatCompactCurrency(isSecondary ? (secondaryOverdue || overdueAmount) : overdueAmount)}
					</div>
					<div className="flex items-center gap-1.5 mt-2.5">
						<span className={`inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full ring-1 ${
							overdueCount > 0
								? 'text-rose-700 bg-rose-100 ring-rose-200'
								: 'text-emerald-700 bg-emerald-100 ring-emerald-200'
						}`}>
							{overdueCount} {overdueCount === 1 ? 'Loan' : 'Loans'}
						</span>
						<span className="font-medium text-[11px] text-slate-500 truncate">
							{overdueCount > 0 ? (isSecondary ? 'Delinquent client EMIs' : 'Requires attention') : 'Zero delinquent loans'}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
