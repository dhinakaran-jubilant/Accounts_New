/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Post-login popup card modal showcasing synchronized loan EMI collections, client names, scheduled dates, and DayBook received dates.
*/

import React, { useState, useMemo, useEffect } from 'react';
import { formatIndianCurrency } from '../../utils/jointLoanUtils';

export default function SyncedLoansModal({
	isOpen = false,
	onClose,
	syncedItems = [],
	lastSyncTime = null,
	syncResult = null,
	onOpenLoan,
	onTriggerSync,
	isSyncing = false,
	dailySyncTime = '09:00',
	autoSyncEnabled = true,
}) {
	const [searchTerm, setSearchTerm] = useState('');

	// Close on Escape key press
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				onClose && onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	// Prevent background scroll when popup card is open
	useEffect(() => {
		if (isOpen) {
			const prevOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prevOverflow;
			};
		}
	}, [isOpen]);

	// Extract only the items that were updated in this specific sync run
	const newlySyncedItems = useMemo(() => {
		if (!syncResult) return [];
		const sftp = syncResult.sftp_result || syncResult;
		// 1. If backend explicitly returned updated_items
		if (Array.isArray(sftp.updated_items) && sftp.updated_items.length > 0) {
			return sftp.updated_items;
		}
		// 2. If updated_count is 0 or not positive, strictly 0 newly synced items
		if (sftp.updated_count === 0) {
			return [];
		}
		// 3. Fallback: if updated_count > 0 and updated_details exists, match with syncedItems
		if (Array.isArray(sftp.updated_details) && sftp.updated_details.length > 0) {
			const detailStr = sftp.updated_details.join(' ');
			return syncedItems.filter((item) => {
				const idMatch = item.dbLoanId && detailStr.includes(`Loan #${item.dbLoanId}`);
				const loanRefMatch = item.loanId && detailStr.includes(item.loanId);
				const clientMatch = item.clientName && detailStr.includes(item.clientName);
				const emiMatch = item.emiNo && detailStr.includes(`EMI ${item.emiNo}`);
				const dateMatch = item.receivedDate && detailStr.includes(item.receivedDate);
				return idMatch || loanRefMatch || (clientMatch && emiMatch) || (clientMatch && dateMatch);
			});
		}
		return [];
	}, [syncResult, syncedItems]);

	// Active View Tab: 'newly_synced' | 'all_synced'
	// When opened with newly synced items, default to 'newly_synced'.
	// When opened directly or 0 new items, default to 'all_synced' so synced loans are always visible.
	const [activeTab, setActiveTab] = useState(() => (newlySyncedItems.length > 0 ? 'newly_synced' : 'all_synced'));

	useEffect(() => {
		if (isOpen) {
			if (newlySyncedItems.length > 0) {
				setActiveTab('newly_synced');
			} else {
				setActiveTab('all_synced');
			}
		}
	}, [isOpen, newlySyncedItems.length]);

	const currentDisplayItems = useMemo(() => {
		if (activeTab === 'newly_synced') {
			return newlySyncedItems;
		}
		return syncedItems;
	}, [activeTab, newlySyncedItems, syncedItems]);

	// Filter current display items based on user search term
	const filteredItems = useMemo(() => {
		if (!searchTerm.trim()) return currentDisplayItems;
		const q = searchTerm.toLowerCase().trim();
		return currentDisplayItems.filter((item) => {
			const client = (item.clientName || '').toLowerCase();
			const loanId = (item.loanId || '').toLowerCase();
			const emiDate = (item.emiDate || '').toLowerCase();
			const recdDate = (item.receivedDate || '').toLowerCase();
			const emiNo = String(item.emiNo || '').toLowerCase();
			const acc = (item.primaryAccount || '').toLowerCase();
			return (
				client.includes(q) ||
				loanId.includes(q) ||
				emiDate.includes(q) ||
				recdDate.includes(q) ||
				emiNo.includes(q) ||
				acc.includes(q)
			);
		});
	}, [currentDisplayItems, searchTerm]);

	// Metrics summary based on current view
	const totalAmount = useMemo(() => {
		return currentDisplayItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
	}, [currentDisplayItems]);

	const uniqueLoansCount = useMemo(() => {
		const set = new Set(currentDisplayItems.map((i) => i.loanId).filter(Boolean));
		return set.size;
	}, [currentDisplayItems]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
			{/* Backdrop Overlay */}
			<div
				className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Modal Card Dialog */}
			<div
				className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-200"
				role="dialog"
				aria-modal="true"
				aria-labelledby="synced-modal-title"
			>
				{/* Top Header Section */}
				<div className="px-6 py-5 bg-gradient-to-r from-primary to-orange-600 text-white relative flex-shrink-0">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-3.5">
							<div className="w-12 h-12 rounded-2xl bg-white/15 text-white flex items-center justify-center shadow-lg ring-2 ring-white/20 flex-shrink-0 backdrop-blur-md">
								<span className="material-symbols-outlined text-[26px]">cloud_done</span>
							</div>
							<div>
								<div className="flex items-center gap-2.5 flex-wrap">
									<h2 id="synced-modal-title" className="text-lg sm:text-xl font-bold tracking-tight text-white">
										{activeTab === 'newly_synced' ? 'DayBook Sync Results' : 'DayBook Synced Loan Collections'}
									</h2>
									<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xs">
										<span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
										{currentDisplayItems.length} {activeTab === 'newly_synced' ? 'Newly Synced' : 'Collections'}
									</span>
								</div>
								<p className="text-xs text-white/85 mt-1 font-medium">
									{activeTab === 'newly_synced'
										? 'Displaying loan installments newly matched and updated from DayBook.'
										: 'DayBook sync proceeds only when received date is empty. Once filled, that EMI will not be re-synced.'}
								</p>
							</div>
						</div>

						{/* Close button */}
						<button
							type="button"
							onClick={onClose}
							className="h-9 w-9 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-xl transition-colors cursor-pointer"
							title="Close (Esc)"
							aria-label="Close"
						>
							<span className="material-symbols-outlined text-[22px]">close</span>
						</button>
					</div>

					{/* Metric Strip */}
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/15">
						<div className="bg-black/15 backdrop-blur-md rounded-xl p-2.5 px-3 border border-white/15 flex items-center gap-2.5">
							<span className="material-symbols-outlined text-white text-[20px]">payments</span>
							<div>
								<div className="text-[10px] text-white/75 font-semibold uppercase tracking-wider">
									{activeTab === 'newly_synced' ? 'Volume Newly Synced' : 'Total Synced Volume'}
								</div>
								<div className="text-sm sm:text-base font-bold text-white">
									₹ {formatIndianCurrency(totalAmount)}
								</div>
							</div>
						</div>

						<div className="bg-black/15 backdrop-blur-md rounded-xl p-2.5 px-3 border border-white/15 flex items-center gap-2.5">
							<span className="material-symbols-outlined text-white text-[20px]">account_balance_wallet</span>
							<div>
								<div className="text-[10px] text-white/75 font-semibold uppercase tracking-wider">
									{activeTab === 'newly_synced' ? 'Newly Synced Loans' : 'Total Synced Loans'}
								</div>
								<div className="text-sm sm:text-base font-bold text-white">
									{uniqueLoansCount} {uniqueLoansCount === 1 ? 'Loan' : 'Loans'}
								</div>
							</div>
						</div>

						<div className="col-span-2 sm:col-span-1 bg-black/15 backdrop-blur-md rounded-xl p-2.5 px-3 border border-white/15 flex items-center gap-2.5">
							<span className="material-symbols-outlined text-white text-[20px]">update</span>
							<div className="min-w-0">
								<div className="text-[10px] text-white/75 font-semibold uppercase tracking-wider">DayBook Sync Stamp</div>
								<div className="text-xs sm:text-sm font-bold text-white truncate font-mono">
									{lastSyncTime || 'Auto-Synced via SFTP'}
								</div>
								<div className="text-[10px] text-emerald-200/90 font-medium flex items-center gap-1 mt-0.5">
									<span className="w-1 h-1 rounded-full bg-emerald-400"></span>
									<span>Daily auto-sync: {dailySyncTime}</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Search & Tab Filter Toolbar */}
				<div className="px-6 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
					{/* Tab Switcher Pills */}
					<div className="inline-flex items-center bg-slate-200/70 p-1 rounded-xl ring-1 ring-slate-300/60 text-xs font-bold shadow-2xs">
						<button
							type="button"
							onClick={() => setActiveTab('newly_synced')}
							className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
								activeTab === 'newly_synced'
									? 'bg-white text-primary shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
							}`}
						>
							<span className="material-symbols-outlined text-[15px]">flash_on</span>
							<span>Newly Synced ({newlySyncedItems.length})</span>
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('all_synced')}
							className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
								activeTab === 'all_synced'
									? 'bg-white text-primary shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
							}`}
						>
							<span className="material-symbols-outlined text-[15px]">format_list_bulleted</span>
							<span>All Synced Collections ({syncedItems.length})</span>
						</button>
					</div>

					{/* Search Box */}
					<div className="relative flex-1 max-w-[340px]">
						<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
							search
						</span>
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search client, loan ID, EMI date, received date..."
							className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
						/>
						{searchTerm && (
							<button
								type="button"
								onClick={() => setSearchTerm('')}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[16px]">close</span>
							</button>
						)}
					</div>

					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
							Showing {filteredItems.length} of {currentDisplayItems.length} records
						</span>
					</div>
				</div>

				{/* Table Body Area */}
				<div className="flex-1 overflow-y-auto custom-scrollbar p-6">
					{filteredItems.length === 0 ? (
						<div className="text-center py-12 px-4">
							<div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100 shadow-2xs">
								<span className="material-symbols-outlined text-[30px]">
									{activeTab === 'newly_synced' ? 'task_alt' : 'sync_disabled'}
								</span>
							</div>
							<h3 className="text-sm font-bold text-slate-800">
								{searchTerm
									? 'No matching EMIs found'
									: activeTab === 'newly_synced'
									? 'All EMIs Are Already Up To Date'
									: 'No Synced Loans Found'}
							</h3>
							<p className="text-xs text-slate-500 max-w-lg mx-auto mt-1">
								{searchTerm
									? `No records matched "${searchTerm}". Try another search term.`
									: activeTab === 'newly_synced'
									? '0 new installments updated in this sync run. All matching loan installments were already synced previously and are kept up to date.'
									: 'When DayBook entries match loan installments, their received dates will be automatically displayed here.'}
							</p>
							{!searchTerm && activeTab === 'newly_synced' && syncedItems.length > 0 && (
								<button
									type="button"
									onClick={() => setActiveTab('all_synced')}
									className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-focus shadow-xs active:scale-95 transition-all cursor-pointer"
								>
									<span className="material-symbols-outlined text-[16px]">visibility</span>
									<span>View All {syncedItems.length} Synced Collections</span>
								</button>
							)}
						</div>
					) : (
						<div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white">
							<table className="w-full text-left border-collapse text-xs">
								<thead>
									<tr className="bg-slate-50/90 text-slate-600 font-bold border-b border-slate-200">
										<th className="py-3 px-4 whitespace-nowrap">#</th>
										<th className="py-3 px-4 whitespace-nowrap">Client Name</th>
										<th className="py-3 px-4 whitespace-nowrap">Loan ID</th>
										<th className="py-3 px-4 text-center whitespace-nowrap">EMI No</th>
										<th className="py-3 px-4 whitespace-nowrap">EMI Date</th>
										<th className="py-3 px-4 whitespace-nowrap">Received Date</th>
										<th className="py-3 px-4 text-right whitespace-nowrap">EMI Amount</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 font-medium">
									{filteredItems.map((item, index) => {
										return (
											<tr
												key={item.id || `${item.loanId}-${item.emiNo}-${index}`}
												className="hover:bg-emerald-50/40 transition-colors group"
											>
												{/* Serial # */}
												<td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
													{index + 1}
												</td>

												{/* Client Name */}
												<td className="py-3 px-4">
													<div className="flex items-center gap-2.5">
														<div className="min-w-0">
															<span className="font-bold text-slate-900 block truncate group-hover:text-emerald-900 transition-colors">
																{item.clientName || 'Client'}
															</span>
															{item.primaryAccount && (
																<span className="text-[10px] text-slate-400 block truncate">
																	{item.primaryAccount}
																</span>
															)}
														</div>
													</div>
												</td>

												{/* Loan ID */}
												<td className="py-3 px-4 whitespace-nowrap">
													{onOpenLoan ? (
														<button
															type="button"
															onClick={() => onOpenLoan(item)}
															className="font-mono text-[11px] font-bold text-primary hover:text-primary-focus cursor-pointer inline-flex items-center gap-1"
															title="View loan details"
														>
															<span>{item.loanId}</span>
															<span className="material-symbols-outlined opacity-0 group-hover:opacity-100 transition-opacity" style={{fontSize: '14px'}}>
																open_in_new
															</span>
														</button>
													) : (
														<span className="font-mono text-[11px] font-bold text-slate-700">
															{item.loanId}
														</span>
													)}
												</td>

												{/* EMI No */}
												<td className="py-3 px-4 text-center whitespace-nowrap">
													<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 ring-1 ring-slate-200">
														EMI #{item.emiNo}
													</span>
												</td>

												{/* EMI Date (Scheduled) */}
												<td className="py-3 px-4 whitespace-nowrap">
													<div className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
														<span>{item.emiDate || '—'}</span>
													</div>
												</td>

												{/* Received Date (Synced from DayBook) */}
												<td className="py-3 px-4 whitespace-nowrap">
													<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 shadow-2xs">
														<span className="material-symbols-outlined text-[15px] text-emerald-600">
															check_circle
														</span>
														<span className="font-mono">{item.receivedDate}</span>
													</div>
												</td>

												{/* Amount */}
												<td className="py-3 px-4 text-right whitespace-nowrap font-bold text-slate-900">
													₹ {formatIndianCurrency(item.amount)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Modal Footer Section */}
				<div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
					<div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-slate-500">
						<span>💡 <span className="font-semibold text-slate-700">Sync Rule:</span> DayBook sync proceeds only when received date is empty. Once filled, that EMI will not be re-synced.</span>
					</div>
				</div>
			</div>
		</div>
	);
}
