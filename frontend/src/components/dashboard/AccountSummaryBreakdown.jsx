/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Account-level financial summary table and cards displaying total principal, collections, outstanding balance, and status breakdown per account.
*/

import React, { useMemo } from 'react';
import {
	calculatePerAccountFinancials,
	formatCompactCurrency,
	formatIndianCurrency,
	cleanAccountKey,
	getAccountAliases,
} from '../../utils/jointLoanUtils';

export default function AccountSummaryBreakdown({
	loans = [],
	rawAccounts = [],
	selectedAccount = 'ALL',
	onSelectAccount,
	isAdmin = false,
	allowedPrimaryKeys = [],
	roleFilter = 'primary',
}) {
	const isSecondary = roleFilter === 'secondary';

	const accountSummaries = useMemo(() => {
		let summaries = calculatePerAccountFinancials(loans, rawAccounts);
		if (!isAdmin && Array.isArray(allowedPrimaryKeys) && allowedPrimaryKeys.length > 0) {
			const cleanAllowed = allowedPrimaryKeys.map(cleanAccountKey);
			summaries = summaries.filter((acc) => {
				const cName = cleanAccountKey(acc.accountName);
				const cKey = cleanAccountKey(acc.accountKey);
				const cAcr = cleanAccountKey(acc.acronym);
				return cleanAllowed.some((k) => {
					if (k === cName || k === cKey || k === cAcr) return true;
					return getAccountAliases(k, rawAccounts).some((al) => {
						const cAl = cleanAccountKey(al);
						return cAl === cName || cAl === cKey || cAl === cAcr;
					});
				});
			});
		}
		return [...summaries].sort((a, b) =>
			(a.accountName || '').localeCompare(b.accountName || '', undefined, { sensitivity: 'base', numeric: true })
		);
	}, [loans, rawAccounts, isAdmin, allowedPrimaryKeys]);

	if (accountSummaries.length === 0) {
		return null;
	}

	return (
		<div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/80 font-sans transition-all duration-300 hover:shadow-md flex flex-col max-h-[500px]">
			{/* Header Strip */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 shrink-0">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
						<span className="material-symbols-outlined text-[22px]">account_balance</span>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
								{isSecondary ? 'Secondary Account Financial Position & Exposure' : 'Account Financial Position & Exposure'}
							</h3>
							<span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
								{accountSummaries.length} Accounts
							</span>
						</div>
						<p className="text-[12px] text-slate-500 mt-0.5">
							{isSecondary
								? 'Secondary capital allocation, payouts settled, and outstanding balance summary by partner account'
								: 'Principal allocation, collections, and outstanding balance summary by partner account'}
						</p>
					</div>
				</div>

				{selectedAccount !== 'ALL' && (
					<button
						type="button"
						onClick={() => onSelectAccount && onSelectAccount('ALL')}
						className="text-[11.5px] font-bold text-primary hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
					>
						<span>Clear Filter ({selectedAccount})</span>
						<span className="material-symbols-outlined text-[14px]">close</span>
					</button>
				)}
			</div>

			{/* Responsive Table of Account Summaries */}
			<div className="overflow-x-auto overflow-y-auto mt-3 flex-1">
				<table className="w-full text-left text-xs">
					<thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-2xs">
						<tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
							<th className="py-2.5 px-3">Account Name</th>
							<th className="py-2.5 px-3 text-center">Facilities</th>
							<th className="py-2.5 px-3 text-right">Total Principal</th>
							<th className="py-2.5 px-3 text-right">Total Collected</th>
							<th className="py-2.5 px-3 text-right">Outstanding Balance</th>
							<th className="py-2.5 px-3 text-center">Recovery</th>
							<th className="py-2.5 px-3 text-center">Status Breakdown</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 font-medium">
						{accountSummaries.map((acc) => {
							const isSelected = selectedAccount === acc.accountKey;

							return (
								<tr
									key={acc.accountKey}
									className={`transition-colors ${
										isSelected
											? 'bg-primary/5 hover:bg-primary/10'
											: 'hover:bg-slate-50/80'
									}`}
								>
									{/* Account Name */}
									<td className="py-3 px-3">
										<div className="flex items-center gap-2.5">
											<div className="min-w-0">
												<div className="font-extrabold text-[13px] text-slate-900 truncate">
													{acc.accountName}
												</div>
											</div>
										</div>
									</td>

									{/* Total Facilities Count */}
									<td className="py-3 px-3 text-center">
										<span className="font-mono font-bold text-slate-800 text-[12px] bg-slate-100 px-2 py-0.5 rounded-md">
											{acc.totalLoansCount}
										</span>
									</td>

									{/* Total Principal */}
									<td className="py-3 px-3 text-right">
										<div className="font-mono font-bold text-slate-900 text-[12.5px]">
											{formatCompactCurrency(acc.totalPrincipal)}
										</div>
										<span className="text-[10px] text-slate-400 font-mono">
											{formatIndianCurrency(acc.totalPrincipal)}
										</span>
									</td>

									{/* Total Collected */}
									<td className="py-3 px-3 text-right">
										<div className="font-mono font-bold text-emerald-700 text-[12.5px]">
											{formatCompactCurrency(acc.totalCollected)}
										</div>
										<span className="text-[10px] text-emerald-600 font-mono">
											{formatIndianCurrency(acc.totalCollected)}
										</span>
									</td>

									{/* Total Balance */}
									<td className="py-3 px-3 text-right">
										<div className="font-mono font-bold text-blue-700 text-[12.5px]">
											{formatCompactCurrency(acc.totalBalance)}
										</div>
										<span className="text-[10px] text-blue-500 font-mono">
											{formatIndianCurrency(acc.totalBalance)}
										</span>
									</td>

									{/* Recovery Rate */}
									<td className="py-3 px-3 text-center">
										<span
											className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ring-1 ${
												acc.recoveryRate >= 80
													? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
													: acc.recoveryRate >= 60
													? 'bg-amber-50 text-amber-700 ring-amber-200'
													: 'bg-rose-50 text-rose-700 ring-rose-200'
											}`}
										>
											{acc.recoveryRate}%
										</span>
									</td>

									{/* Status Breakdown Pills */}
									<td className="py-3 px-3 text-center">
										<div className="flex items-center justify-center gap-1.5 text-[10px]">
											{acc.activeCount > 0 && (
												<span
													className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold"
													title={`${acc.activeCount} Active Loans`}
												>
													{acc.activeCount} Act
												</span>
											)}
											{acc.overdueCount > 0 && (
												<span
													className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold"
													title={`${acc.overdueCount} Overdue Loans`}
												>
													{acc.overdueCount} Ovd
												</span>
											)}
											{acc.pendingCount > 0 && (
												<span
													className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold"
													title={`${acc.pendingCount} Pending Loans`}
												>
													{acc.pendingCount} Pnd
												</span>
											)}
											{acc.closedCount > 0 && (
												<span
													className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold"
													title={`${acc.closedCount} Closed Loans`}
												>
													{acc.closedCount} Cls
												</span>
											)}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
