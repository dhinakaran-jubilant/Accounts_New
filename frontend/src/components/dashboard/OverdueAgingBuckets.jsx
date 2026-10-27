/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Overdue Aging Buckets (Days Past Due - DPD analysis) categorizing delinquent loan installments across 1-15d, 16-30d, 31-60d, 61-90d, and 90+d risk tiers.
*/

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatIndianCurrency, calculateAgingBuckets } from '../../utils/jointLoanUtils';

const SORT_OPTIONS = [
	{
		id: 'dpd_desc',
		label: 'Highest DPD',
		shortLabel: 'Highest DPD',
		description: 'Most delinquent accounts first',
		icon: 'warning',
		iconColor: 'text-rose-500',
	},
	{
		id: 'amount_desc',
		label: 'Highest Overdue',
		shortLabel: 'Highest Overdue',
		description: 'Largest overdue capital first',
		icon: 'payments',
		iconColor: 'text-emerald-600',
	},
	{
		id: 'amount_asc',
		label: 'Lowest Overdue',
		shortLabel: 'Lowest Overdue',
		description: 'Smallest overdue capital first',
		icon: 'arrow_downward',
		iconColor: 'text-slate-500',
	},
	{
		id: 'date_asc',
		label: 'Earliest Due Date',
		shortLabel: 'Earliest Due',
		description: 'Oldest unpaid installments first',
		icon: 'event_busy',
		iconColor: 'text-amber-500',
	},
	{
		id: 'emis_desc',
		label: 'Most Overdue EMIs',
		shortLabel: 'Most EMIs',
		description: 'Highest count of overdue EMIs',
		icon: 'format_list_numbered',
		iconColor: 'text-indigo-500',
	},
	{
		id: 'name_asc',
		label: 'Client Name (A–Z)',
		shortLabel: 'Client (A–Z)',
		description: 'Alphabetical borrower order',
		icon: 'sort_by_alpha',
		iconColor: 'text-sky-500',
	},
];

const getDpdBadgeClass = (dpd) => {
	if (dpd > 90) return 'bg-red-100 text-red-950 border-red-300 font-extrabold';
	if (dpd > 60) return 'bg-red-50 text-red-800 border-red-200 font-bold';
	if (dpd > 30) return 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
	if (dpd > 15) return 'bg-orange-50 text-orange-800 border-orange-200 font-semibold';
	return 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
};

export default function OverdueAgingBuckets({
	loans = [],
	onSelectLoan,
	onOpenLoanDetails,
	accountRoleFilter = 'primary',
}) {
	// Active bucket filter: 'all' | '1_15' | '16_30' | '31_60' | '61_90' | '90_plus'
	const [activeBucketId, setActiveBucketId] = useState('all');
	const [searchTerm, setSearchTerm] = useState('');
	const [sortBy, setSortBy] = useState('dpd_desc');
	const [isSortOpen, setIsSortOpen] = useState(false);
	const sortDropdownRef = useRef(null);
	const [expandedClientNames, setExpandedClientNames] = useState(() => new Set());

	// Close sort dropdown on click outside or Escape
	useEffect(() => {
		if (!isSortOpen) return;
		const handleClickOutside = (e) => {
			if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
				setIsSortOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsSortOpen(false);
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isSortOpen]);

	const currentSortObj = useMemo(() => {
		return SORT_OPTIONS.find((s) => s.id === sortBy) || SORT_OPTIONS[0];
	}, [sortBy]);

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

		// Sort individual installments
		list.sort((a, b) => {
			if (sortBy === 'dpd_desc') return b.dpd - a.dpd;
			if (sortBy === 'dpd_asc') return a.dpd - b.dpd;
			if (sortBy === 'amount_desc') return b.amount - a.amount;
			if (sortBy === 'amount_asc') return a.amount - b.amount;
			if (sortBy === 'date_asc') return (a.instDate?.getTime() || 0) - (b.instDate?.getTime() || 0);
			return 0;
		});

		return list;
	}, [buckets, activeBucketId, searchTerm, sortBy]);

	// Group installments by Client Name for client-based drilldown
	const groupedClients = useMemo(() => {
		const groups = new Map();

		displayedInstallments.forEach((item) => {
			const cName = item.clientName || 'Unknown Borrower';
			if (!groups.has(cName)) {
				groups.set(cName, {
					clientName: cName,
					installments: [],
					totalAmount: 0,
					loanIds: new Set(),
					loans: new Map(),
					primaryAccounts: new Set(),
					maxDpd: 0,
					minDpd: Infinity,
					earliestDueDate: null,
				});
			}

			const group = groups.get(cName);
			group.installments.push(item);
			group.totalAmount += item.amount;
			if (item.loanId) group.loanIds.add(item.loanId);
			if (item.loan && item.loanId && !group.loans.has(item.loanId)) {
				group.loans.set(item.loanId, item.loan);
			}
			if (item.primaryAccount) group.primaryAccounts.add(item.primaryAccount);
			if (item.dpd > group.maxDpd) group.maxDpd = item.dpd;
			if (item.dpd < group.minDpd) group.minDpd = item.dpd;
			if (item.instDate) {
				if (!group.earliestDueDate || item.instDate < group.earliestDueDate) {
					group.earliestDueDate = item.instDate;
				}
			}
		});

		const list = Array.from(groups.values()).map((g) => ({
			...g,
			loanIdsList: Array.from(g.loanIds),
			loansList: Array.from(g.loans.values()),
			primaryAccountsList: Array.from(g.primaryAccounts),
			firstLoan: g.loans.values().next().value || null,
		}));

		// Sort client groups according to sortBy
		list.sort((a, b) => {
			if (sortBy === 'dpd_desc') return b.maxDpd - a.maxDpd;
			if (sortBy === 'dpd_asc') return a.maxDpd - b.maxDpd;
			if (sortBy === 'amount_desc') return b.totalAmount - a.totalAmount;
			if (sortBy === 'amount_asc') return a.totalAmount - b.totalAmount;
			if (sortBy === 'emis_desc') return b.installments.length - a.installments.length;
			if (sortBy === 'date_asc') {
				const timeA = a.earliestDueDate ? a.earliestDueDate.getTime() : Infinity;
				const timeB = b.earliestDueDate ? b.earliestDueDate.getTime() : Infinity;
				return timeA - timeB;
			}
			return a.clientName.localeCompare(b.clientName);
		});

		return list;
	}, [displayedInstallments, sortBy]);

	const toggleClient = (clientName) => {
		setExpandedClientNames((prev) => {
			const next = new Set(prev);
			if (next.has(clientName)) {
				next.delete(clientName);
			} else {
				next.add(clientName);
			}
			return next;
		});
	};

	const allExpanded = groupedClients.length > 0 && expandedClientNames.size === groupedClients.length;
	const handleToggleAll = () => {
		if (allExpanded) {
			setExpandedClientNames(new Set());
		} else {
			setExpandedClientNames(new Set(groupedClients.map((g) => g.clientName)));
		}
	};

	// Auto-expand matching clients when search query is typed
	useEffect(() => {
		if (searchTerm.trim() && groupedClients.length > 0) {
			setExpandedClientNames(new Set(groupedClients.map((g) => g.clientName)));
		}
	}, [searchTerm, groupedClients]);

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
									? 'bg-slate-100 text-slate-800 shadow-md ring-1 ring-slate-300 border-transparent'
									: 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-800 shadow-2xs hover:shadow-xs'
							}`}
						>
							<div>
								<div className="flex items-center justify-between gap-1 mb-2">
									<span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md ${
										isSelected ? 'bg-slate-300 text-slate-800' : b.badgeClass
									}`}>
										{b.label}
									</span>
									<span className={`w-2 h-2 rounded-full ${b.pillBg}`}></span>
								</div>

								<div className={`text-base font-extrabold tracking-tight text-slate-900'}`}>
									₹ {formatIndianCurrency(b.totalAmount)}
								</div>
							</div>

							<div className="mt-3 pt-2.5 border-t border-slate-100/20 flex items-center justify-between text-[12px]">
								<span className='text-slate-500'>
									{b.installmentCount} {b.installmentCount === 1 ? 'EMI' : 'EMIs'} • {b.loanCount} {b.loanCount === 1 ? 'Loan' : 'Loans'}
								</span>
								<span className={`font-mono font-bold text-rose-600`}>
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
						className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
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
							className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
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

					{/* Modern Sort Dropdown */}
					<div ref={sortDropdownRef} className="relative inline-block text-left font-sans">
						<button
							type="button"
							onClick={() => setIsSortOpen((prev) => !prev)}
							className={`h-8 sm:h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border text-[12px] font-bold transition-all cursor-pointer select-none shadow-2xs ${
								isSortOpen
									? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
									: 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900'
							}`}
							aria-haspopup="listbox"
							aria-expanded={isSortOpen}
							title="Sort overdue aging table"
						>
							<span className={`material-symbols-outlined text-[17px] ${currentSortObj.iconColor}`}>
								{currentSortObj.icon}
							</span>
							<span className="text-slate-700 whitespace-nowrap">
								{currentSortObj.shortLabel}
							</span>
							<span
								className={`material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200 ${
									isSortOpen ? 'rotate-180 text-primary' : ''
								}`}
							>
								expand_more
							</span>
						</button>

						{/* Modern Dropdown Popover */}
						{isSortOpen && (
							<div
								role="listbox"
								className="absolute right-0 top-full mt-1.5 z-50 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl ring-1 ring-slate-900/10 p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 font-sans"
							>

								{/* Options List */}
								<div className="flex flex-col gap-0.5">
									{SORT_OPTIONS.map((opt) => {
										const isSelected = sortBy === opt.id;
										return (
											<button
												key={opt.id}
												type="button"
												onClick={() => {
													setSortBy(opt.id);
													setIsSortOpen(false);
												}}
												className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer select-none group ${
													isSelected
														? 'bg-primary/10 text-primary font-bold shadow-2xs'
														: 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
												}`}
											>
												<div className="flex items-center gap-2.5 min-w-0">
													<div
														className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
															isSelected
																? 'bg-primary text-white shadow-2xs'
																: 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-700'
														}`}
													>
														<span className="material-symbols-outlined text-[16px]">
															{opt.icon}
														</span>
													</div>
													<div className="min-w-0">
														<div
															className={`text-[12px] truncate ${
																isSelected ? 'font-extrabold text-primary' : 'font-semibold text-slate-800'
															}`}
														>
															{opt.label}
														</div>
														<div className="text-[10px] text-slate-400 truncate">
															{opt.description}
														</div>
													</div>
												</div>

												{isSelected && (
													<span className="material-symbols-outlined text-primary text-[18px] shrink-0 ml-2">
														check
													</span>
												)}
											</button>
										);
									})}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Client-Based Detailed Overdue Table */}
			<div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white max-h-[460px] overflow-y-auto custom-scrollbar">
				{groupedClients.length === 0 ? (
					<div className="text-center py-10 px-4 text-slate-500 text-xs">
						<span className="material-symbols-outlined text-slate-300 text-[32px] mb-2 block">
							search_off
						</span>
						No overdue borrowers or installments match the current filters.
					</div>
				) : (
					<table className="w-full text-left border-collapse text-xs">
						<thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 font-bold text-slate-600 shadow-2xs">
							<tr>
								<th className="py-2.5 px-3.5 w-12 text-center whitespace-nowrap">#</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap min-w-[200px]">Client Name</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap w-28">Account</th>
								<th className="py-2.5 px-3.5 whitespace-nowrap w-32">Loan ID</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap w-32">Overdue EMIs</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap w-32">Delinquency</th>
								<th className="py-2.5 px-3.5 text-right whitespace-nowrap w-36">Total Overdue</th>
								<th className="py-2.5 px-3.5 text-center whitespace-nowrap w-24">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 font-medium text-slate-700">
							{groupedClients.map((clientGroup, cIdx) => {
								const isExpanded = expandedClientNames.has(clientGroup.clientName);

								return (
									<React.Fragment key={clientGroup.clientName}>
										{/* Client Group Row */}
										<tr
											onClick={() => toggleClient(clientGroup.clientName)}
											className={`cursor-pointer transition-colors group select-none ${
												isExpanded
													? 'bg-amber-50/30 hover:bg-amber-50/50'
													: 'hover:bg-slate-50/80'
											}`}
											title="Click to view respective client overdue EMIs"
										>
											{/* S.No + Expand Chevron */}
											<td className="py-3 px-3.5 text-center whitespace-nowrap w-12">
												<div className="flex items-center justify-center gap-1">
													<span className="text-slate-400 font-mono text-[11px] w-4 text-right">
														{cIdx + 1}
													</span>
													<span
														className={`material-symbols-outlined transition-transform duration-200 ${
															isExpanded ? 'rotate-90 text-primary' : 'text-slate-400 group-hover:text-slate-600'
														}`}
													style={{fontSize: "16px"}}>
														chevron_right
													</span>
												</div>
											</td>

											{/* Client Name */}
											<td className="py-3 px-3.5 min-w-[200px]">
												<div className="flex items-center gap-2">
													<span className="font-extrabold text-[13px] text-slate-900 group-hover:text-primary transition-colors">
														{clientGroup.clientName}
													</span>
												</div>
											</td>

											{/* Account(s) */}
											<td className="py-3 px-3.5 whitespace-nowrap w-28">
												<div className="flex flex-wrap items-center gap-1">
													{clientGroup.primaryAccountsList.map((acc, aIdx) => (
														<span
															key={aIdx}
															className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
														>
															{acc}
														</span>
													))}
												</div>
											</td>

											{/* Loan ID(s) */}
											<td className="py-3 px-3.5 whitespace-nowrap w-32">
												<div className="flex flex-wrap items-center gap-1.5">
													{clientGroup.loanIdsList.map((lid, lIdx) => (
														<button
															key={lIdx}
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																const targetLoan = clientGroup.loans.get(lid) || clientGroup.firstLoan;
																if (targetLoan) {
																	if (onOpenLoanDetails) onOpenLoanDetails(targetLoan);
																	else if (onSelectLoan) onSelectLoan(targetLoan);
																}
															}}
															className="font-mono text-[11px] font-bold text-primary hover:underline cursor-pointer"
															title={`Open loan ${lid}`}
														>
															{lid}
														</button>
													))}
												</div>
											</td>

											{/* Overdue EMIs count */}
											<td className="py-3 px-3.5 text-center whitespace-nowrap w-32">
												<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 ring-1 ring-rose-200">
													<span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
													{clientGroup.installments.length} {clientGroup.installments.length === 1 ? 'EMI' : 'EMIs'}
												</span>
											</td>

											{/* Delinquency */}
											<td className="py-3 px-3.5 text-center whitespace-nowrap w-32">
												<span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border shadow-2xs ${getDpdBadgeClass(clientGroup.maxDpd)}`}>
													<span>{clientGroup.maxDpd} {clientGroup.maxDpd === 1 ? 'Day' : 'Days'}</span>
												</span>
											</td>

											{/* Total Overdue Amount */}
											<td className="py-3 px-3.5 text-right whitespace-nowrap font-extrabold text-[13px] text-rose-700 font-mono w-36">
												₹ {formatIndianCurrency(clientGroup.totalAmount)}
											</td>

											{/* Action Toggle */}
											<td className="py-3 px-3.5 text-center whitespace-nowrap w-24">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														toggleClient(clientGroup.clientName);
													}}
													className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
														isExpanded
															? 'bg-primary text-white shadow-xs'
															: 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
													}`}
												>
													<span>{isExpanded ? 'Hide' : 'EMIs'}</span>
													<span className="material-symbols-outlined text-[14px]">
														{isExpanded ? 'expand_less' : 'expand_more'}
													</span>
												</button>
											</td>
										</tr>

										{/* Respected Client's Overdue EMIs Sub-Table (Expanded View) */}
										{isExpanded && (
											<tr className="bg-slate-50/80">
												<td colSpan={8} className="py-2.5 px-3 sm:px-6 border-b border-slate-200">
													<div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">

														{/* Respective Client's Overdue EMIs Table */}
														<div className="overflow-x-auto max-h-[240px] overflow-y-auto custom-scrollbar">
															<table className="w-full text-left border-collapse text-[11px]">
																<thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 font-bold text-slate-600 shadow-2xs">
																	<tr>
																		<th className="py-2 px-3 text-center w-12 whitespace-nowrap">#</th>
																		<th className="py-2 px-3 text-center whitespace-nowrap w-28">EMI No</th>
																		<th className="py-2 px-3 text-center whitespace-nowrap w-36">EMI Date</th>
																		<th className="py-2 px-3 text-center whitespace-nowrap w-36">Delinquency</th>
																		<th className="py-2 px-3 text-right whitespace-nowrap w-32">Overdue Amount</th>
																		<th className="py-2 px-3 text-center whitespace-nowrap w-28">Action</th>
																	</tr>
																</thead>
																<tbody className="divide-y divide-slate-100 font-medium text-slate-700">
																	{clientGroup.installments.map((inst, iIdx) => (
																		<tr
																			key={inst.id}
																			className="hover:bg-amber-50/40 transition-colors"
																		>
																			{/* S.No */}
																			<td className="py-2 px-3 text-center text-slate-400 font-mono text-[10px] w-12">
																				{iIdx + 1}
																			</td>

																			{/* Installment No */}
																			<td className="py-2 px-3 text-center whitespace-nowrap w-28">
																				<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 ring-1 ring-slate-200">
																					EMI #{inst.installmentNo}
																				</span>
																			</td>

																			{/* EMI Date (amber badge) */}
																			<td className="py-2 px-3 text-center whitespace-nowrap text-slate-600 w-36">
																				<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-slate-700 ring-1 ring-amber-200 font-mono">
																					{inst.dueDate || '—'}
																				</span>
																			</td>

																			{/* Delinquency */}
																			<td className="py-2 px-3 text-center whitespace-nowrap w-36">
																				<span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border shadow-2xs ${getDpdBadgeClass(inst.dpd)}`}>
																					<span>{inst.dpd} {inst.dpd === 1 ? 'Day' : 'Days'}</span>
																				</span>
																			</td>

																			{/* Overdue Amount */}
																			<td className="py-2 px-3 text-right whitespace-nowrap font-bold text-[12px] text-rose-700 font-mono pr-6">
																				₹ {formatIndianCurrency(inst.amount)}
																			</td>

																			{/* Action */}
																			<td className="py-2 px-3 text-center whitespace-nowrap w-28">
																				<button
																					type="button"
																					onClick={() => {
																						if (onOpenLoanDetails) {
																							onOpenLoanDetails(inst.loan);
																						} else if (onSelectLoan) {
																							onSelectLoan(inst.loan);
																						}
																					}}
																					className="px-2.5 py-1 rounded-md text-[12px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1"
																					title="Open in Servicing"
																				>
																					<span>Inspect</span>
																					<span className="material-symbols-outlined" style={{fontSize: "16px"}}>arrow_forward</span>
																				</button>
																			</td>
																		</tr>
																	))}
																</tbody>
															</table>
														</div>
													</div>
												</td>
											</tr>
										)}
									</React.Fragment>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
