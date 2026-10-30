/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-10-29 13:38
Description: DayBook & SFTP Synchronization dashboard component providing synced collection results, modern interactive date filters, account breakdowns, and Excel exports.
*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../services/api';
import { formatIndianCurrency } from '../utils/jointLoanUtils';
import { TableLoader } from './common/LottieLoader';
import _XLSX from 'xlsx-js-style';

const XLSX = _XLSX.default || _XLSX;

// Helper to parse 'DD-MM-YYYY' or 'YYYY-MM-DD' into a midnight Date object
const parseDateRobustly = (val) => {
	if (!val) return null;
	const s = String(val).trim();
	if (!s || s === '-' || s === '—' || s.toLowerCase() === 'dd-mm-yyyy' || s.toLowerCase() === 'none' || s.toLowerCase() === 'null') {
		return null;
	}
	const parts = s.split(/[-/.]/);
	if (parts.length === 3) {
		if (parts[0].length === 4) {
			// YYYY-MM-DD
			return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
		}
		// DD-MM-YYYY
		return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
	}
	const d = new Date(s);
	return isNaN(d.getTime()) ? null : d;
};

// Format Date object to 'YYYY-MM-DD' for HTML date inputs
const toInputDate = (d) => {
	if (!d || isNaN(d.getTime())) return '';
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Format Date object to 'DD-MM-YYYY' for display
const toDisplayDate = (d) => {
	if (!d || isNaN(d.getTime())) return '';
	const pad = (n) => String(n).padStart(2, '0');
	return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export default function Sync({ searchQuery: globalSearch = '', currentUser, onNavigateToJointLoan }) {
	const [syncedItems, setSyncedItems] = useState([]);
	const [allLoans, setAllLoans] = useState([]);
	const [accounts, setAccounts] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncFeedback, setSyncFeedback] = useState(null);
	const [syncStatus, setSyncStatus] = useState({
		last_sync_time: null,
		last_sync_status: null,
		daily_sync_time: '09:00',
		auto_sync_enabled: true,
		sftp_result: null,
	});

	// Filtering states
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedAccount, setSelectedAccount] = useState('ALL');
	const [datePreset, setDatePreset] = useState('all');
	const [dateType, setDateType] = useState('received'); // 'received' | 'due'
	const [fromDate, setFromDate] = useState('');
	const [toDate, setToDate] = useState('');
	const [activeTab, setActiveTab] = useState('all'); // 'all' | 'today' | 'latest'

	// Pagination & Sorting
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [sortField, setSortField] = useState('receivedDate');
	const [sortDirection, setSortDirection] = useState('desc');

	// Modal for inspecting SFTP details
	const [showDetailsModal, setShowDetailsModal] = useState(false);

	// Load all synced data and system config
	const loadData = async (showLoader = true) => {
		if (showLoader) setIsLoading(true);
		try {
			const [syncedRes, loansRes, accsRes, statusRes] = await Promise.allSettled([
				api.getSyncedLoans(),
				api.getJointLoans(),
				api.getAccountNames(),
				api.getSyncStatus(),
			]);

			const loans = loansRes.status === 'fulfilled' && Array.isArray(loansRes.value) ? loansRes.value : [];
			setAllLoans(loans);

			const accs = accsRes.status === 'fulfilled' && Array.isArray(accsRes.value) ? accsRes.value : [];
			setAccounts(accs);

			if (statusRes.status === 'fulfilled' && statusRes.value) {
				setSyncStatus(statusRes.value);
			}

			// Build comprehensive list of synced installments from either /synced-loans or local extraction
			let items = [];
			if (syncedRes.status === 'fulfilled' && syncedRes.value && Array.isArray(syncedRes.value.items) && syncedRes.value.items.length > 0) {
				items = syncedRes.value.items;
			} else {
				// Fallback: extract directly from all approved loans
				loans.forEach((loan) => {
					const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
					schedule.forEach((sch, idx) => {
						let recd = (sch.received_date || sch.receivedDate || '').trim();
						if (!recd && sch.splits) {
							try {
								const sp = typeof sch.splits === 'string' ? JSON.parse(sch.splits) : sch.splits;
								recd = (sp?.recdDateA || sp?.recdDate || '').trim();
							} catch (e) { }
						}
						if (recd && recd !== '-' && recd !== '—' && recd !== 'None' && recd !== 'null' && recd.toLowerCase() !== 'dd-mm-yyyy') {
							items.push({
								id: `${loan.id}-${sch.id || idx}`,
								loanId: loan.loan_ref_id || `JL-${loan.id}`,
								dbLoanId: loan.id,
								clientName: loan.client_account_name || loan.primaryBorrower?.name || 'Client',
								emiNo: sch.sNo || sch.installmentNumber || idx + 1,
								emiDate: sch.date || '',
								receivedDate: recd,
								paymentDate: sch.payment_date || '',
								amount: Number(sch.amount) || 0,
								primaryAccount: loan.primary_account_name || loan.primaryAccountName || '',
								status: 'Collected',
								loan,
							});
						}
					});
				});
			}

			setSyncedItems(items);
		} catch (err) {
			console.warn('[Sync] Data fetch error:', err);
		} finally {
			if (showLoader) setIsLoading(false);
		}
	};

	useEffect(() => {
		loadData(true);
	}, []);

	// Handle Date Presets
	const handlePresetChange = (preset) => {
		setDatePreset(preset);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (preset === 'all') {
			setFromDate('');
			setToDate('');
		} else if (preset === 'today') {
			const str = toInputDate(today);
			setFromDate(str);
			setToDate(str);
		} else if (preset === 'yesterday') {
			const yest = new Date(today);
			yest.setDate(yest.getDate() - 1);
			const str = toInputDate(yest);
			setFromDate(str);
			setToDate(str);
		} else if (preset === 'week') {
			const day = today.getDay();
			const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
			const monday = new Date(today);
			monday.setDate(diff);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			setFromDate(toInputDate(monday));
			setToDate(toInputDate(sunday));
		} else if (preset === 'month') {
			const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
			const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			setFromDate(toInputDate(firstDay));
			setToDate(toInputDate(lastDay));
		} else if (preset === 'last30') {
			const past30 = new Date(today);
			past30.setDate(past30.getDate() - 30);
			setFromDate(toInputDate(past30));
			setToDate(toInputDate(today));
		}
		setCurrentPage(1);
	};

	// Reset all filters to default
	const handleResetFilters = () => {
		setSearchTerm('');
		setSelectedAccount('ALL');
		setDatePreset('all');
		setDateType('received');
		setFromDate('');
		setToDate('');
		setActiveTab('all');
		setCurrentPage(1);
	};

	// Trigger manual SFTP DayBook Sync
	const handleTriggerSync = async () => {
		if (isSyncing) return;
		setIsSyncing(true);
		setSyncFeedback({ type: 'info', text: 'Connecting to SFTP & parsing DayBook...' });

		try {
			const res = await api.syncData();
			const sftp = res?.sftp_result;
			const updatedCount = sftp?.updated_count ?? res?.updated_count ?? 0;

			await loadData(false);

			if (sftp?.success || res?.success) {
				setSyncFeedback({
					type: 'success',
					text: updatedCount > 0 ? `Sync Completed: ${updatedCount} installment(s) updated!` : 'Sync Completed: Already up-to-date.',
				});
				if (updatedCount > 0) {
					setActiveTab('latest');
				}
			} else {
				setSyncFeedback({
					type: 'error',
					text: sftp?.error || sftp?.message || res?.error || 'SFTP sync encountered an issue.',
				});
			}
		} catch (err) {
			console.error('[Sync] Sync failed:', err);
			setSyncFeedback({ type: 'error', text: 'Sync failed: could not connect to server.' });
		} finally {
			setIsSyncing(false);
			setTimeout(() => setSyncFeedback(null), 4000);
		}
	};

	// Items filtered by Active Tab
	const tabFilteredItems = useMemo(() => {
		if (activeTab === 'today') {
			const todayStr = toDisplayDate(new Date());
			return syncedItems.filter((i) => i.receivedDate === todayStr);
		}
		if (activeTab === 'latest') {
			const sftp = syncStatus.sftp_result;
			if (sftp && Array.isArray(sftp.updated_items) && sftp.updated_items.length > 0) {
				const idSet = new Set(sftp.updated_items.map((u) => `${u.dbLoanId}-${u.emiNo}`));
				return syncedItems.filter((i) => idSet.has(`${i.dbLoanId}-${i.emiNo}`));
			}
		}
		return syncedItems;
	}, [syncedItems, activeTab, syncStatus]);

	// Filtered list based on Search, Account, and Modern Date Range
	const filteredItems = useMemo(() => {
		const q = (searchTerm || globalSearch).toLowerCase().trim();
		const fromD = fromDate ? new Date(fromDate + 'T00:00:00') : null;
		const toD = toDate ? new Date(toDate + 'T23:59:59') : null;

		return tabFilteredItems.filter((item) => {
			// Account filter
			if (selectedAccount !== 'ALL') {
				const itemAcc = (item.primaryAccount || '').toLowerCase();
				if (!itemAcc.includes(selectedAccount.toLowerCase())) {
					return false;
				}
			}

			// Text search
			if (q) {
				const client = (item.clientName || '').toLowerCase();
				const loanId = (item.loanId || '').toLowerCase();
				const emiDate = (item.emiDate || '').toLowerCase();
				const recdDate = (item.receivedDate || '').toLowerCase();
				const emiNo = `emi ${item.emiNo || ''}`.toLowerCase();
				const acc = (item.primaryAccount || '').toLowerCase();

				const matches =
					client.includes(q) ||
					loanId.includes(q) ||
					emiDate.includes(q) ||
					recdDate.includes(q) ||
					emiNo.includes(q) ||
					acc.includes(q);

				if (!matches) return false;
			}

			// Date Range Filter
			if (fromD || toD) {
				const targetDateStr = dateType === 'received' ? item.receivedDate : item.emiDate;
				const parsed = parseDateRobustly(targetDateStr);
				if (!parsed) return false;
				const t = parsed.getTime();
				if (fromD && t < fromD.getTime()) return false;
				if (toD && t > toD.getTime()) return false;
			}

			return true;
		});
	}, [tabFilteredItems, searchTerm, globalSearch, selectedAccount, fromDate, toDate, dateType]);

	// Sorting
	const sortedItems = useMemo(() => {
		return [...filteredItems].sort((a, b) => {
			let valA = a[sortField];
			let valB = b[sortField];

			if (sortField === 'receivedDate' || sortField === 'emiDate') {
				const dateA = parseDateRobustly(valA)?.getTime() || 0;
				const dateB = parseDateRobustly(valB)?.getTime() || 0;
				return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
			}

			if (sortField === 'amount') {
				const numA = Number(valA) || 0;
				const numB = Number(valB) || 0;
				return sortDirection === 'asc' ? numA - numB : numB - numA;
			}

			valA = String(valA || '').toLowerCase();
			valB = String(valB || '').toLowerCase();
			if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
			if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}, [filteredItems, sortField, sortDirection]);

	// Pagination
	const totalPages = Math.ceil(sortedItems.length / pageSize) || 1;
	const paginatedItems = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return sortedItems.slice(start, start + pageSize);
	}, [sortedItems, currentPage, pageSize]);

	// Metric summaries
	const totalVolume = useMemo(() => {
		return filteredItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
	}, [filteredItems]);

	const uniqueBorrowers = useMemo(() => {
		return new Set(filteredItems.map((i) => i.loanId).filter(Boolean)).size;
	}, [filteredItems]);

	const avgAmount = useMemo(() => {
		return filteredItems.length > 0 ? Math.round(totalVolume / filteredItems.length) : 0;
	}, [filteredItems, totalVolume]);

	// Handle column sorting toggle
	const handleSort = (field) => {
		if (sortField === field) {
			setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
		} else {
			setSortField(field);
			setSortDirection('desc');
		}
	};

	// Excel Export
	const handleExportToExcel = () => {
		try {
			const rows = sortedItems.map((item, idx) => ({
				'S.No': idx + 1,
				'Loan ID': item.loanId || '',
				'Client / Borrower': item.clientName || '',
				'Primary Account': item.primaryAccount || '',
				'EMI #': `EMI ${item.emiNo || ''}`,
				'Scheduled Due Date': item.emiDate || '',
				'DayBook Received Date': item.receivedDate || '',
				'Amount (INR)': Number(item.amount) || 0,
				Status: item.status || 'Collected',
			}));

			const ws = XLSX.utils.json_to_sheet(rows);

			// Column widths
			ws['!cols'] = [
				{ wch: 8 },
				{ wch: 18 },
				{ wch: 32 },
				{ wch: 28 },
				{ wch: 12 },
				{ wch: 18 },
				{ wch: 22 },
				{ wch: 18 },
				{ wch: 14 },
			];

			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Synced Collections');

			const todayStr = toDisplayDate(new Date());
			XLSX.writeFile(wb, `DayBook_Synced_Collections_${todayStr}.xlsx`);
		} catch (err) {
			console.error('Export error:', err);
		}
	};

	return (
		<div className="flex flex-col w-full gap-6 font-sans">
			{/* Top Header & SFTP Service Controls Strip */}
			<div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80">
				<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
					<div className="flex items-start gap-4">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs shrink-0">
							<span className="material-symbols-outlined">cloud_sync</span>
						</div>
						<div>
							<div className="flex flex-wrap items-center gap-3">
								<h1 className="text-2xl font-black text-slate-900 tracking-tight">DayBook &amp; SFTP Sync</h1>
								<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
									<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
									{syncedItems.length} EMIs Synced
								</span>
								{syncStatus.last_sync_status && (
									<span
										className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ring-1 ${syncStatus.last_sync_status === 'SUCCESS'
												? 'bg-blue-50 text-blue-700 ring-blue-200'
												: 'bg-rose-50 text-rose-700 ring-rose-200'
											}`}
									>
										{syncStatus.last_sync_status}
									</span>
								)}
							</div>
							<p className="text-[12px] text-slate-500 mt-1 font-medium">
								Real-time automated bank collection ingestion, loan installment tracking, and DayBook reconciliation.
							</p>
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-wrap items-center gap-2.5">
						<button
							type="button"
							onClick={handleTriggerSync}
							disabled={isSyncing}
							className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-white shadow-md transition-all cursor-pointer ${isSyncing
									? 'bg-primary/70 cursor-not-allowed'
									: 'bg-primary hover:bg-orange-600 shadow-orange-500/25 active:scale-95'
								}`}
						>
							<span className={`material-symbols-outlined text-[19px] ${isSyncing ? 'animate-spin' : ''}`}>
								sync
							</span>
							<span className="text-[12px]">{isSyncing ? 'Syncing DayBook...' : 'Sync Now'}</span>
						</button>

						<button
							type="button"
							onClick={handleExportToExcel}
							disabled={filteredItems.length === 0}
							className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Export filtered records to Excel"
						>
							<span className="material-symbols-outlined text-emerald-600 text-[19px]">file_download</span>
							<span className="hidden sm:inline text-[12px]">Export Excel</span>
						</button>
					</div>
				</div>

				{/* Feedback Alert Toast */}
				{syncFeedback && (
					<div
						className={`mt-4 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in duration-200 ${syncFeedback.type === 'success'
								? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
								: syncFeedback.type === 'error'
									? 'bg-rose-50 text-rose-800 border border-rose-200'
									: 'bg-blue-50 text-blue-800 border border-blue-200'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">
							{syncFeedback.type === 'success'
								? 'check_circle'
								: syncFeedback.type === 'error'
									? 'error'
									: 'info'}
						</span>
						<span>{syncFeedback.text}</span>
					</div>
				)}

				{/* Sync Details Indicator Strip */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs">
					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-slate-400 text-[18px]">schedule</span>
						<div>
							<div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Last Sync</div>
							<div className="font-bold text-slate-700">{syncStatus.last_sync_time || 'Not Synced Yet'}</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-slate-400 text-[18px]">alarm</span>
						<div>
							<div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Scheduled Time</div>
							<div className="font-bold text-slate-700">
								{syncStatus.daily_sync_time ? `${syncStatus.daily_sync_time} Daily` : '09:00 AM Daily'}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-slate-400 text-[18px]">toggle_on</span>
						<div>
							<div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Auto Ingestion</div>
							<div className="font-bold text-emerald-600">
								{syncStatus.auto_sync_enabled ? 'Active / Enabled' : 'Disabled'}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-slate-400 text-[18px]">rule</span>
						<div>
							<div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Safety Policy</div>
							<div className="font-bold text-slate-600">Skips Filled Dates</div>
						</div>
					</div>
				</div>
			</div>

			{/* Modern Filter Suite Card */}
			<div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex flex-col gap-5">
				{/* Preset Chips & View Tabs */}
				<div className="flex flex-col md:flex-row md:items-center justify-between">
					{/* Tab selection */}
					<div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
						<button
							type="button"
							onClick={() => setActiveTab('all')}
							className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'all'
									? 'bg-white text-slate-900 shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
								}`}
						>
							All Collections ({syncedItems.length})
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('today')}
							className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'today'
									? 'bg-white text-slate-900 shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
								}`}
						>
							Today's Receipts
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('latest')}
							className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'latest'
									? 'bg-white text-slate-900 shadow-xs'
									: 'text-slate-600 hover:text-slate-900'
								}`}
						>
							Latest Sync Batch
						</button>
					</div>

					{/* Date Range Preset Chips */}
					<div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
						{[
							{ id: 'all', label: 'All Time' },
							{ id: 'today', label: 'Today' },
							{ id: 'yesterday', label: 'Yesterday' },
							{ id: 'week', label: 'This Week' },
							{ id: 'month', label: 'This Month' },
						].map((p) => {
							const isActive = datePreset === p.id;
							return (
								<button
									key={p.id}
									type="button"
									onClick={() => handlePresetChange(p.id)}
									className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive
											? 'bg-primary text-white shadow-xs'
											: 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
										}`}
								>
									{p.label}
								</button>
							);
						})}
					</div>
				</div>

				{/* Active Filter Summary Bar */}
				{(fromDate || toDate || selectedAccount !== 'ALL' || searchTerm) && (
					<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-500">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-slate-400">Active Filters:</span>
							{fromDate && toDate && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 text-primary font-bold">
									<span className="material-symbols-outlined text-[14px]">calendar_today</span>
									{dateType === 'received' ? 'Recd' : 'Due'}: {fromDate} → {toDate}
								</span>
							)}
							{selectedAccount !== 'ALL' && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold">
									<span className="material-symbols-outlined text-[14px]">account_balance</span>
									{selectedAccount}
								</span>
							)}
							{searchTerm && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold">
									"{searchTerm}"
								</span>
							)}
							<span className="text-slate-400">({filteredItems.length} records matching)</span>
						</div>

						<button
							type="button"
							onClick={handleResetFilters}
							className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer flex items-center gap-1"
						>
							<span className="material-symbols-outlined text-[14px]">close</span>
							Reset All Filters
						</button>
					</div>
				)}
			</div>

			{/* Synced Results Modern Table Card */}
			<div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col">
				{isLoading ? (
					<div className="py-24 flex flex-col items-center justify-center gap-3">
						<TableLoader message="Loading DayBook synchronized records..." />
					</div>
				) : filteredItems.length === 0 ? (
					<div className="py-20 px-6 text-center max-w-md mx-auto flex flex-col items-center">
						<div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
							<span className="material-symbols-outlined text-[36px]">filter_alt_off</span>
						</div>
						<h3 className="text-lg font-black text-slate-800 tracking-tight">No Synced Collections Found</h3>
						<p className="text-sm text-slate-500 mt-1.5">
							{fromDate || toDate || selectedAccount !== 'ALL' || searchTerm
								? 'No loan installments match the selected date range or search query.'
								: 'No DayBook receipt vouchers have been synced yet. Click "Sync Now" to ingest the latest DayBook.'}
						</p>
						<button
							type="button"
							onClick={handleResetFilters}
							className="mt-5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-orange-600 transition-all cursor-pointer shadow-xs"
						>
							Clear All Filters
						</button>
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full text-left border-collapse min-w-[900px]">
								<thead>
									<tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
										<th className="py-3.5 px-4 w-12 text-center">#</th>
										<th
											className="py-3.5 px-4 cursor-pointer hover:text-slate-800 transition-colors"
											onClick={() => handleSort('loanId')}
										>
											<div className="flex items-center gap-1">
												<span>Loan ID</span>
												{sortField === 'loanId' && (
													<span className="material-symbols-outlined text-[14px]">
														{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
													</span>
												)}
											</div>
										</th>
										<th
											className="py-3.5 px-4 cursor-pointer hover:text-slate-800 transition-colors"
											onClick={() => handleSort('clientName')}
										>
											<div className="flex items-center gap-1">
												<span>Client Name</span>
												{sortField === 'clientName' && (
													<span className="material-symbols-outlined text-[14px]">
														{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
													</span>
												)}
											</div>
										</th>
										<th className="py-3.5 px-4">Account</th>
										<th className="py-3.5 px-4 text-center">EMI #</th>
										<th
											className="py-3.5 px-4 cursor-pointer hover:text-slate-800 transition-colors"
											onClick={() => handleSort('emiDate')}
										>
											<div className="flex items-center gap-1">
												<span>Due Date</span>
												{sortField === 'emiDate' && (
													<span className="material-symbols-outlined text-[14px]">
														{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
													</span>
												)}
											</div>
										</th>
										<th
											className="py-3.5 px-4 cursor-pointer hover:text-slate-800 transition-colors"
											onClick={() => handleSort('receivedDate')}
										>
											<div className="flex items-center gap-1 text-emerald-700">
												<span>Received Date</span>
												{sortField === 'receivedDate' && (
													<span className="material-symbols-outlined" style={{fontSize: "14px"}}>
														{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
													</span>
												)}
											</div>
										</th>
										<th
											className="py-3.5 px-4 text-right cursor-pointer hover:text-slate-800 transition-colors"
											onClick={() => handleSort('amount')}
										>
											<div className="flex items-center justify-end gap-1">
												<span>Amount</span>
												{sortField === 'amount' && (
													<span className="material-symbols-outlined text-[14px]">
														{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
													</span>
												)}
											</div>
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
									{paginatedItems.map((item, idx) => {
										const absoluteIdx = (currentPage - 1) * pageSize + idx + 1;
										const clientInitial = (item.clientName || 'C').charAt(0).toUpperCase();

										return (
											<tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
												<td className="py-3.5 px-4 text-center text-xs font-bold text-slate-400">
													{absoluteIdx}
												</td>

												{/* Loan ID (Clickable) */}
												<td className="py-3.5 px-4">
													<button
														type="button"
														onClick={() => {
															if (onNavigateToJointLoan) {
																const target = allLoans.find(
																	(l) => String(l.id) === String(item.dbLoanId) || l.loan_ref_id === item.loanId
																);
																onNavigateToJointLoan(target || { id: item.dbLoanId, loan_ref_id: item.loanId });
															}
														}}
														className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 text-primary hover:bg-orange-100 hover:text-orange-700 font-extrabold text-[12px] transition-colors cursor-pointer ring-1 ring-orange-200/60"
														title="Open Loan Details"
													>
														<span>{item.loanId}</span>
														<span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_outward</span>
													</button>
												</td>

												{/* Client Name */}
												<td className="py-3.5 px-4">
													<div className="flex items-center gap-2.5">
														<div className="truncate max-w-[220px] font-bold text-slate-900" title={item.clientName}>
															{item.clientName}
														</div>
													</div>
												</td>

												{/* Primary Account */}
												<td className="py-3.5 px-4">
													<span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 ring-1 ring-slate-200">
														{item.primaryAccount || '—'}
													</span>
												</td>

												{/* EMI # */}
												<td className="py-3.5 px-4 text-center">
													<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-50 text-blue-700 ring-1 ring-blue-200/70">
														EMI {item.emiNo}
													</span>
												</td>

												{/* Due Date */}
												<td className="py-3.5 px-4 text-xs font-bold text-slate-500 whitespace-nowrap">
													{item.emiDate || '—'}
												</td>

												{/* DayBook Received Date */}
												<td className="py-3.5 px-4 whitespace-nowrap">
													<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300">
														<span>{item.receivedDate}</span>
													</span>
												</td>

												{/* Amount */}
												<td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
													₹ {formatIndianCurrency(item.amount)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						{/* Table Footer with Pagination Controls */}
						<div className="p-4 px-6 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-semibold text-slate-600">
							<div className="flex items-center gap-2">
								<span>Showing</span>
								<span className="font-bold text-slate-900">
									{(currentPage - 1) * pageSize + 1} -{' '}
									{Math.min(currentPage * pageSize, sortedItems.length)}
								</span>
								<span>of</span>
								<span className="font-bold text-slate-900">{sortedItems.length}</span>
								<span>collections</span>
							</div>

							<div className="flex items-center gap-1.5">
								<button
									type="button"
									onClick={() => setCurrentPage(1)}
									disabled={currentPage === 1}
									className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
									title="First Page"
								>
									<span className="material-symbols-outlined text-[16px]">first_page</span>
								</button>
								<button
									type="button"
									onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
									disabled={currentPage === 1}
									className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
									title="Previous Page"
								>
									<span className="material-symbols-outlined text-[16px]">chevron_left</span>
								</button>

								<span className="px-3 py-1 text-slate-700 font-bold">
									Page {currentPage} of {totalPages}
								</span>

								<button
									type="button"
									onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
									disabled={currentPage >= totalPages}
									className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
									title="Next Page"
								>
									<span className="material-symbols-outlined text-[16px]">chevron_right</span>
								</button>
								<button
									type="button"
									onClick={() => setCurrentPage(totalPages)}
									disabled={currentPage >= totalPages}
									className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
									title="Last Page"
								>
									<span className="material-symbols-outlined text-[16px]">last_page</span>
								</button>
							</div>
						</div>
					</>
				)}
			</div>

			{/* SFTP Detailed Log Modal */}
			{showDetailsModal && syncStatus.sftp_result && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
					<div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
						<div className="flex items-center justify-between pb-4 border-b border-slate-100">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
									<span className="material-symbols-outlined text-[22px]">info</span>
								</div>
								<div>
									<h3 className="font-extrabold text-base text-slate-900">Latest SFTP Sync Log &amp; Ingestion</h3>
									<p className="text-xs text-slate-500 font-medium">Detailed run report from the DayBook ingestion engine.</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setShowDetailsModal(false)}
								className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
							>
								<span className="material-symbols-outlined text-[20px]">close</span>
							</button>
						</div>

						<div className="overflow-y-auto py-4 flex flex-col gap-4 text-xs font-sans">
							<div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl">
								<div>
									<span className="text-slate-400 font-semibold block text-[10.5px] uppercase">Message</span>
									<span className="font-bold text-slate-800">{syncStatus.sftp_result.message || '—'}</span>
								</div>
								<div>
									<span className="text-slate-400 font-semibold block text-[10.5px] uppercase">Total Files Ingested</span>
									<span className="font-bold text-slate-800">{syncStatus.sftp_result.total_files || 0}</span>
								</div>
							</div>

							{Array.isArray(syncStatus.sftp_result.updated_details) && syncStatus.sftp_result.updated_details.length > 0 && (
								<div>
									<h4 className="font-bold text-emerald-700 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1">
										<span className="material-symbols-outlined text-[15px]">check_circle</span>
										Updated Installments ({syncStatus.sftp_result.updated_details.length})
									</h4>
									<div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3 max-h-36 overflow-y-auto space-y-1">
										{syncStatus.sftp_result.updated_details.map((d, i) => (
											<div key={i} className="text-emerald-900 font-semibold">
												• {d}
											</div>
										))}
									</div>
								</div>
							)}

							{Array.isArray(syncStatus.sftp_result.skipped_details) && syncStatus.sftp_result.skipped_details.length > 0 && (
								<div>
									<h4 className="font-bold text-slate-500 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1">
										<span className="material-symbols-outlined text-[15px]">block</span>
										Skipped / Already Filled Installments ({syncStatus.sftp_result.skipped_details.length})
									</h4>
									<div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-40 overflow-y-auto space-y-1 text-slate-600">
										{syncStatus.sftp_result.skipped_details.map((s, i) => (
											<div key={i}>• {s}</div>
										))}
									</div>
								</div>
							)}
						</div>

						<div className="pt-3 border-t border-slate-100 flex justify-end">
							<button
								type="button"
								onClick={() => setShowDetailsModal(false)}
								className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
