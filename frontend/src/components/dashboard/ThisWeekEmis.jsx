/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Dashboard schedule widget displaying upcoming EMI collections and payout dates due in the current week.
*/

import React, { useState, useMemo } from 'react';
import { formatIndianCurrency, formatCompactCurrency } from '../../utils/jointLoanUtils';
import { getStatusBadge } from '../JointLoan';

export default function ThisWeekEmis({
	loans = [],
	onSelectLoan,
	onOpenInServicing,
}) {
	const [statusTab, setStatusTab] = useState('all'); // 'all' | 'overdue' | 'upcoming'

	// Helper to parse date string (supports DD-MM-YYYY and YYYY-MM-DD)
	const parseDateStr = (dateStr) => {
		if (!dateStr || typeof dateStr !== 'string') return null;
		const parts = dateStr.trim().split('-');
		if (parts.length === 3) {
			if (parts[0].length === 4) {
				// YYYY-MM-DD
				const y = parseInt(parts[0], 10);
				const m = parseInt(parts[1], 10) - 1;
				const d = parseInt(parts[2], 10);
				return new Date(y, m, d);
			} else {
				// DD-MM-YYYY
				const d = parseInt(parts[0], 10);
				const m = parseInt(parts[1], 10) - 1;
				const y = parseInt(parts[2], 10);
				return new Date(y, m, d);
			}
		}
		const parsed = new Date(dateStr);
		return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
	};

	// Extract and calculate current week (Sunday to Saturday) EMIs from joint loans
	const emisData = useMemo(() => {
		const now = new Date();
		// Normalize today to start of day
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		// Start of current week: Sunday at 00:00:00.000
		const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
		const startOfWeek = new Date(today);
		startOfWeek.setDate(today.getDate() - dayOfWeek);
		startOfWeek.setHours(0, 0, 0, 0);

		// End of current week: Saturday at 23:59:59.999
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 6);
		endOfWeek.setHours(23, 59, 59, 999);

		const allEmis = [];

		loans.forEach((loan) => {
			const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
			schedule.forEach((inst, index) => {
				const dateStr = inst.date || '';
				const instDate = parseDateStr(dateStr);
				if (!instDate) return;

				// Strictly filter to the current week: Sunday to Saturday
				if (instDate < startOfWeek || instDate > endOfWeek) {
					return;
				}

				const diffTime = instDate.getTime() - today.getTime();
				const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

				const status = (inst.status || 'Upcoming').toLowerCase();
				const isCollected = status === 'collected' || status === 'settled';

				// Exclude collected/settled EMIs
				if (isCollected) return;

				const isOverdue =
					diffDays < 0 ||
					status === 'overdue' ||
					status === 'date overdue';

				allEmis.push({
					loanId: loan.id || `JL-${loan.db_id}`,
					clientName: loan.client_account_name || 'Client',
					amount: Number(inst.amount) || 0,
					interest: Number(inst.interest || inst.interest_amount) || 0,
					date: dateStr,
					instDate,
					diffDays,
					sNo: inst.sNo || inst.installmentNumber || index + 1,
					totalTenure: schedule.length,
					status: inst.status || (isOverdue ? 'Overdue' : 'Active'),
					isCollected: false,
					isOverdue,
					isUpcoming: !isOverdue,
					primaryName: loan.primaryAccountName || loan.primary || 'Primary',
					primaryShare: loan.primaryShare ?? 70,
					loan,
				});
			});
		});

		// Sort by due date ascending (Sunday first, Saturday last)
		allEmis.sort((a, b) => a.instDate - b.instDate);

		return {
			allEmis,
			today,
			startOfWeek,
			endOfWeek,
		};
	}, [loans]);

	// Format Sunday to Saturday date range for display
	const weekRangeLabel = useMemo(() => {
		const { startOfWeek, endOfWeek } = emisData;
		const startStr = startOfWeek.toLocaleDateString('en-IN', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
		});
		const endStr = endOfWeek.toLocaleDateString('en-IN', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
		});
		return `${startStr} – ${endStr}`;
	}, [emisData]);

	// Counts for All, Overdue, Upcoming in the current week
	const counts = useMemo(() => {
		const { allEmis } = emisData;
		let overdue = 0;
		let upcoming = 0;
		allEmis.forEach((e) => {
			if (e.isOverdue) overdue++;
			else upcoming++;
		});
		return {
			all: allEmis.length,
			overdue,
			upcoming,
		};
	}, [emisData]);

	// Filter based on selected statusTab (all | overdue | upcoming)
	const filteredEmis = useMemo(() => {
		const { allEmis } = emisData;

		if (statusTab === 'overdue') {
			return allEmis.filter((emi) => emi.isOverdue);
		}

		if (statusTab === 'upcoming') {
			return allEmis.filter((emi) => emi.isUpcoming);
		}

		return allEmis;
	}, [emisData, statusTab]);

	// Calculate total due for the current filtered list
	const totalDueAmount = useMemo(() => {
		return filteredEmis.reduce((sum, item) => sum + item.amount, 0);
	}, [filteredEmis]);

	// Get friendly countdown badge styling
	const getCountdownBadge = (emiOrDiff) => {
		const diffDays = typeof emiOrDiff === 'number' ? emiOrDiff : (emiOrDiff?.diffDays ?? 0);
		const isOverdue = typeof emiOrDiff === 'object' && emiOrDiff !== null ? emiOrDiff.isOverdue : diffDays < 0;

		if (isOverdue || diffDays < 0) {
			const days = Math.abs(diffDays);
			return {
				text: days > 0 ? `${days}d Overdue` : 'Overdue',
				color: 'bg-rose-50 text-rose-700 ring-rose-300',
				pulse: true,
			};
		}
		if (diffDays === 0) {
			return {
				text: 'Due Today',
				color: 'bg-orange-50 text-orange-700 ring-orange-300',
				pulse: true,
			};
		}
		if (diffDays === 1) {
			return {
				text: 'Due Tomorrow',
				color: 'bg-amber-50 text-amber-700 ring-amber-300',
				pulse: false,
			};
		}
		return {
			text: `Due in ${diffDays} days`,
			color: 'bg-blue-50 text-blue-700 ring-blue-300',
			pulse: false,
		};
	};


	return (
		<div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-6 font-sans">
			{/* Top Header Row */}
			<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-100">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-orange-50 text-primary flex items-center justify-center">
							<span className="material-symbols-outlined text-[20px]">calendar_today</span>
						</div>
						<div>
							<div className="flex items-center gap-2 flex-wrap">
								<h2 className="text-[18px] font-extrabold text-slate-900 tracking-tight">
									This Week's EMIs &amp; Due Amounts
								</h2>
								<span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
									{weekRangeLabel}
								</span>
								<span className={`inline-flex items-center gap-1 font-bold text-[12px] px-2.5 py-0.5 rounded-full ring-1 ${
									statusTab === 'overdue'
										? 'bg-rose-50 text-rose-700 ring-rose-200'
										: statusTab === 'upcoming'
										? 'bg-blue-50 text-blue-700 ring-blue-200'
										: 'bg-orange-50 text-primary ring-orange-200'
								}`}>
									<span className={`w-1.5 h-1.5 rounded-full ${
										statusTab === 'overdue'
											? 'bg-rose-500 animate-pulse'
											: statusTab === 'upcoming'
											? 'bg-blue-500 animate-pulse'
											: 'bg-primary animate-pulse'
									}`}></span>
									{filteredEmis.length} {filteredEmis.length === 1 ? 'EMI' : 'EMIs'} {statusTab === 'overdue' ? 'Overdue' : statusTab === 'upcoming' ? 'Upcoming' : 'Due'}
								</span>
							</div>
							<p className="text-[12px] text-slate-500 mt-1">
								Current week schedule ({weekRangeLabel}) • Showing {statusTab === 'overdue' ? 'overdue' : statusTab === 'upcoming' ? 'upcoming' : 'all'} client installments due between Sunday and Saturday
							</p>
						</div>
					</div>
				</div>

				{/* Right: Overdue / Upcoming Filter Tab */}
				<div className="flex flex-wrap items-center gap-3">
					<div className="inline-flex items-center bg-slate-100 p-1 rounded-xl ring-1 ring-slate-200/60">
						<button
							type="button"
							onClick={() => setStatusTab('all')}
							className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
								statusTab === 'all'
									? 'bg-white text-primary shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
							}`}
						>
							All ({counts.all})
						</button>
						<button
							type="button"
							onClick={() => setStatusTab('overdue')}
							className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
								statusTab === 'overdue'
									? 'bg-white text-rose-600 shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
							}`}
						>
							Overdue ({counts.overdue})
						</button>
						<button
							type="button"
							onClick={() => setStatusTab('upcoming')}
							className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
								statusTab === 'upcoming'
									? 'bg-white text-primary shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
							}`}
						>
							Upcoming ({counts.upcoming})
						</button>
					</div>
				</div>
			</div>

			{/* EMI Cards Grid */}
			{filteredEmis.length === 0 ? (
				<div className="py-10 text-center">
					<div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
						<span className="material-symbols-outlined text-[24px]">task_alt</span>
					</div>
					<h3 className="font-extrabold text-[15px] text-slate-800">
						{statusTab === 'overdue'
							? "No Overdue EMIs for This Week"
							: statusTab === 'upcoming'
							? "No Upcoming EMIs for This Week"
							: "No Pending EMIs for This Week"}
					</h3>
					<p className="text-[12px] text-slate-500 mt-1 max-w-sm mx-auto">
						{statusTab === 'overdue'
							? `All repayments scheduled for the current week (${weekRangeLabel}) are up to date with no overdue payments.`
							: statusTab === 'upcoming'
							? `No upcoming payments scheduled for the remainder of this week (${weekRangeLabel}).`
							: `All client repayment obligations for this week (${weekRangeLabel}) have been collected or settled.`}
					</p>
					{statusTab !== 'all' && (
						<button
							type="button"
							onClick={() => setStatusTab('all')}
							className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
						>
							View All This Week EMIs
						</button>
					)}
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
					{filteredEmis.map((emi, idx) => {
						const countdown = getCountdownBadge(emi);
						const badge = getStatusBadge(emi.status);

						return (
							<div
								key={`${emi.loanId}-${emi.sNo}-${idx}`}
								className="relative overflow-hidden bg-slate-50/70 hover:bg-white rounded-2xl p-4 border border-slate-200/80 hover:shadow-md transition-all duration-200 flex flex-col justify-between group"
							>

								{/* Top Row: Client Name & Countdown Badge */}
								<div className="pl-1">
									<div className="flex items-start justify-between gap-2">
										<div className="truncate">
											<div className="font-extrabold text-[15px] text-slate-900 group-hover:text-primary transition-colors truncate">
												{emi.clientName}
											</div>
											<div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
												<span className="font-mono font-bold text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
													{emi.loanId}
												</span>
												<span>•</span>
												<span className="font-semibold text-slate-700">
													EMI #{emi.sNo} of {emi.totalTenure}
												</span>
											</div>
										</div>

										<span
											className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 shrink-0 ${countdown.color}`}
										>
											{countdown.pulse && (
												<span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
											)}
											<span>{countdown.text}</span>
										</span>
									</div>

									{/* Due Amount Block */}
									<div className="my-3.5 p-2.5 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between">
										<div>
											<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
												Due Amount
											</span>
											<div className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-none mt-0.5">
												{formatIndianCurrency(emi.amount)}
											</div>
										</div>
										<div className="text-right">
											<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
												Due Date
											</span>
											<div className="text-[13px] font-bold text-slate-800 flex items-center gap-1 justify-end mt-0.5">
												<span>{emi.date}</span>
											</div>
										</div>
									</div>

									{/* Partner Info & Status Strip */}
									<div className="flex items-center justify-between text-[11px]">
										<div className="text-slate-500 truncate">
											<span className="text-slate-400">Partner: </span>
											<span className="font-semibold text-slate-700 truncate">
												{emi.primaryName} ({emi.primaryShare}%)
											</span>
										</div>
										<span
											className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${badge.color}`}
										>
											<span className={`w-1 h-1 rounded-full ${badge.dot}`}></span>
											<span>{emi.status}</span>
										</span>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
