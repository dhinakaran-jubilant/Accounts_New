/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Modal dialog component displaying comprehensive servicing metrics and loan facility details.
*/

import React from 'react';

export default function CardDetailsModal({ card, onClose }) {
	if (!card) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
			<div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200">
				{/* Header */}
				<div className="flex items-start justify-between pb-4 border-b border-slate-100">
					<div>
						<span className={`inline-block font-bold text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-2 ${card.categoryColor}`}>
							{card.category}
						</span>
						<h3 className="font-extrabold text-[22px] text-slate-900 tracking-tight">
							{card.company}
						</h3>
						<p className="text-[13px] text-slate-500 font-medium">
							{card.description}
						</p>
					</div>
					<button
						onClick={onClose}
						className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
					>
						<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Financial Highlights */}
				<div className="grid grid-cols-2 gap-3 my-4">
					<div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Facility Size</span>
						<div className="text-[22px] font-extrabold text-slate-900 mt-0.5">{card.amount}</div>
						<div className="text-[12px] text-slate-500">{card.termType || 'Standard Term'}</div>
					</div>
					<div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-100">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Terms / Score</span>
						<div className="text-[20px] font-bold text-primary mt-0.5">{card.rateOrScore || 'Under Evaluation'}</div>
						<div className="text-[12px] text-slate-500">Tier 1 Rating</div>
					</div>
				</div>

				{/* Progress or Details */}
				{card.progressLabel && (
					<div className="space-y-1.5 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
						<div className="flex justify-between text-[12px] font-bold text-slate-700">
							<span>{card.progressLabel}</span>
							<span>{card.progressValue}</span>
						</div>
						<div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
							<div
								className="bg-primary-container h-full rounded-full"
								style={{ width: `${card.progressPercent || 0}%` }}
							></div>
						</div>
					</div>
				)}

				{card.alertBox && (
					<div className="mb-4 bg-primary/5 rounded-xl p-3 text-primary font-bold text-[13px] flex items-center gap-2 ring-1 ring-primary/20">
						<svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="8.5" cy="7" r="4" />
							<polyline points="17 11 19 13 23 9" />
						</svg>
						<span>{card.alertBox.text}</span>
					</div>
				)}

				<div className="text-[12px] text-slate-500 space-y-1 border-t border-slate-100 pt-3">
					<div className="flex justify-between">
						<span className="font-semibold text-slate-600">Status Stage:</span>
						<span className="font-bold text-slate-800">{card.statusText || 'Active Processing'}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-semibold text-slate-600">Timeline Target:</span>
						<span className="font-bold text-slate-800">{card.dueDate || card.badgeRight || card.updatedText || 'Immediate'}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-semibold text-slate-600">Compliance Audit:</span>
						<span className="text-emerald-700 font-bold">Passed (SOC2 + Basel III)</span>
					</div>
				</div>

				{/* Footer Actions */}
				<div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
					>
						Close
					</button>
					<button
						type="button"
						onClick={onClose}
						className="px-5 py-2 rounded-xl text-[13px] font-bold bg-primary-container hover:bg-primary text-on-primary shadow-sm transition-all active:scale-95"
					>
						Proceed to Underwrite
					</button>
				</div>
			</div>
		</div>
	);
}
