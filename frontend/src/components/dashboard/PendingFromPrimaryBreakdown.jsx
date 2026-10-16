/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Secondary perspective widget displaying amounts pending remittance from primary accounts, partner breakdown, and loan counts.
*/

import React from 'react';
import { formatCompactCurrency, formatIndianCurrency } from '../../utils/jointLoanUtils';
import { getColorToken } from '../Settings';

export default function PendingFromPrimaryBreakdown({
	metrics,
	totalLoans = 0,
	onSelectLoan,
	onOpenLoanDetails,
	allLoans = [],
}) {
	const {
		pendingFromPrimary = 0,
		pendingPayoutCount = 0,
		pendingByPrimaryAccount = [],
	} = metrics || {};

	// Helper to find loan object and redirect to joint loan details page
	const handleInspectFacility = (facilityId) => {
		const found = allLoans.find(
			(l) =>
				l.id === facilityId ||
				l.loan_ref_id === facilityId ||
				String(l.db_id) === String(facilityId) ||
				String(l.id) === String(facilityId)
		);
		const targetLoan = found || { id: facilityId, loan_ref_id: facilityId };

		if (onOpenLoanDetails) {
			onOpenLoanDetails(targetLoan);
		} else if (onSelectLoan) {
			onSelectLoan(targetLoan);
		} else {
			const ref = targetLoan.loan_ref_id || targetLoan.id || facilityId;
			window.location.href = `/joint-loan/${encodeURIComponent(ref)}`;
		}
	};

	if (totalLoans === 0) {
		return (
			<div className="bg-white rounded-2xl p-6 ring-1 ring-slate-200/80 shadow-sm font-sans text-center">
				<div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
					<span className="material-symbols-outlined text-[24px]">account_balance</span>
				</div>
				<h4 className="font-extrabold text-[15px] text-slate-900">
					No Secondary Facilities Found
				</h4>
				<p className="text-[12.5px] text-slate-500 mt-1 max-w-md mx-auto">
					No active joint loans match your assigned secondary accounts. Once co-lending facilities are booked where you act as secondary partner, pending remittance details will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-2xl p-5 sm:p-6 ring-1 ring-slate-200/80 shadow-sm font-sans transition-all hover:shadow-md">
			{/* Header Strip */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
						<span className="material-symbols-outlined text-[22px]">swap_horiz</span>
					</div>
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-extrabold text-[16px] text-slate-900 tracking-tight">
								Pending Settlements Due from Primary Accounts
							</h3>
							{pendingByPrimaryAccount.length > 0 && (
								<span className="text-[10.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200">
									{pendingByPrimaryAccount.length} {pendingByPrimaryAccount.length === 1 ? 'Partner' : 'Partners'}
								</span>
							)}
						</div>
						<p className="text-[12px] text-slate-500 mt-0.5">
							Primary partners that collected borrower installments but have not yet transferred your secondary share
						</p>
					</div>
				</div>

				{/* Total Pending Summary Pill */}
				<div className="flex items-center gap-3 self-start sm:self-auto shrink-0 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
					<div className="text-right">
						<div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
							Total Pending
						</div>
						<div className="font-extrabold text-[14px] text-amber-950 font-mono">
							{formatIndianCurrency(pendingFromPrimary)}
						</div>
					</div>
					<div className="h-6 w-px bg-slate-200" />
					<div>
						<div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
							EMIs Awaiting
						</div>
						<div className="font-extrabold text-[14px] text-slate-900 font-mono">
							{pendingPayoutCount} {pendingPayoutCount === 1 ? 'Due' : 'Dues'}
						</div>
					</div>
				</div>
			</div>

			{/* Partners Breakdown Cards Grid */}
			{pendingByPrimaryAccount.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
					{pendingByPrimaryAccount.map((partner) => {
						const colorToken = getColorToken(partner.color || 'blue');
						const dotClass = colorToken?.dot || 'bg-blue-500';

						return (
							<div
								key={partner.primaryName}
								className="bg-slate-50/60 hover:bg-slate-50 rounded-xl p-4 border border-slate-200/80 hover:border-amber-300 transition-all flex flex-col justify-between group shadow-2xs"
							>
								{/* Card Top: Primary Partner Title & Badges */}
								<div>
									<div className="flex items-start justify-between gap-2">
										<div className="flex items-center gap-2 min-w-0">
											<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
											<h4 className="font-extrabold text-[13.5px] text-slate-900 truncate">
												{partner.primaryName}
											</h4>
											{partner.primaryTag && partner.primaryTag !== partner.primaryName && (
												<span className="text-[10.5px] font-extrabold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0">
													{partner.primaryTag}
												</span>
											)}
										</div>
										<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200 shrink-0 shadow-2xs">
											{partner.loansCount} {partner.loansCount === 1 ? 'Loan' : 'Loans'}
										</span>
									</div>

									{/* Card Middle: Amount & Pending EMIs */}
									<div className="mt-3 bg-white rounded-lg p-3 border border-slate-200/60">
										<div className="flex items-baseline justify-between">
											<span className="text-[11px] font-medium text-slate-500">
												Pending Transfer
											</span>
											<span className="font-bold text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">
												{partner.pendingEmisCount} {partner.pendingEmisCount === 1 ? 'EMI' : 'EMIs'} Due
											</span>
										</div>
										<div className="font-extrabold text-[20px] text-amber-950 font-mono tracking-tight mt-1">
											{formatIndianCurrency(partner.pendingAmount)}
										</div>
										<div className="text-[10px] text-slate-400 mt-0.5">
											Approx. {formatCompactCurrency(partner.pendingAmount)}
										</div>
									</div>

									{/* Card Bottom: Associated Facilities List */}
									{Array.isArray(partner.loans) && partner.loans.length > 0 && (
										<div className="mt-3 space-y-1.5">
											<div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
												Impacted Facilities
											</div>
											<div className="space-y-1 max-h-36 overflow-y-auto pr-1">
												{partner.loans.map((loanItem) => (
													<button
														key={loanItem.id}
														type="button"
														onClick={() => handleInspectFacility(loanItem.id)}
														className="w-full text-left bg-white hover:bg-amber-50/50 p-2 rounded-lg border border-slate-200/60 hover:border-amber-300 transition-colors flex items-center justify-between gap-2 cursor-pointer group/item"
														title={`Click to open Joint Loan details for ${loanItem.clientName}`}
													>
														<div className="min-w-0">
															<div className="font-bold text-[11.5px] text-slate-800 truncate group-hover/item:text-primary flex items-center gap-1">
																<span className="truncate">{loanItem.clientName}</span>
																<span className="material-symbols-outlined text-[13px] text-slate-400 group-hover/item:text-primary shrink-0 transition-transform group-hover/item:translate-x-0.5">
																	open_in_new
																</span>
															</div>
															<div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
																<span>{loanItem.id}</span>
																<span>•</span>
																<span>{loanItem.secShare}% Share</span>
															</div>
														</div>
														<div className="text-right shrink-0">
															<div className="font-mono font-bold text-[11.5px] text-amber-900">
																{formatIndianCurrency(loanItem.pendingAmount)}
															</div>
															<div className="text-[9.5px] text-slate-400">
																{loanItem.emisCount} {loanItem.emisCount === 1 ? 'EMI' : 'EMIs'}
															</div>
														</div>
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200/80 flex items-center gap-3.5 mt-4">
					<div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
						<span className="material-symbols-outlined text-[20px]">check_circle</span>
					</div>
					<div>
						<h4 className="font-extrabold text-[13.5px] text-emerald-950">
							All Collected EMIs Are Fully Settled
						</h4>
						<p className="text-[12px] text-emerald-800 mt-0.5">
							Primary partners have transferred all collected borrower installments for your secondary facilities. Zero settlement payouts are currently pending from primary accounts.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
