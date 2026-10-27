/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Dashboard list widget presenting recently booked and modified joint loan facilities.
*/

import React, { useState, useMemo } from 'react';
import { formatIndianCurrency } from '../../utils/jointLoanUtils';
import { getStatusBadge, getPrimaryTagColor } from '../JointLoan';
import { TableLoader } from '../common/LottieLoader';

export default function RecentJointLoans({
	loans = [],
	isLoading = false,
	onSelectLoan,
	onNavigateToJointLoans,
	onOpenLoanDetails,
	activeStatusFilter = 'ALL',
	onStatusFilterChange,
	searchQuery: propSearchQuery = '',
	limit = 10,
}) {
	const [internalSearch, setInternalSearch] = useState('');
	const searchQuery = propSearchQuery || internalSearch;

	const statusOptions = ['ALL', 'Active', 'Overdue', 'Date Overdue', 'Pending', 'Closed'];

	// Helper to extract timestamp or sorting weight from loan for chronological recency
	const parseLoanDate = (loan) => {
		const dateStr = loan.loan_date || loan.appliedDate || loan.created_at || loan.date || '';
		if (dateStr) {
			const cleanStr = String(dateStr).trim().split(' ')[0];
			const parts = cleanStr.split(/[-/]/);
			if (parts.length === 3) {
				if (parts[0].length === 4) {
					// YYYY-MM-DD
					const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
					if (!isNaN(d.getTime())) return d.getTime();
				} else {
					// DD-MM-YYYY
					const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
					if (!isNaN(d.getTime())) return d.getTime();
				}
			}
			const parsed = new Date(cleanStr);
			if (!isNaN(parsed.getTime())) return parsed.getTime();
		}
		// Fallback to numeric ID if date is not available or equal
		const numericId = parseInt(loan.db_id || loan.id || 0, 10);
		return isNaN(numericId) ? 0 : numericId;
	};

	// Filter loans by search query and active status, sorted by most recent date/ID descending
	const matchedLoans = useMemo(() => {
		const matched = loans.filter((loan) => {
			// Status check
			if (activeStatusFilter !== 'ALL') {
				const s1 = (loan.status || '').toLowerCase().trim();
				const s2 = activeStatusFilter.toLowerCase().trim();
				if (s1 !== s2) return false;
			}

			// Search query check
			if (searchQuery.trim()) {
				const q = searchQuery.toLowerCase().trim();
				const idMatch = (loan.id || loan.loan_ref_id || '').toLowerCase().includes(q);
				const nameMatch = (loan.client_account_name || '').toLowerCase().includes(q);
				const priMatch = (loan.primaryAccountName || loan.primary || '').toLowerCase().includes(q);
				const secMatch = Array.isArray(loan.secondaryAccounts)
					? loan.secondaryAccounts.some((s) => (s.accountName || '').toLowerCase().includes(q))
					: false;
				if (!idMatch && !nameMatch && !priMatch && !secMatch) return false;
			}

			return true;
		});

		// Sort strictly by most recent first
		return [...matched].sort((a, b) => {
			const timeB = parseLoanDate(b);
			const timeA = parseLoanDate(a);
			if (timeB !== timeA) return timeB - timeA;
			const idB = parseInt(b.db_id || b.id || 0, 10) || 0;
			const idA = parseInt(a.db_id || a.id || 0, 10) || 0;
			return idB - idA;
		});
	}, [loans, activeStatusFilter, searchQuery]);

	// Display only recent 10 joint loans
	const recentLoans = useMemo(() => {
		return matchedLoans.slice(0, limit);
	}, [matchedLoans, limit]);

	// Repayment schedule summary helper
	const getScheduleProgress = (loan) => {
		const schedule = loan.repaymentSchedule || [];
		if (!schedule.length) return { paidCount: 0, totalCount: 0, percent: 0, overdueCount: 0 };

		let paidCount = 0;
		let overdueCount = 0;
		schedule.forEach((inst) => {
			const st = (inst.status || '').toLowerCase();
			if (st === 'collected' || st === 'settled') {
				paidCount += 1;
			} else if (st === 'partial') {
				paidCount += 0.5;
			} else if (st === 'overdue') {
				overdueCount += 1;
			}
		});

		const totalCount = schedule.length;
		const percent = Math.min(100, Math.round((paidCount / totalCount) * 100));

		return { paidCount: Math.floor(paidCount), totalCount, percent, overdueCount };
	};

	return (
		<div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 font-sans overflow-hidden flex flex-col max-h-[580px]">
			{/* Header Strip with Controls */}
			<div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shrink-0">
				<div>
					<div className="flex items-center gap-2">
						<div className='w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center'>
							<span className="material-symbols-outlined text-[22px]">assignment</span>
						</div>
						<div>
							<div className='flex items-center gap-2'>
								<h2 className="text-[18px] font-extrabold text-slate-900 tracking-tight">
									Recent Joint Loans
								</h2>
								<span className="font-bold text-[12px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full ring-1 ring-slate-200">
									Showing {recentLoans.length} of {matchedLoans.length}
								</span>
								{matchedLoans.length > limit && (
									<span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full ring-1 ring-primary/20">
										Latest {limit}
									</span>
								)}
							</div>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Top {limit} recently booked and servicing co-lending facilities
							</p>	
						</div>
					</div>
				</div>

				{/* Search, Filter Pills & Servicing CTA */}
				<div className="flex flex-wrap items-center gap-3">
					{/* Search input */}
					<div className="relative">
						<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
							search
						</span>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setInternalSearch(e.target.value)}
							placeholder="Search loans, clients..."
							className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-48 sm:w-56"
						/>
					</div>

					{/* Jump to Joint Loans Servicing Desk */}
					{onNavigateToJointLoans && (
						<button
							type="button"
							onClick={onNavigateToJointLoans}
							className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-xl text-[12px] font-bold shadow-sm hover:bg-primary/90 transition-transform active:scale-95 shrink-0"
						>
							<span>Joint Loan Desk</span>
							<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
						</button>
					)}
				</div>
			</div>

			{/* Loans Table */}
			<div className="overflow-x-auto overflow-y-auto flex-1">
				<table className="w-full text-left border-collapse">
					<thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-2xs">
						<tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
							<th className="py-3.5 px-5">Client Name</th>
							<th className="py-3.5 px-4">Amount</th>
							<th className="py-3.5 px-4">Co-Lending Share</th>
							<th className="py-3.5 px-4">Repayment Progress</th>
							<th className="py-3.5 px-4">Status</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 text-[13px]">
						{isLoading ? (
							<TableLoader colSpan={6} text="Loading recent joint loans..." />
						) : recentLoans.length === 0 ? (
							<tr>
								<td colSpan={6} className="py-12 text-center text-slate-400">
									<div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
										<span className="material-symbols-outlined text-[24px]">folder_off</span>
									</div>
									<div className="font-bold text-[14px] text-slate-700">No joint loans found</div>
									<p className="text-[12px] text-slate-400 mt-1">
										Try adjusting your search query or status filter.
									</p>
								</td>
							</tr>
						) : (
							recentLoans.map((loan) => {
								const badge = getStatusBadge(loan.status);
								const progress = getScheduleProgress(loan);
								const clientName = loan.client_account_name || 'Client';
								const primaryTag = loan.primary || 'SS';
								const primaryTagClass = getPrimaryTagColor(primaryTag);
								const primaryName = loan.primaryAccountName || 'Primary';
								const primaryShare = loan.primaryShare ?? 70;

								// Secondary accounts preview
								const secAccounts = loan.accountDetails
									? loan.accountDetails.filter((a) => !a.isPrimary)
									: loan.secondaryAccounts || [];

								return (
									<tr
										key={loan.id || loan.db_id}
										className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
										title="Click to open loan details page"
										onClick={() => {
											if (onOpenLoanDetails) {
												onOpenLoanDetails(loan);
											} else if (onNavigateToJointLoans) {
												onNavigateToJointLoans(loan);
											} else if (onSelectLoan) {
												onSelectLoan(loan);
											}
										}}
									>
										{/* Ref ID & Borrower */}
										<td className="py-4 px-5">
											<div className="flex items-center gap-3">
												<div>
													<div className="font-extrabold text-[14px] text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
														<span>{clientName}</span>
													</div>
													<div className="flex items-center gap-2 mt-0.5">
														<span className="font-mono text-[11px] font-bold text-slate-500">
															{loan.id || `JL-${loan.db_id}`}
														</span>
														<span className="text-slate-300">•</span>
														<span className="text-[11px] text-slate-500">
															{loan.loan_date || loan.appliedDate || '-'}
														</span>
													</div>
												</div>
											</div>
										</td>

										{/* Amount & Tenure */}
										<td className="py-4 px-4">
											<div className="font-extrabold text-[15px] text-slate-900">
												₹ {formatIndianCurrency(loan.amount)}
											</div>
										</td>

										{/* Co-Lending Share */}
										<td className="py-4 px-4">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${primaryTagClass}`}>
													<span>{primaryTag}</span>
													<span>{primaryShare}%</span>
												</span>
												{secAccounts.map((sec, i) => {
													const sTag = sec.accountTag || sec.accountName || 'SEC';
													return (
														<span
															key={i}
															className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200"
														>
															<span>{sTag}</span>
															<span>{sec.share || 100 - primaryShare}%</span>
														</span>
													);
												})}
											</div>
										</td>

										{/* Repayment Progress */}
										<td className="py-4 px-4">
											<div className="w-36">
												<div className="flex items-center justify-between text-[11px] mb-1">
													<span className="font-semibold text-slate-700">
														{progress.paidCount}/{progress.totalCount} Paid
													</span>
													{progress.overdueCount > 0 ? (
														<span className="font-bold text-rose-600">
															{progress.overdueCount} Overdue
														</span>
													) : (
														<span className="font-semibold text-slate-400">
															{progress.percent}%
														</span>
													)}
												</div>
												<div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
													<div
														className={`h-full rounded-full transition-all duration-500 ${
															progress.overdueCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
														}`}
														style={{ width: `${progress.percent}%` }}
													></div>
												</div>
											</div>
										</td>

										{/* Status Badge & Open Arrow */}
										<td className="py-4 px-4">
											<div className="flex items-center justify-between gap-2">
												<span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full ring-1 ${badge.color}`}>
													<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
													<span>{loan.status || 'Active'}</span>
												</span>
												<span className="material-symbols-outlined text-[18px] text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
													chevron_right
												</span>
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{/* Footer CTA */}
			{onNavigateToJointLoans && (
				<div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
					<span className="text-slate-500 font-medium">
						Showing recent {recentLoans.length} {recentLoans.length === 1 ? 'joint loan' : 'joint loans'} {matchedLoans.length > limit ? `(out of ${matchedLoans.length} total)` : ''}
					</span>
					<button
						type="button"
						onClick={onNavigateToJointLoans}
						className="font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
					>
						<span>Open Complete Joint Loan Desk</span>
						<span className="material-symbols-outlined text-[14px]">arrow_forward</span>
					</button>
				</div>
			)}
		</div>
	);
}
