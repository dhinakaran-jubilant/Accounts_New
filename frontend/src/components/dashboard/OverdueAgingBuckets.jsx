/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Overdue Aging Buckets (Days Past Due - DPD analysis) categorizing delinquent loan installments across 1-15d, 16-30d, 31-60d, 61-90d, and 90+d risk tiers.
*/

import React, { useState, useMemo } from 'react';
import { formatIndianCurrency, calculateAgingBuckets } from '../../utils/jointLoanUtils';

export default function OverdueAgingBuckets({
	loans = [],
	onSelectLoan,
	onOpenLoanDetails,
	accountRoleFilter = 'primary',
}) {
	// Active bucket filter: 'all' | '1_15' | '16_30' | '31_60' | '61_90' | '90_plus'
	const [activeBucketId, setActiveBucketId] = useState('all');
	const [searchTerm, setSearchTerm] = useState('');
	const [sortBy, setSortBy] = useState('dpd_desc'); // 'dpd_desc' | 'amount_desc' | 'date_asc'

	// Calculate aging buckets across the current loans portfolio
	const agingData = useMemo(() => {
		return calculateAgingBuckets(loans);
	}, [loans]);

	const { buckets, totalOverdueAmount, totalOverdueCount, uniqueOverdueLoansCount, maxDpd } = agingData;

	// Extract installments based on activeBucketId
	const displayedInstallments = useMemo(() => {
		let list = [];
		if (activeBucketId === 'all') {
			buckets.forEach((b) => {
				list = list.concat(b.installments);
			});
		} else {
			const b = buckets.find((item) => item.id === activeBucketId);
			if (b) list = [...b.installments];
		}

		// Search filter
		if (searchTerm.trim()) {
			const q = searchTerm.toLowerCase().trim();
			list = list.filter((item) => {
				const client = (item.clientName || '').toLowerCase();
				const loanId = (item.loanId || '').toLowerCase();
				const primary = (item.primaryAccount || '').toLowerCase();
				const chq = (item.chequeNo || '').toLowerCase();
				const due = (item.dueDate || '').toLowerCase();
				return client.includes(q) || loanId.includes(q) || primary.includes(q) || chq.includes(q) || due.includes(q);
			});
		}

		// Sort
		list.sort((a, b) => {
			if (sortBy === 'dpd_desc') return b.dpd - a.dpd;
			if (sortBy === 'amount_desc') return b.amount - a.amount;
			if (sortBy === 'date_asc') return (a.instDate?.getTime() || 0) - (b.instDate?.getTime() || 0);
			return 0;
		});

		return list;
	}, [buckets, activeBucketId, searchTerm, sortBy]);

	// If no overdue loans exist in the portfolio
	if (totalOverdueCount === 0) {
		return (
			<div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-6 font-sans">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
							<span className="material-symbols-outlined text-[24px]">verified</span>
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h3 className="text-base font-extrabold text-slate-900 tracking-tight">
									Overdue Aging Analysis (DPD Buckets)
								</h3>
								<span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
									100% On-Time
								</span>
							</div>
							<p className="text-xs text-slate-500 mt-0.5">
								No overdue installments detected. All loan repayment schedules are current and up to date.
							</p>
						</div>
					</div>

					<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 self-start sm:self-auto">
						<span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
						<span>Zero Delinquency Exposure</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-6 font-sans flex flex-col space-y-5">
			{/* Header Section */}
			<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
				<div className="flex items-start sm:items-center gap-3.5">
					<div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100 shadow-2xs">
						<span className="material-symbols-outlined text-[24px]">pending_actions</span>
					</div>
					<div>
						<div className="flex items-center gap-2.5 flex-wrap">
							<h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
								Overdue Aging Buckets (DPD Analysis)
							</h3>
							<span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 ring-1 ring-rose-200 shadow-2xs">
								<span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
								{totalOverdueCount} Overdue {totalOverdueCount === 1 ? 'EMI' : 'EMIs'}
							</span>
							<span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full ring-1 ring-slate-200">
								{uniqueOverdueLoansCount} {uniqueOverdueLoansCount === 1 ? 'Facility' : 'Facilities'} Impacted
							</span>
						</div>
						<p className="text-xs text-slate-500 mt-1">
							Portfolio delinquency aging categorized by Days Past Due (DPD) from mild grace to critical non-performing loans.
						</p>
					</div>
				</div>

				{/* High-level metrics badge pill */}
				<div className="flex items-center gap-3 self-start lg:self-auto flex-wrap">
					<div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/90 text-left">
						<div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Overdue Capital</div>
						<div className="text-sm sm:text-base font-extrabold text-rose-700">
							₹ {formatIndianCurrency(totalOverdueAmount)}
						</div>
					</div>

					<div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/90 text-left">
						<div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Max Delinquency</div>
						<div className="text-sm sm:text-base font-extrabold text-slate-900 font-mono">
							{maxDpd} <span className="text-xs font-semibold text-slate-500">Days</span>
						</div>
					</div>
				</div>
			</div>

			{/* Portfolio Overdue Exposure Distribution Segmented Bar */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between text-xs font-bold text-slate-600">
					<span>Overdue Capital Distribution by Aging Tier</span>
					<span className="text-slate-400 font-normal">Click any tier card below to drilldown</span>
				</div>

				<div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
					{buckets.map((b) => {
						if (!b.totalAmount || b.totalAmount <= 0) return null;
						return (
							<div
								key={b.id}
								style={{
									flex: `${b.totalAmount} 1 0%`,
									backgroundColor: b.barColor,
								}}
								className="h-full transition-all duration-300 relative group cursor-pointer hover:opacity-90"
								onClick={() => setActiveBucketId(b.id)}
								title={`${b.label}: ₹${formatIndianCurrency(b.totalAmount)} (${b.percentage}%)`}
							/>
						);
					})}
				</div>
			</div>

			{/* 5 Interactive Aging Bucket Cards */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
				{buckets.map((b) => {
					const isSelected = activeBucketId === b.id;
					return (
						<button
							key={b.id}
							type="button"
							onClick={() => setActiveBucketId(isSelected ? 'all' : b.id)}
							className={`p-3.5 rounded-2xl text-left transition-all border cursor-pointer select-none relative flex flex-col justify-between ${
								isSelected
									? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-900 border-transparent'
									: 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-800 shadow-2xs hover:shadow-xs'
							}`}
						>
							<div>
								<div className="flex items-center justify-between gap-1 mb-2">
									<span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md ${
										isSelected ? 'bg-white/20 text-white' : b.badgeClass
									}`}>
										{b.label}
									</span>
									<span className={`w-2 h-2 rounded-full ${b.pillBg}`}></span>
								</div>

								<div className={`text-base font-extrabold tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
									₹ {formatIndianCurrency(b.totalAmount)}
								</div>
							</div>

							<div className="mt-3 pt-2.5 border-t border-slate-100/20 flex items-center justify-between text-[11px]">
								<span className={isSelected ? 'text-white/80' : 'text-slate-500'}>
									{b.installmentCount} {b.installmentCount === 1 ? 'EMI' : 'EMIs'} • {b.loanCount} {b.loanCount === 1 ? 'Loan' : 'Loans'}
								</span>
								<span className={`font-mono font-bold ${isSelected ? 'text-rose-300' : 'text-rose-600'}`}>
									{b.percentage}%
								</span>
							</div>
						</button>
					);
				})}
			</div>

			{/* Filter & Search Bar */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
				<div className="flex items-center gap-2 flex-wrap">
					{/* All Bucket Reset Pill */}
					<button
						type="button"
						onClick={() => setActiveBucketId('all')}
						className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
							activeBucketId === 'all'
								? 'bg-primary text-white shadow-xs'
								: 'bg-slate-100 hover:bg-slate-200 text-slate-700'
						}`}
					>
						All Aging Tiers ({totalOverdueCount})
					</button>

					{activeBucketId !== 'all' && (
						<span className="text-xs font-semibold text-slate-500">
							Filtering: <strong className="text-slate-800">{buckets.find((b) => b.id === activeBucketId)?.label}</strong>
						</span>
					)}
				</div>

				<div className="flex items-center gap-2.5 flex-1 max-w-md justify-end">
					{/* Search Bar */}
					<div className="relative flex-1 min-w-[180px]">
						<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
							search
						</span>
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search borrower, loan ID, cheque..."
							className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
						/>
						{searchTerm && (
							<button
								type="button"
								onClick={() => setSearchTerm('')}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[15px]">close</span>
							</button>
						)}
					</div>

					{/* Sort Dropdown */}
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value)}
						className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-2xs"
					>
						<option value="dpd_desc">Highest DPD</option>
						<option value="amount_desc">Highest Amount</option>
						<option value="date_asc">Earliest Due Date</option>
					</select>
				</div>
			</div>

			{/* Detailed Overdue Table */}
			<div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white max-h-[380px] overflow-y-auto custom-scrollbar">
				{displayedInstallments.length === 0 ? (
					<div className="text-center py-10 px-4 text-slate-500 text-xs">
						<span className="material-symbols-outlined text-slate-300 text-[32px] mb-2 block">
							search_off
						</span>
						No overdue installments match the current filters.
					</div>
				) : (
					<table className="w-full text-left border-collapse text-xs">
						<thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 font-bold text-slate-600">
							<tr>
								<th className="py-2.5 px-3.5 whitespace-nowrap">#</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap">Account</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap">Loan ID</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap">EMI No</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap">Scheduled Date</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap">Delinquency (DPD)</th>
								<th className="py-2.5 px-3.5 text-right whitespace-nowrap">Overdue Amount</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 font-medium text-slate-700">
							{displayedInstallments.map((item, idx) => {
								let dpdBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
								if (item.dpd > 90) {
									dpdBadgeClass = 'bg-red-100 text-red-950 border-red-300 font-extrabold';
								} else if (item.dpd > 60) {
									dpdBadgeClass = 'bg-red-50 text-red-800 border-red-200 font-bold';
								} else if (item.dpd > 30) {
									dpdBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
								} else if (item.dpd > 15) {
									dpdBadgeClass = 'bg-orange-50 text-orange-800 border-orange-200';
								}

								return (
									<tr
										key={item.id}
										className="hover:bg-slate-50/80 transition-colors group"
									>
										{/* S.No */}
										<td className="py-2.5 px-3.5 text-slate-400 font-mono text-[11px]">
											{idx + 1}
										</td>

										{/* Borrower */}
										<td className="py-2.5 px-3.5">
											<div className="min-w-0">
												<span className="font-bold text-slate-900 block truncate group-hover:text-primary transition-colors">
													{item.clientName}
												</span>
												<span className="text-[10px] text-slate-400 block truncate">
													{item.primaryAccount}
												</span>
											</div>
										</td>

										{/* Loan ID */}
										<td className="py-2.5 px-3.5 whitespace-nowrap">
											<button
												type="button"
												onClick={() => onSelectLoan && onSelectLoan(item.loan)}
												className="font-mono text-[11px] font-bold text-primary hover:underline cursor-pointer"
												title="Open quick details"
											>
												{item.loanId}
											</button>
										</td>

										{/* Installment No */}
										<td className="py-2.5 px-3.5 text-center whitespace-nowrap">
											<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 ring-1 ring-slate-200">
												EMI #{item.installmentNo}
											</span>
										</td>

										{/* Due Date */}
										<td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-mono">
											{item.dueDate || '—'}
										</td>

										{/* DPD Pill Badge */}
										<td className="py-2.5 px-3.5 text-center whitespace-nowrap">
											<span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border shadow-2xs ${dpdBadgeClass}`}>
												<span>{item.dpd} {item.dpd === 1 ? 'Day' : 'Days'}</span>
											</span>
										</td>

										{/* Amount */}
										<td className="py-2.5 px-3.5 text-right whitespace-nowrap font-bold text-rose-700">
											₹ {formatIndianCurrency(item.amount)}
										</td>

										{/* Action */}
										<td className="py-2.5 px-3.5 text-center whitespace-nowrap">
											<button
												type="button"
												onClick={() => {
													if (onOpenLoanDetails) {
														onOpenLoanDetails(item.loan);
													} else if (onSelectLoan) {
														onSelectLoan(item.loan);
													}
												}}
												className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1"
												title="Open in Servicing"
											>
												<span>Inspect</span>
												<span className="material-symbols-outlined" style={{fontSize: "13px"}}>arrow_forward</span>
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
