/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Quick-view modal dialog displaying detailed joint loan facility metrics and schedule breakdowns.
*/

import React from 'react';
import { formatIndianCurrency } from '../../utils/jointLoanUtils';
import { getStatusBadge, getPrimaryTagColor } from '../JointLoan';

export default function JointLoanDetailsModal({ loan, onClose, onOpenInServicing }) {
	if (!loan) return null;

	const badge = getStatusBadge(loan.status);
	const primaryTag = loan.primary || 'SS';
	const primaryTagClass = getPrimaryTagColor(primaryTag);
	const primaryName = loan.primaryAccountName || 'Primary Partner';
	const primaryShare = loan.primaryShare ?? 70;
	const clientName = loan.client_account_name || 'Client';

	const secAccounts = loan.accountDetails
		? loan.accountDetails.filter((a) => !a.isPrimary)
		: loan.secondaryAccounts || [];

	const schedule = loan.repaymentSchedule || [];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
			<div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl ring-1 ring-slate-200 max-h-[90vh] overflow-y-auto">
				{/* Top Bar */}
				<div className="flex items-start justify-between pb-4 border-b border-slate-100">
					<div>
						<div className="flex items-center gap-2 mb-2">
							<span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full ring-1 ${badge.color}`}>
								<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
								<span>{loan.status || 'Active'}</span>
							</span>
							<span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
								{loan.id || `JL-${loan.db_id}`}
							</span>
							{loan.category && (
								<span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">
									{loan.category}
								</span>
							)}
						</div>
						<h3 className="text-[22px] font-extrabold text-slate-900 tracking-tight">
							{clientName}
						</h3>
						{(loan.address || loan.contact) && (
							<p className="text-[12px] text-slate-500 mt-0.5">
								{loan.address} {loan.contact ? `• ${loan.contact}` : ''}
							</p>
						)}
					</div>

					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
					>
						<span className="material-symbols-outlined text-[20px]">close</span>
					</button>
				</div>

				{/* Financial Highlight Grid */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
					<div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Facility</span>
						<div className="text-[18px] font-extrabold text-slate-900 mt-1">
							{formatIndianCurrency(loan.amount)}
						</div>
						<div className="text-[11px] text-slate-500">{loan.tenure || '10 Mo'}</div>
					</div>
					<div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Fixed Rate</span>
						<div className="text-[18px] font-extrabold text-primary mt-1">
							{loan.interest_rate || loan.interestRate || (loan.rate && loan.rate !== '7.2% Fixed' ? loan.rate : '-')}
						</div>
						<div className="text-[11px] text-slate-500">Tier 1 Rating</div>
					</div>
					<div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Disbursed Date</span>
						<div className="text-[16px] font-bold text-slate-900 mt-1">
							{loan.loan_date || loan.appliedDate || '-'}
						</div>
						<div className="text-[11px] text-slate-500">Initial Issue</div>
					</div>
					<div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Maturity Date</span>
						<div className="text-[16px] font-bold text-slate-900 mt-1">
							{loan.dueDate || '-'}
						</div>
						<div className="text-[11px] text-slate-500">Final Term</div>
					</div>
				</div>

				{/* Co-Lending Capital Distribution */}
				<div className="mb-5 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
					<div className="flex items-center justify-between mb-3">
						<h4 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">
							Co-Lending Capital Breakdown
						</h4>
						<span className="text-[12px] font-bold text-primary">
							Primary: {primaryShare}% • Co-Lenders: {100 - primaryShare}%
						</span>
					</div>

					<div className="space-y-2">
						{/* Primary Account Row */}
						<div className="flex items-center justify-between p-2.5 bg-white rounded-xl shadow-xs border border-slate-100">
							<div className="flex items-center gap-2">
								<span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${primaryTagClass}`}>
									{primaryTag}
								</span>
								<div>
									<div className="font-bold text-[13px] text-slate-800">{primaryName}</div>
									<div className="text-[11px] text-slate-400">Primary Managing Partner</div>
								</div>
							</div>
							<div className="text-right">
								<div className="font-extrabold text-[14px] text-slate-900">
									{formatIndianCurrency(Number(loan.amount) * (primaryShare / 100))}
								</div>
								<div className="text-[11px] text-emerald-600 font-semibold">{primaryShare}% Allocation</div>
							</div>
						</div>

						{/* Secondary Accounts */}
						{secAccounts.map((sec, idx) => {
							const sTag = sec.accountTag || sec.accountName || 'SEC';
							const sName = sec.accountName || `Secondary Account ${idx + 1}`;
							const sShare = sec.share || (100 - primaryShare);
							const sAmt = sec.principal || sec.amount || (Number(loan.amount) * (sShare / 100));

							return (
								<div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-xl shadow-xs border border-slate-100">
									<div className="flex items-center gap-2">
										<span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
											{sTag}
										</span>
										<div>
											<div className="font-bold text-[13px] text-slate-800">{sName}</div>
											<div className="text-[11px] text-slate-400">Secondary Co-Lender</div>
										</div>
									</div>
									<div className="text-right">
										<div className="font-extrabold text-[14px] text-slate-900">
											{formatIndianCurrency(sAmt)}
										</div>
										<div className="text-[11px] text-slate-500 font-semibold">{sShare}% Allocation</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Repayment Schedule Preview */}
				{schedule.length > 0 && (
					<div className="mb-6">
						<div className="flex items-center justify-between mb-2">
							<h4 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">
								Installments Snapshot ({schedule.length} Schedule Items)
							</h4>
							<span className="text-[11px] text-slate-500">Showing first 4 rows</span>
						</div>
						<div className="border border-slate-100 rounded-xl overflow-hidden">
							<table className="w-full text-left text-[12px]">
								<thead className="bg-slate-50 text-[11px] text-slate-500 font-bold uppercase border-b border-slate-100">
									<tr>
										<th className="py-2 px-3">#</th>
										<th className="py-2 px-3">Date</th>
										<th className="py-2 px-3">Amount</th>
										<th className="py-2 px-3">Status</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{schedule.slice(0, 4).map((inst, i) => {
										const st = (inst.status || '').toLowerCase();
										const colorClass =
											st === 'collected' || st === 'settled'
												? 'text-emerald-700 bg-emerald-50'
												: st === 'overdue'
												? 'text-rose-700 bg-rose-50'
												: 'text-slate-700 bg-slate-100';

										return (
											<tr key={i} className="hover:bg-slate-50/50">
												<td className="py-2 px-3 font-semibold text-slate-500">
													Inst. {inst.sNo || inst.installmentNumber || i + 1}
												</td>
												<td className="py-2 px-3 font-medium text-slate-800">{inst.date}</td>
												<td className="py-2 px-3 font-bold text-slate-900">
													{formatIndianCurrency(inst.amount)}
												</td>
												<td className="py-2 px-3">
													<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
														{inst.status || 'Upcoming'}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{/* Modal Footer */}
				<div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
					>
						Close
					</button>
					{onOpenInServicing && (
						<button
							type="button"
							onClick={() => {
								onOpenInServicing(loan);
								onClose();
							}}
							className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-[13px] font-bold shadow-sm hover:bg-primary/90 transition-transform active:scale-95"
						>
							<span>Open in Servicing Desk</span>
							<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
