/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: System settings and user preferences component for security settings, profile updates, and audit logs.
*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';

// Available color presets with styling tokens
export const COLOR_OPTIONS = [
	{ id: 'purple', label: 'Purple', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-300', dot: 'bg-purple-500' },
	{ id: 'blue', label: 'Blue', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-300', dot: 'bg-blue-500' },
	{ id: 'teal', label: 'Teal', bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-300', dot: 'bg-teal-500' },
	{ id: 'emerald', label: 'Emerald', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-300', dot: 'bg-emerald-500' },
	{ id: 'amber', label: 'Amber', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-300', dot: 'bg-amber-500' },
	{ id: 'rose', label: 'Rose', bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-300', dot: 'bg-rose-500' },
	{ id: 'indigo', label: 'Indigo', bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-300', dot: 'bg-indigo-500' },
	{ id: 'cyan', label: 'Cyan', bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-300', dot: 'bg-cyan-500' },
	{ id: 'slate', label: 'Slate', bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-300', dot: 'bg-slate-500' },
];

export const getColorToken = (colorName) => {
	const c = (colorName || 'blue').toLowerCase();
	return COLOR_OPTIONS.find((opt) => opt.id === c) || COLOR_OPTIONS[1];
};

// Modern Custom Dropdown Component for Accounts Filter in Settings
function ModernAccountDropdown({ value = 'ALL', onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const dropdownRef = useRef(null);
	const searchInputRef = useRef(null);

	const selectedOption =
		options.find((o) => o.id === value) ||
		options[0] || { id: 'ALL', label: 'All Accounts' };

	const filteredOptions = useMemo(() => {
		if (!searchTerm.trim()) return options;
		const q = searchTerm.toLowerCase();
		return options.filter((o) => {
			const labelMatch = o.label && o.label.toLowerCase().includes(q);
			const acronymMatch = o.acronym && o.acronym.toLowerCase().includes(q);
			return labelMatch || acronymMatch;
		});
	}, [options, searchTerm]);

	// Close on click outside or Escape
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
				setSearchTerm('');
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsOpen(false);
				setSearchTerm('');
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	// Focus search input when opened
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
		if (isOpen) setSearchTerm('');
	};

	const handleSelect = (id) => {
		onChange(id);
		setIsOpen(false);
		setSearchTerm('');
	};

	const isFiltered = value !== 'ALL';

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			{/* Trigger Button */}
			<button
				type="button"
				onClick={handleToggle}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
					isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: isFiltered
						? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
						: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
				}`}
			>
				{selectedOption.dot ? (
					<span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dot}`} />
				) : (
					<span
						className={`material-symbols-outlined text-[17px] shrink-0 ${
							isFiltered ? 'text-primary' : 'text-slate-500'
						}`}
					>
						account_balance
					</span>
				)}

				<span className="max-w-[130px] sm:max-w-[150px] truncate text-left">
					{selectedOption.label}
				</span>

				{selectedOption.count !== undefined && (
					<span
						className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
							isFiltered
								? 'bg-primary text-white'
								: 'bg-slate-200/90 text-slate-700'
						}`}
					>
						{selectedOption.count}
					</span>
				)}

				{isFiltered && (
					<span
						role="button"
						tabIndex={0}
						onClick={(e) => {
							e.stopPropagation();
							onChange('ALL');
							setSearchTerm('');
						}}
						title="Clear account filter"
						className="p-0.5 hover:bg-primary/15 rounded text-primary/70 hover:text-primary transition-colors cursor-pointer"
					>
						<span className="material-symbols-outlined text-[14px]">close</span>
					</span>
				)}

				<span
					className={`material-symbols-outlined text-[17px] text-slate-400 transition-transform duration-200 shrink-0 ${
						isOpen ? 'rotate-180 text-primary' : ''
					}`}
				>
					expand_more
				</span>
			</button>

			{/* Dropdown Menu Popover */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100"
				>
					{/* Header */}
					<div className="flex items-center justify-between px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
						<span className="flex items-center gap-1.5">
							<span className="material-symbols-outlined text-[14px]">filter_list</span>
							Filter by Account
						</span>
						{isFiltered && (
							<button
								type="button"
								onClick={() => handleSelect('ALL')}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					{/* Options List */}
					<div className="overflow-y-auto flex flex-col gap-0.5 p-0.5 max-h-56">
						{filteredOptions.length > 0 ? (
							filteredOptions.map((opt) => {
								const isSelected = opt.id === value;
								return (
									<button
										key={opt.id}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => handleSelect(opt.id)}
										className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group text-left ${
											isSelected
												? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
												: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
										}`}
									>
										<div className="flex items-center gap-2 min-w-0 pr-2">
											<span className="truncate">{opt.label}</span>
											{opt.acronym && opt.id !== 'ALL' && opt.acronym.toLowerCase() !== opt.label.toLowerCase() && (
												<span className="text-[10px] font-bold text-slate-400 shrink-0">
													({opt.acronym})
												</span>
											)}
										</div>

										<div className="flex items-center gap-1.5 shrink-0">
											{opt.count !== undefined && (
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
														isSelected
															? 'bg-primary text-white'
															: opt.count > 0
															? 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
															: 'bg-slate-50 text-slate-400'
													}`}
												>
													{opt.count}
												</span>
											)}
											{isSelected && (
												<span className="material-symbols-outlined text-[16px] text-primary">
													check
												</span>
											)}
										</div>
									</button>
								);
							})
						) : (
							<div className="px-3 py-4 text-center text-slate-400 text-xs">
								No accounts found
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default function Settings({ searchQuery: initialSearch = '' }) {
	const [accounts, setAccounts] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState(initialSearch);
	const [accountFilter, setAccountFilter] = useState('ALL');
	const [typeFilter, setTypeFilter] = useState('ALL');
	const [approvalFilter, setApprovalFilter] = useState('ALL'); // 'ALL' | 'REQUIRED' | 'NOT_REQUIRED'
	const [isApprovalDropdownOpen, setIsApprovalDropdownOpen] = useState(false);
	const approvalDropdownRef = useRef(null);

	// Pagination State
	const [currentPage, setCurrentPage] = useState(1);
	const pageSize = 10;

	// Close approval filter dropdown on outside click
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (approvalDropdownRef.current && !approvalDropdownRef.current.contains(e.target)) {
				setIsApprovalDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Modal State
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingAccount, setEditingAccount] = useState(null); // null = new, object = edit
	const [formData, setFormData] = useState({
		name: '',
		acronym: '',
		color: 'blue',
		type: 'jl_report',
		is_need_approval: true,
	});
	const [modalError, setModalError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Delete confirmation modal state
	const [deletingAccount, setDeletingAccount] = useState(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Toast / Feedback State
	const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }

	const showToast = (message, type = 'success') => {
		setToast({ message, type });
		setTimeout(() => setToast(null), 3500);
	};

	// Fetch account names from PostgreSQL
	const loadAccounts = async () => {
		setIsLoading(true);
		try {
			const data = await api.getAccountNames();
			if (Array.isArray(data)) {
				setAccounts(data);
			}
		} catch (err) {
			console.error('Failed to load account names:', err);
			showToast('Failed to load account names from database', 'error');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadAccounts();
		document.body.style.overflow = '';
		return () => {
			document.body.style.overflow = '';
		};
	}, []);

	// Lock background body scrolling when modals are open and always release on close
	useEffect(() => {
		if (isModalOpen || deletingAccount) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		} else {
			document.body.style.overflow = '';
		}
	}, [isModalOpen, deletingAccount]);

	const handleNameChange = (val) => {
		setFormData((prev) => ({ ...prev, name: val }));
	};

	// Open Create Modal
	const handleOpenCreate = () => {
		setEditingAccount(null);
		setFormData({
			name: '',
			acronym: '',
			color: 'blue',
			type: 'jl_report',
			is_need_approval: true,
		});
		setModalError('');
		setIsModalOpen(true);
	};

	// Open Edit Modal
	const handleOpenEdit = (acc) => {
		setEditingAccount(acc);
		setFormData({
			name: acc.name,
			acronym: acc.acronym,
			color: acc.color || 'blue',
			type: acc.type || 'jl_report',
			is_need_approval: acc.is_need_approval !== false,
		});
		setModalError('');
		setIsModalOpen(true);
	};

	// Save or Update Account Name
	const handleSubmit = async (e) => {
		e.preventDefault();
		const trimmedName = formData.name.trim();
		const trimmedAcronym = formData.acronym.trim().toUpperCase();

		if (!trimmedName) {
			setModalError('Account name is required.');
			return;
		}
		if (!trimmedAcronym) {
			setModalError('Acronym is required.');
			return;
		}

		setIsSubmitting(true);
		setModalError('');

		try {
			if (editingAccount) {
				const res = await api.updateAccountName(editingAccount.id, {
					...formData,
					name: trimmedName,
					acronym: trimmedAcronym,
				});
				if (res.account) {
					setAccounts((prev) =>
						prev.map((a) => (a.id === editingAccount.id ? res.account : a))
					);
					showToast(`Account '${res.account.name}' updated successfully!`);
					setIsModalOpen(false);
				}
			} else {
				const res = await api.createAccountName({
					...formData,
					name: trimmedName,
					acronym: trimmedAcronym,
				});
				if (res.account) {
					setAccounts((prev) => [...prev, res.account]);
					showToast(`Account '${res.account.name}' created successfully!`);
					setIsModalOpen(false);
				}
			}
		} catch (err) {
			setModalError(err.message || 'Operation failed. Please verify input.');
		} finally {
			setIsSubmitting(false);
		}
	};

	// Delete Account Name
	const handleConfirmDelete = async () => {
		if (!deletingAccount) return;
		setIsDeleting(true);
		try {
			await api.deleteAccountName(deletingAccount.id);
			setAccounts((prev) => prev.filter((a) => a.id !== deletingAccount.id));
			showToast(`Account '${deletingAccount.name}' deleted successfully!`);
			setDeletingAccount(null);
		} catch (err) {
			showToast(err.message || 'Failed to delete account', 'error');
		} finally {
			setIsDeleting(false);
		}
	};

	// Filter accounts
	const filteredAccounts = useMemo(() => {
		return accounts.filter((acc) => {
			const query = searchQuery.toLowerCase().trim();
			const matchesQuery =
				!query ||
				(acc.name && acc.name.toLowerCase().includes(query)) ||
				(acc.acronym && acc.acronym.toLowerCase().includes(query));

			const matchesType =
				typeFilter === 'ALL' || acc.type === typeFilter;

			const matchesApproval =
				approvalFilter === 'ALL' ||
				(approvalFilter === 'REQUIRED' && acc.is_need_approval) ||
				(approvalFilter === 'NOT_REQUIRED' && !acc.is_need_approval);

			const matchesAccount =
				accountFilter === 'ALL' ||
				(acc.name && acc.name.toLowerCase() === accountFilter.toLowerCase()) ||
				String(acc.id) === String(accountFilter);

			return matchesQuery && matchesType && matchesApproval && matchesAccount;
		});
	}, [accounts, searchQuery, typeFilter, approvalFilter, accountFilter]);

	// Dynamic account name filter options
	const accountFilterOptions = useMemo(() => {
		const opts = [
			{ id: 'ALL', label: 'All Accounts', acronym: '', count: accounts.length, dot: null }
		];
		const sorted = [...accounts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
		sorted.forEach((acc) => {
			const token = getColorToken(acc.color);
			opts.push({
				id: acc.name,
				label: acc.name,
				acronym: acc.acronym || '',
				dot: token.dot || 'bg-slate-400',
			});
		});
		return opts;
	}, [accounts]);

	// Counts for approval filter
	const approvalCounts = useMemo(() => {
		const all = accounts.length;
		const required = accounts.filter((a) => a.is_need_approval).length;
		const notRequired = accounts.filter((a) => !a.is_need_approval).length;
		return { ALL: all, REQUIRED: required, NOT_REQUIRED: notRequired };
	}, [accounts]);

	// Reset to page 1 on search or filter change
	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, approvalFilter, accountFilter]);

	// Pagination calculations
	const totalItems = filteredAccounts.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, totalItems);

	const paginatedAccounts = useMemo(() => {
		return filteredAccounts.slice(startIndex, endIndex);
	}, [filteredAccounts, startIndex, endIndex]);

	const getPageNumbers = () => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		if (currentPage <= 3) {
			return [1, 2, 3, 4, '...', totalPages];
		}
		if (currentPage >= totalPages - 2) {
			return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
		}
		return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
	};

	// Metrics
	const stats = useMemo(() => {
		const total = accounts.length;
		const jlCount = accounts.filter((a) => a.type === 'jl_report').length;
		const shortCount = accounts.filter((a) => a.type === 'short_loan').length;
		const approvalCount = accounts.filter((a) => a.is_need_approval).length;
		return { total, jlCount, shortCount, approvalCount };
	}, [accounts]);

	const selectedColorToken = useMemo(() => getColorToken(formData.color), [formData.color]);

	return (
		<div className="w-full space-y-6">
			{/* Toast Notification */}
			{toast && (
				<div
					className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-[13px] font-bold animate-in fade-in slide-in-from-bottom-3 duration-200 ${
						toast.type === 'error'
							? 'bg-rose-50 text-rose-800 border-rose-200'
							: 'bg-emerald-50 text-emerald-800 border-emerald-200'
					}`}
				>
					<span className="material-symbols-outlined text-[18px]">
						{toast.type === 'error' ? 'error' : 'check_circle'}
					</span>
					<span>{toast.message}</span>
					<button
						onClick={() => setToast(null)}
						className="ml-2 text-slate-400 hover:text-slate-600 p-0.5"
					>
						<span className="material-symbols-outlined text-[16px]">close</span>
					</button>
				</div>
			)}

			{/* Top Header & Page Title */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<span className="material-symbols-outlined text-[24px]">tune</span>
						</div>
						<div>
							<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Settings &amp; Entities
							</h1>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Configure organization co-lending partner accounts, acronyms, and approval workflows
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<button
						onClick={handleOpenCreate}
						className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary-container hover:bg-primary text-on-primary font-bold text-[13.5px] shadow-sm hover:shadow active:scale-98 transition-all shrink-0"
					>
						<span className="material-symbols-outlined text-[19px]">add</span>
						<span>Add Account Name</span>
					</button>
				</div>
			</div>
					{/* Stat Highlights Row */}
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
						<div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
							<div className="flex items-center justify-between text-slate-500 text-[12px] font-semibold">
								<span>Total Entities</span>
								<span className="material-symbols-outlined text-primary text-[20px]">corporate_fare</span>
							</div>
							<div className="mt-2 text-[26px] font-extrabold text-slate-900 tracking-tight">
								{stats.total}
							</div>
							<div className="text-[11px] text-slate-400 mt-0.5">Stored in PostgreSQL</div>
						</div>

						<div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
							<div className="flex items-center justify-between text-slate-500 text-[12px] font-semibold">
								<span>JL Reports</span>
								<span className="material-symbols-outlined text-purple-600 text-[20px]">handshake</span>
							</div>
							<div className="mt-2 text-[26px] font-extrabold text-slate-900 tracking-tight">
								{stats.jlCount}
							</div>
							<div className="text-[11px] text-slate-400 mt-0.5">Active co-lenders</div>
						</div>

						<div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
							<div className="flex items-center justify-between text-slate-500 text-[12px] font-semibold">
								<span>Short Loans</span>
								<span className="material-symbols-outlined text-teal-600 text-[20px]">payments</span>
							</div>
							<div className="mt-2 text-[26px] font-extrabold text-slate-900 tracking-tight">
								{stats.shortCount}
							</div>
							<div className="text-[11px] text-slate-400 mt-0.5">Credit line partners</div>
						</div>

						<div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
							<div className="flex items-center justify-between text-slate-500 text-[12px] font-semibold">
								<span>Approval Req.</span>
								<span className="material-symbols-outlined text-amber-600 text-[20px]">verified</span>
							</div>
							<div className="mt-2 text-[26px] font-extrabold text-slate-900 tracking-tight">
								{stats.approvalCount}
							</div>
							<div className="text-[11px] text-slate-400 mt-0.5">Mandatory secondary check</div>
						</div>
					</div>

					{/* Main Card: Controls, Filters & Accounts Table (Requests.jsx style) */}
					<div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 flex flex-col gap-5">
						{/* Top Controls: Filter Dropdowns on Left, Search Input on Right */}
						<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
							{/* Filter Dropdowns on Left */}
							<div className="flex items-center flex-wrap gap-2.5">
								{/* Modern Account Name Filter Dropdown */}
								<ModernAccountDropdown
									value={accountFilter}
									onChange={setAccountFilter}
									options={accountFilterOptions}
								/>

								{/* Modern Approval Filter Dropdown */}
								<div className="relative" ref={approvalDropdownRef}>
									<button
										type="button"
										onClick={() => setIsApprovalDropdownOpen((prev) => !prev)}
										className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
											isApprovalDropdownOpen
												? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
												: approvalFilter !== 'ALL'
												? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
												: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
										}`}
									>
										<span className="material-symbols-outlined text-[17px] text-slate-500">
											verified
										</span>
										<span className="text-slate-500 font-medium">Approval:</span>
										<span className="font-bold flex items-center gap-1.5 text-slate-800">
											{approvalFilter === 'REQUIRED' && (
												<span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
											)}
											{approvalFilter === 'NOT_REQUIRED' && (
												<span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
											)}
											{approvalFilter === 'ALL'
												? 'All'
												: approvalFilter === 'REQUIRED'
												? 'Required'
												: 'Not Required'}
										</span>
										{approvalFilter !== 'ALL' && (
											<span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-primary text-white">
												{approvalCounts[approvalFilter]}
											</span>
										)}
										<span
											className={`material-symbols-outlined text-[17px] text-slate-400 transition-transform duration-200 shrink-0 ${
												isApprovalDropdownOpen ? 'rotate-180 text-primary' : ''
											}`}
										>
											expand_more
										</span>
									</button>

									{/* Floating Dropdown Popover */}
									{isApprovalDropdownOpen && (
										<div className="absolute left-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
											<div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
												Filter by Approval
											</div>
											{[
												{ id: 'ALL', label: 'All', dot: null, count: approvalCounts.ALL },
												{ id: 'REQUIRED', label: 'Required', dot: 'bg-emerald-500', count: approvalCounts.REQUIRED },
												{ id: 'NOT_REQUIRED', label: 'Not Required', dot: 'bg-slate-400', count: approvalCounts.NOT_REQUIRED },
											].map((opt) => {
												const isSelected = approvalFilter === opt.id;
												return (
													<button
														key={opt.id}
														type="button"
														onClick={() => {
															setApprovalFilter(opt.id);
															setIsApprovalDropdownOpen(false);
														}}
														className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
															isSelected
																? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
																: 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
														}`}
													>
														<div className="flex items-center gap-2">
															{opt.dot ? (
																<span className={`w-2 h-2 rounded-full ${opt.dot}`} />
															) : (
																<span className="material-symbols-outlined text-[15px] text-slate-400">
																	apps
																</span>
															)}
															<span>{opt.label}</span>
														</div>
														<div className="flex items-center gap-1.5">
															<span
																className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
																	isSelected
																		? 'bg-primary text-white'
																		: 'bg-slate-100 text-slate-600'
																}`}
															>
																{opt.count}
															</span>
															{isSelected && (
																<span
																	className="material-symbols-outlined text-primary text-[16px]"
																	style={{ fontFamily: 'Material Symbols Outlined' }}
																>
																	check
																</span>
															)}
														</div>
													</button>
												);
											})}
										</div>
									)}
								</div>

								{/* Reset button */}
								{(accountFilter !== 'ALL' || approvalFilter !== 'ALL' || searchQuery) && (
									<button
										type="button"
										onClick={() => {
											setAccountFilter('ALL');
											setApprovalFilter('ALL');
											setSearchQuery('');
										}}
										className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold transition-all cursor-pointer shadow-2xs"
										title="Reset all filters"
									>
										<span className="material-symbols-outlined text-[15px]">filter_list_off</span>
										<span>Reset All</span>
									</button>
								)}
							</div>

							{/* Search Input on Right */}
							<div className="relative min-w-[200px] sm:w-72">
								<span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
									search
								</span>
								<input
									type="text"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Search account name or acronym..."
									className="w-full h-9 pl-8 pr-8 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:bg-white placeholder:text-slate-400 font-medium"
								/>
								{searchQuery && (
									<button
										type="button"
										onClick={() => setSearchQuery('')}
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
										<th className="py-3 px-4 text-center w-14 whitespace-nowrap">S.No</th>
										<th className="py-3 px-4 whitespace-nowrap">Account Name</th>
										<th className="py-3 px-4 whitespace-nowrap">Acronym</th>
										<th className="py-3 px-4 whitespace-nowrap">Approval</th>
										<th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 text-[13px] bg-white">
									{isLoading ? (
										<tr>
											<td colSpan="5" className="py-16 text-center">
												<div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
												<p className="text-xs font-bold text-slate-500">Loading account names from database...</p>
											</td>
										</tr>
									) : filteredAccounts.length === 0 ? (
										<tr>
											<td colSpan="5" className="py-16 text-center">
												<div className="max-w-sm mx-auto">
													<div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
														<span className="material-symbols-outlined text-[28px]">search_off</span>
													</div>
													<h3 className="text-sm font-bold text-slate-800">No account names match your criteria</h3>
													<p className="text-xs text-slate-500 mt-1">
														Try adjusting your search terms or filters, or add a new co-lending partner account.
													</p>
													<div className="mt-4 flex items-center justify-center gap-2.5">
														{(accountFilter !== 'ALL' || approvalFilter !== 'ALL' || searchQuery) && (
															<button
																type="button"
																onClick={() => {
																	setAccountFilter('ALL');
																	setApprovalFilter('ALL');
																	setSearchQuery('');
																}}
																className="text-xs font-bold text-primary hover:underline cursor-pointer"
															>
																Clear filters
															</button>
														)}
														<button
															type="button"
															onClick={handleOpenCreate}
															className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 transition-all cursor-pointer"
														>
															<span className="material-symbols-outlined text-[15px]">add</span>
															<span>Create New Account</span>
														</button>
													</div>
												</div>
											</td>
										</tr>
									) : (
										paginatedAccounts.map((acc, index) => {
											const colorToken = getColorToken(acc.color);
											return (
												<tr
													key={acc.id}
													className="hover:bg-slate-50 transition-colors group cursor-pointer"
												>
													<td className="py-3 px-4 text-center font-bold text-xs text-slate-500">
														{startIndex + index + 1}
													</td>

													{/* Account Name */}
													<td className="py-3 px-4">
														<div className="font-bold text-slate-900 group-hover:text-primary transition-colors leading-tight">
															{acc.name}
														</div>
													</td>

													{/* Acronym Tag */}
													<td className="py-3 px-4 whitespace-nowrap">
														<span
															className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-extrabold ring-1 ${colorToken.bg} ${colorToken.text} ${colorToken.ring}`}
														>
															{acc.acronym}
														</span>
													</td>

													{/* Approval Workflow */}
													<td className="py-3 px-4 whitespace-nowrap">
														{acc.is_need_approval ? (
															<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300">
																<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
																Required
															</span>
														) : (
															<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-300">
																<span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
																Not Required
															</span>
														)}
													</td>

													{/* Actions */}
													<td className="py-3 px-4 text-right whitespace-nowrap">
														<div className="flex items-center justify-end gap-1">
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	handleOpenEdit(acc);
																}}
																title="Edit Account"
																className="p-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
															>
																<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
															</button>
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	setDeletingAccount(acc);
																}}
																title="Delete Account"
																className="p-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
															>
																<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
															</button>
														</div>
													</td>
												</tr>
											);
										})
									)}
								</tbody>
							</table>

							{/* Pagination Footer */}
							<div className="border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50/50 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none">
								{/* Left: Summary Count */}
								<div className="flex items-center gap-2 text-slate-500 font-medium text-center sm:text-left">
									<span>
										Showing{' '}
										<span className="font-bold text-slate-900">
											{totalItems === 0 ? 0 : startIndex + 1}
										</span>{' '}
										to <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
										<span className="font-bold text-slate-900">{totalItems}</span> accounts
									</span>
									{totalItems !== accounts.length && (
										<span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200/70">
											{accounts.length} total
										</span>
									)}
								</div>

								{/* Right: Page Navigation Buttons */}
								<div className="flex items-center gap-1">
									{/* First Page */}
									<button
										type="button"
										onClick={() => setCurrentPage(1)}
										disabled={currentPage === 1}
										className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
										title="First page"
										aria-label="First page"
									>
										<span className="material-symbols-outlined text-[18px]">first_page</span>
									</button>

									{/* Previous Page */}
									<button
										type="button"
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1}
										className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
										title="Previous page"
										aria-label="Previous page"
									>
										<span className="material-symbols-outlined text-[18px]">chevron_left</span>
									</button>

									{/* Numeric Page Buttons */}
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
													aria-label={`Page ${page}`}
													aria-current={isCurrent ? 'page' : undefined}
													className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-xl text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${
														isCurrent
															? 'bg-primary text-white shadow-xs'
															: 'text-slate-700 hover:text-slate-900 hover:bg-white'
													}`}
												>
													{page}
												</button>
											);
										})}
									</div>

									{/* Next Page */}
									<button
										type="button"
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage === totalPages || totalItems === 0}
										className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
										title="Next page"
										aria-label="Next page"
									>
										<span className="material-symbols-outlined text-[18px]">chevron_right</span>
									</button>

									{/* Last Page */}
									<button
										type="button"
										onClick={() => setCurrentPage(totalPages)}
										disabled={currentPage === totalPages || totalItems === 0}
										className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
										title="Last page"
										aria-label="Last page"
									>
										<span className="material-symbols-outlined text-[18px]">last_page</span>
									</button>
								</div>
							</div>
						</div>
					</div>

			{/* Create / Edit Account Modal (Portaled to document.body to cover fixed header & sidebar with no top gap) */}
			{isModalOpen && createPortal(
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
					<div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
						{/* Modal Header (Pinned) */}
						<div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-white shrink-0">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20 shrink-0">
									<span className="material-symbols-outlined text-[22px]">
										{editingAccount ? 'edit_note' : 'add_business'}
									</span>
								</div>
								<div>
									<h3 className="font-extrabold text-[16.5px] text-slate-900 tracking-tight">
										{editingAccount ? 'Edit Account Name' : 'Create New Account Name'}
									</h3>
									<p className="text-[11px] text-slate-400 font-medium">
										Configure co-lending partner identity, acronym code, and rules.
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setIsModalOpen(false)}
								className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
							>
								<span className="material-symbols-outlined" style={{fontSize: '18px'}}>close</span>
							</button>
						</div>

						{/* Form with Scrollable Content Body and Pinned Footer */}
						<form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
							<div className="p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
								{modalError && (
									<div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[12px] font-semibold flex items-center gap-2">
										<span className="material-symbols-outlined text-[16px]">error</span>
										<span>{modalError}</span>
									</div>
								)}

								{/* Account Name & Acronym Inputs */}
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<div className="sm:col-span-2">
										<label className="block text-[11.5px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
											Account Full Name <span className="text-rose-500">*</span>
										</label>
										<div className="relative flex items-center">
											<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize: '18px'}}>
												account_balance
											</span>
											<input
												type="text"
												required
												value={formData.name}
												onChange={(e) => handleNameChange(e.target.value)}
												placeholder="e.g. Surge Capital Solutions"
												className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[12px] bg-slate-50 border border-slate-200/90 focus:bg-white focus:border-[#ff5c00] focus:ring-0 focus:outline-none outline-none transition-all text-slate-900 font-semibold placeholder:text-slate-400"
											/>
										</div>
									</div>

									<div>
										<div className="flex items-center justify-between mb-1.5">
											<label className="block text-[11.5px] font-bold text-slate-700 uppercase tracking-wider">
												Acronym <span className="text-rose-500">*</span>
											</label>
											<span className="text-[11px] text-slate-400 font-medium">Max 6 letters</span>
										</div>
										<div className="relative">
											<input
												type="text"
												required
												maxLength={6}
												value={formData.acronym}
												onChange={(e) =>
													setFormData({ ...formData, acronym: e.target.value.toUpperCase() })
												}
												placeholder="SCS"
												className="w-full px-3 py-2.5 rounded-xl text-[12px] font-mono font-extrabold uppercase bg-slate-50 border border-slate-200/90 focus:bg-white focus:border-[#ff5c00] focus:ring-0 focus:outline-none outline-none transition-all text-slate-900 placeholder:text-slate-400 tracking-wider"
											/>
										</div>
									</div>
								</div>

								{/* Approval Workflow Switch */}
								<div>
									<div
										onClick={() => setFormData({ ...formData, is_need_approval: !formData.is_need_approval })}
										className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
									>
										<div className="flex items-center gap-3">
											<div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
												formData.is_need_approval ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
											}`}>
												<span className="material-symbols-outlined text-[20px]">
													{formData.is_need_approval ? 'verified_user' : 'lock_open'}
												</span>
											</div>
											<div>
												<div className="text-[12.5px] font-bold text-slate-800 flex items-center gap-2">
													<span>Require Secondary Verification</span>
													{formData.is_need_approval ? (
														<span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
															Active
														</span>
													) : (
														<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
															Bypassed
														</span>
													)}
												</div>
												<div className="text-[11px] text-slate-500">
													Secondary managers must formally review and verify loan disbursements
												</div>
											</div>
										</div>

										{/* iOS Style Animated Toggle Switch */}
										<div
											className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ${
												formData.is_need_approval ? 'bg-emerald-500' : 'bg-slate-300'
											}`}
										>
											<div
												className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
													formData.is_need_approval ? 'translate-x-5' : 'translate-x-0'
												}`}
											/>
										</div>
									</div>
								</div>
							</div>

							{/* Pinned Modal Actions Footer */}
							<div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end shrink-0">
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setIsModalOpen(false)}
										disabled={isSubmitting}
										className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
									>
										Cancel
									</button>
									<button
										type="submit"
										disabled={isSubmitting}
										className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-[13px] font-bold shadow-sm hover:shadow active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
									>
										{isSubmitting ? (
											<span className="material-symbols-outlined text-[16px] animate-spin">
												progress_activity
											</span>
										) : (
											<span className="material-symbols-outlined text-[18px]">
												{editingAccount ? 'save' : 'add'}
											</span>
										)}
										<span>{editingAccount ? 'Save Changes' : 'Create Account'}</span>
									</button>
								</div>
							</div>
						</form>
					</div>
				</div>,
				document.body
			)}

			{/* Delete Confirmation Modal (Portaled to document.body) */}
			{deletingAccount && createPortal(
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
					<div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
						<div className="flex items-center gap-2">
							<div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
								<span className="material-symbols-outlined text-[28px]">warning</span>
							</div>
							<h3 className="text-slate-900 text-[20px] font-extrabold">Delete Account Name?</h3>	
						</div>
						<div>
							<p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
								Are you sure you want to delete{' '}
								<strong className="text-slate-800 font-bold">{deletingAccount.name}</strong> (
								{deletingAccount.acronym})? This entity will no longer be available for new loan facilities.
							</p>
						</div>
						<div className="pt-2 flex items-center justify-end gap-2.5">
							<button
								type="button"
								onClick={() => setDeletingAccount(null)}
								disabled={isDeleting}
								className="px-4 py-2 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmDelete}
								disabled={isDeleting}
								className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-bold shadow-xs active:scale-98 transition-all disabled:opacity-50"
							>
								{isDeleting && (
									<span className="material-symbols-outlined text-[15px] animate-spin">
										progress_activity
									</span>
								)}
								<span>Confirm</span>
							</button>
						</div>
					</div>
				</div>,
				document.body
			)}

		</div>
	);
}
