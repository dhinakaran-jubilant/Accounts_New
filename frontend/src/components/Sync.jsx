/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-10-29 13:38
Description: DayBook & SFTP Synchronization dashboard component providing synced collection results, modern interactive date filters, account breakdowns, and Excel exports.
*/

import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { formatIndianCurrency } from '../utils/jointLoanUtils';
import { TableLoader } from './common/LottieLoader';
import _XLSX from 'xlsx-js-style';
import { ModernAccountDropdown, ModernDateRangeCalendar } from './JointLoan';

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
	const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
	const [dateType, setDateType] = useState('received'); // 'received' | 'due'
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

	// Dynamic account filter options populated from accounts table and synced items
	const accountFilterOptions = useMemo(() => {
		if (Array.isArray(accounts) && accounts.length > 0) {
			let dbOptions = accounts
				.filter((acc) => acc && (acc.name || acc.acronym))
				.map((acc) => {
					const name = (acc.name || acc.acronym).trim();
					const acr = (acc.acronym || '').trim();
					const count = syncedItems.filter((item) => {
						const itemAcc = (item.primaryAccount || '').toLowerCase();
						return (
							itemAcc === name.toLowerCase() ||
							itemAcc === acr.toLowerCase() ||
							itemAcc.includes(name.toLowerCase()) ||
							(acr && itemAcc.includes(acr.toLowerCase()))
						);
					}).length;

					return {
						id: name,
						label: name,
						acronym: acr,
						color: acc.color || 'blue',
						count,
					};
				});

			dbOptions.sort((a, b) => {
				if (b.count !== a.count) return b.count - a.count;
				return a.label.localeCompare(b.label);
			});

			return [
				{ id: 'ALL', label: 'All Accounts', count: syncedItems.length },
				...dbOptions,
			];
		}

		// Fallback: extract from syncedItems
		const nameMap = new Map();
		syncedItems.forEach((item) => {
			const name = item.primaryAccount;
			if (name) nameMap.set(name, (nameMap.get(name) || 0) + 1);
		});

		const opts = Array.from(nameMap.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => ({ id: name, label: name, count }));

		return [
			{ id: 'ALL', label: 'All Accounts', count: syncedItems.length },
			...opts,
		];
	}, [accounts, syncedItems]);

	// Reference date for date range calendar popover
	const calendarReferenceDate = useMemo(() => {
		if (syncedItems.length > 0) {
			return syncedItems[0].receivedDate || syncedItems[0].emiDate || '';
		}
		return '';
	}, [syncedItems]);

	// Reset all filters to default
	const handleResetFilters = () => {
		setSearchTerm('');
		setSelectedAccount('ALL');
		setDateRange({ startDate: '', endDate: '' });
		setDateType('received');
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

		return tabFilteredItems.filter((item) => {
			// Account filter
			if (selectedAccount !== 'ALL') {
				const target = selectedAccount.toLowerCase();
				const itemAcc = (item.primaryAccount || '').toLowerCase();
				const accObj = accounts.find(
					(a) => (a.name || '').toLowerCase() === target || (a.acronym || '').toLowerCase() === target
				);
				const targetAcr = (accObj?.acronym || '').toLowerCase();
				const matches =
					itemAcc === target ||
					(targetAcr && itemAcc === targetAcr) ||
					itemAcc.includes(target) ||
					(targetAcr && itemAcc.includes(targetAcr));
				if (!matches) return false;
			}

			// Text search
			if (q) {
				const client = (item.clientName || '').toLowerCase();
				const loanId = (item.loanId || '').toLowerCase();
				const emiDate = (item.emiDate || '').toLowerCase();
				const recdDate = (item.receivedDate || '').toLowerCase();
				const emiNo = `emi ${item.emiNo || ''}`.toLowerCase();
				const acc = (item.primaryAccount || '').toLowerCase();
				const amtStr = String(item.amount || '');

				const matches =
					client.includes(q) ||
					loanId.includes(q) ||
					emiDate.includes(q) ||
					recdDate.includes(q) ||
					emiNo.includes(q) ||
					acc.includes(q) ||
					amtStr.includes(q);

				if (!matches) return false;
			}

			// Date Range Filter
			if (dateRange.startDate || dateRange.endDate) {
				const targetDateStr = dateType === 'received' ? item.receivedDate : item.emiDate;
				const parsed = parseDateRobustly(targetDateStr);
				if (!parsed) return false;
				const t = parsed.getTime();

				if (dateRange.startDate) {
					const fromD = parseDateRobustly(dateRange.startDate);
					if (fromD && t < fromD.getTime()) return false;
				}
				if (dateRange.endDate) {
					const toD = parseDateRobustly(dateRange.endDate);
					if (toD && t > toD.getTime()) return false;
				}
			}

			return true;
		});
	}, [tabFilteredItems, searchTerm, globalSearch, selectedAccount, accounts, dateRange, dateType]);

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
	const totalItems = sortedItems.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, totalItems);

	const paginatedItems = useMemo(() => {
		return sortedItems.slice(startIndex, endIndex);
	}, [sortedItems, startIndex, endIndex]);

	// Reset page when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, [searchTerm, selectedAccount, dateRange, dateType, activeTab]);

	// Keep current page valid
	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(Math.max(1, totalPages));
		}
	}, [currentPage, totalPages]);

	// Page number list with ellipsis for pagination
	const getPageNumbers = () => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		const pages = [];
		if (currentPage <= 3) {
			pages.push(1, 2, 3, 4, '...', totalPages);
		} else if (currentPage >= totalPages - 2) {
			pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
		} else {
			pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
		}
		return pages;
	};

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
		<div className="flex flex-col w-full gap-space-lg font-sans">
			{/* Top Header & Page Title */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<span className="material-symbols-outlined text-[24px]">cloud_sync</span>
						</div>
						<div>
							<div className="flex flex-wrap items-center gap-3">
								<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
									DayBook &amp; SFTP Sync
								</h1>
								<span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
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
							<p className="text-[12px] text-slate-500 mt-0.5">
								Real-time automated bank collection ingestion, loan installment tracking, and DayBook reconciliation.
							</p>
						</div>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex items-center gap-space-sm flex-wrap">
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

			{/* Main Card: Controls, Filters & Table Navigation (JointLoan.jsx style) */}
			<div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 flex flex-col gap-5">
				{/* Top Controls: Filter Dropdowns on Left, Search Input on Right */}
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
					{/* Filters on Left */}
					<div className="flex items-center flex-wrap gap-2.5">
						{/* Collection View Tabs (Role toggle style) */}
						<div className="inline-flex items-center p-1 bg-surface-container-low rounded-xl border border-slate-200/80 shadow-2xs">
							<button
								type="button"
								onClick={() => setActiveTab('all')}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${
									activeTab === 'all'
										? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
										: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							>
								<span>All</span>
								<span
									className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
										activeTab === 'all'
											? 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
											: 'bg-slate-200/70 text-slate-600'
									}`}
								>
									{syncedItems.length}
								</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab('today')}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${
									activeTab === 'today'
										? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-200/70'
										: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							>
								<span className="w-2 h-2 rounded-full bg-emerald-500"></span>
								<span>Today</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab('latest')}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${
									activeTab === 'latest'
										? 'bg-white text-blue-700 shadow-xs ring-1 ring-blue-200/70'
										: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							>
								<span className="w-2 h-2 rounded-full bg-blue-500"></span>
								<span>Latest Batch</span>
							</button>
						</div>

						{/* Account Name Filter */}
						<ModernAccountDropdown
							value={selectedAccount}
							onChange={setSelectedAccount}
							options={accountFilterOptions}
						/>

						{/* Date Range Filter */}
						<ModernDateRangeCalendar
							startDate={dateRange.startDate}
							endDate={dateRange.endDate}
							onChange={setDateRange}
							referenceDate={calendarReferenceDate}
						/>

						{/* Date Type Toggle: Received Date vs Due Date */}
						<div className="inline-flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200/80 shadow-2xs">
							<button
								type="button"
								onClick={() => setDateType('received')}
								className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
									dateType === 'received'
										? 'bg-white text-emerald-700 shadow-2xs ring-1 ring-slate-200/70'
										: 'text-slate-500 hover:text-slate-800'
								}`}
								title="Filter date range by DayBook Received Date"
							>
								Recd Date
							</button>
							<button
								type="button"
								onClick={() => setDateType('due')}
								className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
									dateType === 'due'
										? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/70'
										: 'text-slate-500 hover:text-slate-800'
								}`}
								title="Filter date range by Scheduled Due Date"
							>
								Due Date
							</button>
						</div>

						{/* Active filter indicator & Reset All */}
						{(selectedAccount !== 'ALL' || dateRange.startDate || dateRange.endDate || searchTerm || activeTab !== 'all') && (
							<button
								type="button"
								onClick={handleResetFilters}
								className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold transition-all cursor-pointer shadow-2xs"
								title="Reset all filters"
							>
								<span className="material-symbols-outlined text-[15px]">filter_list_off</span>
								<span>Reset All</span>
							</button>
						)}
					</div>

					{/* Search Input on Right */}
					<div className="relative min-w-[200px] sm:w-64">
						<span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
							search
						</span>
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search borrower, ID, amount..."
							className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:bg-white placeholder:text-slate-400 font-medium"
						/>
						{searchTerm && (
							<button
								type="button"
								onClick={() => setSearchTerm('')}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[16px]">close</span>
							</button>
						)}
					</div>
				</div>

				{/* Table Container */}
				<div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
								<th className="py-3 px-4 text-center w-14">#</th>
								<th
									className="py-3 px-4 whitespace-nowrap cursor-pointer hover:text-slate-800 transition-colors select-none"
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
									className="py-3 px-4 whitespace-nowrap cursor-pointer hover:text-slate-800 transition-colors select-none"
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
								<th className="py-3 px-4 whitespace-nowrap">Primary</th>
								<th className="py-3 px-4 text-center whitespace-nowrap">EMI #</th>
								<th
									className="py-3 px-4 whitespace-nowrap cursor-pointer hover:text-slate-800 transition-colors select-none"
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
									className="py-3 px-4 whitespace-nowrap cursor-pointer hover:text-slate-800 transition-colors select-none"
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
									className="py-3 px-4 text-right whitespace-nowrap cursor-pointer hover:text-slate-800 transition-colors select-none"
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
						<tbody className="divide-y divide-slate-100 text-[13px] bg-white">
							{isLoading ? (
								<tr>
									<td colSpan="8" className="py-16 text-center">
										<TableLoader message="Loading DayBook synchronized records..." />
									</td>
								</tr>
							) : filteredItems.length === 0 ? (
								<tr>
									<td colSpan="8" className="py-16 text-center">
										<div className="max-w-sm mx-auto">
											<div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
												<span className="material-symbols-outlined text-[28px]">search_off</span>
											</div>
											<h3 className="text-sm font-bold text-slate-800">
												No synced collections found
											</h3>
											<p className="text-xs text-slate-500 mt-1">
												{selectedAccount !== 'ALL' || dateRange.startDate || dateRange.endDate || searchTerm || activeTab !== 'all'
													? 'No collections match your current filter and search criteria.'
													: 'No DayBook collections have been synced yet. Click "Sync Now" to ingest the latest DayBook.'}
											</p>
											{(selectedAccount !== 'ALL' || dateRange.startDate || dateRange.endDate || searchTerm || activeTab !== 'all') && (
												<button
													type="button"
													onClick={handleResetFilters}
													className="mt-3 text-xs font-bold text-primary hover:underline cursor-pointer"
												>
													Clear filters
												</button>
											)}
										</div>
									</td>
								</tr>
							) : (
								paginatedItems.map((item, idx) => {
									const absoluteIdx = startIndex + idx + 1;
									return (
										<tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
											<td className="py-3 px-4 text-center text-xs font-bold text-slate-500">
												{absoluteIdx}
											</td>
											<td className="py-3 px-4 whitespace-nowrap">
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
													className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-50 text-primary hover:bg-orange-100 hover:text-orange-700 font-mono font-bold text-[11px] transition-colors cursor-pointer border border-orange-200/60"
													title="Open Loan Details"
												>
													<span>{item.loanId}</span>
													<span className="material-symbols-outlined" style={{fontSize: "14px"}}>arrow_outward</span>
												</button>
											</td>
											<td className="py-3 px-4 max-w-[220px]">
												<div
													className="font-bold text-[13px] text-slate-900 uppercase truncate"
													title={item.clientName}
												>
													{item.clientName}
												</div>
											</td>
											<td className="py-3 px-4 whitespace-nowrap">
												<span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
													{item.primaryAccount || '—'}
												</span>
											</td>
											<td className="py-3 px-4 text-center whitespace-nowrap">
												<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70">
													EMI {item.emiNo}
												</span>
											</td>
											<td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-600">
												{item.emiDate || '—'}
											</td>
											<td className="py-3 px-4 whitespace-nowrap">
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
													<span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
													<span>{item.receivedDate}</span>
												</span>
											</td>
											<td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap text-xs sm:text-[13px]">
												₹ {formatIndianCurrency(item.amount)}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>

					{/* Pagination Footer */}
					<div className="border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50/50 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none">
						<div className="flex items-center gap-2 text-slate-500 font-medium text-center sm:text-left">
							<span>
								Showing{' '}
								<span className="font-bold text-slate-900">
									{sortedItems.length === 0 ? 0 : startIndex + 1}
								</span>{' '}
								to <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
								<span className="font-bold text-slate-900">{sortedItems.length}</span> collections
							</span>
							{sortedItems.length !== syncedItems.length && (
								<span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200/70">
									{syncedItems.length} total
								</span>
							)}
						</div>

						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setCurrentPage(1)}
								disabled={currentPage === 1}
								className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
								title="First page"
							>
								<span className="material-symbols-outlined text-[18px]">first_page</span>
							</button>

							<button
								type="button"
								onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
								disabled={currentPage === 1}
								className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
								title="Previous page"
							>
								<span className="material-symbols-outlined text-[18px]">chevron_left</span>
							</button>

							<div className="flex items-center gap-1 mx-0.5">
								{getPageNumbers().map((page, pIdx) => {
									if (page === '...') {
										return (
											<span
												key={`ellipsis-${pIdx}`}
												className="h-8 w-6 flex items-center justify-center text-slate-400 font-bold text-[12px]"
											>
												…
											</span>
										);
									}
									const isCurrent = page === currentPage;
									return (
										<button
											key={page}
											type="button"
											onClick={() => setCurrentPage(page)}
											aria-current={isCurrent ? 'page' : undefined}
											className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-xl text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${
												isCurrent
													? 'bg-primary text-white shadow-xs'
													: 'text-slate-700 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80'
											}`}
										>
											{page}
										</button>
									);
								})}
							</div>

							<button
								type="button"
								onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
								disabled={currentPage >= totalPages}
								className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
								title="Next page"
							>
								<span className="material-symbols-outlined text-[18px]">chevron_right</span>
							</button>

							<button
								type="button"
								onClick={() => setCurrentPage(totalPages)}
								disabled={currentPage >= totalPages}
								className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
								title="Last page"
							>
								<span className="material-symbols-outlined text-[18px]">last_page</span>
							</button>
						</div>
					</div>
				</div>
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
