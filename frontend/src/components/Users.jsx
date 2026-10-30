/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: User administration component for managing user accounts, credential assignments, and permission roles.
*/

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { TableLoader } from './common/LottieLoader';
import { doesLoanMatchPrimaryAccount, doesLoanMatchSecondaryAccount, formatIndianCurrency } from '../utils/jointLoanUtils';

// Available System Menus for granular assignment
export const AVAILABLE_MENUS = [
	{ id: 'dashboard', label: 'Dashboard', icon: 'widgets' },
	{ id: 'joint-loan', label: 'Joint Loan', icon: 'handshake' },
	{ id: 'short-loan', label: 'Short Loan', icon: 'payments' },
	{ id: 'matchup', label: 'Matchup', icon: 'compare_arrows' },
	{ id: 'sync', label: 'Sync', icon: 'cloud_sync' },
	{ id: 'requests', label: 'Requests', icon: 'pending_actions' },
	{ id: 'users', label: 'Users', icon: 'group' },
	{ id: 'settings', label: 'Settings', icon: 'settings' },
];

// Role styling helper matching JointLoan status badges
export const getUserRoleBadge = (role) => {
	switch ((role || 'user').toLowerCase()) {
		case 'super admin':
			return {
				label: 'Super Admin',
				color: 'bg-purple-50 text-purple-700 ring-purple-300',
				dot: 'bg-purple-500',
				icon: 'shield_person',
				avatarGradient: 'from-purple-600 to-indigo-700',
			};
		case 'admin':
			return {
				label: 'Administrator',
				color: 'bg-purple-50 text-purple-700 ring-purple-300',
				dot: 'bg-purple-500',
				icon: 'shield_person',
				avatarGradient: 'from-purple-600 to-indigo-600',
			};
		case 'manager':
			return {
				label: 'Manager',
				color: 'bg-amber-50 text-amber-700 ring-amber-300',
				dot: 'bg-amber-500',
				icon: 'supervisor_account',
				avatarGradient: 'from-amber-500 to-orange-600',
			};
		case 'user':
		default:
			return {
				label: 'User',
				color: 'bg-blue-50 text-blue-700 ring-blue-300',
				dot: 'bg-blue-500',
				icon: 'person',
				avatarGradient: 'from-sky-500 to-blue-600',
			};
	}
};

// Status styling helper matching JointLoan/Accounts design system
export const getUserStatusBadge = (status) => {
	const norm = (status || 'active').toLowerCase();
	if (norm === 'inactive') {
		return {
			label: 'Inactive',
			icon: 'cancel',
			color: 'bg-slate-100 text-slate-700 ring-slate-300',
			dot: 'bg-slate-400',
			border: 'border-slate-300',
		};
	}
	return {
		label: 'Active',
		icon: 'check_circle',
		color: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
		dot: 'bg-emerald-500',
		border: 'border-emerald-200',
	};
};


// Color map for DB account colors matching Settings presets
export const ACCOUNT_COLOR_MAP = {
	purple: 'bg-purple-50 text-purple-700 ring-purple-300',
	blue: 'bg-blue-50 text-blue-700 ring-blue-300',
	teal: 'bg-teal-50 text-teal-700 ring-teal-300',
	emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
	amber: 'bg-amber-50 text-amber-700 ring-amber-300',
	rose: 'bg-rose-50 text-rose-700 ring-rose-300',
	indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-300',
	cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-300',
	slate: 'bg-slate-100 text-slate-700 ring-slate-300',
};

// Tag color helper using DB color if provided, with standard fallbacks
export const getEntityTagColor = (acronym, colorName) => {
	if (colorName && ACCOUNT_COLOR_MAP[colorName.toLowerCase()]) {
		return ACCOUNT_COLOR_MAP[colorName.toLowerCase()];
	}
	const acr = (acronym || '').toUpperCase();
	switch (acr) {
		case 'SCS':
			return 'bg-purple-50 text-purple-700 ring-purple-300';
		case 'FC':
			return 'bg-teal-50 text-teal-700 ring-teal-300';
		case 'SS':
			return 'bg-sky-50 text-sky-700 ring-sky-300';
		case 'AS':
			return 'bg-blue-50 text-blue-700 ring-blue-300';
		case 'SCE':
			return 'bg-amber-50 text-amber-700 ring-amber-300';
		case 'JC':
			return 'bg-rose-50 text-rose-700 ring-rose-300';
		default:
			return 'bg-slate-100 text-slate-700 ring-slate-300';
	}
};

// Get initials from user full name or employee code
export const getUserInitials = (name, code) => {
	if (name) {
		const parts = name.trim().split(/\s+/);
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return parts[0].slice(0, 2).toUpperCase();
	}
	if (code) return code.slice(0, 2).toUpperCase();
	return 'U';
};

// Modern Role Dropdown matching ModernStatusDropdown in JointLoan.jsx
function ModernRoleDropdown({ value, onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const selectedOption =
		options.find((opt) => opt.id === value) ||
		options[0] || {
			id: 'ALL',
			label: 'All Roles',
			dot: 'bg-primary',
		};

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
					isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: value !== 'ALL'
						? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
						: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
				}`}
			>
				<span className="flex items-center gap-1.5 font-bold text-slate-800">
					<span
						className={`w-2 h-2 rounded-full shrink-0 ${
							selectedOption.dot || 'bg-slate-400'
						}`}
					/>
					<span>{selectedOption.label}</span>
				</span>

				{selectedOption.count !== undefined && (
					<span
						className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
							value !== 'ALL'
								? 'bg-primary text-white'
								: 'bg-slate-200/90 text-slate-700'
						}`}
					>
						{selectedOption.count}
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

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-56 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
					<div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
						<span>Filter By Role</span>
						{value !== 'ALL' && (
							<button
								type="button"
								onClick={() => {
									onChange('ALL');
									setIsOpen(false);
								}}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					<div className="flex flex-col gap-0.5 mt-0.5">
						{options.map((opt) => {
							const isSelected = opt.id === value;
							return (
								<button
									key={opt.id}
									type="button"
									onClick={() => {
										onChange(opt.id);
										setIsOpen(false);
									}}
									className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer group ${isSelected
										? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
										: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-[0.98]'
										}`}
								>
									<div className="flex items-center gap-2.5">
										<span
											className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot || 'bg-slate-400'
												}`}
										/>
										<span>{opt.label}</span>
									</div>

									<div className="flex items-center gap-2">
										{opt.count !== undefined && (
											<span
												className={`text-[11px] px-2 py-0.5 rounded-full font-extrabold ${isSelected
													? 'bg-primary text-white'
													: 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
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
						})}
					</div>
				</div>
			)}
		</div>
	);
}

// Modern Status Dropdown matching ModernRoleDropdown and ModernStatusDropdown in JointLoan
function ModernStatusDropdown({ value, onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const selectedOption =
		options.find((opt) => opt.id === value) ||
		options[0] || {
			id: 'ALL',
			label: 'All Statuses',
			dot: 'bg-primary',
		};

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
					isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: value !== 'ALL'
						? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
						: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
				}`}
			>
				<span className="flex items-center gap-1.5 font-bold text-slate-800">
					<span
						className={`w-2 h-2 rounded-full shrink-0 ${
							selectedOption.dot || 'bg-slate-400'
						}`}
					/>
					<span>{selectedOption.label}</span>
				</span>

				{selectedOption.count !== undefined && (
					<span
						className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
							value !== 'ALL'
								? 'bg-primary text-white'
								: 'bg-slate-200/90 text-slate-700'
						}`}
					>
						{selectedOption.count}
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

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-48 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
					<div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
						<span>Filter By Status</span>
						{value !== 'ALL' && (
							<button
								type="button"
								onClick={() => {
									onChange('ALL');
									setIsOpen(false);
								}}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					<div className="flex flex-col gap-0.5 mt-0.5">
						{options.map((opt) => {
							const isSelected = opt.id === value;
							return (
								<button
									key={opt.id}
									type="button"
									onClick={() => {
										onChange(opt.id);
										setIsOpen(false);
									}}
									className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer group ${
										isSelected
											? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
											: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-[0.98]'
									}`}
								>
									<div className="flex items-center gap-2.5">
										<span
											className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
												opt.dot || 'bg-slate-400'
											}`}
										/>
										<span>{opt.label}</span>
									</div>

									<div className="flex items-center gap-2">
										{opt.count !== undefined && (
											<span
												className={`text-[11px] px-2 py-0.5 rounded-full font-extrabold ${
													isSelected
														? 'bg-primary text-white'
														: 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
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
						})}
					</div>
				</div>
			)}
		</div>
	);
}

// Modern Menu Access Dropdown matching JointLoan filter styling
function ModernMenuDropdown({ value, onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const selectedOption =
		options.find((opt) => opt.id === value) ||
		options[0] || {
			id: 'ALL',
			label: 'All Menus',
		};

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
					isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: value !== 'ALL'
						? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
						: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
				}`}
			>
				<span className="flex items-center gap-1.5 font-bold text-slate-800">
					<span className="material-symbols-outlined text-[15px] text-slate-500 shrink-0">
						view_quilt
					</span>
					<span>{selectedOption.label}</span>
				</span>

				<span
					className={`material-symbols-outlined text-[17px] text-slate-400 transition-transform duration-200 shrink-0 ${
						isOpen ? 'rotate-180 text-primary' : ''
					}`}
				>
					expand_more
				</span>
			</button>

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-60 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150 max-h-72 overflow-y-auto">
					<div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
						<span>Filter By Menu Access</span>
						{value !== 'ALL' && (
							<button
								type="button"
								onClick={() => {
									onChange('ALL');
									setIsOpen(false);
								}}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					<div className="flex flex-col gap-0.5 mt-0.5">
						{options.map((opt) => {
							const isSelected = opt.id === value;
							return (
								<button
									key={opt.id}
									type="button"
									onClick={() => {
										onChange(opt.id);
										setIsOpen(false);
									}}
									className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer group ${isSelected
										? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
										: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-[0.98]'
										}`}
								>
									<div className="flex items-center gap-2">
										<span className="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-primary">
											{opt.icon || 'arrow_right'}
										</span>
										<span>{opt.label}</span>
									</div>

									{isSelected && (
										<span className="material-symbols-outlined text-[16px] text-primary">
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
	);
}

// =========================================================================
// Form Modern Role Dropdown (for Add / Edit User Modal)
// =========================================================================
function FormRoleDropdown({ value, onChange, isSoleAdmin = false }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const roleOptions = [
		{
			id: 'Super Admin',
			label: 'Super Admin',
			icon: 'shield_person',
			color: 'text-purple-700 bg-purple-50 ring-purple-200',
			dot: 'bg-purple-500',
			desc: 'Master administrative access',
		},
		{
			id: 'admin',
			label: 'Admin',
			icon: 'shield_person',
			color: 'text-indigo-700 bg-indigo-50 ring-indigo-200',
			dot: 'bg-indigo-500',
			desc: 'Full administrative access',
		},
		{
			id: 'user',
			label: 'User',
			icon: 'person',
			color: 'text-blue-700 bg-blue-50 ring-blue-200',
			dot: 'bg-blue-500',
			desc: 'Standard operations access',
		},
	];

	const selectedRole =
		roleOptions.find((r) => r.id.toLowerCase() === (value || '').toLowerCase()) ||
		roleOptions[roleOptions.length - 1];

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={dropdownRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`w-full flex items-center justify-between pl-3 pr-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all cursor-pointer font-semibold ${isOpen
					? 'border-primary ring-2 ring-primary/20 shadow-sm'
					: 'border-slate-200 hover:border-slate-300 shadow-2xs'
					}`}
			>
				<div className="flex items-center gap-2.5 truncate">
					<span className="material-symbols-outlined text-[18px] text-slate-400">
						manage_accounts
					</span>
					<span
						className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedRole.dot}`}
					/>
					<span className="font-bold text-slate-800 truncate">
						{selectedRole.label}
					</span>
				</div>
				<span
					className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
						}`}
				>
					expand_more
				</span>
			</button>

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-full z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
					{roleOptions.map((opt) => {
						const isSelected = opt.id === value;
						const isDisabled = isSoleAdmin && opt.id.toLowerCase() === 'user';
						return (
							<button
								key={opt.id}
								type="button"
								disabled={isDisabled}
								onClick={() => {
									if (isDisabled) return;
									onChange(opt.id);
									setIsOpen(false);
								}}
								className={`flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${isDisabled
									? 'opacity-40 cursor-not-allowed bg-slate-50'
									: isSelected
									? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20 cursor-pointer'
									: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 cursor-pointer'
									}`}
								title={isDisabled ? 'System requires at least one Administrator' : undefined}
							>
								<div className="flex items-center gap-2.5 truncate">
									<div
										className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isDisabled
											? 'bg-slate-200 text-slate-400'
											: isSelected
											? 'bg-primary text-white'
											: 'bg-slate-100 text-slate-600'
											}`}
									>
										<span className="material-symbols-outlined text-[16px]">
											{opt.icon}
										</span>
									</div>
									<div className="truncate">
										<div className="text-[12.5px] font-bold leading-tight flex items-center gap-1.5">
											<span>{opt.label}</span>
											{isDisabled && (
												<span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded ring-1 ring-amber-200">
													Admin Required
												</span>
											)}
										</div>
										<div className="text-[10.5px] text-slate-400 font-medium">
											{isDisabled ? 'Cannot demote sole administrator' : opt.desc}
										</div>
									</div>
								</div>
								{isSelected && (
									<span className="material-symbols-outlined text-primary text-[17px] flex-shrink-0">
										check_circle
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

// =========================================================================
// Form Modern Status Dropdown (for Add / Edit User Modal)
// =========================================================================
function FormStatusDropdown({ value = 'active', onChange }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const statusOptions = [
		{
			id: 'active',
			label: 'Active',
			icon: 'check_circle',
			color: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
			dot: 'bg-emerald-500',
			desc: 'Operational and permitted to login',
		},
		{
			id: 'inactive',
			label: 'Inactive',
			icon: 'cancel',
			color: 'text-rose-700 bg-rose-50 ring-rose-200',
			dot: 'bg-rose-500',
			desc: 'Account suspended / access disabled',
		},
	];

	const selectedStatus =
		statusOptions.find((s) => s.id === (value || '').toLowerCase()) || statusOptions[0];

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={dropdownRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`w-full flex items-center justify-between pl-3 pr-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all cursor-pointer font-semibold ${
					isOpen
						? 'border-primary ring-2 ring-primary/20 shadow-sm'
						: 'border-slate-200 hover:border-slate-300 shadow-2xs'
				}`}
			>
				<div className="flex items-center gap-2.5 truncate">
					<span className="material-symbols-outlined text-[18px] text-slate-400">
						{selectedStatus.icon}
					</span>
					<span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedStatus.dot}`} />
					<span className="font-bold text-slate-800 truncate">
						{selectedStatus.label}
					</span>
				</div>
				<span
					className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${
						isOpen ? 'rotate-180 text-primary' : ''
					}`}
				>
					expand_more
				</span>
			</button>

			{isOpen && (
				<div className="absolute left-0 top-full mt-1.5 w-full z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
					{statusOptions.map((opt) => {
						const isSelected = opt.id === (value || '').toLowerCase();
						return (
							<button
								key={opt.id}
								type="button"
								onClick={() => {
									onChange(opt.id);
									setIsOpen(false);
								}}
								className={`flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
									isSelected
										? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
										: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
								}`}
							>
								<div className="flex items-center gap-2.5 truncate">
									<div
										className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
											isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
										}`}
									>
										<span className="material-symbols-outlined text-[16px]">
											{opt.icon}
										</span>
									</div>
									<div className="truncate">
										<div className="text-[12.5px] font-bold leading-tight">
											{opt.label}
										</div>
										<div className="text-[10.5px] text-slate-400 font-medium">
											{opt.desc}
										</div>
									</div>
								</div>
								{isSelected && (
									<span className="material-symbols-outlined text-primary text-[17px] flex-shrink-0">
										check_circle
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

// =========================================================================
// Form Modern Allowed Menus Multi-Select Dropdown (for Add / Edit User Modal)
// =========================================================================
function FormMenuMultiSelectDropdown({ selectedMenus = [], onChange, isAdmin }) {
	const [isOpen, setIsOpen] = useState(false);
	const [openUpward, setOpenUpward] = useState(false);
	const [maxHeight, setMaxHeight] = useState(280);
	const dropdownRef = useRef(null);

	// Dynamically calculate whether to open upward or downward based on available size/space
	const updateDropdownPosition = () => {
		if (!dropdownRef.current) return;
		const rect = dropdownRef.current.getBoundingClientRect();

		// Viewport boundaries
		const viewportBelow = window.innerHeight - rect.bottom - 12;
		const viewportAbove = rect.top - 12;

		// Scroll container / modal boundaries
		const scrollParent =
			dropdownRef.current.closest('.overflow-y-auto') ||
			dropdownRef.current.closest('form');

		let spaceBelow = viewportBelow;
		let spaceAbove = viewportAbove;

		if (scrollParent) {
			const parentRect = scrollParent.getBoundingClientRect();
			spaceBelow = Math.min(spaceBelow, parentRect.bottom - rect.bottom - 12);
			spaceAbove = Math.min(spaceAbove, rect.top - parentRect.top - 12);
		}

		// Required height for the dropdown menu (~250px)
		const neededHeight = 250;
		const shouldOpenUpward = spaceBelow < neededHeight && spaceAbove > spaceBelow;
		setOpenUpward(shouldOpenUpward);

		const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow;
		const computedMaxHeight = Math.min(300, Math.max(160, availableSpace));
		setMaxHeight(computedMaxHeight);
	};

	const handleToggle = () => {
		if (!isOpen) {
			updateDropdownPosition();
		}
		setIsOpen((prev) => !prev);
	};

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};
		if (isOpen) {
			updateDropdownPosition();
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
			window.addEventListener('resize', updateDropdownPosition);

			const scrollParent = dropdownRef.current?.closest('.overflow-y-auto');
			if (scrollParent) {
				scrollParent.addEventListener('scroll', updateDropdownPosition);
			}
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleKeyDown);
				window.removeEventListener('resize', updateDropdownPosition);
				if (scrollParent) {
					scrollParent.removeEventListener('scroll', updateDropdownPosition);
				}
			};
		}
	}, [isOpen]);

	const totalCount = AVAILABLE_MENUS.length;
	const selectedCount = isAdmin ? totalCount : selectedMenus.length;
	const isAllSelected = selectedCount === totalCount;

	const handleToggleMenu = (menuId) => {
		if (isAdmin) return;
		const exists = selectedMenus.includes(menuId);
		if (exists) {
			onChange(selectedMenus.filter((m) => m !== menuId));
		} else {
			onChange([...selectedMenus, menuId]);
		}
	};

	const handleSelectAll = () => {
		if (isAdmin) return;
		onChange(AVAILABLE_MENUS.map((m) => m.id));
	};

	const handleClearAll = () => {
		if (isAdmin) return;
		onChange([]);
	};

	return (
		<div ref={dropdownRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
			<button
				type="button"
				onClick={handleToggle}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`w-full flex items-center justify-between pl-3 pr-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all cursor-pointer font-semibold ${isOpen
					? 'border-primary ring-2 ring-primary/20 shadow-sm'
					: 'border-slate-200 hover:border-slate-300 shadow-2xs'
					}`}
			>
				<div className="flex items-center gap-2 truncate">
					<span className="material-symbols-outlined text-[18px] text-slate-400">
						view_quilt
					</span>
					{isAdmin ? (
						<span className="font-bold text-slate-800 truncate">
							All Menus (Full Admin Access)
						</span>
					) : selectedCount === 0 ? (
						<span className="text-slate-400 font-normal truncate">
							Select Allowed Menus...
						</span>
					) : isAllSelected ? (
						<span className="font-bold text-primary truncate">
							All Menus ({totalCount})
						</span>
					) : (
						<span className="font-bold text-slate-800 truncate">
							{selectedCount} {selectedCount === 1 ? 'Menu' : 'Menus'} Selected
						</span>
					)}
				</div>

				<div className="flex items-center gap-1.5 flex-shrink-0">
					<span
						className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${isAdmin || isAllSelected
							? 'bg-primary/10 text-primary'
							: selectedCount > 0
								? 'bg-slate-100 text-slate-700'
								: 'bg-rose-50 text-rose-600'
							}`}
					>
						{selectedCount}/{totalCount}
					</span>
					<span
						className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
							}`}
					>
						expand_more
					</span>
				</div>
			</button>

			{isOpen && (
				<div
					className={`absolute left-0 ${openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} w-full z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150`}
					style={{ maxHeight: `${maxHeight}px` }}
				>
					{/* Dropdown Header with Select All / Clear */}
					<div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 flex-shrink-0">
						<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
							Navigation Access
						</span>
						{!isAdmin ? (
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handleSelectAll}
									className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
								>
									Select All
								</button>
								<span className="text-slate-300">|</span>
								<button
									type="button"
									onClick={handleClearAll}
									className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer"
								>
									Clear
								</button>
							</div>
						) : (
							<span className="text-[11px] font-bold text-purple-600">
								All Granted
							</span>
						)}
					</div>

					{/* Menu Items List */}
					<div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 p-0.5 mt-1">
						{AVAILABLE_MENUS.map((menu) => {
							const isChecked = isAdmin || selectedMenus.includes(menu.id);
							return (
								<button
									key={menu.id}
									type="button"
									disabled={isAdmin}
									onClick={() => handleToggleMenu(menu.id)}
									className={`w-full flex items-center justify-between px-2.5 py-3 rounded-xl text-left text-[12px] transition-all ${isAdmin
										? 'opacity-70 cursor-default'
										: 'cursor-pointer hover:bg-slate-50'
										} ${isChecked
											? 'bg-primary/5 text-primary font-bold'
											: 'text-slate-700 font-medium'
										}`}
								>
									<div className="flex items-center gap-2.5 truncate">
										<span
											className={`material-symbols-outlined text-[18px] ${isChecked ? 'text-primary' : 'text-slate-400'
												}`}
										>
											{menu.icon}
										</span>
										<span className="truncate">{menu.label}</span>
									</div>
									<div
										className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${isChecked
											? 'bg-primary border-primary text-white'
											: 'border-slate-300 bg-white'
										}`}
									>
										{isChecked && (
											<span className="material-symbols-outlined text-[13px] font-black">
												check
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>

					{/* Footer Done Button */}
					<div className="pt-2 border-t border-slate-100 flex items-center justify-between px-1 flex-shrink-0">
						<span className="text-[11px] text-slate-400 font-medium">
							{selectedCount} of {totalCount} accessible
						</span>
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-bold cursor-pointer transition-all"
						>
							Done
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// Descriptions and metadata for all system navigation menus
const MENU_METADATA = {
	dashboard: {
		label: 'Dashboard',
		icon: 'widgets',
		category: 'Analytics',
		description: 'Portfolio overview, metrics, KPIs, and performance charts.',
	},
	'joint-loan': {
		label: 'Joint Loan',
		icon: 'handshake',
		category: 'Lending Operations',
		description: 'Co-lending loan application, repayment schedules, split calculations & approvals.',
	},
	'short-loan': {
		label: 'Short Loan',
		icon: 'payments',
		category: 'Lending Operations',
		description: 'Short-term credit facilities, fast disbursement, and collection monitoring.',
	},
	matchup: {
		label: 'Matchup',
		icon: 'compare_arrows',
		category: 'Reconciliation',
		description: 'Daily ledger reconciliation, bank statements, and account matching.',
	},
	requests: {
		label: 'Requests',
		icon: 'pending_actions',
		category: 'Workflow',
		description: 'Workflow requests, authorization queues, and manager approvals.',
	},
	users: {
		label: 'Users',
		icon: 'group',
		category: 'Administration',
		description: 'Staff directory, role permissions, access control, and user management.',
	},
	settings: {
		label: 'Settings',
		icon: 'settings',
		category: 'System Config',
		description: 'System accounts, configuration parameters, and global preferences.',
	},
};

// User Details View Page matching JointLoanDetailsPage in JointLoan.jsx
function UserDetailsPage({ user, onBack, onEdit, onDelete, accountNames = [], loans = [] }) {
	const [activeTab, setActiveTab] = useState('joint-loan'); // 'joint-loan' | 'menus'
	const [copiedField, setCopiedField] = useState(null);
	const roleBadge = getUserRoleBadge(user.role);
	const initials = getUserInitials(user.name, user.employee_code);
	const isRootAdmin = ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase());

	// Copy to clipboard helper matching JointLoan copy helper
	const handleCopy = (text, fieldName) => {
		if (!text) return;
		navigator.clipboard.writeText(text);
		setCopiedField(fieldName);
		setTimeout(() => setCopiedField(null), 2000);
	};

	// Helper to find full account name and color from DB accounts
	const getAccountMeta = (acronym) => {
		if (!Array.isArray(accountNames) || accountNames.length === 0) {
			return { name: acronym, color: 'blue' };
		}
		const found = accountNames.find(
			(a) => (a.acronym || '').toUpperCase() === (acronym || '').toUpperCase()
		);
		return {
			name: found?.name || acronym,
			color: found?.color || 'blue',
		};
	};

	// Extract account permissions
	let primaryAccs = [];
	let secondaryAccs = [];
	if (['admin', 'super admin'].includes((user.role || '').toLowerCase())) {
		primaryAccs = ['All Accounts (*)'];
		secondaryAccs = ['All Accounts (*)'];
	} else if (user.permissions) {
		if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
			primaryAccs = Array.isArray(user.permissions.primary) ? user.permissions.primary : [];
			secondaryAccs = Array.isArray(user.permissions.secondary) ? user.permissions.secondary : [];
		} else if (Array.isArray(user.permissions)) {
			primaryAccs = user.permissions;
		}
	}

	// Filter database accounts for Joint Loan specific accounts
	const jlAccounts = useMemo(() => {
		if (!Array.isArray(accountNames) || accountNames.length === 0) return [];
		return accountNames
			.filter((a) => a && (a.acronym || a.name))
			.filter((a) => a.type === 'jl_report' || !a.type)
			.map((a) => ({
				id: a.id,
				name: a.name || a.acronym,
				acronym: (a.acronym || a.name || '').toUpperCase().trim(),
				color: a.color || 'blue',
			}));
	}, [accountNames]);

	const allowedMenus = Array.isArray(user.allowed_menus) ? user.allowed_menus : [];

	const isAccountPrimary = (acronym) => {
		if (['admin', 'super admin'].includes((user.role || '').toLowerCase())) return true;
		return primaryAccs.map((a) => (a || '').toUpperCase()).includes((acronym || '').toUpperCase());
	};

	const isAccountSecondary = (acronym) => {
		if (['admin', 'super admin'].includes((user.role || '').toLowerCase())) return true;
		return secondaryAccs.map((a) => (a || '').toUpperCase()).includes((acronym || '').toUpperCase());
	};

	// Filter Joint Loan accounts to only those assigned with active permissions (Primary or Secondary)
	// and reorder position: primary accounts first, then secondary accounts
	const assignedJlAccounts = useMemo(() => {
		let list = [];
		if (['admin', 'super admin'].includes((user.role || '').toLowerCase())) {
			list = [...jlAccounts];
		} else {
			const matched = jlAccounts.filter(
				(acc) => isAccountPrimary(acc.acronym) || isAccountSecondary(acc.acronym)
			);

			const matchedAcronyms = new Set(matched.map((a) => a.acronym.toUpperCase()));
			const missingAssigned = [];

			[...primaryAccs, ...secondaryAccs].forEach((acr) => {
				if (acr && acr !== 'All Accounts (*)' && !matchedAcronyms.has(acr.toUpperCase())) {
					const info = getAccountInfo(acr);
					matchedAcronyms.add(acr.toUpperCase());
					missingAssigned.push({
						id: acr,
						name: info.name,
						acronym: acr.toUpperCase().trim(),
						color: info.color,
					});
				}
			});

			list = [...matched, ...missingAssigned];
		}

		// Reorder: primary accounts are first, then secondary accounts
		return list.sort((a, b) => {
			const aPri = isAccountPrimary(a.acronym) ? 1 : 0;
			const bPri = isAccountPrimary(b.acronym) ? 1 : 0;
			if (aPri !== bPri) {
				return bPri - aPri; // Primary (1) comes before Secondary (0)
			}
			const aName = (a.name || a.acronym || '').toUpperCase();
			const bName = (b.name || b.acronym || '').toUpperCase();
			return aName.localeCompare(bName);
		});
	}, [jlAccounts, user.role, primaryAccs, secondaryAccs]);

	const primaryLoansMap = useMemo(() => {
		if (!Array.isArray(loans) || loans.length === 0) return {};
		const map = {};
		assignedJlAccounts.forEach((acc) => {
			const matched = loans.filter((l) =>
				doesLoanMatchPrimaryAccount(l, acc.acronym, accountNames) ||
				doesLoanMatchPrimaryAccount(l, acc.name, accountNames)
			);
			map[acc.acronym] = matched;
		});
		return map;
	}, [loans, assignedJlAccounts, accountNames]);

	const secondaryLoansMap = useMemo(() => {
		if (!Array.isArray(loans) || loans.length === 0) return {};
		const map = {};
		assignedJlAccounts.forEach((acc) => {
			const matched = loans.filter((l) =>
				doesLoanMatchSecondaryAccount(l, acc.acronym, accountNames) ||
				doesLoanMatchSecondaryAccount(l, acc.name, accountNames)
			);
			map[acc.acronym] = matched;
		});
		return map;
	}, [loans, assignedJlAccounts, accountNames]);


	return (
		<div className="flex flex-col w-full gap-space-lg font-sans animate-in fade-in duration-200">
			{/* Top Navigation & Breadcrumbs */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
				{/* Breadcrumb: Users / User Name with Employee Code tag */}
				<nav className="flex items-center gap-2 text-[13px] font-medium flex-wrap" aria-label="Breadcrumb">
					<button
						type="button"
						onClick={onBack}
						className="text-slate-500 hover:text-primary font-semibold transition-colors cursor-pointer hover:underline flex items-center gap-1"
					>
						<span>Users</span>
					</button>
					<span className="text-slate-300 font-normal">/</span>
					<div className="flex items-center gap-2">
						<span className="font-bold text-[14px] text-slate-900 uppercase">
							{user.name || 'Unnamed User'}
						</span>
						<span className="font-extrabold text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-md ring-1 ring-primary/20 tracking-tight font-mono">
							{user.employee_code}
						</span>
					</div>
				</nav>

				{/* Quick Actions & Copy Feedback */}
				<div className="flex items-center gap-2">
					{copiedField && (
						<span className="text-[12px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl ring-1 ring-emerald-200 flex items-center gap-1 transition-all">
							<span className="material-symbols-outlined text-[16px]">check_circle</span>
							<span>{copiedField} copied!</span>
						</span>
					)}

					<button
						type="button"
						onClick={() => onEdit(user)}
						className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-[12.5px] shadow-2xs transition-all active:scale-95 cursor-pointer"
					>
						<span className="material-symbols-outlined text-[16px]">edit</span>
						<span>Edit User</span>
					</button>

					<button
						type="button"
						onClick={() => onDelete(user)}
						disabled={isRootAdmin}
						className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-[12.5px] transition-all active:scale-95 cursor-pointer ${
							isRootAdmin
								? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
								: 'border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-2xs'
						}`}
						title={isRootAdmin ? 'Primary System Admin cannot be deleted' : 'Delete user'}
					>
						<span className="material-symbols-outlined text-[16px]">delete</span>
						<span>Delete</span>
					</button>
				</div>
			</div>

			{/* User Profile Hero Card */}
			<div className="bg-surface-container-lowest rounded-2xl p-space-md sm:p-5 shadow-sm ring-1 ring-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-5">
				<div className="flex items-center gap-4 min-w-0">
					<div
						className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr ${roleBadge.avatarGradient} text-white font-black text-[22px] flex items-center justify-center shadow-md tracking-wider shrink-0 ring-4 ring-white`}
					>
						{initials}
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2.5 flex-wrap">
							<h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate uppercase">
								{user.name || 'Unnamed User'}
							</h1>
							<span
								className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ring-1 ${roleBadge.color}`}
							>
								<span className={`w-1.5 h-1.5 rounded-full ${roleBadge.dot}`} />
								<span>{roleBadge.label}</span>
							</span>
						</div>
						<div className="text-[12px] text-slate-500 mt-1.5 flex items-center gap-4 flex-wrap">
							{user.email ? (
								<a
									href={`mailto:${user.email}`}
									className="flex items-center gap-1 text-slate-600 hover:text-primary transition-colors"
								>
									<span className="material-symbols-outlined text-slate-400" style={{fontSize: "18px"}}>mail</span>
									<span>{user.email}</span>
								</a>
							) : (
								<span className="flex items-center gap-1 text-slate-400 italic">
									<span className="material-symbols-outlined" style={{fontSize: "18px"}}>mail</span>
									<span className="text-[11px]">No email configured</span>
								</span>
							)}
							{user.mobile ? (
								<a
									href={`tel:${user.mobile}`}
									className="flex items-center gap-1 text-slate-600 hover:text-primary transition-colors"
								>
									<span className="material-symbols-outlined text-slate-400" style={{fontSize: "18px"}}>call</span>
									<span>{user.mobile}</span>
								</a>
							) : (
								<span className="flex items-center gap-1 text-slate-400 italic">
									<span className="material-symbols-outlined" style={{fontSize: "18px"}}>call</span>
									<span className="text-[11px]">No mobile configured</span>
								</span>
							)}
						</div>
					</div>
				</div>

				{/* Status Badges on Right */}
				<div className="flex items-center gap-2 flex-wrap">
					{(user.status || 'active').toLowerCase() === 'inactive' ? (
						<span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-300">
							<span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
							<span>Inactive Account</span>
						</span>
					) : (
						<span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
							<span>Active Account</span>
						</span>
					)}
					{user.is_initial_password && (
						<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11.5px] font-bold">
							<span className="material-symbols-outlined text-[15px] text-amber-600">
								lock_reset
							</span>
							<span>Temporary Password</span>
						</span>
					)}
				</div>
			</div>

			{/* 4-Card Summary Metrics Strip (matching JointLoan metrics strip) */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
				{/* Metric 1: System Role Level */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>System Role</span>
						<span
							className={`material-symbols-outlined text-[20px] ${
								['admin', 'super admin'].includes((user.role || '').toLowerCase())
									? 'text-purple-600'
									: user.role === 'manager'
									? 'text-amber-600'
									: 'text-blue-600'
							}`}
						>
							{roleBadge.icon}
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[22px] text-slate-900 leading-tight">
							{roleBadge.label}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-slate-700">
								{['admin', 'super admin'].includes((user.role || '').toLowerCase())
									? 'Tier 1: Full System Privileges'
									: user.role === 'manager'
									? 'Tier 2: Verification Rights'
									: 'Tier 3: Standard Operations'}
							</span>
						</div>
					</div>
				</div>

				{/* Metric 2: Joint Loan Accounts */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Joint Loan Accounts</span>
						<span className="material-symbols-outlined text-primary text-[20px]">
							handshake
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[22px] text-primary leading-tight">
							{['admin', 'super admin'].includes((user.role || '').toLowerCase())
								? 'All Accounts (*)'
								: `${primaryAccs.length + secondaryAccs.length} ${
										primaryAccs.length + secondaryAccs.length === 1 ? 'Account' : 'Accounts'
								  }`}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-emerald-700">{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? 'All' : primaryAccs.length} Primary</span>
							<span>·</span>
							<span className="font-bold text-blue-700">{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? 'All' : secondaryAccs.length} Secondary</span>
						</div>
					</div>
				</div>

				{/* Metric 3: Menu Visibility */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Accessible Menus</span>
						<span className="material-symbols-outlined text-purple-600 text-[20px]">
							grid_view
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[22px] text-slate-900 leading-tight">
							{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? `${AVAILABLE_MENUS.length} Menus` : `${allowedMenus.length} Menus`}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-purple-700 mt-1 font-semibold">
							<span>
								{['admin', 'super admin'].includes((user.role || '').toLowerCase())
									? '100% full system coverage'
									: `${Math.round((allowedMenus.length / AVAILABLE_MENUS.length) * 100)}% of system modules`}
							</span>
						</div>
					</div>
				</div>

				{/* Metric 4: Account Status */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Account Status</span>
						<span
							className={`material-symbols-outlined text-[20px] ${
								(user.status || 'active').toLowerCase() === 'inactive'
									? 'text-slate-400'
									: 'text-emerald-600'
							}`}
						>
							{(user.status || 'active').toLowerCase() === 'inactive'
								? 'cancel'
								: 'check_circle'}
						</span>
					</div>
					<div className="my-2">
						<div
							className={`font-extrabold text-[22px] leading-tight flex items-center gap-1.5 ${
								(user.status || 'active').toLowerCase() === 'inactive'
									? 'text-slate-600'
									: 'text-emerald-700'
							}`}
						>
							<span>
								{(user.status || 'active').toLowerCase() === 'inactive'
									? 'Inactive'
									: 'Active Account'}
							</span>
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-semibold text-slate-700">
								{(user.status || 'active').toLowerCase() === 'inactive'
									? 'Account Suspended / Access Disabled'
									: user.is_initial_password
									? 'Temporary Password'
									: 'Fully Active & Operational'}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Section Tabs */}
			<div className="flex items-center justify-between border-b border-slate-200/80">
				<div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
					<button
						type="button"
						onClick={() => setActiveTab('joint-loan')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
							activeTab === 'joint-loan'
								? 'border-primary text-primary'
								: 'border-transparent text-slate-500 hover:text-slate-800'
						}`}
					>
						<span className="material-symbols-outlined text-[18px]">handshake</span>
						<span>Joint Loan Permissions</span>
						<span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 font-extrabold text-slate-700">
							{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? 'All' : primaryAccs.length + secondaryAccs.length}
						</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('menus')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
							activeTab === 'menus'
								? 'border-primary text-primary'
								: 'border-transparent text-slate-500 hover:text-slate-800'
						}`}
					>
						<span className="material-symbols-outlined text-[18px]">grid_view</span>
						<span>Menu Navigation</span>
						<span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 font-extrabold text-slate-700">
							{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? AVAILABLE_MENUS.length : allowedMenus.length}
						</span>
					</button>
				</div>
			</div>

			{/* TAB 1: JOINT LOAN PERMISSIONS */}
			{activeTab === 'joint-loan' && (
				<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col font-sans">
					{/* Header */}
					<div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
						<div>
							<h3 className="font-extrabold text-[17px] text-slate-900 flex items-center gap-2">
								<span className="material-symbols-outlined text-primary text-[22px]">
									handshake
								</span>
								<span>Joint Loan Account Access &amp; Permissions</span>
							</h3>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Granular co-lending permissions governing loan origination, editing, and view access across database accounts.
							</p>
						</div>
						<span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-full ring-1 ring-blue-200 w-fit">
							Mutually Exclusive Per Account
						</span>
					</div>

					<div className="p-6 space-y-6">

						{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? (
							<div className="p-5 rounded-2xl bg-purple-50/80 border border-purple-200 text-purple-900 flex items-center gap-3">
								<span className="material-symbols-outlined text-[26px] text-purple-600 shrink-0">
									verified
								</span>
								<div>
									<div className="font-extrabold text-[14px]">Full System Administrator Access</div>
									<p className="text-[12.5px] text-purple-800 mt-0.5">
										As an Administrator, this user automatically possesses complete, unrestricted Primary (create &amp; edit) and Secondary (view) rights across all system accounts.
									</p>
								</div>
							</div>
						) : (
							<div className="space-y-5">
								{/* Structured Accounts Table */}
								<div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
									<div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
										<span className="font-extrabold text-[13px] text-slate-800">
											Joint Loan Accounts Matrix
										</span>
										<div className="flex items-center gap-2">
											<span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-0.5 rounded-full">
												{assignedJlAccounts.filter((a) => isAccountPrimary(a.acronym)).length} Primary
											</span>
											<span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 ring-1 ring-blue-200 px-2.5 py-0.5 rounded-full">
												{assignedJlAccounts.filter((a) => !isAccountPrimary(a.acronym) && isAccountSecondary(a.acronym)).length} Secondary
											</span>
										</div>
									</div>

									<div className="overflow-x-auto">
										<table className="w-full text-left border-collapse">
											<thead>
												<tr className="border-b border-slate-200/80 bg-slate-50/60 text-slate-600 font-bold text-[11.5px] uppercase tracking-wider">
													<th className="py-3 px-4 w-12 text-center">#</th>
													<th className="py-3 px-4">Account Name &amp; Code</th>
													<th className="py-3 px-4">Permission Level</th>
													<th className="py-3 px-4 text-center">Account Type</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100 text-[12.5px]">
												{assignedJlAccounts.length > 0 ? (
													assignedJlAccounts.map((acc, idx) => {
														const isPri = isAccountPrimary(acc.acronym);
														const isSec = isAccountSecondary(acc.acronym);

														return (
															<tr
																key={acc.id || acc.acronym || idx}
																className="hover:bg-slate-50/70 transition-colors"
															>
																<td className="py-3 px-4 text-center text-slate-400 font-bold text-[12px]">
																	{idx + 1}
																</td>
																<td className="py-3 px-4">
																	<div className="flex items-center gap-2.5">
																		<span className="font-bold text-slate-900">
																			{acc.name}
																		</span>
																		<span
																			className={`inline-block font-extrabold text-[11px] px-2.5 py-0.5 rounded-md uppercase tracking-wider ring-1 shrink-0 ${getEntityTagColor(
																				acc.acronym,
																				acc.color
																			)}`}
																		>
																			{acc.acronym}
																		</span>
																	</div>
																</td>
																<td className="py-3 px-4">
																	{isPri ? (
																		<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
																			<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
																			<span>Primary (Create &amp; Edit)</span>
																		</span>
																	) : isSec ? (
																		<div className="space-y-1">
																			<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-blue-50 text-blue-700 ring-1 ring-blue-200">
																				<span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
																				<span>Secondary (View Only)</span>
																			</span>
																			<div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold">
																				<span className="material-symbols-outlined text-[13px]">visibility</span>
																				<span>Can view {primaryLoansMap[acc.acronym]?.length || 0} {primaryLoansMap[acc.acronym]?.length === 1 ? 'loan' : 'loans'} having {acc.acronym} as Primary</span>
																			</div>
																		</div>
																	) : (
																		<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">
																			<span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
																			<span>No Access</span>
																		</span>
																	)}
																</td>
																<td className="py-3 px-4 text-center">
																	<span className="text-[11px] font-bold text-slate-500 bg-slate-100 p-2 rounded-md">
																		Joint Loan Report
																	</span>
																</td>
															</tr>
														);
													})
												) : (
													<tr>
														<td colSpan={5} className="py-8 text-center text-slate-400 italic">
															No Joint Loan accounts assigned to this user.
														</td>
													</tr>
												)}
											</tbody>
										</table>
									</div>
								</div>

								{/* Primary Loans Accessible for Secondary Assigned Accounts */}
								{secondaryAccs.length > 0 && !['admin', 'super admin'].includes((user.role || '').toLowerCase()) && (
									<div className="border border-blue-200/80 rounded-2xl overflow-hidden shadow-2xs bg-white mt-5">
										<div className="px-5 py-3.5 bg-gradient-to-r from-blue-50/80 to-slate-50 border-b border-blue-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
											<div className="flex items-center gap-2.5">
												<div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
													<span className="material-symbols-outlined text-[20px]">visibility</span>
												</div>
												<div>
													<div className="flex items-center gap-2">
														<span className="font-extrabold text-[13.5px] text-slate-800">
															Primary Loans Viewable by This User
														</span>
														<span className="text-[10.5px] font-extrabold text-blue-700 bg-blue-50 ring-1 ring-blue-200 px-2 py-0.5 rounded-full">
															Secondary (View Only) Access
														</span>
													</div>
													<p className="text-[11.5px] text-slate-500 mt-0.5">
														Because this user has Secondary access to assigned account(s), they can view joint loans where those accounts are Primary Lender:
													</p>
												</div>
											</div>
										</div>

										<div className="p-4 space-y-4">
											{assignedJlAccounts
												.filter((acc) => !isAccountPrimary(acc.acronym) && isAccountSecondary(acc.acronym))
												.map((acc) => {
													const matchedPrimaryLoans = primaryLoansMap[acc.acronym] || [];
													return (
														<div key={acc.acronym} className="border border-slate-200/80 rounded-xl overflow-hidden">
															<div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
																<div className="flex items-center gap-2">
																	<span className={`inline-block font-extrabold text-[11px] px-2 py-0.5 rounded-md uppercase tracking-wider ring-1 ${getEntityTagColor(acc.acronym, acc.color)}`}>
																		{acc.acronym}
																	</span>
																	<span className="font-bold text-[13px] text-slate-800">{acc.name}</span>
																	<span className="text-[11.5px] text-slate-500 font-medium">as Primary Lender</span>
																</div>
																<span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
																	{matchedPrimaryLoans.length} {matchedPrimaryLoans.length === 1 ? 'Loan' : 'Loans'}
																</span>
															</div>

															{matchedPrimaryLoans.length > 0 ? (
																<div className="overflow-x-auto">
																	<table className="w-full text-left border-collapse text-[12px]">
																		<thead>
																			<tr className="border-b border-slate-200/60 bg-slate-50/40 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
																				<th className="py-2.5 px-4 w-12 text-center">#</th>
																				<th className="py-2.5 px-4">Loan ID</th>
																				<th className="py-2.5 px-4">Client Name</th>
																				<th className="py-2.5 px-4">Loan Amount</th>
																				<th className="py-2.5 px-4">Loan Date</th>
																				<th className="py-2.5 px-4 text-center">Status</th>
																				<th className="py-2.5 px-4 text-center">User Access</th>
																			</tr>
																		</thead>
																		<tbody className="divide-y divide-slate-100">
																			{matchedPrimaryLoans.map((l, lIdx) => (
																				<tr key={l.id || l.loan_ref_id || lIdx} className="hover:bg-slate-50/60 transition-colors">
																					<td className="py-2.5 px-4 text-center text-slate-400 font-semibold">{lIdx + 1}</td>
																					<td className="py-2.5 px-4 font-bold text-primary">
																						{l.loan_ref_id || l.id}
																					</td>
																					<td className="py-2.5 px-4 font-semibold text-slate-800">
																						{l.client_account_name || l.clientName || 'Borrower'}
																					</td>
																					<td className="py-2.5 px-4 font-bold text-slate-900">
																						₹{formatIndianCurrency(l.loan_amount || l.amount || 0)}
																					</td>
																					<td className="py-2.5 px-4 text-slate-600">
																						{l.loan_date || '-'}
																					</td>
																					<td className="py-2.5 px-4 text-center">
																						<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
																							(l.status || '').toLowerCase() === 'active'
																								? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
																								: (l.status || '').toLowerCase().includes('overdue')
																								? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
																								: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
																						}`}>
																							{l.status || 'Active'}
																						</span>
																					</td>
																					<td className="py-2.5 px-4 text-center">
																						<span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
																							<span className="material-symbols-outlined text-[13px]">visibility</span>
																							<span>View Only</span>
																						</span>
																					</td>
																				</tr>
																			))}
																		</tbody>
																	</table>
																</div>
															) : (
																<div className="py-6 px-4 text-center text-slate-400 italic text-[12px]">
																	No loans in the database currently have {acc.name} ({acc.acronym}) as Primary.
																</div>
															)}
														</div>
													);
												})}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			)}

			{/* TAB 2: MENU NAVIGATION */}
			{activeTab === 'menus' && (
				<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col font-sans">
					<div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
						<div>
							<h3 className="font-extrabold text-[17px] text-slate-900 flex items-center gap-2">
								<span className="material-symbols-outlined text-primary text-[22px]">
									grid_view
								</span>
								<span>Application Navigation &amp; Module Access</span>
							</h3>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Controls which main navigation items and functional workspaces this user can see and open.
							</p>
						</div>
						<span className="text-[11.5px] font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full w-fit">
							{['admin', 'super admin'].includes((user.role || '').toLowerCase())
								? 'All Menus Granted'
								: `${allowedMenus.length} of ${AVAILABLE_MENUS.length} Menus Assigned`}
						</span>
					</div>

					<div className="p-6">
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{AVAILABLE_MENUS.map((menu) => {
								const hasAccess = ['admin', 'super admin'].includes((user.role || '').toLowerCase()) || allowedMenus.includes(menu.id);
								const meta = MENU_METADATA[menu.id] || {
									description: 'Application feature module',
									category: 'System',
								};

								return (
									<div
										key={menu.id}
										className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
											hasAccess
												? 'bg-white border-slate-200/90 shadow-2xs ring-1 ring-slate-100'
												: 'bg-slate-50/50 border-slate-200/50 opacity-60'
										}`}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="flex items-center gap-2.5">
												<div
													className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
														hasAccess
															? 'bg-primary/10 text-primary'
															: 'bg-slate-100 text-slate-400'
													}`}
												>
													<span className="material-symbols-outlined text-[20px]">
														{menu.icon}
													</span>
												</div>
												<div>
													<h4 className="font-bold text-[13.5px] text-slate-900 leading-tight">
														{menu.label}
													</h4>
													<span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
														{meta.category}
													</span>
												</div>
											</div>

											<span
												className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
													hasAccess
														? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
														: 'bg-slate-100 text-slate-500'
												}`}
											>
												<span className="material-symbols-outlined text-[13px]">
													{hasAccess ? 'check' : 'close'}
												</span>
												<span>{hasAccess ? 'Allowed' : 'Restricted'}</span>
											</span>
										</div>

										<p className="text-[11.5px] text-slate-500 leading-relaxed">
											{meta.description}
										</p>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default function Users({ searchQuery: propSearchQuery = '' }) {
	const [users, setUsers] = useState([]);
	const [accountNames, setAccountNames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [internalSearchQuery, setInternalSearchQuery] = useState('');
	const searchQuery = propSearchQuery !== '' ? propSearchQuery : internalSearchQuery;

	// Dropdown filters
	const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'admin' | 'manager' | 'user'
	const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'active' | 'inactive'
	const [menuFilter, setMenuFilter] = useState('ALL'); // 'ALL' | menu id

	// View Details State
	const [selectedUser, setSelectedUser] = useState(null);

	// Modals State
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	const [formData, setFormData] = useState({
		employee_code: '',
		name: '',
		role: 'user',
		status: 'active',
		password: '',
		email: '',
		mobile: '',
		allowed_menus: ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'sync', 'requests', 'users', 'settings'],
		permissions: { primary: [], secondary: [] },
		changePassword: false,
	});
	const [showPassword, setShowPassword] = useState(false);
	const [modalError, setModalError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Memoized list of available accounts fetched directly from DB (accounts_name table)
	const availableAccountList = useMemo(() => {
		if (!Array.isArray(accountNames) || accountNames.length === 0) return [];
		return accountNames
			.filter((a) => a && (a.acronym || a.name))
			.map((a) => ({
				id: a.id,
				name: a.name || a.acronym,
				acronym: (a.acronym || a.name || '').toUpperCase().trim(),
				color: a.color || 'blue',
			}));
	}, [accountNames]);

	// Account Permission Helpers (Primary vs Secondary)
	const isAccountPrimary = (acronym) => {
		const primaryList = formData.permissions?.primary || [];
		return primaryList.includes(acronym);
	};

	const isAccountSecondary = (acronym) => {
		const secondaryList = formData.permissions?.secondary || [];
		return secondaryList.includes(acronym);
	};

	const toggleAccountPrimary = (acronym) => {
		setFormData((prev) => {
			const currPrimary = prev.permissions?.primary || [];
			const isAlreadyPri = currPrimary.includes(acronym);
			return {
				...prev,
				permissions: {
					primary: isAlreadyPri
						? currPrimary.filter((a) => a !== acronym)
						: [...currPrimary, acronym],
					// Mutually exclusive: cannot have secondary if primary is chosen
					secondary: (prev.permissions?.secondary || []).filter((a) => a !== acronym),
				},
			};
		});
	};

	const toggleAccountSecondary = (acronym) => {
		setFormData((prev) => {
			const currSecondary = prev.permissions?.secondary || [];
			const isAlreadySec = currSecondary.includes(acronym);
			return {
				...prev,
				permissions: {
					// Mutually exclusive: cannot have primary if secondary is chosen
					primary: (prev.permissions?.primary || []).filter((a) => a !== acronym),
					secondary: isAlreadySec
						? currSecondary.filter((a) => a !== acronym)
						: [...currSecondary, acronym],
				},
			};
		});
	};

	const clearAccountPermission = (acronym) => {
		setFormData((prev) => ({
			...prev,
			permissions: {
				primary: (prev.permissions?.primary || []).filter((a) => a !== acronym),
				secondary: (prev.permissions?.secondary || []).filter((a) => a !== acronym),
			},
		}));
	};

	const setAllPrimary = () => {
		const allAcrs = availableAccountList.map((a) => a.acronym);
		setFormData((prev) => ({
			...prev,
			permissions: {
				primary: allAcrs,
				secondary: [],
			},
		}));
	};

	const setAllSecondary = () => {
		const allAcrs = availableAccountList.map((a) => a.acronym);
		setFormData((prev) => ({
			...prev,
			permissions: {
				primary: [],
				secondary: allAcrs,
			},
		}));
	};

	const clearAllAccountPermissions = () => {
		setFormData((prev) => ({
			...prev,
			permissions: {
				primary: [],
				secondary: [],
			},
		}));
	};

	// Check if Joint Loan menu is granted for this user (or if user is admin)
	const isJointLoanAllowed =
		['admin', 'super admin'].includes((formData.role || '').toLowerCase()) ||
		(Array.isArray(formData.allowed_menus) && formData.allowed_menus.includes('joint-loan'));

	// Delete Confirmation Modal State
	const [userToDelete, setUserToDelete] = useState(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Toast Feedback State
	const [toastFeedback, setToastFeedback] = useState(null);

	const showToast = (message, type = 'success') => {
		setToastFeedback({ message, type });
		setTimeout(() => setToastFeedback(null), 3500);
	};

	// Pagination
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [loans, setLoans] = useState([]);

	// Load data from backend
	const loadData = async () => {
		setIsLoading(true);
		try {
			const [usersRes, accsRes, loansRes] = await Promise.allSettled([
				api.getUsers(),
				api.getAccountNames(),
				api.getJointLoans(),
			]);

			if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
				setUsers(usersRes.value);
			}
			if (accsRes.status === 'fulfilled' && Array.isArray(accsRes.value)) {
				setAccountNames(accsRes.value);
			}
			if (loansRes.status === 'fulfilled' && Array.isArray(loansRes.value)) {
				setLoans(loansRes.value);
			}
		} catch (err) {
			console.warn('Backend users unavailable:', err);
			showToast('Failed to load users from backend', 'error');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadData();
		document.body.style.overflow = '';
		return () => {
			document.body.style.overflow = '';
		};
	}, []);

	// Lock body scroll when modals open
	useEffect(() => {
		if (isCreateOpen || userToDelete) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		} else {
			document.body.style.overflow = '';
		}
	}, [isCreateOpen, userToDelete]);

	// Open Create Modal
	const handleOpenCreate = async () => {
		setEditingUser(null);
		setFormData({
			employee_code: '',
			name: '',
			email: '',
			mobile: '',
			role: 'user',
			status: 'active',
			password: '',
			allowed_menus: ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'sync', 'requests', 'users', 'settings'],
			permissions: {
				primary: [],
				secondary: [],
			},
			changePassword: true,
		});
		setShowPassword(false);
		setModalError('');
		setIsCreateOpen(true);

		// Refresh account names from database to ensure fresh DB accounts
		try {
			const freshAccs = await api.getAccountNames();
			if (Array.isArray(freshAccs)) {
				setAccountNames(freshAccs);
			}
		} catch (err) {
			console.warn('Failed to refresh accounts from DB:', err);
		}
	};

	// Open Edit Modal
	const handleOpenEdit = async (user) => {
		setEditingUser(user);

		let userPerms = { primary: [], secondary: [] };
		if (user.permissions) {
			if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
				const pri = Array.isArray(user.permissions.primary) ? [...user.permissions.primary] : [];
				const sec = (Array.isArray(user.permissions.secondary) ? [...user.permissions.secondary] : []).filter(
					(a) => !pri.includes(a)
				);
				userPerms = {
					primary: pri,
					secondary: sec,
				};
			} else if (Array.isArray(user.permissions)) {
				userPerms = {
					primary: [...user.permissions],
					secondary: [],
				};
			}
		}

		setFormData({
			employee_code: user.employee_code || '',
			name: user.name || '',
			email: user.email || '',
			mobile: user.mobile || '',
			role: user.role || 'user',
			status: (user.status || 'active').toLowerCase(),
			password: '',
			allowed_menus: Array.isArray(user.allowed_menus) ? user.allowed_menus : [],
			permissions: userPerms,
			changePassword: false,
		});
		setShowPassword(false);
		setModalError('');
		setIsCreateOpen(true);

		// Refresh account names from database to ensure fresh DB accounts
		try {
			const freshAccs = await api.getAccountNames();
			if (Array.isArray(freshAccs)) {
				setAccountNames(freshAccs);
			}
		} catch (err) {
			console.warn('Failed to refresh accounts from DB:', err);
		}
	};

	// Close Create / Edit Modal
	const handleCloseModal = () => {
		setIsCreateOpen(false);
		setEditingUser(null);
		setModalError('');
	};

	// Save or Update User
	const handleSubmit = async (e) => {
		e.preventDefault();
		const trimmedCode = formData.employee_code.trim().toUpperCase();
		const trimmedName = formData.name.trim();

		if (!trimmedCode) {
			setModalError('Employee Code is required.');
			return;
		}
		if (!trimmedName) {
			setModalError('Full Name is required.');
			return;
		}

		if (!editingUser && !formData.password.trim()) {
			setModalError('Password is required for new accounts.');
			return;
		}

		if (editingUser && formData.changePassword && !formData.password.trim()) {
			setModalError('Please enter the new password or uncheck "Change Password".');
			return;
		}

		const payload = {
			employee_code: trimmedCode,
			name: trimmedName,
			email: formData.email.trim(),
			mobile: formData.mobile.trim(),
			role: formData.role,
			status: formData.status || 'active',
			allowed_menus:
				['admin', 'super admin'].includes((formData.role || '').toLowerCase())
					? AVAILABLE_MENUS.map((m) => m.id)
					: formData.allowed_menus && formData.allowed_menus.length > 0
						? formData.allowed_menus
						: ['dashboard', 'joint-loan', 'sync'],
			permissions:
				['admin', 'super admin'].includes((formData.role || '').toLowerCase())
					? {
						primary: availableAccountList.map((a) => a.acronym),
						secondary: availableAccountList.map((a) => a.acronym),
					}
					: isJointLoanAllowed
					? {
						primary: formData.permissions?.primary || [],
						secondary: (formData.permissions?.secondary || []).filter(
							(a) => !(formData.permissions?.primary || []).includes(a)
						),
					}
					: { primary: [], secondary: [] },
		};

		if (!editingUser || formData.changePassword) {
			if (formData.password.trim()) {
				payload.password = formData.password.trim();
			}
		}

		setIsSubmitting(true);
		setModalError('');

		try {
			if (editingUser) {
				const res = await api.updateUser(editingUser.id, payload);
				if (res && res.user) {
					setUsers((prev) =>
						prev.map((u) => (u.id === editingUser.id ? res.user : u))
					);
					if (selectedUser && selectedUser.id === editingUser.id) {
						setSelectedUser(res.user);
					}
				} else {
					await loadData();
				}
				showToast(`User ${trimmedName} updated successfully.`);
			} else {
				const res = await api.createUser(payload);
				if (res && res.user) {
					setUsers((prev) => [...prev, res.user]);
				} else {
					await loadData();
				}
				showToast(`User ${trimmedName} created successfully.`);
			}
			handleCloseModal();
		} catch (err) {
			setModalError(err.message || 'Operation failed. Please review inputs.');
		} finally {
			setIsSubmitting(false);
		}
	};

	// Confirm Deletion
	const handleConfirmDelete = async () => {
		if (!userToDelete) return;
		setIsDeleting(true);
		try {
			await api.deleteUser(userToDelete.id);
			setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
			if (selectedUser && selectedUser.id === userToDelete.id) {
				setSelectedUser(null);
			}
			showToast(`User ${userToDelete.name || userToDelete.employee_code} deleted successfully.`);
			setUserToDelete(null);
		} catch (err) {
			showToast(err.message || 'Failed to delete user.', 'error');
		} finally {
			setIsDeleting(false);
		}
	};

	// Menu toggle
	const toggleMenu = (menuId) => {
		setFormData((prev) => {
			const exists = prev.allowed_menus.includes(menuId);
			return {
				...prev,
				allowed_menus: exists
					? prev.allowed_menus.filter((m) => m !== menuId)
					: [...prev.allowed_menus, menuId],
			};
		});
	};

	// Account Acronym toggle
	const toggleAccount = (acronym) => {
		setFormData((prev) => {
			const exists = prev.selectedAccounts.includes(acronym);
			return {
				...prev,
				selectedAccounts: exists
					? prev.selectedAccounts.filter((a) => a !== acronym)
					: [...prev.selectedAccounts, acronym],
			};
		});
	};

	// Role counts for tabs & dropdown
	const roleCounts = useMemo(() => {
		const all = users.length;
		const admin = users.filter((u) => ['admin', 'super admin'].includes((u.role || '').toLowerCase())).length;
		const manager = users.filter((u) => (u.role || '').toLowerCase() === 'manager').length;
		const standard = users.filter(
			(u) => (u.role || '').toLowerCase() === 'user' || !u.role
		).length;
		return { ALL: all, admin, manager, user: standard };
	}, [users]);

	// Role options for ModernRoleDropdown
	const roleDropdownOptions = useMemo(
		() => [
			{ id: 'ALL', label: 'All Roles', dot: 'bg-primary', count: roleCounts.ALL },
			{ id: 'admin', label: 'Admin', dot: 'bg-purple-500', count: roleCounts.admin },
			{ id: 'user', label: 'Users', dot: 'bg-blue-500', count: roleCounts.user },
		],
		[roleCounts]
	);

	// Status options for ModernStatusDropdown
	const statusDropdownOptions = useMemo(
		() => [
			{ id: 'ALL', label: 'All Statuses', dot: 'bg-primary', count: users.length },
			{
				id: 'active',
				label: 'Active',
				dot: 'bg-emerald-500',
				count: users.filter((u) => (u.status || 'active').toLowerCase() === 'active').length,
			},
			{
				id: 'inactive',
				label: 'Inactive',
				dot: 'bg-rose-500',
				count: users.filter((u) => (u.status || '').toLowerCase() === 'inactive').length,
			},
		],
		[users]
	);

	// Menu options for ModernMenuDropdown
	const menuDropdownOptions = useMemo(
		() => [{ id: 'ALL', label: 'All Menus', icon: 'view_quilt' }, ...AVAILABLE_MENUS],
		[]
	);

	// Filtered users
	const filteredUsers = useMemo(() => {
		return users.filter((u) => {
			const q = searchQuery.toLowerCase().trim();
			const matchesQuery =
				!q ||
				(u.name && u.name.toLowerCase().includes(q)) ||
				(u.employee_code && u.employee_code.toLowerCase().includes(q)) ||
				(u.email && u.email.toLowerCase().includes(q)) ||
				(u.mobile && u.mobile.toLowerCase().includes(q));

			const matchesRole =
				roleFilter === 'ALL' || (u.role || 'user').toLowerCase() === roleFilter.toLowerCase();

			const userStatus = (u.status || 'active').toLowerCase();
			const matchesStatus =
				statusFilter === 'ALL' || userStatus === statusFilter.toLowerCase();

			const userMenus = Array.isArray(u.allowed_menus) ? u.allowed_menus : [];
			const matchesMenu =
				menuFilter === 'ALL' ||
				['admin', 'super admin'].includes((u.role || '').toLowerCase()) ||
				userMenus.includes(menuFilter);

			return matchesQuery && matchesRole && matchesStatus && matchesMenu;
		});
	}, [users, searchQuery, roleFilter, statusFilter, menuFilter]);

	// Pagination calculations
	const totalItems = filteredUsers.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, totalItems);

	// Reset page on search or filter change
	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, roleFilter, statusFilter, menuFilter, pageSize]);

	// Keep currentPage in valid range when filtered items or page size changes
	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(Math.max(1, totalPages));
		}
	}, [currentPage, totalPages]);

	const paginatedUsers = useMemo(() => {
		return filteredUsers.slice(startIndex, endIndex);
	}, [filteredUsers, startIndex, endIndex]);

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

	// =========================================================================
	// Render User Details View if user selected (identical to JointLoan)
	// =========================================================================
	if (selectedUser) {
		return (
			<>
				<UserDetailsPage
					user={selectedUser}
					onBack={() => setSelectedUser(null)}
					onEdit={(u) => handleOpenEdit(u)}
					onDelete={(u) => setUserToDelete(u)}
					accountNames={accountNames}
					loans={loans}
				/>
				{renderDeleteModal()}
				{renderCreateModal()}
			</>
		);
	}

	// =========================================================================
	// Delete Confirmation Modal (matching renderDeleteModal in JointLoan.jsx)
	// =========================================================================
	function renderDeleteModal() {
		if (!userToDelete) return null;
		const badge = getUserRoleBadge(userToDelete.role);

		return (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans overscroll-contain animate-in fade-in duration-200"
				onClick={() => {
					if (!isDeleting) setUserToDelete(null);
				}}
			>
				<div
					className="bg-white rounded-2xl max-w-lg w-full shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div className="p-6 pb-4">
						<div className="flex items-start gap-4">
							<div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
								<span className="material-symbols-outlined" style={{ fontSize: '26px' }}>
									delete_forever
								</span>
							</div>
							<div className="flex-1 min-w-0">
								<h3 className="text-[17px] font-extrabold text-slate-900 leading-snug">
									Delete User Account?
								</h3>
								<p className="text-[12.5px] text-slate-500 leading-relaxed">
									Are you sure you want to permanently remove this user account?
								</p>
							</div>
						</div>

						{/* User Info Summary Card */}
						<div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
							<div className="flex items-center justify-between gap-2 mb-2">
								<span className="font-mono font-bold text-[12px] text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
									{userToDelete.employee_code}
								</span>
								<span
									className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ring-1 ${badge.color}`}
								>
									<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
									{badge.label}
								</span>
							</div>

							<div className="space-y-1.5 text-[12px]">
								<div className="flex items-center justify-between text-slate-600">
									<span className="text-slate-400">Full Name:</span>
									<span className="font-bold text-slate-800 truncate max-w-[200px]">
										{userToDelete.name || 'Unnamed User'}
									</span>
								</div>
								{userToDelete.email && (
									<div className="flex items-center justify-between text-slate-600">
										<span className="text-slate-400">Email:</span>
										<span className="font-semibold text-slate-700 truncate max-w-[200px]">
											{userToDelete.email}
										</span>
									</div>
								)}
								{userToDelete.mobile && (
									<div className="flex items-center justify-between text-slate-600">
										<span className="text-slate-400">Mobile:</span>
										<span className="font-semibold text-slate-700">
											{userToDelete.mobile}
										</span>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Modal Actions */}
					<div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
						<button
							type="button"
							onClick={() => setUserToDelete(null)}
							disabled={isDeleting}
							className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[13px] shadow-2xs transition-all active:scale-95 cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleConfirmDelete}
							disabled={isDeleting}
							className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[13px] shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer disabled:opacity-50"
						>
							{isDeleting ? (
								<>
									<span className="material-symbols-outlined text-[18px] animate-spin">
										progress_activity
									</span>
									<span>Deleting...</span>
								</>
							) : (
								<>
									<span className="material-symbols-outlined text-[18px]">delete</span>
									<span>Delete User</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		);
	}

	// =========================================================================
	// Create / Edit User Modal (matching New Loan Modal in JointLoan.jsx)
	// =========================================================================
	function renderCreateModal() {
		if (!isCreateOpen) return null;

		return createPortal(
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans overscroll-contain animate-in fade-in duration-200">
				<div
					className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl ring-1 ring-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Fixed Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20 shrink-0">
								<span className="material-symbols-outlined text-primary text-[22px]">
									{editingUser ? 'manage_accounts' : 'person_add'}
								</span>
							</div>
							<div>
								<h3 className="font-extrabold text-[16.5px] text-slate-900 tracking-tight">
									<span>{editingUser ? 'Edit User Profile' : 'New User Account'}</span>
								</h3>
								<p className="text-[11px] text-slate-400 font-medium">
									{editingUser
										? `Update employee details, role, menus, and Joint Loan permissions for ${editingUser.name || editingUser.employee_code}`
										: 'Configure employee code, full name, role, allowed menus, Joint Loan permissions, and password'}
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={handleCloseModal}
							className="p-1 h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
							title="Close modal"
						>
							<span className="material-symbols-outlined">close</span>
						</button>
					</div>

					{/* Scrollable Form Body */}
					<form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden">
						<div className="overflow-y-auto p-6 space-y-4">
							{/* Error Banner */}
							{modalError && (
								<div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-bold flex items-center gap-2">
									<span className="material-symbols-outlined text-[18px]">error</span>
									<span>{modalError}</span>
								</div>
							)}

							{/* 1. Employee Code & Full Name */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Employee Code <span className="text-rose-500">*</span>
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
											badge
										</span>
										<input
											type="text"
											value={formData.employee_code}
											onChange={(e) =>
												setFormData((prev) => ({
													...prev,
													employee_code: e.target.value.toUpperCase(),
												}))
											}
											placeholder="e.g. JC0002"
											className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono font-bold"
											required
										/>
									</div>
								</div>

								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Full Name <span className="text-rose-500">*</span>
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
											person
										</span>
										<input
											type="text"
											value={formData.name}
											onChange={(e) =>
												setFormData((prev) => ({ ...prev, name: e.target.value }))
											}
											placeholder="e.g. Dhina"
											className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-semibold"
											required
										/>
									</div>
								</div>
							</div>

							{/* 2. Mail ID & Mobile Number */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Mail ID
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
											mail
										</span>
										<input
											type="email"
											value={formData.email}
											onChange={(e) =>
												setFormData((prev) => ({ ...prev, email: e.target.value }))
											}
											placeholder="user@jubilant.com"
											className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
										/>
									</div>
								</div>

								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Mobile Number
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
											call
										</span>
										<input
											type="tel"
											value={formData.mobile}
											onChange={(e) =>
												setFormData((prev) => ({ ...prev, mobile: e.target.value }))
											}
											placeholder="+91 98765 43210"
											className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
										/>
									</div>
								</div>
							</div>

							{/* 3. Role & Account Status */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Role <span className="text-rose-500">*</span>
									</label>
									<FormRoleDropdown
										value={formData.role}
										isSoleAdmin={
											Boolean(
												editingUser &&
												['admin', 'super admin'].includes((editingUser.role || '').toLowerCase()) &&
												users.filter((u) => ['admin', 'super admin'].includes((u.role || '').toLowerCase()) && u.id !== editingUser.id).length === 0
											)
										}
										onChange={(newRole) => {
											setFormData((prev) => ({
												...prev,
												role: newRole,
												allowed_menus:
													['admin', 'super admin'].includes((newRole || '').toLowerCase())
														? AVAILABLE_MENUS.map((m) => m.id)
														: prev.allowed_menus,
											}));
										}}
									/>
									{editingUser &&
										['admin', 'super admin'].includes((editingUser.role || '').toLowerCase()) &&
										users.filter((u) => ['admin', 'super admin'].includes((u.role || '').toLowerCase()) && u.id !== editingUser.id).length === 0 && (
											<p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
												<span className="material-symbols-outlined text-[13px]">info</span>
												Sole Administrator: create or promote another Admin first before demoting.
											</p>
									)}
								</div>

								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Status <span className="text-rose-500">*</span>
									</label>
									<FormStatusDropdown
										value={formData.status || 'active'}
										onChange={(newStatus) => {
											setFormData((prev) => ({
												...prev,
												status: newStatus,
											}));
										}}
									/>
								</div>
							</div>

							{/* 4. Allowed Menus & Password */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
								<div>
									<div className="flex items-center justify-between mb-1">
										<label className="block text-[12px] font-bold text-slate-700">
											Allowed Menus
										</label>
										{['admin', 'super admin'].includes((formData.role || '').toLowerCase()) && (
											<span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full ring-1 ring-purple-200">
												Admin Full Access
											</span>
										)}
									</div>
									<FormMenuMultiSelectDropdown
										selectedMenus={formData.allowed_menus || []}
										onChange={(newMenus) =>
											setFormData((prev) => ({ ...prev, allowed_menus: newMenus }))
										}
										isAdmin={['admin', 'super admin'].includes((formData.role || '').toLowerCase())}
									/>
								</div>

								<div>
									{!editingUser || formData.changePassword ? (
										<div>
											<div className="flex items-center justify-between mb-1">
												<label className="block text-[12px] font-bold text-slate-700">
													{editingUser ? 'New Password' : 'Password'}{' '}
													<span className="text-rose-500">*</span>
												</label>
												{editingUser && (
													<button
														type="button"
														onClick={() =>
															setFormData((prev) => ({
																...prev,
																changePassword: false,
																password: '',
															}))
														}
														className="text-[11px] font-bold text-slate-500 hover:text-slate-700 underline cursor-pointer"
													>
														Cancel Reset
													</button>
												)}
											</div>
											<div className="relative">
												<input
													type={showPassword ? 'text' : 'password'}
													value={formData.password}
													onChange={(e) =>
														setFormData((prev) => ({ ...prev, password: e.target.value }))
													}
													placeholder="Enter password..."
													className="w-full pl-3.5 pr-10 py-2.5 rounded-xl text-[13px] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
													required={!editingUser || formData.changePassword}
												/>
												<button
													type="button"
													onClick={() => setShowPassword((p) => !p)}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
												>
													<span className="material-symbols-outlined text-[18px]">
														{showPassword ? 'visibility_off' : 'visibility'}
													</span>
												</button>
											</div>
										</div>
									) : (
										<div>
											<div className="flex items-center justify-between mb-1">
												<label className="block text-[12px] font-bold text-slate-700">
													Password
												</label>
												<button
													type="button"
													onClick={() =>
														setFormData((prev) => ({ ...prev, changePassword: true }))
													}
													className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
												>
													Reset Password
												</button>
											</div>
											<div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[12.5px] text-slate-700 font-semibold">
												<div className="flex items-center gap-2">
													<span className="material-symbols-outlined text-[18px] text-emerald-600">
														lock
													</span>
													<span>Password is encrypted</span>
												</div>
											</div>
										</div>
									)}
								</div>
							</div>

							{/* 5. Joint Loan Account Permissions (Primary vs Secondary Access) - Only if Joint Loan menu is allowed */}
							{isJointLoanAllowed && (
								<div className="space-y-2 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pb-1">
									<div>
										<label className="block text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5">
											<span className="material-symbols-outlined text-[18px] text-primary">
												handshake
											</span>
											<span>Joint Loan Account Permissions</span>
										</label>
										<p className="text-[11px] text-slate-400 mt-0.5">
											Choose any one option per account: <span className="font-semibold text-emerald-600">Primary</span> (Create &amp; Edit) or <span className="font-semibold text-blue-600">Secondary</span> (View Only - user can view loans where this account is Primary or Secondary).
										</p>
									</div>

									{formData.role !== 'admin' && (
										<div className="flex items-center gap-1.5 flex-wrap">
											<button
												type="button"
												onClick={setAllPrimary}
												className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer transition-all active:scale-95"
												title="Set all Joint Loan accounts to Primary (Create & Edit)"
											>
												All Primary
											</button>
											<button
												type="button"
												onClick={setAllSecondary}
												className="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg cursor-pointer transition-all active:scale-95"
												title="Set all Joint Loan accounts to Secondary (View Only)"
											>
												All Secondary
											</button>
											<button
												type="button"
												onClick={clearAllAccountPermissions}
												className="text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg cursor-pointer transition-all active:scale-95"
												title="Clear all Joint Loan account permissions"
											>
												Clear All
											</button>
										</div>
									)}
								</div>

								{/* Admin Callout */}
								{['admin', 'super admin'].includes((formData.role || '').toLowerCase()) ? (
									<div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-purple-900 text-[12px] font-semibold flex items-center gap-2">
										<span className="material-symbols-outlined text-[18px] text-purple-600">
											verified
										</span>
										<span>
											Administrators automatically have unrestricted Primary (Create &amp; Edit) and Secondary (View) access across all Joint Loan accounts.
										</span>
									</div>
								) : availableAccountList.length === 0 ? (
									<div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500 text-[12.5px]">
										<span className="material-symbols-outlined text-[20px] text-slate-400 block mb-1">
											handshake
										</span>
										No Joint Loan accounts found in database. Configure Joint Loan accounts in Settings to assign permissions.
									</div>
								) : (
									<div className="border border-slate-200/90 rounded-xl overflow-hidden bg-slate-50/40 divide-y divide-slate-100 max-h-56 overflow-y-auto">
										{availableAccountList.map((acc) => {
											const isPri = isAccountPrimary(acc.acronym);
											const isSec = isAccountSecondary(acc.acronym);

											return (
												<div
													key={acc.id || acc.acronym}
													className="px-3.5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-white transition-colors"
												>
													{/* Account Info */}
													<div className="flex items-center gap-2.5 min-w-0">
														<div className="truncate">
															<span className="font-bold text-[12.5px] text-slate-800">
																{acc.name}
															</span>
														</div>
														<span
															className={`inline-block font-extrabold text-[11px] px-2 py-0.5 rounded-md uppercase tracking-wider ring-1 flex-shrink-0 ${getEntityTagColor(
																acc.acronym,
																acc.color
															)}`}
														>
															{acc.acronym}
														</span>
													</div>

													{/* Mutually Exclusive Segmented Selector (Choose any one per account: None, Primary, or Secondary) */}
													<div className="inline-flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200/80 gap-1 flex-shrink-0">
														{/* None Option */}
														<button
															type="button"
															onClick={() => clearAccountPermission(acc.acronym)}
															className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none ${!isPri && !isSec
																? 'bg-white text-slate-700 shadow-2xs border border-slate-200/60'
																: 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
																}`}
															title="No access permissions for this account"
														>
															None
														</button>

														{/* Primary Option */}
														<button
															type="button"
															onClick={() => toggleAccountPrimary(acc.acronym)}
															className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer select-none ${isPri
																? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-700'
																: 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
																}`}
															title="Primary: User can create and edit joint loans where this account is Primary"
														>
															<span className="material-symbols-outlined text-[15px]">
																{isPri ? 'radio_button_checked' : 'radio_button_unchecked'}
															</span>
															<span>Primary</span>
														</button>

														{/* Secondary Option */}
														<button
															type="button"
															onClick={() => toggleAccountSecondary(acc.acronym)}
															className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer select-none ${isSec
																? 'bg-blue-600 text-white shadow-2xs ring-1 ring-blue-700'
																: 'text-slate-600 hover:text-blue-700 hover:bg-white/60'
																}`}
															title="Secondary: View Only. User can see joint loans where this account is Primary or Secondary"
														>
															<span className="material-symbols-outlined text-[15px]">
																{isSec ? 'radio_button_checked' : 'radio_button_unchecked'}
															</span>
															<span>Secondary</span>
														</button>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
							)}
						</div>

						{/* Fixed Footer */}
						<div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5 flex-shrink-0">
							<button
								type="button"
								onClick={handleCloseModal}
								disabled={isSubmitting}
								className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[13px] shadow-2xs transition-all active:scale-95 cursor-pointer"
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={isSubmitting}
								className="flex items-center gap-1.5 bg-primary-container hover:bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[13px] shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
							>
								{isSubmitting ? (
									<>
										<span className="material-symbols-outlined text-[18px] animate-spin">
											progress_activity
										</span>
										<span>Saving...</span>
									</>
								) : (
									<>
										<span className="material-symbols-outlined text-[18px]">check</span>
										<span>{editingUser ? 'Save Changes' : 'Create User'}</span>
									</>
								)}
							</button>
						</div>
					</form>
				</div>
			</div>,
			document.body
		);
	}

	// =========================================================================
	// Main Users Page Render (matching JointLoan.jsx structure)
	// =========================================================================
	return (
		<div className="flex flex-col w-full gap-space-lg font-sans">
			{/* Top Header & Page Title */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<span className="material-symbols-outlined text-[24px]">group</span>
						</div>
						<div>
							<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Users &amp; Access Control
							</h1>
							<p className="text-[13px] text-slate-500 mt-0.5">
								Configure staff credentials, roles, application menu visibility &amp; entity permissions
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-space-sm flex-wrap">
					{toastFeedback && (
						<span
							className={`text-[12px] font-bold px-2.5 py-1.5 rounded-xl ring-1 flex items-center gap-1 transition-all ${toastFeedback.type === 'error'
								? 'text-rose-700 bg-rose-50 ring-rose-200'
								: 'text-emerald-700 bg-emerald-50 ring-emerald-200'
								}`}
						>
							<span className="material-symbols-outlined text-[16px]">
								{toastFeedback.type === 'error' ? 'error' : 'check_circle'}
							</span>
							<span>{toastFeedback.message}</span>
						</span>
					)}

					<button
						type="button"
						onClick={handleOpenCreate}
						className="flex items-center gap-1.5 bg-primary-container hover:bg-primary text-on-primary px-space-md py-2.5 rounded-xl font-bold text-[13px] shadow-sm transition-all active:scale-95 cursor-pointer"
					>
						<span className="material-symbols-outlined text-[18px]">person_add</span>
						<span>New User</span>
					</button>
				</div>
			</div>

			{/* KPI Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
				{/* KPI 1: Total Users */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Total Users</span>
						<span className="material-symbols-outlined text-primary text-[20px]">group</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{roleCounts.ALL}
						</div>
						<div className="flex items-center gap-1 text-[12px] mt-1">
							<span className="font-bold text-primary">{roleCounts.ALL} accounts</span>
							<span className="text-slate-500">active staff</span>
						</div>
					</div>
				</div>

				{/* KPI 2: Administrators */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Administrators</span>
						<span className="material-symbols-outlined text-purple-600 text-[20px]">
							shield_person
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{roleCounts.admin}
						</div>
						<div className="flex items-center gap-1 text-[12px] mt-1">
							<span className="font-bold text-purple-700">{roleCounts.admin} admins</span>
							<span className="text-slate-500">full privileges</span>
						</div>
					</div>
				</div>

				{/* KPI 3: Managers */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Managers</span>
						<span className="material-symbols-outlined text-amber-600 text-[20px]">
							supervisor_account
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{roleCounts.manager}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-amber-700 font-semibold mt-1">
							<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
							<span>secondary verifiers</span>
						</div>
					</div>
				</div>

				{/* KPI 4: Standard Users */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Users</span>
						<span className="material-symbols-outlined text-sky-600 text-[20px]">person</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{roleCounts.user}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-sky-700 font-semibold mt-1">
							<span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
							<span>restricted access</span>
						</div>
					</div>
				</div>
			</div>

			{/* Main Card: Controls, Filters & Users Table (Requests.jsx style) */}
			<div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 flex flex-col gap-5">
				{/* Top Controls: Filter Dropdowns on Left, Search Input on Right */}
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
					{/* Filter Dropdowns on Left */}
					<div className="flex items-center flex-wrap gap-2.5">
						{/* Role Filter */}
						<ModernRoleDropdown
							value={roleFilter}
							onChange={setRoleFilter}
							options={roleDropdownOptions}
						/>

						{/* Status Filter */}
						<ModernStatusDropdown
							value={statusFilter}
							onChange={setStatusFilter}
							options={statusDropdownOptions}
						/>

						{/* Menu Access Filter */}
						<ModernMenuDropdown
							value={menuFilter}
							onChange={setMenuFilter}
							options={menuDropdownOptions}
						/>

						{/* Reset All Filters */}
						{(roleFilter !== 'ALL' || statusFilter !== 'ALL' || menuFilter !== 'ALL' || internalSearchQuery) && (
							<button
								type="button"
								onClick={() => {
									setRoleFilter('ALL');
									setStatusFilter('ALL');
									setMenuFilter('ALL');
									setInternalSearchQuery('');
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
					<div className="relative min-w-[200px] sm:w-64">
						<span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
							search
						</span>
						<input
							type="text"
							value={internalSearchQuery}
							onChange={(e) => setInternalSearchQuery(e.target.value)}
							placeholder="Search by name, code, email..."
							className="w-full h-9 pl-8 pr-8 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:bg-white placeholder:text-slate-400 font-medium"
						/>
						{internalSearchQuery && (
							<button
								type="button"
								onClick={() => setInternalSearchQuery('')}
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
								<th className="py-3 px-4 text-center w-12 whitespace-nowrap">#</th>
								<th className="py-3 px-4 whitespace-nowrap">Emp Code</th>
								<th className="py-3 px-4 whitespace-nowrap">User Name</th>
								<th className="py-3 px-4 whitespace-nowrap">Role</th>
								<th className="py-3 px-4 whitespace-nowrap">Status</th>
								<th className="py-3 px-4 whitespace-nowrap">Allowed Menus</th>
								<th className="py-3 px-4 text-right whitespace-nowrap">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 text-[13px] bg-white">
							{isLoading ? (
								<TableLoader colSpan={7} text="Loading user records..." size="lg" />
							) : filteredUsers.length === 0 ? (
								<tr>
									<td colSpan="7" className="py-16 text-center">
										<div className="max-w-sm mx-auto">
											<div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
												<span className="material-symbols-outlined text-[28px]">manage_accounts</span>
											</div>
											<h3 className="text-sm font-bold text-slate-800">
												No users found
											</h3>
											<p className="text-xs text-slate-500 mt-1">
												No user records match your selected role, status, or search query.
											</p>
											{(roleFilter !== 'ALL' || statusFilter !== 'ALL' || menuFilter !== 'ALL' || internalSearchQuery) && (
												<button
													type="button"
													onClick={() => {
														setRoleFilter('ALL');
														setStatusFilter('ALL');
														setMenuFilter('ALL');
														setInternalSearchQuery('');
													}}
													className="mt-3 text-xs font-bold text-primary hover:underline cursor-pointer"
												>
													Clear filters
												</button>
											)}
										</div>
									</td>
								</tr>
							) : (
								paginatedUsers.map((user, idx) => {
									const roleBadge = getUserRoleBadge(user.role);
									const initials = getUserInitials(user.name, user.employee_code);
									const isRootAdmin = ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase());

									const userMenus = Array.isArray(user.allowed_menus) ? user.allowed_menus : [];

									let rowPrimary = [];
									let rowSecondary = [];
									if (['admin', 'super admin'].includes((user.role || '').toLowerCase())) {
										rowPrimary = ['All (*)'];
										rowSecondary = ['All (*)'];
									} else if (user.permissions) {
										if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
											rowPrimary = Array.isArray(user.permissions.primary) ? user.permissions.primary : [];
											rowSecondary = Array.isArray(user.permissions.secondary) ? user.permissions.secondary : [];
										} else if (Array.isArray(user.permissions)) {
											rowPrimary = user.permissions;
										}
									}

									return (
										<tr
											key={user.id}
											onClick={() => setSelectedUser(user)}
											className="hover:bg-slate-50 transition-colors cursor-pointer group"
										>
											{/* 1. # */}
											<td className="py-3 px-4 text-center text-xs font-bold text-slate-500">
												{startIndex + idx + 1}
											</td>

											{/* 2. Emp Code */}
											<td className="py-3 px-4 whitespace-nowrap">
												<span className="font-extrabold text-[12px] text-primary bg-primary/10 px-2.5 py-1 rounded-md ring-1 ring-primary/20 font-mono">
													{user.employee_code}
												</span>
											</td>

											{/* 3. User Name */}
											<td className="py-3 px-4 max-w-[200px]">
												<div className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">
													{user.name || 'Unnamed User'}
												</div>
											</td>

											{/* 3. Role */}
											<td className="py-3 px-4">
												<span
													className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 ${roleBadge.color}`}
												>
													<span className={`w-1.5 h-1.5 rounded-full ${roleBadge.dot}`} />
													<span>{roleBadge.label}</span>
												</span>
											</td>

											{/* 4. Status */}
											<td className="py-3 px-4 whitespace-nowrap">
												{(user.status || 'active').toLowerCase() === 'inactive' ? (
													<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-600 bg-slate-100 ring-1 ring-slate-300">
														<span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
														<span>Inactive</span>
													</span>
												) : (
													<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200">
														<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
														<span>Active</span>
													</span>
												)}
											</td>

											{/* 5. Accessible Menus */}
											<td className="py-3 px-4">
												{['admin', 'super admin'].includes((user.role || '').toLowerCase()) ? (
													<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 ring-1 ring-purple-200">
														<span className="material-symbols-outlined text-[13px]">
															done_all
														</span>
														<span>All Menus</span>
													</span>
												) : userMenus.length > 0 ? (
													<div className="flex flex-wrap gap-1 max-w-[200px]">
														{userMenus.slice(0, 2).map((mId) => {
															const menuObj = AVAILABLE_MENUS.find((m) => m.id === mId);
															return (
																<span
																	key={mId}
																	className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
																>
																	{menuObj ? menuObj.label : mId}
																</span>
															);
														})}
														{userMenus.length > 2 && (
															<span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-slate-200 text-slate-600">
																+{userMenus.length - 2}
															</span>
														)}
													</div>
												) : (
													<span className="text-[12px] text-slate-400 italic">None</span>
												)}
											</td>

											{/* 7. Action */}
											<td className="py-3 px-4 text-right">
												<div className="flex items-center justify-end gap-1">
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handleOpenEdit(user);
														}}
														className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-100/80 transition-colors cursor-pointer"
														title="Edit user"
													>
														<span className="material-symbols-outlined" style={{ fontSize: '19px' }}>
															edit
														</span>
													</button>

													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															setUserToDelete(user);
														}}
														disabled={isRootAdmin}
														className={`flex items-center justify-center p-1.5 rounded-lg transition-colors cursor-pointer ${isRootAdmin
															? 'text-slate-300 cursor-not-allowed'
															: 'text-slate-400 hover:text-primary hover:bg-primary/10'
															}`}
														title={
															isRootAdmin
																? 'Primary system admin cannot be deleted'
																: 'Delete user'
														}
													>
														<span className="material-symbols-outlined" style={{ fontSize: '19px' }}>
															delete
														</span>
													</button>
												</div>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

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
							<span className="font-bold text-slate-900">{totalItems}</span> users
						</span>
						{totalItems !== users.length && (
							<span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200/70">
								{users.length} total
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
										className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-xl text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${isCurrent
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

			{/* Interactive Modals */}
			{renderDeleteModal()}
			{renderCreateModal()}
		</div>
	);
}
