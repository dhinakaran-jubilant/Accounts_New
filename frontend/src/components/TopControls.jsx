/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Filter toolbar component providing search inputs, status dropdowns, and view toggles for loan lists.
*/

import React from 'react';

export default function TopControls({
	activeTab,
	onTabChange,
	viewMode,
	onViewModeChange,
	onExport,
}) {
	return (
		<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md font-sans">
			{/* Left: Title & Main Category Tabs */}
			<div className="flex flex-wrap items-center gap-space-md">
				<h1 className="font-extrabold text-[26px] text-slate-900 tracking-tight">
					Loan Operations &amp; Pipeline
				</h1>
				<div className="flex items-center bg-surface-container-low p-1 rounded-full shadow-sm ring-1 ring-slate-200/60">
					<button
						type="button"
						onClick={() => onTabChange('pipeline')}
						className={`flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-bold text-[13px] transition-transform active:scale-95 ${activeTab === 'pipeline'
								? 'bg-primary-container text-on-primary shadow-sm'
								: 'font-semibold text-slate-600 hover:text-slate-900'
							}`}
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<rect height="18" rx="1" width="5" x="3" y="3" />
							<rect height="12" rx="1" width="5" x="10" y="3" />
							<rect height="15" rx="1" width="5" x="17" y="3" />
						</svg>
						<span>Pipeline Stages</span>
						<span
							className={`font-bold text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'pipeline'
									? 'bg-white/25 text-on-primary'
									: 'bg-surface-container text-slate-700'
								}`}
						>
							148
						</span>
					</button>

					<button
						type="button"
						onClick={() => onTabChange('all')}
						className={`flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-semibold text-[13px] transition-colors ${activeTab === 'all'
								? 'bg-primary-container text-on-primary font-bold shadow-sm'
								: 'text-slate-600 hover:text-slate-900'
							}`}
					>
						<svg
							className="w-4 h-4 text-slate-500"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<line x1="3" x2="21" y1="6" y2="6" />
							<line x1="3" x2="21" y1="12" y2="12" />
							<line x1="3" x2="21" y1="18" y2="18" />
						</svg>
						<span>All Loans</span>
					</button>

					<button
						type="button"
						onClick={() => onTabChange('disbursements')}
						className={`hidden sm:flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-semibold text-[13px] transition-colors ${activeTab === 'disbursements'
								? 'bg-primary-container text-on-primary font-bold shadow-sm'
								: 'text-slate-600 hover:text-slate-900'
							}`}
					>
						<svg
							className="w-4 h-4 text-slate-500"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
							<line x1="16" x2="16" y1="2" y2="6" />
							<line x1="8" x2="8" y1="2" y2="6" />
							<line x1="3" x2="21" y1="10" y2="10" />
						</svg>
						<span>Disbursements</span>
					</button>
				</div>
			</div>

			{/* Right Controls: Underwriters, Sprint selector, View toggle, Export */}
			<div className="flex items-center">

				{/* Export Report CTA */}
				<button
					type="button"
					onClick={onExport}
					className="flex items-center gap-1.5 bg-surface-container-lowest hover:bg-surface-container-low text-slate-800 px-space-md py-2 rounded-xl font-bold text-[13px] shadow-sm ring-1 ring-slate-200/80 transition-colors"
				>
					<svg
						className="w-4 h-4 text-slate-500"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						viewBox="0 0 24 24"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" x2="12" y1="15" y2="3" />
					</svg>
					<span>Export</span>
				</button>
			</div>
		</div>
	);
}
