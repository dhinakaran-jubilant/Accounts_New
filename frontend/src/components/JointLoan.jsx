/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Joint loan management component handling loan booking, repayment schedules, approval workflows, and audit history.
*/

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import {
	exportJointLoanToExcel,
	exportJointLoansListToExcel,
	exportOutstandingReportPerPrimaryAccount,
} from '../utils/jointLoanExport';

// Status badge styling helper for: Active, Overdue, Date Overdue, Closed, Pending
export const getStatusBadge = (status) => {
	switch (status) {
		case 'Active':
		case 'Settled':
			return {
				color: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
				dot: 'bg-emerald-500',
			};
		case 'Collected':
			return {
				color: 'bg-blue-100 text-blue-700 ring-blue-300',
				dot: 'bg-blue-500',
			};
		case 'Pending Payout Approval':
			return {
				color: 'bg-amber-100 text-amber-800 ring-amber-300',
				dot: 'bg-amber-500',
			};
		case 'Payout Discrepancy':
			return {
				color: 'bg-rose-100 text-rose-700 ring-rose-300',
				dot: 'bg-rose-500',
			};
		case 'Overdue':
			return {
				color: 'bg-rose-100 text-rose-700 ring-rose-300',
				dot: 'bg-rose-500',
			};
		case 'Date Overdue':
			return {
				color: 'bg-orange-100 text-orange-700 ring-orange-300',
				dot: 'bg-orange-500',
			};
		case 'Closed':
			return {
				color: 'bg-slate-100 text-slate-700 ring-slate-300',
				dot: 'bg-slate-400',
			};
		case 'Pending Secondary':
			return {
				color: 'bg-amber-100 text-amber-700 ring-amber-300',
				dot: 'bg-amber-500',
			};
		case 'Pending Admin':
			return {
				color: 'bg-purple-100 text-purple-700 ring-purple-300',
				dot: 'bg-purple-500',
			};
		case 'Rejected':
			return {
				color: 'bg-rose-100 text-rose-700 ring-rose-300',
				dot: 'bg-rose-500',
			};
		case 'Pending':
		default:
			return {
				color: 'bg-amber-100 text-amber-700 ring-amber-300',
				dot: 'bg-amber-500',
			};
	}
};

// Color map for account tag badges matching Settings presets
export const ACCOUNT_COLOR_MAP = {
	purple: 'bg-purple-50 text-purple-700 ring-purple-300',
	blue: 'bg-blue-50 text-blue-700 ring-blue-300',
	teal: 'bg-teal-50 text-teal-700 ring-teal-300',
	emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
	green: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
	amber: 'bg-amber-50 text-amber-700 ring-amber-300',
	orange: 'bg-amber-50 text-amber-700 ring-amber-300',
	rose: 'bg-rose-50 text-rose-700 ring-rose-300',
	red: 'bg-rose-50 text-rose-700 ring-rose-300',
	indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-300',
	cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-300',
	sky: 'bg-sky-50 text-sky-700 ring-sky-300',
	slate: 'bg-slate-100 text-slate-700 ring-slate-300',
};

// Curated dynamic palette for deterministic color generation when no DB color is assigned
const DYNAMIC_TAG_PALETTE = [
	'bg-purple-50 text-purple-700 ring-purple-300',
	'bg-teal-50 text-teal-700 ring-teal-300',
	'bg-blue-50 text-blue-700 ring-blue-300',
	'bg-amber-50 text-amber-700 ring-amber-300',
	'bg-rose-50 text-rose-700 ring-rose-300',
	'bg-emerald-50 text-emerald-700 ring-emerald-300',
	'bg-indigo-50 text-indigo-700 ring-indigo-300',
	'bg-cyan-50 text-cyan-700 ring-cyan-300',
];

// Module-level cache of account objects (populated via API and stored in localStorage)
let cachedGlobalAccountObjects = (() => {
	try {
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('loanDesk_account_names') : null;
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
})();

export const setCachedGlobalAccountObjects = (accounts) => {
	if (Array.isArray(accounts) && accounts.length > 0) {
		cachedGlobalAccountObjects = accounts;
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('loanDesk_account_names', JSON.stringify(accounts));
			}
		} catch {}
	}
};

// Tag color styling helper for any account (dynamically resolved from DB account objects, color name, or deterministic palette)
export const getPrimaryTagColor = (primary, accountObjects = []) => {
	if (!primary) return 'bg-slate-100 text-slate-700 ring-slate-300';

	// 1. If primary is already an account object with color property
	if (typeof primary === 'object' && primary !== null) {
		const objColor = primary.color || primary.colorName;
		if (objColor && ACCOUNT_COLOR_MAP[String(objColor).toLowerCase()]) {
			return ACCOUNT_COLOR_MAP[String(objColor).toLowerCase()];
		}
		primary = primary.acronym || primary.name || primary.accountName || primary.accountTag || '';
	}

	const raw = String(primary).trim();
	if (!raw) return 'bg-slate-100 text-slate-700 ring-slate-300';

	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const targetClean = clean(raw);

	// 2. If primary is directly a recognized color key (e.g. 'purple', 'teal', 'blue')
	if (ACCOUNT_COLOR_MAP[targetClean]) {
		return ACCOUNT_COLOR_MAP[targetClean];
	}

	// 3. Resolve from provided accountObjects or module-level cached account objects
	const accountsToSearch = (Array.isArray(accountObjects) && accountObjects.length > 0)
		? accountObjects
		: cachedGlobalAccountObjects;

	if (Array.isArray(accountsToSearch) && accountsToSearch.length > 0) {
		const matchedAcc = accountsToSearch.find((a) => {
			if (!a) return false;
			return (
				clean(a.acronym) === targetClean ||
				clean(a.name) === targetClean ||
				clean(a.accountName) === targetClean ||
				clean(a.label) === targetClean
			);
		});

		if (matchedAcc && matchedAcc.color) {
			const col = String(matchedAcc.color).toLowerCase();
			if (ACCOUNT_COLOR_MAP[col]) {
				return ACCOUNT_COLOR_MAP[col];
			}
		}
	}

	// 4. Deterministic hash-based dynamic color so ANY account code/name gets a consistent, vibrant badge
	let hash = 0;
	for (let i = 0; i < targetClean.length; i++) {
		hash = targetClean.charCodeAt(i) + ((hash << 5) - hash);
	}
	const paletteIndex = Math.abs(hash) % DYNAMIC_TAG_PALETTE.length;
	return DYNAMIC_TAG_PALETTE[paletteIndex];
};

// Format numeric string into Indian currency comma format (e.g. 5,00,000 or 5,00,000.50)
export const formatIndianNumber = (val) => {
	if (!val && val !== 0) return '';
	const raw = String(val).trim();
	if (!raw) return '';

	// Support decimal values if present (e.g. 2255000.01 -> 22,55,000.01)
	if (raw.includes('.')) {
		const parts = raw.split('.');
		const intPart = parts[0];
		const decPart = parts.slice(1).join('');
		const cleanInt = String(intPart || '0').replace(/[^0-9]/g, '');
		const cleanDec = String(decPart || '').replace(/[^0-9]/g, '').slice(0, 2);

		let formattedInt = '0';
		if (cleanInt) {
			try {
				formattedInt = BigInt(cleanInt).toLocaleString('en-IN');
			} catch (e) {
				const lastThree = cleanInt.substring(cleanInt.length - 3);
				const otherNumbers = cleanInt.substring(0, cleanInt.length - 3);
				formattedInt = otherNumbers !== ''
					? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
					: lastThree;
			}
		}
		if (raw.endsWith('.') && cleanDec === '') {
			return `${formattedInt}.`;
		}
		return cleanDec !== '' ? `${formattedInt}.${cleanDec}` : formattedInt;
	}

	const digits = raw.replace(/[^0-9]/g, '');
	if (!digits) return '';
	try {
		return BigInt(digits).toLocaleString('en-IN');
	} catch (e) {
		const lastThree = digits.substring(digits.length - 3);
		const otherNumbers = digits.substring(0, digits.length - 3);
		if (otherNumbers !== '') {
			return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
		}
		return lastThree;
	}
};

// Format date string to dd-mm-yyyy format (e.g. 18-09-2026)
export const formatLoanDate = (dateVal) => {
	if (!dateVal) return '-';
	const str = String(dateVal).trim();
	if (!str || str === '-' || str === '-') return '-';
	if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
		return str;
	}
	const parsed = parseAnyDateToDate(dateVal);
	if (parsed) {
		const dd = String(parsed.getDate()).padStart(2, '0');
		const mm = String(parsed.getMonth() + 1).padStart(2, '0');
		const yyyy = parsed.getFullYear();
		return `${dd}-${mm}-${yyyy}`;
	}
	const parts = str.split(/[-/]/);
	if (parts.length === 3 && parts[0].length === 4) {
		return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
	}
	return str;
};

// Format share percentage value: integer if no decimals, or up to 2 decimal digits if fractional (e.g. 98 -> '98', 45.4545 -> '45.45')
export const formatSharePercent = (val) => {
	if (val === null || val === undefined || val === '') return '0';
	const num = Number(val);
	if (isNaN(num)) return '0';
	const rounded = Math.round(num * 100) / 100;
	return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(2);
};

// Strip 'JL', 'JL-', 'JL_' prefixes from loan reference ID for comparison
export const stripLoanPrefix = (str) => {
	if (!str) return '';
	return String(str)
		.trim()
		.replace(/^(?:jl[-_]?)+/i, '')
		.trim();
};

export const cleanLoanId = (str) => {
	return stripLoanPrefix(str)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
};

export const normalizeDateForCompare = (dateVal) => {
	if (!dateVal) return '';
	const formatted = formatLoanDate(dateVal);
	return formatted === '-' ? '' : formatted;
};

export const normalizeNameForCompare = (name) => {
	return String(name || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
};

// Extract loan ID or reference from URL pathname (e.g. /joint-loan/JLSS000040 or /joint-loans/JLSS000040)
export const extractLoanIdFromPath = (pathname = typeof window !== 'undefined' ? window.location.pathname : '') => {
	if (!pathname) return null;
	const match = pathname.match(/^\/joint-loans?\/([^/?#]+)/i);
	return match ? decodeURIComponent(match[1]).trim() : null;
};

// Check if a loan object matches a target loan ID or reference flexibly
export const isMatchingLoan = (loan, targetId) => {
	if (!loan || !targetId) return false;
	const tid = String(targetId).trim().toUpperCase();
	const lId = String(loan.id || '').trim().toUpperCase();
	const lRef = String(loan.loan_ref_id || '').trim().toUpperCase();
	const lDbId = String(loan.db_id || '').trim();

	if (lId === tid || lRef === tid || (lDbId && lDbId === String(targetId).trim())) {
		return true;
	}

	const cleanTid = cleanLoanId(targetId);
	if (cleanTid) {
		if (cleanLoanId(loan.id) === cleanTid || cleanLoanId(loan.loan_ref_id) === cleanTid) {
			return true;
		}
	}
	return false;
};

// Secondary account dropdown options
const secondaryAccountOptions = [
	'Finova Capital',
	'A Square',
	'Apex Capital Co-Partner',
	'Horizon Freight Affiliate',
	'Vanguard Allied Trust',
	'Sterling Guaranty Group',
	'Chen Practice Associates',
	'Metro Fleet Syndicate',
	'Pacific Commercial Guarantors',
	'Artisan Retail Holdings',
];

// Joint loans list initialized from database
const initialJointLoans = [];

// Modern custom dropdown component for secondary account selection
function ModernAccountSelect({ value, onChange, options = [], placeholder = 'Select account', accountObjects = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [openUpward, setOpenUpward] = useState(false);
	const [menuMaxHeight, setMenuMaxHeight] = useState(240);
	const [searchTerm, setSearchTerm] = useState('');
	const dropdownRef = useRef(null);
	const searchInputRef = useRef(null);

	// Update dropdown open direction (up/down) and maxHeight based on available space
	const updateDropdownPlacement = useCallback(() => {
		if (!dropdownRef.current) return;
		const rect = dropdownRef.current.getBoundingClientRect();
		let spaceBelow = window.innerHeight - rect.bottom;
		let spaceAbove = rect.top;

		// Find nearest scrolling/clipping container (e.g. .overflow-y-auto in modal)
		let parent = dropdownRef.current.parentElement;
		while (parent && parent !== document.body && parent !== document.documentElement) {
			const style = window.getComputedStyle(parent);
			const overflowY = style.overflowY || '';
			const overflow = style.overflow || '';
			if (
				['auto', 'scroll', 'hidden'].includes(overflowY) ||
				['auto', 'scroll', 'hidden'].includes(overflow) ||
				parent.classList.contains('overflow-y-auto')
			) {
				const pRect = parent.getBoundingClientRect();
				spaceBelow = Math.min(spaceBelow, pRect.bottom - rect.bottom);
				spaceAbove = Math.min(spaceAbove, rect.top - pRect.top);
				break;
			}
			parent = parent.parentElement;
		}

		const neededHeight = 240;
		// If space below is insufficient for dropdown and more space above, open upwards
		const shouldOpenUp = spaceBelow < neededHeight && spaceAbove > spaceBelow;
		setOpenUpward(shouldOpenUp);

		const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
		const safeHeight = Math.min(240, Math.max(130, Math.floor(availableSpace - 12)));
		setMenuMaxHeight(safeHeight);
	}, []);

	// Toggle dropdown and dynamically position upward if near bottom
	const handleToggle = () => {
		if (!isOpen) {
			updateDropdownPlacement();
			setSearchTerm('');
		}
		setIsOpen((prev) => !prev);
	};

	// Recalculate on open, resize, or scroll (captured for nested scroll containers)
	useEffect(() => {
		if (!isOpen) return;
		updateDropdownPlacement();

		const handleReposition = () => {
			updateDropdownPlacement();
		};

		window.addEventListener('resize', handleReposition);
		window.addEventListener('scroll', handleReposition, true);
		return () => {
			window.removeEventListener('resize', handleReposition);
			window.removeEventListener('scroll', handleReposition, true);
		};
	}, [isOpen, updateDropdownPlacement]);

	// Focus search input when dropdown opens
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// Close dropdown when clicking outside or pressing Escape
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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

	// Normalize options to { name, acronym, label, value }
	const normalizedOptions = useMemo(() => {
		return options.map((opt) => {
			if (typeof opt === 'object' && opt !== null) {
				const name = String(opt.name || opt.value || opt.label || '').trim();
				const acronym = opt.acronym ? String(opt.acronym).trim().toUpperCase() : getAcronym(name, accountObjects);
				let label = opt.label;
				if (!label) {
					const cleanName = name.toUpperCase();
					label = (acronym && acronym !== cleanName && !cleanName.endsWith(`(${acronym})`))
						? `${cleanName} (${acronym})`
						: cleanName;
				}
				const value = opt.value || name.toUpperCase();
				return { name, acronym, label, value };
			}
			const str = String(opt || '').trim();
			const cleanName = str.toUpperCase();
			const acronym = getAcronym(str, accountObjects);
			const label = (acronym && acronym !== cleanName && !cleanName.endsWith(`(${acronym})`))
				? `${cleanName} (${acronym})`
				: cleanName;
			return { name: str, acronym, label, value: cleanName };
		});
	}, [options, accountObjects]);

	// Filter options based on search term
	const filteredOptions = useMemo(() => {
		if (!searchTerm.trim()) return normalizedOptions;
		const query = searchTerm.toLowerCase().trim();
		return normalizedOptions.filter(
			(opt) =>
				opt.label.toLowerCase().includes(query) ||
				opt.name.toLowerCase().includes(query) ||
				opt.acronym.toLowerCase().includes(query)
		);
	}, [normalizedOptions, searchTerm]);

	// Find matching option for selected value
	const selectedOption = useMemo(() => {
		if (!value) return null;
		const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
		const target = clean(value);
		return normalizedOptions.find(
			(opt) =>
				clean(opt.value) === target ||
				clean(opt.name) === target ||
				clean(opt.label) === target
		);
	}, [value, normalizedOptions]);

	// Display value in trigger button
	const triggerDisplay = useMemo(() => {
		if (!value) return '';
		if (selectedOption?.label) return selectedOption.label;
		const raw = String(value).trim();
		const acr = getAcronym(raw, accountObjects);
		const upper = raw.toUpperCase();
		if (acr && acr !== upper && !upper.endsWith(`(${acr})`)) {
			return `${upper} (${acr})`;
		}
		return upper;
	}, [value, selectedOption, accountObjects]);

	return (
		<div className={`relative w-full ${isOpen ? 'z-40' : 'z-10'}`} ref={dropdownRef}>
			{/* Trigger Button */}
			<button
				type="button"
				onClick={handleToggle}
				className={`w-full h-10 px-3.5 py-2 rounded-xl text-[12.5px] bg-white border transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isOpen
					? 'border-primary ring-2 ring-primary/20 bg-white'
					: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
					}`}
				aria-expanded={isOpen}
			>
				<div className="flex items-center min-w-0">
					{value ? (
						<span className="truncate text-slate-900 font-bold text-[12px] uppercase tracking-wide">
							{triggerDisplay}
						</span>
					) : (
						<span className="truncate text-slate-400 font-normal text-[12px]">
							{placeholder}
						</span>
					)}
				</div>
				<span
					className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 text-primary' : ''
						}`}
				>
					expand_more
				</span>
			</button>

			{/* Floating Options Menu */}
			{isOpen && (
				<div
					className={`absolute left-0 right-0 z-50 bg-white rounded-xl shadow-2xl ring-1 ring-slate-900/10 border border-slate-100 flex flex-col overflow-hidden animate-fadeIn ${openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
						}`}
					style={{ maxHeight: `${menuMaxHeight}px` }}
				>
					{/* Search Bar if more than 3 options */}
					{normalizedOptions.length > 3 && (
						<div className="p-2 border-b border-slate-100 bg-slate-50/70 sticky top-0 z-10 flex-shrink-0">
							<div className="relative">
								<span className="material-symbols-outlined text-[15px] text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">
									search
								</span>
								<input
									ref={searchInputRef}
									type="text"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									placeholder="Search account..."
									className="w-full h-7 pl-7 pr-2 text-[11.5px] uppercase bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-400 placeholder:normal-case font-medium"
								/>
								{searchTerm && (
									<button
										type="button"
										onClick={() => setSearchTerm('')}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[13px] cursor-pointer"
									>
										×
									</button>
								)}
							</div>
						</div>
					)}

					{/* Options List */}
					<div className="overflow-y-auto divide-y divide-slate-50 py-1 flex-1">
						{filteredOptions.length > 0 ? (
							filteredOptions.map((opt) => {
								const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
								const isSelected =
									clean(opt.value) === clean(value) ||
									clean(opt.name) === clean(value) ||
									clean(opt.label) === clean(value);
								return (
									<button
										key={opt.value || opt.label}
										type="button"
										onClick={() => {
											onChange(opt.value, opt);
											setIsOpen(false);
										}}
										className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[12px] transition-colors text-left cursor-pointer group ${isSelected
											? 'bg-primary/10 text-primary font-bold'
											: 'text-slate-700 hover:bg-slate-50 hover:text-primary font-medium'
											}`}
									>
										<div className="flex items-center min-w-0">
											<span className="truncate uppercase font-bold text-[12px] tracking-wide">
												{opt.label}
											</span>
										</div>
										{isSelected && (
											<span className="material-symbols-outlined text-[16px] text-primary flex-shrink-0 ml-2">
												check
											</span>
										)}
									</button>
								);
							})
						) : (
							<div className="px-3 py-4 text-center text-slate-400 text-[12px] font-medium">
								{searchTerm ? 'No matching accounts found' : 'No accounts available'}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// Helper to compute realistic account breakdown (account name, principal, interest, interest %, repay amount)
// Helper to compute realistic account breakdown (account name, principal, interest, interest %, repay amount)
export const getLoanAccountDetails = (loan) => {
	if (!loan) return [];

	const totalSched = Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0
		? loan.repaymentSchedule.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
		: Number(loan.total_repayment_amount || loan.total_repayment || loan.totalRepayAmount || 0);

	if (loan.accountDetails && loan.accountDetails.length > 0) {
		const totalPrin = loan.accountDetails.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) || Number(loan.amount) || 0;
		const secAccounts = loan.accountDetails.filter((a) => !a.isPrimary);
		const totalSecShare = secAccounts.reduce((sum, a) => sum + Number(a.share || 0), 0);

		return loan.accountDetails.map((acc) => {
			let sharePct = (totalPrin > 0 && acc.principal != null && Number(acc.principal) > 0)
				? ((Number(acc.principal) || 0) / totalPrin) * 100
				: (acc.share != null ? Number(acc.share) : 0);
			if (acc.isPrimary) {
				if (totalSecShare >= 100 || (Number(acc.principal) === 0 && totalSecShare > 0)) {
					sharePct = Math.max(0, 100 - totalSecShare);
				}
			}
			const accPrin = Number(acc.principal) || 0;
			const accInt = (totalSched > 0 && sharePct != null)
				? Math.round(((totalSched - totalPrin) * sharePct) / 100)
				: (Number(acc.interest) || 0);
			const accRepay = (totalSched > 0 && sharePct != null)
				? Math.round((totalSched * sharePct) / 100)
				: (accPrin + accInt);
			return {
				...acc,
				share: sharePct,
				interest: Math.max(0, accInt),
				repayAmount: accRepay,
			};
		});
	}

	const rawRate = parseFloat(String(loan.rate || '7.2').replace(/[^0-9.]/g, '')) || 7.2;
	const totalAmount = Number(loan.amount) || 0;
	const tenureMatch = String(loan.tenure || '').match(/\d+/);
	const tenureMonths = tenureMatch ? parseInt(tenureMatch[0], 10) : 36;
	const tenureYears = Math.max(1, Math.round((tenureMonths / 12) * 10) / 10);

	const hasSchedRepay = totalSched > 0 && totalSched >= totalAmount;
	const totalFacilityInterest = hasSchedRepay
		? totalSched - totalAmount
		: Math.round(totalAmount * (rawRate / 100) * (tenureYears * 0.55));

	const calculateInterest = (principal, rate, share) => {
		if (hasSchedRepay && share != null) {
			return Math.round((totalFacilityInterest * share) / 100);
		}
		return Math.round(principal * (rate / 100) * (tenureYears * 0.55));
	};

	const priName = loan.primaryAccountName || loan.primary_account_name || loan.primaryBorrower?.name || 'Primary Account';
	const priTag = loan.primary || (priName.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase()) || 'PRI';
	
	const rawLoanPriShare = loan.primaryShare ?? loan.primary_account_share ?? loan.primarySharePct;
	let pShare = 60;
	if (totalAmount > 0 && loan.primary_account_amount != null && Number(loan.primary_account_amount) > 0) {
		pShare = ((Number(loan.primary_account_amount) || 0) / totalAmount) * 100;
	} else if (loan.secondaryAccounts && loan.secondaryAccounts.length > 0) {
		const secPctSum = loan.secondaryAccounts.reduce((sum, s) => sum + Number(s.share || s.percentage || 0), 0);
		if (secPctSum >= 100 || (loan.primary_account_amount != null && Number(loan.primary_account_amount) === 0)) {
			pShare = Math.max(0, 100 - secPctSum);
		} else if (rawLoanPriShare != null && rawLoanPriShare !== '') {
			pShare = Number(rawLoanPriShare);
		} else {
			pShare = Math.max(0, 100 - secPctSum);
		}
	} else if (rawLoanPriShare != null && rawLoanPriShare !== '') {
		pShare = Number(rawLoanPriShare);
	}

	const pPrincipal = pShare === 0
		? 0
		: (loan.primary_account_amount != null
			? Number(loan.primary_account_amount)
			: Math.round((totalAmount * pShare) / 100));
	const pInterest = pShare === 0
		? 0
		: (hasSchedRepay
			? Math.round((totalFacilityInterest * pShare) / 100)
			: (loan.primary_account_interest != null ? Number(loan.primary_account_interest) : calculateInterest(pPrincipal, rawRate, pShare)));
	const pRepay = pShare === 0
		? 0
		: (hasSchedRepay
			? Math.round((totalSched * pShare) / 100)
			: (pPrincipal + pInterest));

	const accounts = [
		{
			id: `acc-pri-${loan.id || 'main'}`,
			isPrimary: true,
			accountCategory: 'Primary Account',
			accountName: priName,
			accountTag: priTag,
			role: 'Primary Account',
			initials: priTag,
			principal: pPrincipal,
			interest: pInterest,
			interestRate: rawRate,
			repayAmount: pRepay,
			share: pShare,
		},
	];

	if (loan.secondaryAccounts && loan.secondaryAccounts.length > 0) {
		const validSecAccounts = loan.secondaryAccounts.filter(
			(a) => (a.accountName || a.name) && (Number(String(a.amount || a.share || 0).replace(/[^0-9.-]+/g, '')) > 0 || a.share)
		);

		validSecAccounts.forEach((sec, idx) => {
			const sName = sec.accountName || sec.name || `Secondary ${idx + 1}`;
			const p = Number(String(sec.amount || sec.share || 0).replace(/[^0-9.-]+/g, '')) || 0;
			const r = Math.round((rawRate + 0.2) * 100) / 100;
			const rawSecShare = (p > 0 && totalAmount > 0)
				? ((p / totalAmount) * 100)
				: (sec.share != null ? Number(sec.share) : (sec.percentage != null ? Number(sec.percentage) : ((100 - pShare) / Math.max(1, validSecAccounts.length))));
			const secShare = rawSecShare;
			const interestVal = hasSchedRepay
				? Math.round((totalFacilityInterest * secShare) / 100)
				: (Number(sec.interest || sec.interest_amount) || calculateInterest(p, r, secShare));
			const secRepay = hasSchedRepay
				? Math.round((totalSched * secShare) / 100)
				: (p + interestVal);
			const tag = sec.accountTag || sName.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase() || `S${idx + 1}`;
			accounts.push({
				id: `acc-sec-${sec.id || idx}`,
				isPrimary: false,
				accountCategory: 'Secondary Account',
				accountName: sName,
				accountTag: tag,
				role: 'Secondary Account',
				initials: tag,
				principal: p,
				interest: interestVal,
				interestRate: r,
				repayAmount: secRepay,
				share: secShare,
				tds: Number(sec.tds) || Math.round(interestVal * 0.1),
			});
		});
	}

	return accounts;
};

// Helper to clean OCR artifacts from customer name (e.g. 'AF] ASSOCIATES vr' -> 'AFJ ASSOCIATES')
export const cleanCustomerName = (rawName) => {
	if (!rawName) return '';
	let s = String(rawName).trim();
	s = s.replace(/\b(?:vr|yr|v~|vi|iv|pic|photo|img|icon|thumbnail)\b\s*,?\s*(?:No\s*Image|NoImage|Nolmage|No\s*Photo)?/gi, '');
	s = s.replace(/\b(?:No\s*Image|NoImage|Nolmage|No\s*Photo|NoPhoto|S\/o|W\/o|D\/o|C\/o)\b/gi, '');
	s = s.replace(/\b(?:vr|yr|v~|vi|iv)\b\s*$/gi, '');
	s = s.replace(/(?<=[A-Z])\]/g, 'J');
	s = s.replace(/\](?=[A-Z])/g, 'J');
	s = s.replace(/\b\](?=[a-zA-Z])/g, 'J');
	s = s.replace(/\s+/g, ' ');
	return s.replace(/[,.\s\-_/]+$/, '').trim();
};

// Helper to generate realistic installment repayment schedule
export const generateRepaymentSchedule = (loan, accountsList) => {
	if (!loan) return [];
	const totalAmount = Number(loan.amount) || 0;
	const tenureMatch = String(loan.total_installments || loan.total_dues || loan.total_emis || loan.tenure || '').match(/\d+/);
	const tenureMonths = tenureMatch ? parseInt(tenureMatch[0], 10) : 10;
	const rawSchedule = (Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0)
		? loan.repaymentSchedule
		: ((Array.isArray(loan.repayment_schedule) && loan.repayment_schedule.length > 0) ? loan.repayment_schedule : null);
	const hasPdfSchedule = Boolean(rawSchedule && rawSchedule.length > 0);
	const count = hasPdfSchedule ? rawSchedule.length : (tenureMatch ? tenureMonths : 10);

	// Resolve accounts for Primary and Secondary split
	const effectiveAccounts =
		accountsList && accountsList.length > 0 ? accountsList : getLoanAccountDetails(loan);
	const primaryAcc = effectiveAccounts.find((a) => a.isPrimary) || effectiveAccounts[0] || {
		accountName: loan.primary_account_name || loan.primaryAccountName || 'Primary Account',
		accountTag: loan.primary || 'PRI',
		share: (loan.primaryShare != null && loan.primaryShare !== '')
			? Number(loan.primaryShare)
			: (loan.primary_account_share != null ? Number(loan.primary_account_share) : 60),
	};
	const secAccs = effectiveAccounts.filter((a) => !a.isPrimary);

	const priSharePct = (primaryAcc && primaryAcc.principal != null && Number(primaryAcc.principal) > 0 && totalAmount > 0)
		? ((Number(primaryAcc.principal) / totalAmount) * 100)
		: ((primaryAcc && primaryAcc.share != null && primaryAcc.share !== '' && !isNaN(Number(primaryAcc.share)))
			? Number(primaryAcc.share)
			: (secAccs.length > 0
				? Math.max(0, 100 - secAccs.reduce((s, a) => s + (Number(a.share) || 0), 0))
				: ((loan.primaryShare != null && loan.primaryShare !== '')
					? Number(loan.primaryShare)
					: (loan.primary_account_share != null ? Number(loan.primary_account_share) : 60))));
	const secShareSum = secAccs.reduce((s, a) => s + (Number(a.share) || 0), 0);
	const totalSecShare = secAccs.length > 0 && secShareSum > 0 ? secShareSum : Math.max(0, 100 - priSharePct);

	// Total facility obligation metrics across all co-lending accounts
	const totalFacilityRepay = effectiveAccounts.reduce((sum, a) => sum + (Number(a.repayAmount) || 0), 0) || totalAmount;
	const totalFacilityInterest = effectiveAccounts.reduce((sum, a) => sum + (Number(a.interest) || 0), 0);

	// Base monthly EMI and Interest for count EMIs
	const baseEmiTotal = Math.round(totalFacilityRepay / count);
	const baseEmiInterest = Math.round(totalFacilityInterest / count);

	let startYear = 2026;
	let startMonth = 6; // 0-indexed: 6 = July
	const startDay = 18;

	const customStartDate = loan.repaymentStartDate || loan.scheduleStartDate || loan.appliedDate;
	if (customStartDate) {
		const parts = String(customStartDate).split(/[-/]/);
		if (parts.length === 3) {
			if (parts[0].length === 4) {
				startYear = parseInt(parts[0], 10);
				startMonth = parseInt(parts[1], 10) - 1;
			} else {
				startYear = parseInt(parts[2], 10);
				startMonth = parseInt(parts[1], 10) - 1;
			}
		}
	}

	const schedule = [];
	let currentBalance = totalAmount;

	const isClosed = loan.status === 'Closed';

	const loanNumericId = parseInt(String(loan.id || '1').replace(/\D/g, ''), 10) || 1;
	const baseChqNum = 482100 + (loanNumericId * 100);

	for (let i = 1; i <= count; i++) {
		const monthOffset = i - 1;
		const pdfRow = hasPdfSchedule ? rawSchedule[i - 1] : null;

		// Schedule/Billing Date
		const scheduleDateObj = new Date(startYear, startMonth + monthOffset, startDay);
		const sD = String(scheduleDateObj.getDate()).padStart(2, '0');
		const sM = String(scheduleDateObj.getMonth() + 1).padStart(2, '0');
		const sY = scheduleDateObj.getFullYear();
		const dateStr = pdfRow?.date || `${sD}-${sM}-${sY}`;

		// Received Date & Payment Date from DB row
		const receivedDate = pdfRow?.received_date || pdfRow?.receivedDate || '';
		const paymentDate = pdfRow?.payment_date || pdfRow?.paymentDate || '';

		// Installment EMI total & Interest
		const emiTotal = pdfRow?.amount ?? (i === count ? totalFacilityRepay - baseEmiTotal * (count - 1) : baseEmiTotal);
		const monthlyInterest = pdfRow?.interest_amount ?? (pdfRow?.interest ?? (i === count ? totalFacilityInterest - baseEmiInterest * (count - 1) : baseEmiInterest));
		const principalComp = Math.min(currentBalance, Math.max(0, emiTotal - monthlyInterest));
		currentBalance = Math.max(0, currentBalance - principalComp);

		// Primary split per EMI
		const priRepayTotal = priSharePct === 0
			? 0
			: ((primaryAcc && primaryAcc.repayAmount != null && primaryAcc.repayAmount !== '' && !isNaN(Number(primaryAcc.repayAmount)))
				? Number(primaryAcc.repayAmount)
				: Math.round((totalFacilityRepay * priSharePct) / 100));
		const priInterestTotal = priSharePct === 0
			? 0
			: ((primaryAcc && primaryAcc.interest != null && primaryAcc.interest !== '' && !isNaN(Number(primaryAcc.interest)))
				? Number(primaryAcc.interest)
				: Math.round((totalFacilityInterest * priSharePct) / 100));
		const priAmount = priSharePct === 0
			? 0
			: (hasPdfSchedule
				? Math.round((emiTotal * priSharePct) / 100)
				: (i === count ? priRepayTotal - Math.round(priRepayTotal / count) * (count - 1) : Math.round(priRepayTotal / count)));
		const priInterest = priSharePct === 0
			? 0
			: (hasPdfSchedule
				? Math.round((monthlyInterest * priSharePct) / 100)
				: (i === count ? priInterestTotal - Math.round(priInterestTotal / count) * (count - 1) : Math.round(priInterestTotal / count)));

		// Per-secondary-account split per EMI
		let remainingAmount = emiTotal - priAmount;
		let remainingInterest = monthlyInterest - priInterest;

		const secAccountsData = secAccs.map((sa, idx) => {
			const saSharePct = (sa && sa.principal != null && Number(sa.principal) > 0 && totalAmount > 0)
				? ((Number(sa.principal) / totalAmount) * 100)
				: ((sa && sa.share != null && sa.share !== '' && !isNaN(Number(sa.share)))
					? Number(sa.share)
					: (secAccs.length > 0 ? (totalSecShare / secAccs.length) : 0));
			const saRepayTotal = (sa && sa.repayAmount != null && sa.repayAmount !== '' && !isNaN(Number(sa.repayAmount)))
				? Number(sa.repayAmount)
				: Math.round((totalFacilityRepay * saSharePct) / 100);
			const saInterestTotal = (sa && sa.interest != null && sa.interest !== '' && !isNaN(Number(sa.interest)))
				? Number(sa.interest)
				: Math.round((totalFacilityInterest * saSharePct) / 100);

			let saAmount, saInterest;
			if (idx === secAccs.length - 1) {
				saAmount = remainingAmount;
				saInterest = remainingInterest;
			} else {
				saAmount = hasPdfSchedule
					? Math.round((emiTotal * saSharePct) / 100)
					: (i === count ? saRepayTotal - Math.round(saRepayTotal / count) * (count - 1) : Math.round(saRepayTotal / count));
				saInterest = hasPdfSchedule
					? Math.round((monthlyInterest * saSharePct) / 100)
					: (i === count ? saInterestTotal - Math.round(saInterestTotal / count) * (count - 1) : Math.round(saInterestTotal / count));
				remainingAmount -= saAmount;
				remainingInterest -= saInterest;
			}

			return {
				accountName: sa.accountName || `Secondary ${idx + 1}`,
				accountTag: sa.accountTag || sa.initials || `S${idx + 1}`,
				share: saSharePct,
				amount: saAmount,
				interest: saInterest,
				tds: sa.tds || 0,
			};
		});

		// Instrument Cheque Number from DB row
		const chqNo = pdfRow?.cheque_no || pdfRow?.chequeNo || (pdfRow ? '' : `CHQ-${baseChqNum + i}`);

		// Status calculation purely from DB row & actual dates
		let status = 'Active';
		let badgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
		let dotClass = 'bg-emerald-500';

		if (pdfRow?.status) {
			status = pdfRow.status;
		} else if (isClosed) {
			status = 'Settled';
		} else if (receivedDate) {
			status = 'Collected';
		} else if (isDueDateCrossed(dateStr)) {
			status = 'Overdue';
		} else {
			status = 'Active';
		}

		if (status === 'Settled' || status === 'Closed' || status === 'Active') {
			badgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
			dotClass = 'bg-emerald-500';
		} else if (status === 'Collected' || status === 'Paid') {
			badgeClass = 'bg-blue-50 text-blue-700 ring-blue-200';
			dotClass = 'bg-blue-500';
		} else if (status === 'Overdue') {
			badgeClass = 'bg-rose-50 text-rose-700 ring-rose-200';
			dotClass = 'bg-rose-500';
		} else {
			badgeClass = 'bg-slate-100 text-slate-700 ring-slate-200';
			dotClass = 'bg-amber-400';
		}

		const legacySecAcc = secAccountsData[0] || { amount: 0, interest: 0, accountTag: 'SEC', accountName: 'Secondary Account', share: totalSecShare };

		const rawPStatus = pdfRow?.payout_approval_status || pdfRow?.payoutApprovalStatus;
		const isApprovedPayout = Boolean(
			pdfRow?.payout_approved_by ||
			pdfRow?.payoutApprovedBy ||
			status === 'Settled'
		);
		let effectivePayoutStatus = rawPStatus;
		if (!effectivePayoutStatus) {
			if (receivedDate && !isApprovedPayout) {
				effectivePayoutStatus = 'PENDING';
			} else if (isApprovedPayout) {
				effectivePayoutStatus = 'APPROVED';
			} else {
				effectivePayoutStatus = null;
			}
		} else if (rawPStatus === 'APPROVED' && !isApprovedPayout && receivedDate) {
			effectivePayoutStatus = 'PENDING';
		}
		const effectivePayoutTarget = pdfRow?.payout_approval_target || pdfRow?.payoutApprovalTarget || (effectivePayoutStatus === 'PENDING' ? 'SECONDARY' : null);
		const effectiveRequestedRole = pdfRow?.payout_requested_role || pdfRow?.payoutRequestedRole || (effectivePayoutStatus === 'PENDING' ? 'PRIMARY' : null);

		schedule.push({
			id: pdfRow?.id,
			sNo: i,
			installmentNumber: i,
			date: dateStr,
			chqNo,
			amount: emiTotal,
			interest: monthlyInterest,
			receivedDate,
			paymentDate,
			primaryAccountName: primaryAcc.accountName || 'Primary Account',
			primaryAccountTag: primaryAcc.accountTag || 'PRI',
			primarySharePct: priSharePct,
			primaryAmount: priAmount,
			primaryInterest: priInterest,
			dueDate: paymentDate || '-',
			// Legacy single-secondary fields
			secAccountName: legacySecAcc.accountName,
			secAccountTag: legacySecAcc.accountTag,
			secSharePct: legacySecAcc.share,
			secAmount: legacySecAcc.amount,
			secInterest: legacySecAcc.interest,
			tds: legacySecAcc.tds || 0,
			// Per-account secondary array
			secAccounts: secAccountsData,
			status,
			badgeClass,
			dotClass,
			principal: principalComp,
			balance: currentBalance,
			totalEmi: emiTotal,
			remarks: pdfRow?.remarks || '',
			splits: pdfRow?.splits || null,
			payout_approval_status: effectivePayoutStatus,
			payoutApprovalStatus: effectivePayoutStatus,
			payout_approval_target: effectivePayoutTarget,
			payoutApprovalTarget: effectivePayoutTarget,
			payout_editor_role: pdfRow?.payout_editor_role || pdfRow?.payoutEditorRole || effectiveRequestedRole,
			payout_requested_role: effectiveRequestedRole,
			payoutRequestedRole: effectiveRequestedRole,
			payout_requested_by: pdfRow?.payout_requested_by || pdfRow?.payoutRequestedBy || (effectivePayoutStatus === 'PENDING' ? (primaryAcc.accountName || 'Primary Partner') : null),
			payout_requested_at: pdfRow?.payout_requested_at || pdfRow?.payoutRequestedAt,
			payout_approved_by: pdfRow?.payout_approved_by || pdfRow?.payoutApprovedBy,
			payout_approved_at: pdfRow?.payout_approved_at || pdfRow?.payoutApprovedAt,
			payout_notes: pdfRow?.payout_notes || pdfRow?.payoutNotes,
		});
	}

	// 10% TDS of each secondary account's TOTAL facility interest (e.g. 65,450 -> 6,545 TDS) collected/deducted upfront from the 1st due secondary amount
	if (schedule.length > 0 && schedule[0].secAccounts) {
		schedule[0].secAccounts = schedule[0].secAccounts.map((sa, idx) => {
			const totalSecInterestForAcc =
				(secAccs[idx]?.interest != null && !isNaN(Number(secAccs[idx].interest)))
					? Number(secAccs[idx].interest)
					: schedule.reduce(
						(sum, inst) => sum + (Number(inst.secAccounts?.[idx]?.interest) || 0),
						0
					);
			const tdsVal = Math.round(totalSecInterestForAcc * 0.10);
			const grossAmount = Number(sa.amount) || 0;
			const netAmount = Math.max(0, grossAmount - tdsVal);
			return { ...sa, tds: tdsVal, grossAmount, amount: netAmount };
		});
		// Also set legacy tds & secAmount = sum/first secondary net values
		schedule[0].tds = schedule[0].secAccounts.reduce((s, sa) => s + (sa.tds || 0), 0);
		if (schedule[0].secAccounts[0]) {
			schedule[0].secAmount = schedule[0].secAccounts[0].amount;
		}
	}

	return schedule;
};

// Parse DD-MM-YYYY string to Date
export const parseDDMMYYYY = (val) => {
	if (!val || typeof val !== 'string') return null;
	const parts = val.trim().split('-');
	if (parts.length === 3 && parts[2].length === 4) {
		const d = parseInt(parts[0], 10);
		const m = parseInt(parts[1], 10) - 1;
		const y = parseInt(parts[2], 10);
		const date = new Date(y, m, d);
		if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m) {
			return date;
		}
	}
	return null;
};

// Check if dateStrA is strictly before dateStrB (dateStrA < dateStrB)
export const isDateBefore = (dateStrA, dateStrB) => {
	const a = parseDDMMYYYY(dateStrA);
	const b = parseDDMMYYYY(dateStrB);
	if (!a || !b) return false;
	return a.getTime() < b.getTime();
};

// Check if dateStr is in the past or today (dateStr <= today)
export const isPastOrTodayDate = (dateStr) => {
	const d = parseDDMMYYYY(dateStr);
	if (!d) return false;
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return d.getTime() <= today.getTime();
};

// Check if an installment / EMI due date has crossed (due date < today)
export const isDueDateCrossed = (dateStr) => {
	if (!dateStr) return false;
	const clean = String(dateStr).trim().replace(/[/.]/g, '-');
	let d = parseDDMMYYYY(clean);
	if (!d) {
		const parts = clean.split('-');
		if (parts.length === 3 && parts[0].length === 4) {
			d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
		}
	}
	if (!d || isNaN(d.getTime())) return false;
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return d.getTime() < today.getTime();
};

// Check if an installment / EMI is paid
export const isEmiPaid = (inst) => {
	if (!inst) return false;
	const status = String(inst.status || '').toLowerCase();
	if (status === 'overdue') return false;

	// Partial installment with sub-installments
	if (inst.isPartial) {
		const fullAmount = Number(inst.amount) || 0;
		if (fullAmount > 0) {
			let totalPaid = 0;
			if (Array.isArray(inst.subInstallments) && inst.subInstallments.length > 0) {
				for (const sub of inst.subInstallments) {
					const sRecd = sub.receivedDate || sub.received_date || sub.recdDate;
					const isSubPaid = sub.subType === 'paid' ||
						Boolean(sRecd && String(sRecd).trim() && String(sRecd).trim() !== '-' && String(sRecd).trim() !== '—') ||
						sub.status === 'Settled' || sub.status === 'Collected' || sub.status === 'Paid';
					if (isSubPaid) {
						totalPaid += Number(sub.amount) || 0;
					}
				}
			} else if (inst.partialPaidAmount !== undefined) {
				totalPaid = Number(inst.partialPaidAmount) || 0;
			}
			if (totalPaid < fullAmount && !inst.isRowFullyPaid && inst.partialBalAmount !== 0) return false;
			return true;
		}
	}

	// Splits JSON object
	if (inst.splits) {
		let sp = inst.splits;
		if (typeof sp === 'string') {
			try { sp = JSON.parse(sp); } catch (e) { sp = null; }
		}
		if (sp && typeof sp === 'object') {
			const fullAmount = Number(inst.amount) || 0;
			const pA = Number(sp.amountA ?? sp.paidAmount ?? 0);
			const hasRecdB = Boolean(sp.recdDateB && String(sp.recdDateB).trim() && sp.recdDateB !== '-' && sp.recdDateB !== '—');
			const pB = hasRecdB ? Number(sp.amountB ?? sp.balAmount ?? 0) : 0;
			const hasRecdC = Boolean(sp.recdDateC && String(sp.recdDateC).trim() && sp.recdDateC !== '-' && sp.recdDateC !== '—');
			const pC = hasRecdC ? Number(sp.amountC ?? 0) : 0;
			const paidSum = pA + pB + pC;
			if (fullAmount > 0 && paidSum < fullAmount && !sp.isFinalSettled) return false;
			return true;
		}
	}

	if (status === 'settled' || status === 'paid' || status === 'collected') return true;
	const recd = inst.receivedDate || inst.received_date || inst.paymentDate || inst.payment_date || inst.recdDate || inst.recd_date;
	if (recd && String(recd).trim() && String(recd).trim() !== '-' && String(recd).trim() !== '—') return true;
	return false;
};

// Calculate total remaining balance for a repayment schedule
export const getScheduleTotalBalance = (schedule) => {
	if (!Array.isArray(schedule) || schedule.length === 0) return 0;
	let totalAmount = 0;
	let totalPaid = 0;

	for (const inst of schedule) {
		if (!inst) continue;
		const fullAmount = Number(inst.amount) || 0;
		totalAmount += fullAmount;

		if (inst.isPartial && Array.isArray(inst.subInstallments) && inst.subInstallments.length > 0) {
			let subPaid = 0;
			for (const sub of inst.subInstallments) {
				const sRecd = sub.receivedDate || sub.received_date || sub.recdDate;
				const isPaid = sub.subType === 'paid' ||
					sub.status === 'Settled' ||
					sub.status === 'Collected' ||
					sub.status === 'Paid' ||
					Boolean(sRecd && String(sRecd).trim() && String(sRecd).trim() !== '-' && String(sRecd).trim() !== '—');
				if (isPaid) {
					subPaid += Number(sub.amount) || 0;
				}
			}
			totalPaid += Math.min(fullAmount, subPaid);
		} else if (inst.isPartial && inst.partialPaidAmount !== undefined) {
			totalPaid += Math.min(fullAmount, Number(inst.partialPaidAmount) || 0);
		} else if (inst.splits) {
			let sp = inst.splits;
			if (typeof sp === 'string') {
				try { sp = JSON.parse(sp); } catch (e) { sp = null; }
			}
			if (sp && typeof sp === 'object') {
				const pA = Number(sp.amountA ?? sp.paidAmount ?? 0);
				const hasRecdB = Boolean(sp.recdDateB && String(sp.recdDateB).trim() && sp.recdDateB !== '-' && sp.recdDateB !== '—');
				const pB = hasRecdB ? Number(sp.amountB ?? sp.balAmount ?? 0) : 0;
				const hasRecdC = Boolean(sp.recdDateC && String(sp.recdDateC).trim() && sp.recdDateC !== '-' && sp.recdDateC !== '—');
				const pC = hasRecdC ? Number(sp.amountC ?? 0) : 0;
				totalPaid += Math.min(fullAmount, pA + pB + pC);
			}
		} else {
			const recd = inst.receivedDate || inst.received_date || inst.paymentDate || inst.payment_date || inst.recdDate || inst.recd_date;
			const isPaid = Boolean(recd && String(recd).trim() && String(recd).trim() !== '-' && String(recd).trim() !== '—') ||
				inst.status === 'Settled' || inst.status === 'Collected' || inst.status === 'Paid';
			if (isPaid) {
				totalPaid += fullAmount;
			}
		}
	}
	return Math.max(0, totalAmount - totalPaid);
};

// Check if an installment / EMI is overdue:
// Overdue means EMI amount has unpaid balance and due date is crossed
export const isEmiOverdue = (inst) => {
	if (!inst) return false;
	const status = String(inst.status || '').toLowerCase();
	if (status === 'overdue') return true;
	if (isEmiPaid(inst)) return false;
	return isDueDateCrossed(inst.date);
};

// Check if a loan has any installment awaiting payout date approval
// Rule: pending status means, if recd date or payout date filled and sec manager not approved that payout date.
export const isLoanPayoutPending = (loan) => {
	if (!loan || loan.is_deleted) return false;
	const sch = Array.isArray(loan.repaymentSchedule)
		? loan.repaymentSchedule
		: (Array.isArray(loan.repayment_schedule) ? loan.repayment_schedule : []);

	if (Array.isArray(sch)) {
		for (const item of sch) {
			if (!item) continue;

			// 1. Sub-installments (splits)
			if (Array.isArray(item.subInstallments) && item.subInstallments.length > 0) {
				for (const sub of item.subInstallments) {
					if (!sub) continue;
					const subPStatus = (sub.payout_approval_status || sub.payoutApprovalStatus || '').toUpperCase();
					const subStatus = (sub.status || '').toLowerCase();
					const subRecd = sub.receivedDate || sub.received_date || sub.recdDate;
					const hasSubRecd = Boolean(subRecd && String(subRecd).trim() && String(subRecd).trim() !== '-' && String(subRecd).trim() !== '—');
					const subPayoutDate = sub.dueDate || sub.paymentDate || sub.payment_date;
					const hasSubPayout = Boolean(subPayoutDate && String(subPayoutDate).trim() && String(subPayoutDate).trim() !== '-' && String(subPayoutDate).trim() !== '—');
					const isSubApproved = hasSubPayout && (subStatus === 'settled' || ((subPStatus === 'APPROVED' || sub.payout_approved_by || sub.payoutApprovedBy) && subPStatus !== 'PENDING' && subPStatus !== 'REJECTED'));

					if ((hasSubRecd || hasSubPayout) && !isSubApproved) {
						return true;
					}
				}
			}

			// 2. Raw JSON splits
			if (item.splits) {
				let sp = item.splits;
				if (typeof sp === 'string') {
					try {
						sp = JSON.parse(sp);
					} catch (e) {
						sp = null;
					}
				}
				if (sp && typeof sp === 'object') {
					const sA = (sp.payoutApprovalStatusA || sp.payout_approval_status_a || '').toUpperCase();
					const sB = (sp.payoutApprovalStatusB || sp.payout_approval_status_b || '').toUpperCase();
					const recdA = sp.recdDateA || sp.recdDate;
					const recdB = sp.recdDateB;
					const dueA = sp.dueDateA || sp.dueDate;
					const dueB = sp.dueDateB;
					const hasA = Boolean((recdA && String(recdA).trim() && recdA !== '-' && recdA !== '—') || (dueA && String(dueA).trim() && dueA !== '-' && dueA !== '—'));
					const hasB = Boolean((recdB && String(recdB).trim() && recdB !== '-' && recdB !== '—') || (dueB && String(dueB).trim() && dueB !== '-' && dueB !== '—'));

					if (hasA && sA !== 'APPROVED') return true;
					if (hasB && sB !== 'APPROVED') return true;
				}
			}

			// 3. Regular installment
			const recdDate = item.receivedDate || item.received_date || item.recdDate || item.recd_date;
			const hasRecdDate = Boolean(recdDate && String(recdDate).trim() && String(recdDate).trim() !== '-' && String(recdDate).trim() !== '—') || item.status === 'Collected';
			const payoutDate = item.dueDate || item.due_date || item.paymentDate || item.payment_date || item.payoutDate || item.payout_date;
			const hasPayoutDate = Boolean(payoutDate && String(payoutDate).trim() && String(payoutDate).trim() !== '-' && String(payoutDate).trim() !== '—');
			const pStatus = (item.payout_approval_status || item.payoutApprovalStatus || '').toUpperCase();
			const instStatus = (item.status || '').toLowerCase();
			const isApproved = hasPayoutDate && (instStatus === 'settled' || ((pStatus === 'APPROVED' || item.payout_approved_by || item.payoutApprovedBy) && pStatus !== 'PENDING' && pStatus !== 'REJECTED'));

			// Rule: pending status means, if recd date or payout date filled and sec manager not approved that payout date
			if ((hasRecdDate || hasPayoutDate) && !isApproved) {
				return true;
			}
		}
	}
	return false;
};

// Check if all installments in a loan have their payout date filled and approved
export const areAllPayoutsApproved = (loan) => {
	if (!loan || loan.is_deleted) return false;
	const sch = Array.isArray(loan.repaymentSchedule)
		? loan.repaymentSchedule
		: (Array.isArray(loan.repayment_schedule) ? loan.repayment_schedule : []);
	if (!sch || sch.length === 0) return true;

	for (const item of sch) {
		if (!item) continue;

		// 1. Partial / split subInstallments
		if (item.isPartial && Array.isArray(item.subInstallments) && item.subInstallments.length > 0) {
			const allSubsApproved = item.subInstallments.every((sub) => {
				if (!sub || sub.subType === 'balance') return false;
				const hasDueDate = Boolean(
					sub.dueDate &&
					String(sub.dueDate).trim() &&
					String(sub.dueDate).trim() !== '-' &&
					String(sub.dueDate).trim() !== '—'
				);
				const pStatus = (sub?.payout_approval_status || sub?.payoutApprovalStatus || '').toUpperCase();
				return hasDueDate && (pStatus === 'APPROVED' || sub?.status === 'Settled');
			});
			if (!allSubsApproved) return false;
			continue;
		}

		// 2. Splits JSON object
		if (item.splits) {
			let sp = item.splits;
			if (typeof sp === 'string') {
				try {
					sp = JSON.parse(sp);
				} catch (e) {
					sp = null;
				}
			}
			if (sp && typeof sp === 'object') {
				if (sp.isFinalSettled) {
					continue;
				}
				const sA = (sp.payoutApprovalStatusA || sp.payout_approval_status_a || '').toUpperCase();
				const sB = (sp.payoutApprovalStatusB || sp.payout_approval_status_b || '').toUpperCase();
				const sC = (sp.payoutApprovalStatusC || sp.payout_approval_status_c || '').toUpperCase();
				const hasDueDateA = Boolean(sp.dueDateA && String(sp.dueDateA).trim() && String(sp.dueDateA).trim() !== '-' && String(sp.dueDateA).trim() !== '—');
				const hasDueDateB = Boolean(sp.dueDateB && String(sp.dueDateB).trim() && String(sp.dueDateB).trim() !== '-' && String(sp.dueDateB).trim() !== '—');
				const hasDueDateC = Boolean(sp.dueDateC && String(sp.dueDateC).trim() && String(sp.dueDateC).trim() !== '-' && String(sp.dueDateC).trim() !== '—');

				if (!hasDueDateA || sA !== 'APPROVED') return false;
				if (hasDueDateB && sB !== 'APPROVED') return false;
				if (hasDueDateC && sC !== 'APPROVED') return false;
				continue;
			}
		}

		// 3. Regular installment
		const payoutDate = item.dueDate || item.paymentDate || item.payment_date;
		const hasPayoutDate = Boolean(
			payoutDate &&
			String(payoutDate).trim() &&
			String(payoutDate).trim() !== '-' &&
			String(payoutDate).trim() !== '—'
		);
		const pStatus = (item.payout_approval_status || item.payoutApprovalStatus || '').toUpperCase();
		const isApproved = hasPayoutDate && pStatus !== 'PENDING' && (pStatus === 'APPROVED' || item.payout_approved_by || item.payoutApprovedBy || item.status === 'Settled');
		if (!isApproved) {
			return false;
		}
	}
	return true;
};

// Compute loan status based on EMI schedule and approval status:
// - Closed: all EMIs are completed and total balance is 0
// - Overdue: loan is active but any one of EMI is overdue (due date crossed and not paid)
// - Pending: if any payout date approval is pending, or if pending initial approval
// - Active: all emi's recd/payout date approved by sec manager and no emi date is crossed today date
export const getComputedLoanStatus = (loan, customSchedule) => {
	if (!loan) return 'Active';

	// 1. Rejected status
	if (loan.approval_status === 'REJECTED' || loan.status === 'Rejected') {
		return 'Rejected';
	}

	const isLoanCreatedBySuperAdmin = Boolean(
		loan.is_super_admin ||
		(loan.actioned_by && ['admin', 'super admin', 'dhinakaran sekar', 'administrator', 'system admin'].includes(String(loan.actioned_by).trim().toLowerCase())) ||
		(loan.requester_name && ['system admin', 'super admin', 'dhinakaran sekar'].includes(String(loan.requester_name).trim().toLowerCase()))
	);

	if (!isLoanCreatedBySuperAdmin) {
		// 2. Pending secondary approval (initial creation)
		if (loan.approval_status === 'PENDING_SECONDARY' || (loan.approval_status === 'PENDING' && !loan.verified_by)) {
			return 'Pending Secondary';
		}

		// 3. Pending admin final approval (initial creation)
		if (loan.approval_status === 'PENDING_ADMIN' || loan.approval_status === 'VERIFIED') {
			return 'Pending Admin';
		}
	}

	const schedule = Array.isArray(customSchedule) && customSchedule.length > 0
		? customSchedule
		: (Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0
			? loan.repaymentSchedule
			: (Array.isArray(loan.repayment_schedule) ? loan.repayment_schedule : []));

	if (!schedule || schedule.length === 0) {
		return loan.status || 'Active';
	}

	// Rule: in repayment schedule, all emi are completed and total balance is 0, that loan status is Closed
	const allEmisPaid = schedule.length > 0 && schedule.every((inst) => isEmiPaid(inst));
	const totalBalance = getScheduleTotalBalance(schedule);

	if (allEmisPaid && totalBalance === 0) {
		return 'Closed';
	}

	// Rule: overdue means if any emi date is crossed today date and emi has unpaid balance
	const hasOverdue = schedule.some((inst) => isEmiOverdue(inst));
	if (hasOverdue) {
		return 'Overdue';
	}

	// Rule: pending status means, if recd date or payout date filled and sec manager not approved that payout date
	const hasPayoutPending = isLoanPayoutPending(loan);
	if (hasPayoutPending) {
		return 'Pending';
	}

	// Rule: active status means all emi's recd/payout date approved by sec manager and no emi date is crossed today date
	return 'Active';
};

// Check if a loan is newly created and pending initial multi-stage approval (secondary or admin)
export const isNewLoanPendingApproval = (loan) => {
	if (!loan || loan.is_deleted) return false;
	if (isLoanPayoutPending(loan)) {
		return false;
	}
	const loanStatus = (loan.status || '').toLowerCase();
	const appStatus = (loan.approval_status || loan.approvalStatus || '').toUpperCase();
	if (
		loanStatus === 'pending payout approval' ||
		loanStatus === 'payout pending' ||
		appStatus === 'PENDING_PAYOUT'
	) {
		return false;
	}
	if (
		appStatus === 'APPROVED' ||
		loan.status === 'Active' ||
		loan.status === 'Closed' ||
		appStatus === 'REJECTED' ||
		loan.status === 'Rejected'
	) {
		return false;
	}
	const computed = getComputedLoanStatus(loan);
	return (
		computed === 'Pending Secondary' ||
		computed === 'Pending Admin' ||
		appStatus === 'PENDING_SECONDARY' ||
		appStatus === 'PENDING_ADMIN' ||
		appStatus === 'PENDING' ||
		appStatus === 'VERIFIED' ||
		loan.status === 'Pending'
	);
};

// Check if a loan is pending approval (either secondary manager or admin approval, or payout approval)
export const isLoanPendingApproval = (loan) => {
	if (!loan || loan.is_deleted) return false;
	return isNewLoanPendingApproval(loan) || isLoanPayoutPending(loan);
};

// Calculate offset date in DD-MM-YYYY format from base dateStr
export const getOffsetDateDDMMYYYY = (baseDateStr, daysOffset = 0) => {
	const parsed = parseDDMMYYYY(baseDateStr);
	if (!parsed) return '';
	const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + daysOffset);
	const d = String(target.getDate()).padStart(2, '0');
	const m = String(target.getMonth() + 1).padStart(2, '0');
	const y = target.getFullYear();
	return `${d}-${m}-${y}`;
};

// Get current date in DD-MM-YYYY format
export const getTodayDDMMYYYY = () => {
	const now = new Date();
	const d = String(now.getDate()).padStart(2, '0');
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const y = now.getFullYear();
	return `${d}-${m}-${y}`;
};

// Auto-formats date with hyphens between day, month, and year (DD-MM-YYYY)
export const formatWithAutoDash = (inputVal, prevVal = '') => {
	if (!inputVal) return '';

	// Detect if user is deleting / backspacing
	const isDeleting = prevVal && inputVal.length < prevVal.length;

	// If user was at a hyphen and pressed backspace, delete the preceding digit as well so user doesn't get stuck
	if (isDeleting && prevVal.endsWith('-') && inputVal === prevVal.slice(0, -1)) {
		const digits = inputVal.replace(/\D/g, '').slice(0, 8);
		const trimmedDigits = digits.slice(0, -1);
		if (trimmedDigits.length === 0) return '';
		if (trimmedDigits.length <= 2) return trimmedDigits;
		if (trimmedDigits.length <= 4) return `${trimmedDigits.slice(0, 2)}-${trimmedDigits.slice(2)}`;
		return `${trimmedDigits.slice(0, 2)}-${trimmedDigits.slice(2, 4)}-${trimmedDigits.slice(4, 8)}`;
	}

	// Strip non-digits
	const digits = inputVal.replace(/\D/g, '').slice(0, 8);

	if (isDeleting) {
		if (digits.length === 0) return '';
		if (digits.length <= 2) return digits;
		if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
		return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
	}

	// If user manually typed a separator (- / . space) after a 1-digit day or 1-digit month, auto-pad with leading 0
	const endsWithSep = /[-/.\s]$/.test(inputVal);
	if (endsWithSep) {
		if (digits.length === 1) {
			return `0${digits}-`;
		}
		if (digits.length === 3) {
			return `${digits.slice(0, 2)}-0${digits.slice(2)}-`;
		}
	}

	// When typing digits:
	if (digits.length === 0) return '';
	if (digits.length < 2) return digits;
	if (digits.length === 2) {
		// Auto-fill hyphen between date and month
		return `${digits}-`;
	}
	if (digits.length < 4) {
		return `${digits.slice(0, 2)}-${digits.slice(2)}`;
	}
	if (digits.length === 4) {
		// Auto-fill hyphen between month and year
		return `${digits.slice(0, 2)}-${digits.slice(2)}-`;
	}
	// 5 to 8 digits for year
	return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
};

// Modern Interactive Calendar Popover Component for selecting dates
const CALENDAR_MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];
const CALENDAR_DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Parse any date value (DD-MM-YYYY, YYYY-MM-DD, Date object) to a valid JavaScript Date
export function parseAnyDateToDate(val) {
	if (!val) return null;
	if (val instanceof Date && !isNaN(val.getTime())) return val;
	const str = String(val).trim();
	if (!str || str === '-' || str === '-') return null;

	// Extract the date part (strip time, e.g. "T..." or " 12:00:00")
	const datePart = str.split(/[T\s]/)[0].trim();
	const parts = datePart.split(/[-/.]/);
	if (parts.length === 3) {
		// DD-MM-YYYY or DD/MM/YYYY
		if (parts[2].length === 4) {
			const d = parseInt(parts[0], 10);
			const m = parseInt(parts[1], 10) - 1;
			const y = parseInt(parts[2], 10);
			const date = new Date(y, m, d);
			if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m) {
				return date;
			}
		}
		// YYYY-MM-DD
		if (parts[0].length === 4) {
			const y = parseInt(parts[0], 10);
			const m = parseInt(parts[1], 10) - 1;
			const d = parseInt(parts[2], 10);
			const date = new Date(y, m, d);
			if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m) {
				return date;
			}
		}
	}

	const parsed = new Date(str);
	return !isNaN(parsed.getTime()) ? parsed : null;
}

// Extract date object from loan (appliedDate, loan_date, etc.)
export function getLoanDateObject(loan) {
	if (!loan) return null;
	const raw =
		loan.loan_date ||
		loan.appliedDate ||
		loan.loanDate ||
		loan.date ||
		loan.applied_date ||
		'';
	return parseAnyDateToDate(raw);
}

// Compare two DD-MM-YYYY date strings: returns negative if A < B, 0 if equal, positive if A > B
export const compareDDMMYYYY = (dateStrA, dateStrB) => {
	const a = parseAnyDateToDate(dateStrA);
	const b = parseAnyDateToDate(dateStrB);
	if (!a && !b) return 0;
	if (!a) return -1;
	if (!b) return 1;
	return a.getTime() - b.getTime();
};

// Check if a loan's date falls within [startDateStr, endDateStr]
export const isLoanInDateRange = (loan, startDateStr, endDateStr) => {
	if (!startDateStr && !endDateStr) return true;
	const loanDate = getLoanDateObject(loan);
	if (!loanDate) return false;

	const targetTime = new Date(loanDate.getFullYear(), loanDate.getMonth(), loanDate.getDate()).getTime();

	if (startDateStr) {
		const sDate = parseAnyDateToDate(startDateStr);
		if (sDate) {
			const sTime = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()).getTime();
			if (targetTime < sTime) return false;
		}
	}

	if (endDateStr) {
		const eDate = parseAnyDateToDate(endDateStr);
		if (eDate) {
			const eTime = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate()).getTime();
			if (targetTime > eTime) return false;
		}
	}

	return true;
};

// Collect all unique account names involved in a joint loan (Primary, Borrower/Client, Secondaries)
export const getLoanAllAccountNames = (loan) => {
	if (!loan) return [];
	const accs = new Set();

	// Primary account:
	if (loan.primaryAccountName) accs.add(String(loan.primaryAccountName).trim());
	if (loan.primary) accs.add(String(loan.primary).trim());

	// Secondary accounts:
	if (Array.isArray(loan.secondaryAccounts)) {
		loan.secondaryAccounts.forEach((sa) => {
			if (sa?.accountName) accs.add(String(sa.accountName).trim());
		});
	}
	if (Array.isArray(loan.accountDetails)) {
		loan.accountDetails.forEach((ad) => {
			if (ad?.accountName) accs.add(String(ad.accountName).trim());
		});
	}
	if (Array.isArray(loan.remaining_accounts)) {
		loan.remaining_accounts.forEach((ra) => {
			if (ra?.account_name) accs.add(String(ra.account_name).trim());
		});
	}
	if (loan.secondaryAccountName) accs.add(String(loan.secondaryAccountName).trim());
	if (loan.secAccountName) accs.add(String(loan.secAccountName).trim());

	return Array.from(accs).filter(Boolean);
};

// Check if a loan matches the specified account name, supporting aliases and acronyms
export const doesLoanMatchAccount = (loan, targetAccount, accountObjects = []) => {
	if (!targetAccount || targetAccount === 'ALL') return true;
	const names = getLoanAllAccountNames(loan);
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const targetClean = clean(targetAccount);
	if (!targetClean) return true;

	return names.some((accName) => {
		const accClean = clean(accName);
		if (!accClean) return false;
		if (accClean === targetClean) return true;

		// Match via account objects if available
		if (Array.isArray(accountObjects) && accountObjects.length > 0) {
			const targetObj = accountObjects.find(
				(a) => clean(a.name) === targetClean || clean(a.acronym) === targetClean
			);
			if (targetObj) {
				if (clean(targetObj.name) === accClean || clean(targetObj.acronym) === accClean) {
					return true;
				}
			}
			const accObj = accountObjects.find(
				(a) => clean(a.name) === accClean || clean(a.acronym) === accClean
			);
			if (accObj) {
				if (clean(accObj.name) === targetClean || clean(accObj.acronym) === targetClean) {
					return true;
				}
			}
		}

		return false;
	});
};

// Resolve acronym or short tag for an account string/object
export const getAcronym = (nameOrAcronym, accountObjects = []) => {
	if (!nameOrAcronym) return '';
	const raw = String(nameOrAcronym).trim();
	if (!raw) return '';
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const targetClean = clean(raw);

	// 1. Check accountObjects if provided (or cached global account objects)
	const accountsToCheck = (Array.isArray(accountObjects) && accountObjects.length > 0)
		? accountObjects
		: (Array.isArray(cachedGlobalAccountObjects) ? cachedGlobalAccountObjects : []);
	if (accountsToCheck.length > 0) {
		const found = accountsToCheck.find(
			(a) => clean(a.name) === targetClean || clean(a.acronym) === targetClean
		);
		if (found && found.acronym) return found.acronym.trim().toUpperCase();
		if (found && found.name && clean(found.name) === targetClean && found.acronym) {
			return found.acronym.trim().toUpperCase();
		}
	}

	// 2. If already short acronym (e.g. "SS", "FC", "SCS", "JE")
	if (/^[A-Za-z]{2,6}$/.test(raw) && raw === raw.toUpperCase()) {
		return raw;
	}

	// 3. Fallback: extract initials from multi-word names (e.g. "S. Sudhakar" -> "SS", "Surge Capital Solutions" -> "SCS")
	const words = raw.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
	if (words.length > 1) {
		const derived = words.map((w) => w[0]).join('').toUpperCase();
		if (derived.length >= 2 && derived.length <= 6) {
			return derived;
		}
	}

	return raw;
};

// Check if an account identifier matches a target name/acronym
export const isAccountMatch = (loanAccountValue, targetAccountValue, accountObjects = []) => {
	if (!loanAccountValue || !targetAccountValue) return false;
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const lClean = clean(loanAccountValue);
	const tClean = clean(targetAccountValue);
	if (!lClean || !tClean) return false;
	if (lClean === tClean) return true;

	const lAcr = clean(getAcronym(loanAccountValue, accountObjects));
	const tAcr = clean(getAcronym(targetAccountValue, accountObjects));
	if (lAcr && tAcr && lAcr === tAcr) return true;
	if (lAcr && lAcr === tClean) return true;
	if (tAcr && tAcr === lClean) return true;

	if (Array.isArray(accountObjects) && accountObjects.length > 0) {
		const tObj = accountObjects.find(
			(o) => clean(o.acronym) === tClean || clean(o.name) === tClean
		);
		if (tObj) {
			if (clean(tObj.acronym) === lClean || clean(tObj.name) === lClean) return true;
			if (lAcr && clean(tObj.acronym) === lAcr) return true;
		}

		const lObj = accountObjects.find(
			(o) => clean(o.acronym) === lClean || clean(o.name) === lClean
		);
		if (lObj) {
			if (clean(lObj.acronym) === tClean || clean(lObj.name) === tClean) return true;
			if (tAcr && clean(lObj.acronym) === tAcr) return true;
		}
	}
	return false;
};

// Check if a primary account identifier/name is assigned as primary to the user
export const isUserAssignedPrimaryAccount = (primaryAccountName, userPerms, accountObjects = []) => {
	if (!primaryAccountName) return false;
	// Admin without specific primary restrictions can create for any primary account
	if (!userPerms || (userPerms.isAdmin && (!Array.isArray(userPerms.primary) || userPerms.primary.length === 0))) {
		return true;
	}

	const userPrimaryList = Array.isArray(userPerms.primary) ? userPerms.primary : [];
	if (userPrimaryList.length === 0) {
		return false;
	}

	return userPrimaryList.some((target) =>
		isAccountMatch(primaryAccountName, target, accountObjects)
	);
};

// Check if loan matches any of the user's primary accounts
export const checkLoanMatchesUserPrimary = (loan, userPrimaryList, accountObjects = []) => {
	if (!loan || !Array.isArray(userPrimaryList) || userPrimaryList.length === 0) return false;

	const loanPrimaryValues = [
		loan.primary,
		loan.primaryAccountName,
		loan.primary_account_name,
	];
	if (Array.isArray(loan.accountDetails)) {
		const pri = loan.accountDetails.find((a) => a && a.isPrimary);
		if (pri) {
			loanPrimaryValues.push(pri.accountTag, pri.accountName);
		}
	}

	return userPrimaryList.some((target) =>
		loanPrimaryValues.some((lp) => isAccountMatch(lp, target, accountObjects))
	);
};

// Check if loan matches any of the user's secondary accounts
export const checkLoanMatchesUserSecondary = (loan, userSecondaryList, accountObjects = []) => {
	if (!loan || !Array.isArray(userSecondaryList) || userSecondaryList.length === 0) return false;

	const loanSecondaryValues = [];
	if (Array.isArray(loan.secondaryAccounts)) {
		loan.secondaryAccounts.forEach((sa) => {
			if (sa) {
				loanSecondaryValues.push(sa.accountName, sa.accountTag, sa.name);
			}
		});
	}
	if (Array.isArray(loan.accountDetails)) {
		loan.accountDetails
			.filter((a) => a && !a.isPrimary)
			.forEach((sa) => {
				if (sa) {
					loanSecondaryValues.push(sa.accountName, sa.accountTag, sa.name);
				}
			});
	}
	if (Array.isArray(loan.remaining_accounts)) {
		loan.remaining_accounts.forEach((ra) => {
			if (ra) {
				loanSecondaryValues.push(ra.account_name, ra.name);
			}
		});
	}
	if (loan.secondaryAccountName) loanSecondaryValues.push(loan.secondaryAccountName);
	if (loan.secAccountName) loanSecondaryValues.push(loan.secAccountName);
	if (loan.coBorrower?.name) loanSecondaryValues.push(loan.coBorrower.name);

	return userSecondaryList.some((target) =>
		loanSecondaryValues.some((ls) => isAccountMatch(ls, target, accountObjects))
	);
};

// Check if loan matches user's permission configuration and role toggle ('all' | 'primary' | 'secondary')
export const doesLoanMatchUserPermissions = (
	loan,
	userPerms,
	accountObjects = [],
	roleFilter = 'all'
) => {
	if (!loan) return false;

	// For admin users without specific restrictions:
	if (!userPerms || userPerms.isAdmin) {
		const hasSpecificPrimary = Array.isArray(userPerms?.primary) && userPerms.primary.length > 0;
		const hasSpecificSecondary = Array.isArray(userPerms?.secondary) && userPerms.secondary.length > 0;

		if (roleFilter === 'primary') {
			if (hasSpecificPrimary) {
				return checkLoanMatchesUserPrimary(loan, userPerms.primary, accountObjects);
			}
			return true;
		}

		if (roleFilter === 'secondary') {
			if (hasSpecificSecondary || hasSpecificPrimary) {
				return (
					(hasSpecificSecondary && checkLoanMatchesUserSecondary(loan, userPerms.secondary, accountObjects)) ||
					(hasSpecificPrimary && checkLoanMatchesUserSecondary(loan, userPerms.primary, accountObjects))
				);
			}
			const hasSec =
				(Array.isArray(loan.secondaryAccounts) && loan.secondaryAccounts.length > 0) ||
				(Array.isArray(loan.accountDetails) && loan.accountDetails.some((a) => a && !a.isPrimary)) ||
				(Array.isArray(loan.remaining_accounts) && loan.remaining_accounts.length > 0) ||
				Boolean(loan.secondaryAccountName) ||
				Boolean(loan.secAccountName) ||
				Boolean(loan.coBorrower?.name);
			return Boolean(hasSec);
		}

		return true;
	}

	const hasPrimary = Array.isArray(userPerms.primary) && userPerms.primary.length > 0;
	const hasSecondary = Array.isArray(userPerms.secondary) && userPerms.secondary.length > 0;

	if (!hasPrimary && !hasSecondary) return false;

	const matchesPrimary = hasPrimary
		? checkLoanMatchesUserPrimary(loan, userPerms.primary, accountObjects)
		: false;

	// For secondary match: check user's assigned secondary accounts, as well as user's primary accounts
	// (since a user managing an account is also the stakeholder when that account participates as secondary)
	const matchesSecondary =
		(hasSecondary && checkLoanMatchesUserSecondary(loan, userPerms.secondary, accountObjects)) ||
		(hasPrimary && checkLoanMatchesUserSecondary(loan, userPerms.primary, accountObjects));

	if (roleFilter === 'primary') {
		return matchesPrimary;
	}

	if (roleFilter === 'secondary') {
		return matchesSecondary;
	}

	// 'all': user's assigned primary and secondary accounts
	return matchesPrimary || matchesSecondary;
};

// Check if a loan is treated as a secondary account loan for the user
export const isLoanSecondaryForUser = (
	loan,
	userPerms,
	roleFilter = 'all',
	accountObjects = []
) => {
	if (!loan) return false;

	// Admin users have full primary privileges across all loans
	if (userPerms && userPerms.isAdmin) {
		return false;
	}

	// If filtered explicitly by 'secondary', treat as secondary loan
	if (roleFilter === 'secondary') return true;

	// For regular users (non-admin), if user is not primary on this loan, it is a secondary loan for them
	const isUserPrimary = checkLoanMatchesUserPrimary(loan, userPerms?.primary, accountObjects);
	return !isUserPrimary;
};

// Helper to extract secondary account identifiers from a loan
export const getLoanSecondaryAccounts = (loan) => {
	if (!loan) return [];
	const accs = [];
	if (Array.isArray(loan.secondaryAccounts)) {
		loan.secondaryAccounts.forEach((sa) => {
			if (sa) {
				const name = sa.accountName || sa.name || sa.accountTag;
				if (name && !accs.includes(name)) accs.push(name);
			}
		});
	}
	if (Array.isArray(loan.accountDetails)) {
		loan.accountDetails
			.filter((a) => a && !a.isPrimary)
			.forEach((sa) => {
				const name = sa.accountName || sa.accountTag;
				if (name && !accs.includes(name)) accs.push(name);
			});
	}
	if (Array.isArray(loan.remaining_accounts)) {
		loan.remaining_accounts.forEach((ra) => {
			if (ra?.account_name && !accs.includes(ra.account_name)) accs.push(ra.account_name);
		});
	}
	if (loan.secondaryAccountName && !accs.includes(loan.secondaryAccountName)) {
		accs.push(loan.secondaryAccountName);
	}
	if (loan.coBorrower?.name && !accs.includes(loan.coBorrower.name)) {
		accs.push(loan.coBorrower.name);
	}
	return accs;
};

// Check if a specific user has primary access for any of this loan's secondary accounts
export const checkUserHasPrimaryAccessForLoanSecondary = (user, loan, accountObjects = []) => {
	if (!user || !loan) return false;
	// System Admin never handles secondary approval - final approval is sent to System Admin
	if (['admin', 'super admin'].includes((user.role || '').toLowerCase()) || ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase())) return false;

	const secAccounts = getLoanSecondaryAccounts(loan);
	if (secAccounts.length === 0) return false;

	let userPrimaryList = [];
	if (user.permissions) {
		if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
			userPrimaryList = Array.isArray(user.permissions.primary) ? user.permissions.primary : [];
		} else if (Array.isArray(user.permissions)) {
			userPrimaryList = user.permissions;
		}
	}

	if (userPrimaryList.length === 0) return false;

	return userPrimaryList.some((target) =>
		secAccounts.some((secAcc) => isAccountMatch(secAcc, target, accountObjects))
	);
};

// Check if a specific user has primary access for this loan's primary account
export const checkUserHasPrimaryAccessForLoanPrimary = (user, loan, accountObjects = []) => {
	if (!user || !loan) return false;
	if (['admin', 'super admin'].includes((user.role || '').toLowerCase()) || ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase())) return false;

	const priAccount = loan.primary_account_name || loan.primaryAccountName || loan.primaryBorrower?.name || loan.leadAccount;
	if (!priAccount) return false;

	let userPrimaryList = [];
	if (user.permissions) {
		if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
			userPrimaryList = Array.isArray(user.permissions.primary) ? user.permissions.primary : [];
		} else if (Array.isArray(user.permissions)) {
			userPrimaryList = user.permissions;
		}
	}

	if (userPrimaryList.length === 0) return false;

	return userPrimaryList.some((target) => isAccountMatch(priAccount, target, accountObjects));
};

// Get all users who have primary access for this loan's primary account
export const getUsersWithPrimaryAccessForLoanPrimary = (loan, allUsers = [], accountObjects = []) => {
	if (!loan || !Array.isArray(allUsers) || allUsers.length === 0) return [];
	return allUsers.filter((u) => {
		if (['admin', 'super admin'].includes((u.role || '').toLowerCase())) return false;
		return checkUserHasPrimaryAccessForLoanPrimary(u, loan, accountObjects);
	});
};

// Get all users who have primary access for this loan's secondary accounts
export const getUsersWithPrimaryAccessForLoanSecondary = (loan, allUsers = [], accountObjects = []) => {
	if (!loan || !Array.isArray(allUsers) || allUsers.length === 0) return [];
	return allUsers.filter((u) => {
		if (['admin', 'super admin'].includes((u.role || '').toLowerCase())) return false;
		return checkUserHasPrimaryAccessForLoanSecondary(u, loan, accountObjects);
	});
};

// Check if an individual account has approval access enabled (is_need_approval !== false)
export const checkAccountHasApprovalAccess = (accountNameOrTag, accountObjects = []) => {
	if (!accountNameOrTag) return true;
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const targetClean = clean(accountNameOrTag);

	const matched = (accountObjects || []).find((a) => {
		return (
			clean(a.acronym) === targetClean ||
			clean(a.name) === targetClean ||
			isAccountMatch(accountNameOrTag, a.name, accountObjects) ||
			isAccountMatch(accountNameOrTag, a.acronym, accountObjects)
		);
	});

	if (!matched) return true;

	if (
		matched.is_need_approval === false ||
		matched.approval_access === false ||
		matched.approvalAccess === false ||
		matched.is_need_approval === 0 ||
		matched.approval_access === 0
	) {
		return false;
	}
	return true;
};

// Check if any of this loan's secondary accounts require approval workflow
export const checkLoanSecondaryRequiresApproval = (loan, accountObjects = []) => {
	if (!loan) return true;
	const secAccounts = getLoanSecondaryAccounts(loan);
	if (!secAccounts || secAccounts.length === 0) return true;

	// Returns true if ANY secondary account requires approval. If all are false, returns false.
	return secAccounts.some((secAcc) => checkAccountHasApprovalAccess(secAcc, accountObjects));
};

// Check if a user can access this loan:
// Before final approval, ONLY:
// 1. Admin
// 2. The user with primary access for this loan's secondary account (during secondary review)
// can access the loan. Everyone else is strictly blocked.
export const canUserAccessLoan = (loan, user, userPerms, accountObjects = [], allUsers = []) => {
	if (!loan) return false;

	const isFinallyApproved =
		loan.approval_status === 'APPROVED' ||
		['Active', 'Overdue', 'Date Overdue', 'Settled', 'Closed'].includes(loan.status) ||
		Boolean(loan.is_super_admin) ||
		Boolean(loan.actioned_by && ['admin', 'super admin', 'dhinakaran sekar', 'system admin'].includes(String(loan.actioned_by).trim().toLowerCase())) ||
		isLoanPayoutPending(loan);
	if (isFinallyApproved) return true;

	if (!user) return false;
	const isAdmin = userPerms?.isAdmin || ['admin', 'super admin'].includes((user.role || '').toLowerCase());
	if (isAdmin) return true;

	// In secondary verification stage:
	const isPendingSecondary = loan.approval_status === 'PENDING_SECONDARY' || loan.approval_status === 'PENDING' || !loan.approval_status;
	if (isPendingSecondary) {
		return checkUserHasPrimaryAccessForLoanSecondary(user, loan, accountObjects);
	}

	// In admin approval stage or rejected:
	// Only admin can access
	return false;
};

// Human-friendly date formatting for labels
export const formatDisplayDate = (dateStr) => {
	const d = parseAnyDateToDate(dateStr);
	if (!d) return dateStr || '';
	const day = String(d.getDate()).padStart(2, '0');
	const month = CALENDAR_MONTH_NAMES[d.getMonth()]?.slice(0, 3) || '';
	const year = d.getFullYear();
	return `${day} ${month} ${year}`;
};

export const formatDateRangeLabel = (startDate, endDate) => {
	if (!startDate && !endDate) return 'Date Range';
	if (startDate && endDate) {
		if (startDate === endDate) return formatDisplayDate(startDate);
		return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
	}
	if (startDate) return `From ${formatDisplayDate(startDate)}`;
	return `Until ${formatDisplayDate(endDate)}`;
};

export function ModernCalendarPicker({
	value,
	onChange,
	minDate = '',
	minDateLabel = '',
	onClose,
	openUpward = 'auto',
	align = 'left',
	usePortal = false,
	anchorRef = null,
}) {
	const popoverRef = useRef(null);
	const [dynamicUpward, setDynamicUpward] = useState(openUpward === true);
	const [portalPos, setPortalPos] = useState({ top: null, bottom: null, left: null, right: null });

	useLayoutEffect(() => {
		const determineDirection = () => {
			const targetEl = anchorRef?.current || popoverRef.current?.parentElement;
			if (!targetEl) return;

			const rect = targetEl.getBoundingClientRect();
			if (rect.bottom < -50 || rect.top > window.innerHeight + 50) {
				if (onClose) onClose();
				return;
			}

			const calHeight = 345;
			const calWidth = 280;
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;

			let isUp = false;
			if (openUpward === true) {
				isUp = spaceAbove >= calHeight || spaceAbove >= spaceBelow;
			} else if (openUpward === false) {
				isUp = spaceBelow < calHeight && spaceAbove > spaceBelow;
			} else {
				isUp = spaceBelow < calHeight && spaceAbove > spaceBelow;
			}
			setDynamicUpward(isUp);

			if (usePortal) {
				let rightPos = align === 'right' ? Math.max(8, window.innerWidth - rect.right) : null;
				let leftPos = align === 'right' ? null : Math.max(8, rect.left);

				if (align === 'right' && rect.right < calWidth + 16) {
					rightPos = null;
					leftPos = Math.max(8, rect.left);
				} else if (align !== 'right' && rect.left + calWidth > window.innerWidth - 8) {
					leftPos = null;
					rightPos = Math.max(8, window.innerWidth - rect.right);
				}

				setPortalPos({
					top: isUp ? null : rect.bottom + 6,
					bottom: isUp ? window.innerHeight - rect.top + 6 : null,
					left: leftPos,
					right: rightPos,
				});
			}
		};

		determineDirection();
		window.addEventListener('resize', determineDirection);
		window.addEventListener('scroll', determineDirection, true);

		return () => {
			window.removeEventListener('resize', determineDirection);
			window.removeEventListener('scroll', determineDirection, true);
		};
	}, [openUpward, align, usePortal, anchorRef, onClose]);

	const getInitialDate = () => {
		const parsed = parseDDMMYYYY(value);
		if (parsed) return { year: parsed.getFullYear(), month: parsed.getMonth() };
		const minParsed = parseDDMMYYYY(minDate);
		if (minParsed) return { year: minParsed.getFullYear(), month: minParsed.getMonth() };
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() };
	};

	const [view, setView] = useState(getInitialDate);
	const todayStr = useMemo(() => getTodayDDMMYYYY(), []);

	const handlePrevMonth = (e) => {
		e.stopPropagation();
		setView((prev) => {
			if (prev.month === 0) return { year: prev.year - 1, month: 11 };
			return { year: prev.year, month: prev.month - 1 };
		});
	};

	const handleNextMonth = (e) => {
		e.stopPropagation();
		setView((prev) => {
			if (prev.month === 11) return { year: prev.year + 1, month: 0 };
			return { year: prev.year, month: prev.month + 1 };
		});
	};

	const { days, prevMonthDays, nextMonthDays } = useMemo(() => {
		const firstDayIndex = new Date(view.year, view.month, 1).getDay();
		const totalDays = new Date(view.year, view.month + 1, 0).getDate();
		const prevTotalDays = new Date(view.year, view.month, 0).getDate();

		const prevDays = [];
		for (let i = firstDayIndex - 1; i >= 0; i--) {
			prevDays.push(prevTotalDays - i);
		}

		const currentDays = [];
		for (let d = 1; d <= totalDays; d++) {
			const dStr = `${String(d).padStart(2, '0')}-${String(view.month + 1).padStart(2, '0')}-${view.year}`;
			const isBeforeMin = Boolean(minDate && isDateBefore(dStr, minDate));
			const isSelected = value === dStr;
			const isToday = todayStr === dStr;
			currentDays.push({
				dayNum: d,
				dateStr: dStr,
				isBeforeMin,
				isSelected,
				isToday,
			});
		}

		const nextDays = [];
		const totalSlots = prevDays.length + currentDays.length;
		const remaining = (7 - (totalSlots % 7)) % 7;
		for (let i = 1; i <= remaining; i++) {
			nextDays.push(i);
		}

		return { days: currentDays, prevMonthDays: prevDays, nextMonthDays: nextDays };
	}, [view.year, view.month, minDate, value, todayStr]);

	const handleSelectDay = (dayObj) => {
		if (dayObj.isBeforeMin) return;
		onChange(dayObj.dateStr);
		onClose();
	};

	const isTodayDisabled = Boolean(minDate && isDateBefore(todayStr, minDate));
	const handleSelectToday = (e) => {
		e.stopPropagation();
		if (isTodayDisabled) return;
		onChange(todayStr);
		onClose();
	};

	const popoverContent = (
		<div
			ref={popoverRef}
			onMouseDown={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
			style={
				usePortal
					? {
							position: 'fixed',
							top: !dynamicUpward && portalPos.top != null ? `${portalPos.top}px` : undefined,
							bottom: dynamicUpward && portalPos.bottom != null ? `${portalPos.bottom}px` : undefined,
							left: portalPos.left != null ? `${portalPos.left}px` : undefined,
							right: portalPos.right != null ? `${portalPos.right}px` : undefined,
							maxHeight: dynamicUpward
								? portalPos.bottom != null ? `${Math.max(260, window.innerHeight - portalPos.bottom - 16)}px` : undefined
								: portalPos.top != null ? `${Math.max(260, window.innerHeight - portalPos.top - 16)}px` : undefined,
							zIndex: 99999,
						}
					: undefined
			}
			className={`${
				usePortal
					? ''
					: `absolute ${align === 'right' ? 'right-0' : 'left-0'} z-50 ${
							dynamicUpward ? 'bottom-full mb-2' : 'top-full mt-2'
						}`
			} w-[276px] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/10 p-3 flex flex-col gap-2 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}
		>
			{/* Top Header with Month/Year Navigation */}
			<div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100">
				{/* Left Arrow Button */}
				<button
					type="button"
					onClick={handlePrevMonth}
					className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
					title="Previous month"
				>
					<span className="material-symbols-outlined text-[18px]">chevron_left</span>
				</button>

				{/* Non-editable Month & Year Display */}
				<span className="text-[13.5px] font-extrabold text-slate-800 tracking-tight select-none">
					{CALENDAR_MONTH_NAMES[view.month]} {view.year}
				</span>

				{/* Right Arrow Button */}
				<button
					type="button"
					onClick={handleNextMonth}
					className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
					title="Next month"
				>
					<span className="material-symbols-outlined text-[18px]">chevron_right</span>
				</button>
			</div>

			{/* Day of week headers */}
			<div className="grid grid-cols-7 gap-1 text-center">
				{CALENDAR_DAY_NAMES.map((name) => (
					<span key={name} className="text-[10px] font-bold text-slate-400 py-0.5 uppercase tracking-wider">
						{name}
					</span>
				))}
			</div>

			{/* Days Grid */}
			<div className="grid grid-cols-7 gap-1 text-center">
				{/* Previous month days */}
				{prevMonthDays.map((d, idx) => (
					<span
						key={`prev-${idx}`}
						className="h-7 flex items-center justify-center text-[11px] font-medium text-slate-300 select-none"
					>
						{d}
					</span>
				))}

				{/* Current month days */}
				{days.map((item) => {
					let btnClass = 'text-slate-700 hover:bg-primary/10 hover:text-primary';
					if (item.isBeforeMin) {
						btnClass = 'opacity-30 cursor-not-allowed text-slate-300 line-through decoration-slate-300';
					} else if (item.isSelected) {
						btnClass = 'bg-primary text-white font-extrabold shadow-sm ring-2 ring-primary/25 hover:bg-primary';
					} else if (item.isToday) {
						btnClass = 'text-primary font-bold border border-primary/40 bg-primary/5 hover:bg-primary/15';
					}

					return (
						<button
							key={item.dateStr}
							type="button"
							disabled={item.isBeforeMin}
							onClick={() => handleSelectDay(item)}
							title={
								item.isBeforeMin
									? `Cannot select date before ${minDate} (${minDateLabel || 'min date'})`
									: item.dateStr
							}
							className={`h-7 w-full flex items-center justify-center rounded-lg text-[11.5px] font-semibold transition-all cursor-pointer select-none ${btnClass}`}
						>
							{item.dayNum}
						</button>
					);
				})}

				{/* Next month days */}
				{nextMonthDays.map((d, idx) => (
					<span
						key={`next-${idx}`}
						className="h-7 flex items-center justify-center text-[11px] font-medium text-slate-300 select-none"
					>
						{d}
					</span>
				))}
			</div>

			{/* Footer: Min Date Notice & Quick Action */}
			<div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px]">
				{minDate && minDate !== '-' && minDate !== '-' ? (
					<span
						className="text-[10px] font-semibold text-slate-500 truncate max-w-[160px]"
						title={`Minimum allowable date: ${minDate} (${minDateLabel || 'required date'})`}
					>
						Min: <span className="font-mono font-bold text-slate-700">{minDate}</span>
					</span>
				) : (
					<span className="text-[10px] text-slate-400">Select Date</span>
				)}

				<div className="flex items-center gap-1.5 ml-auto">
					<button
						type="button"
						disabled={isTodayDisabled}
						onClick={handleSelectToday}
						className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${isTodayDisabled
							? 'opacity-40 cursor-not-allowed text-slate-400'
							: 'text-primary hover:bg-primary/10'
							}`}
						title={isTodayDisabled ? `Today is earlier than ${minDate}` : 'Select today'}
					>
						Today
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);

	if (usePortal && typeof document !== 'undefined') {
		return createPortal(popoverContent, document.body);
	}
	return popoverContent;
}

// Editable Date Cell (type directly in dd-mm-yyyy, select from modern calendar, or pick from suggestions)
export function EditableDateCell({
	id,
	value,
	onChange,
	onEnter,
	onKeyDown,
	minDate = '',
	minDateLabel = '',
	placeholder = 'dd-mm-yyyy',
	disabled = false,
	tooltip = '',
	suggestions = null,
	openUpward = 'auto',
	align = 'left',
	fullWidth = false,
}) {
	const isDash = !value || value === '-' || value === '-';
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [showCalendar, setShowCalendar] = useState(false);
	const containerRef = useRef(null);
	const dropdownRef = useRef(null);

	const [suggestionsPos, setSuggestionsPos] = useState({
		top: null,
		bottom: null,
		left: null,
		right: null,
		placeUpward: false,
	});

	const updateSuggestionsPosition = useCallback(() => {
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const dropdownHeight = 160;
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;

		let shouldOpenUpward = false;
		if (openUpward === true) {
			shouldOpenUpward = spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow;
		} else if (openUpward === false) {
			shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
		} else {
			shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
		}

		setSuggestionsPos({
			top: shouldOpenUpward ? null : rect.bottom + 6,
			bottom: shouldOpenUpward ? window.innerHeight - rect.top + 6 : null,
			left: align === 'right' ? null : Math.max(8, rect.left),
			right: align === 'right' ? Math.max(8, window.innerWidth - rect.right) : null,
			placeUpward: shouldOpenUpward,
		});
	}, [openUpward, align]);

	useLayoutEffect(() => {
		if (!showSuggestions) return;
		updateSuggestionsPosition();
		const handleScrollOrResize = () => {
			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				if (rect.bottom < 0 || rect.top > window.innerHeight) {
					setShowSuggestions(false);
					return;
				}
			}
			updateSuggestionsPosition();
		};
		window.addEventListener('scroll', handleScrollOrResize, true);
		window.addEventListener('resize', handleScrollOrResize);
		return () => {
			window.removeEventListener('scroll', handleScrollOrResize, true);
			window.removeEventListener('resize', handleScrollOrResize);
		};
	}, [showSuggestions, updateSuggestionsPosition]);

	// Close suggestions & calendar dropdown when clicking outside or pressing Escape
	useEffect(() => {
		if (!showSuggestions && !showCalendar) return;
		const handleClickOutside = (e) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target) &&
				(!dropdownRef.current || !dropdownRef.current.contains(e.target))
			) {
				setShowSuggestions(false);
				setShowCalendar(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setShowSuggestions(false);
				setShowCalendar(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [showSuggestions, showCalendar]);

	// If disabled, render clean read-only text
	if (disabled) {
		return (
			<div
				className="inline-flex items-center justify-center h-[28px] px-2 text-[12px] font-mono font-semibold text-slate-500 select-none cursor-not-allowed"
				title={tooltip || 'Field is locked'}
			>
				{isDash ? <span className="text-slate-400 font-bold text-[14px]">-</span> : value}
			</div>
		);
	}

	const displayVal = isDash ? '' : value;

	// Validate calendar date:
	const isCompleteDate = Boolean(displayVal && displayVal.length === 10);
	const isValidCalendarDate = isCompleteDate ? parseDDMMYYYY(displayVal) !== null : true;

	// Component-level sanity checks while typing (e.g. month cannot be > 12, day cannot be > 31)
	const dayNum = displayVal.length >= 2 ? parseInt(displayVal.slice(0, 2), 10) : null;
	const isInvalidDay = dayNum !== null && (dayNum < 1 || dayNum > 31);

	const monthNum = displayVal.length >= 5 ? parseInt(displayVal.slice(3, 5), 10) : null;
	const isInvalidMonth = monthNum !== null && (monthNum < 1 || monthNum > 12);

	const isInvalidDate = isInvalidDay || isInvalidMonth || (isCompleteDate && !isValidCalendarDate);

	// Check if current value violates minDate (is a past date relative to minDate)
	const isPastOfMin = Boolean(
		isCompleteDate &&
		isValidCalendarDate &&
		minDate &&
		minDate.length === 10 &&
		minDate !== '-' &&
		minDate !== '-' &&
		isDateBefore(displayVal, minDate)
	);

	const hasWarning = isInvalidDate || isPastOfMin;

	let warningMessage = '';
	if (isInvalidMonth) {
		warningMessage = 'Invalid month: Month must be between 01 and 12';
	} else if (isInvalidDay) {
		warningMessage = 'Invalid day: Day must be between 01 and 31';
	} else if (isCompleteDate && !isValidCalendarDate) {
		warningMessage = 'Invalid date: Date does not exist on the calendar';
	} else if (isPastOfMin) {
		warningMessage = `Invalid: Cannot be earlier than ${minDateLabel || 'required date'} (${minDate})`;
	}

	return (
		<div ref={containerRef} className={`relative ${fullWidth ? 'flex w-full' : 'inline-flex'} items-center group`}>
			<input
				id={id}
				type="text"
				value={displayVal}
				placeholder={placeholder}
				maxLength={10}
				autoComplete="off"
				inputMode="numeric"
				onClick={() => {
					if (suggestions && suggestions.length > 0) {
						setShowSuggestions(true);
					}
				}}
				onFocus={() => {
					if (suggestions && suggestions.length > 0) {
						setShowSuggestions(true);
					}
				}}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						setShowSuggestions(false);
						setShowCalendar(false);
					}
					if (e.key === 'Enter') {
						setShowSuggestions(false);
						setShowCalendar(false);
						if (onEnter) {
							e.preventDefault();
							onEnter(e);
						}
					}
					if (onKeyDown) {
						onKeyDown(e);
					}
				}}
				onChange={(e) => {
					const formatted = formatWithAutoDash(e.target.value, displayVal);
					onChange(formatted);
				}}
				onBlur={() => {
					// If user typed a date before minDate, correct it to minDate on blur
					if (
						displayVal &&
						displayVal.length === 10 &&
						minDate &&
						minDate !== '-' &&
						minDate !== '-' &&
						isDateBefore(displayVal, minDate)
					) {
						onChange(minDate);
					}
				}}
				className={
					fullWidth
						? `w-full h-[42px] pl-3.5 pr-10 text-[14px] font-bold font-mono text-slate-800 bg-white border rounded-xl transition-all placeholder:text-slate-300 ${hasWarning
							? 'bg-rose-50/70 border-rose-300 text-rose-900 focus:border-rose-400 focus:ring-2 focus:ring-rose-200'
							: 'border-slate-300 hover:border-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20'
						} focus:outline-none cursor-pointer`
						: `w-[96px] h-[28px] px-1.5 text-[11.5px] font-mono font-medium rounded-md border transition-all placeholder:text-slate-300 shadow-2xs text-center ${hasWarning
							? 'bg-rose-50/70 border-rose-300 text-rose-900 focus:border-rose-400 focus:ring-1 focus:ring-rose-300'
							: 'bg-white hover:bg-slate-50 focus:bg-white text-slate-800 border-slate-200 hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary'
						} focus:outline-none cursor-pointer`
				}
				title={
					hasWarning
						? warningMessage
						: tooltip || (minDate && minDate !== '-' ? `Minimum date: ${minDate} (${minDateLabel})` : '')
				}
			/>

			{/* Modern Calendar Trigger Button */}
			<div className={fullWidth ? 'absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center' : 'relative ml-1 flex items-center justify-center'}>
				<button
					type="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						setShowCalendar((prev) => !prev);
						setShowSuggestions(false);
					}}
					title={minDate ? `Select date on or after ${minDate}` : 'Select date from calendar'}
					className={`w-6 h-6 flex items-center justify-center rounded-lg transition-all cursor-pointer ${showCalendar
						? 'bg-primary text-white shadow-xs'
						: 'text-slate-400 hover:text-primary hover:bg-slate-100 active:scale-95'
						}`}
				>
					<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>calendar_today</span>
				</button>
			</div>

			{/* Modern Interactive Calendar Popover */}
			{showCalendar && (
				<ModernCalendarPicker
					value={displayVal}
					minDate={minDate}
					minDateLabel={minDateLabel}
					openUpward={openUpward}
					align={align}
					usePortal={true}
					anchorRef={containerRef}
					onChange={(newDate) => {
						onChange(newDate);
						setShowCalendar(false);
					}}
					onClose={() => setShowCalendar(false)}
				/>
			)}

			{/* Interactive Date Suggestions Dropdown */}
			{showSuggestions && !showCalendar && suggestions && suggestions.length > 0 && typeof document !== 'undefined' && createPortal(
				<div
					ref={dropdownRef}
					onMouseDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
					style={{
						position: 'fixed',
						top: suggestionsPos.placeUpward ? undefined : `${suggestionsPos.top}px`,
						bottom: suggestionsPos.placeUpward ? `${suggestionsPos.bottom}px` : undefined,
						left: suggestionsPos.left != null ? `${suggestionsPos.left}px` : undefined,
						right: suggestionsPos.right != null ? `${suggestionsPos.right}px` : undefined,
						zIndex: 99999,
					}}
					className="min-w-[215px] bg-white rounded-xl shadow-2xl ring-1 ring-slate-900/10 py-1.5 px-1.5 flex flex-col gap-1 text-left animate-in fade-in zoom-in-95 duration-100"
				>
					<div className="flex items-center justify-between px-2 py-1 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
						<span className="flex items-center gap-1 text-primary">
							<span className="material-symbols-outlined text-[14px]">lightbulb</span>
							<span>Suggested Payout</span>
						</span>
						<button
							type="button"
							onClick={() => setShowSuggestions(false)}
							className="text-slate-400 hover:text-slate-700 text-[14px] leading-none px-1 py-0.5 rounded cursor-pointer"
							title="Close suggestions"
						>
							&times;
						</button>
					</div>

					<div className="flex flex-col gap-0.5 mt-0.5">
						{suggestions.map((s, idx) => {
							const isCurrent = displayVal === s.date;
							const isDisabled = Boolean(s.disabled);
							return (
								<button
									key={s.date + s.label + idx}
									type="button"
									disabled={isDisabled}
									onClick={() => {
										if (isDisabled) return;
										onChange(s.date);
										setShowSuggestions(false);
									}}
									title={s.tooltip || (isDisabled ? 'Date is earlier than client received date' : '')}
									className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11.5px] transition-all ${isDisabled
										? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400'
										: isCurrent
											? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20 cursor-pointer'
											: 'text-slate-700 hover:text-primary hover:bg-slate-50 cursor-pointer group active:scale-[0.98]'
										}`}
								>
									<div className="flex items-center gap-1.5">
										<span className="font-mono font-bold">
											{s.date}
										</span>
										<span
											className={`text-[9.5px] px-1.5 py-0.5 rounded font-extrabold ${s.badgeClass || 'bg-slate-100 text-slate-600'
												}`}
										>
											{s.label}
										</span>
									</div>
									{isCurrent ? (
										<span className="material-symbols-outlined text-[15px] text-primary">
											check_circle
										</span>
									) : isDisabled ? null : (
										<span className="material-symbols-outlined text-[14px] text-slate-300 group-hover:text-primary transition-colors">
											arrow_forward
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>,
				document.body
			)}
		</div>
	);
}

// Modern Custom Dropdown Component for Repayment Schedule Status Filter
function ScheduleStatusDropdown({ value, onChange, options }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const selectedOption = options.find((opt) => opt.id === value) || options[0];

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsOpen(false);
			}
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
			{/* Trigger Button */}
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs select-none ${isOpen
					? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-sm'
					: 'bg-surface-container-low hover:bg-surface-container border-slate-200/90 text-slate-700 hover:text-slate-900'
					}`}
			>
				<span className="flex items-center gap-1.5">
					<span
						className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedOption?.dot || 'bg-slate-400'
							}`}
					/>
					<span>{selectedOption?.label}</span>
				</span>

				{selectedOption?.count !== undefined && (
					<span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-slate-200/80 text-slate-700">
						{selectedOption.count}
					</span>
				)}

				<span
					className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
						}`}
				>
					expand_more
				</span>
			</button>

			{/* Dropdown Menu Popover */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute right-0 top-full mt-1.5 z-50 min-w-[215px] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-1.5 flex flex-col gap-0.5 text-left animate-in fade-in zoom-in-95 duration-100"
				>
					<div className="flex items-center justify-between px-2.5 py-1 text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
						<span>Filter by Status</span>
						{value !== 'ALL' && (
							<button
								type="button"
								onClick={() => {
									onChange('ALL');
									setIsOpen(false);
								}}
								className="text-[10.5px] text-primary hover:underline font-bold cursor-pointer"
							>
								Reset
							</button>
						)}
					</div>

					<div className="flex flex-col gap-0.5 mt-1">
						{options.map((opt) => {
							const isSelected = opt.id === value;
							return (
								<button
									key={opt.id}
									type="button"
									role="option"
									aria-selected={isSelected}
									onClick={() => {
										onChange(opt.id);
										setIsOpen(false);
									}}
									className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-[12px] font-semibold transition-all cursor-pointer group ${isSelected
										? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
										: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-[0.98]'
										}`}
								>
									<div className="flex items-center gap-2">
										<span
											className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dot || 'bg-slate-400'
												}`}
										/>
										<span>{opt.label}</span>
									</div>

									<div className="flex items-center gap-1.5">
										{opt.count !== undefined && (
											<span
												className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${isSelected
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

// Modern Custom Dropdown Component for Joint Loan Status Filter
function ModernStatusDropdown({ value, onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const selectedOption = options.find((opt) => opt.id === value) || options[0] || {
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
			if (e.key === 'Escape') {
				setIsOpen(false);
			}
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
			{/* Trigger Button */}
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-haspopup="listbox"
					aria-expanded={isOpen}
					className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: value !== 'ALL'
							? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
							: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
						}`}
				>
					<span className="flex items-center gap-1.5 font-extrabold text-slate-800">
						<span
							className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedOption.dot || 'bg-slate-400'
								}`}
						/>
						<span>{selectedOption.label}</span>
					</span>

					{selectedOption.count !== undefined && (
						<span
							className={`px-2 rounded-full text-[10px] font-extrabold ${value !== 'ALL'
								? 'bg-primary text-white'
								: 'bg-slate-200/80 text-slate-700'
								}`}
						>
							{selectedOption.count}
						</span>
					)}

					<span
						className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
							}`}
					>
						expand_more
					</span>
				</button>

				{/* Quick Reset Button when filtered */}
				{value !== 'ALL' && (
					<button
						type="button"
						onClick={() => onChange('ALL')}
						title="Clear status filter"
						className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
					>
						<span className="material-symbols-outlined" style={{ fontSize: "18px" }}>close</span>
					</button>
				)}
			</div>

			{/* Dropdown Menu Popover */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute left-0 top-full mt-2 z-50 min-w-[240px] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-2 flex flex-col gap-1 text-left animate-in fade-in zoom-in-95 duration-100"
				>
					<div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
						<span>Filter by Status</span>
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

					<div className="flex flex-col gap-0.5 mt-1">
						{options.map((opt) => {
							const isSelected = opt.id === value;
							return (
								<button
									key={opt.id}
									type="button"
									role="option"
									aria-selected={isSelected}
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

// ─── ModernAccountDropdown ─────────────────────────────────────────────────
// Account name filter dropdown with search, live counts, and quick reset
function ModernAccountDropdown({ value = 'ALL', onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const dropdownRef = useRef(null);
	const searchInputRef = useRef(null);

	const selectedOption = options.find((o) => o.id === value) || options[0] || { id: 'ALL', label: 'All Accounts' };

	const filteredOptions = useMemo(() => {
		if (!searchTerm.trim()) return options;
		const q = searchTerm.toLowerCase();
		return options.filter((o) => {
			const labelMatch = o.label && o.label.toLowerCase().includes(q);
			const acronymMatch = o.acronym && o.acronym.toLowerCase().includes(q);
			return labelMatch || acronymMatch;
		});
	}, [options, searchTerm]);

	// Close on outside click / Escape
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

	// Focus search input when dropdown opens
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
		if (isOpen) setSearchTerm('');
	};

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			<div className="flex items-center gap-1.5">
				{/* Trigger Button */}
				<button
					type="button"
					onClick={handleToggle}
					aria-haspopup="listbox"
					aria-expanded={isOpen}
					className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: value !== 'ALL'
							? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
							: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
						}`}
				>
					<span className="material-symbols-outlined text-[16px] text-slate-500 flex-shrink-0">person</span>
					<span className="font-extrabold text-slate-800 max-w-[140px] truncate">{selectedOption.label}</span>

					{selectedOption.count !== undefined && (
						<span
							className={`px-2 rounded-full text-[10px] font-extrabold ${value !== 'ALL'
								? 'bg-primary text-white'
								: 'bg-slate-200/80 text-slate-700'
								}`}
						>
							{selectedOption.count}
						</span>
					)}

					<span
						className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
							}`}
					>
						expand_more
					</span>
				</button>
			</div>

			{/* Dropdown Popover */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute left-0 top-full mt-2 z-50 min-w-[260px] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-2 flex flex-col gap-1 text-left animate-in fade-in zoom-in-95 duration-100"
				>
					{/* Header */}
					<div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
						<span>Filter by Account</span>
						{value !== 'ALL' && (
							<button
								type="button"
								onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					{/* Options */}
					<div className="overflow-y-auto flex flex-col gap-0.5 p-1 max-h-[260px]">
						{filteredOptions.length > 0 ? (
							filteredOptions.map((opt) => {
								const isSelected = opt.id === value;
								return (
									<button
										key={opt.id}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(''); }}
										className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer group ${isSelected
											? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
											: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-[0.98]'
											}`}
									>
										<div className="flex items-center gap-2 min-w-0">
											<span className="truncate">{opt.label}</span>
										</div>
										<div className="flex items-center gap-2 flex-shrink-0">
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
												<span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>check</span>
											)}
										</div>
									</button>
								);
							})
						) : (
							<div className="px-3 py-4 text-center text-slate-400 text-[12px] font-medium">
								No accounts found
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── ModernDateRangeCalendar ───────────────────────────────────────────────
// Date range filter with calendar popover, range highlight, and presets
function ModernDateRangeCalendar({ startDate = '', endDate = '', onChange, referenceDate = null }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	// Internal draft state before Apply
	const [draftStart, setDraftStart] = useState(startDate);
	const [draftEnd, setDraftEnd] = useState(endDate);
	const [hoverDate, setHoverDate] = useState('');

	// Which month is shown - default to referenceDate or May 2026 if loans have that date
	const getInitialView = () => {
		if (startDate) {
			const d = parseAnyDateToDate(startDate);
			if (d) return { year: d.getFullYear(), month: d.getMonth() };
		}
		if (referenceDate) {
			const d = parseAnyDateToDate(referenceDate);
			if (d) return { year: d.getFullYear(), month: d.getMonth() };
		}
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() };
	};

	const [view, setView] = useState(getInitialView);

	// Sync draft state when popover opens
	useEffect(() => {
		if (isOpen) {
			setDraftStart(startDate);
			setDraftEnd(endDate);
			setHoverDate('');
			const initView = getInitialView();
			setView(initView);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	// Close on outside click / Escape
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') setIsOpen(false);
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	// Month navigation
	const handlePrevMonth = () => {
		setView((prev) =>
			prev.month === 0
				? { year: prev.year - 1, month: 11 }
				: { year: prev.year, month: prev.month - 1 }
		);
	};
	const handleNextMonth = () => {
		setView((prev) =>
			prev.month === 11
				? { year: prev.year + 1, month: 0 }
				: { year: prev.year, month: prev.month + 1 }
		);
	};

	// Day selection logic: first click = start, second click = end
	const handleDayClick = (dateStr) => {
		if (!draftStart || (draftStart && draftEnd)) {
			// Reset and pick start
			setDraftStart(dateStr);
			setDraftEnd('');
		} else {
			// Pick end (ensure start <= end)
			if (compareDDMMYYYY(dateStr, draftStart) < 0) {
				setDraftEnd(draftStart);
				setDraftStart(dateStr);
			} else {
				setDraftEnd(dateStr);
			}
		}
	};

	// Day classification for styling
	const getDayStyle = (dateStr) => {
		const effectiveEnd = draftEnd || (hoverDate && !draftEnd ? hoverDate : '');

		const isStart = dateStr === draftStart;
		const isEnd = dateStr === draftEnd;
		const isSingle = draftStart && !draftEnd && !hoverDate && dateStr === draftStart;

		// In range highlight
		let isInRange = false;
		if (draftStart && effectiveEnd) {
			const startTime = parseAnyDateToDate(draftStart)?.getTime() || 0;
			const endTime = parseAnyDateToDate(effectiveEnd)?.getTime() || 0;
			const dayTime = parseAnyDateToDate(dateStr)?.getTime() || 0;
			const [lo, hi] = startTime <= endTime ? [startTime, endTime] : [endTime, startTime];
			isInRange = dayTime > lo && dayTime < hi;
		}

		if (isStart || isEnd || isSingle) return 'range-endpoint';
		if (isInRange) return 'range-middle';
		return 'normal';
	};

	const { days, prevMonthDays, nextMonthDays } = useMemo(() => {
		const firstDayIndex = new Date(view.year, view.month, 1).getDay();
		const totalDays = new Date(view.year, view.month + 1, 0).getDate();
		const prevTotalDays = new Date(view.year, view.month, 0).getDate();

		const prevDays = [];
		for (let i = firstDayIndex - 1; i >= 0; i--) {
			prevDays.push(prevTotalDays - i);
		}

		const currentDays = [];
		for (let d = 1; d <= totalDays; d++) {
			const dStr = `${String(d).padStart(2, '0')}-${String(view.month + 1).padStart(2, '0')}-${view.year}`;
			currentDays.push({ dayNum: d, dateStr: dStr });
		}

		const nextDays = [];
		const totalSlots = prevDays.length + currentDays.length;
		const remaining = (7 - (totalSlots % 7)) % 7;
		for (let i = 1; i <= remaining; i++) nextDays.push(i);

		return { days: currentDays, prevMonthDays: prevDays, nextMonthDays: nextDays };
	}, [view.year, view.month]);

	// Apply selection
	const handleApply = () => {
		const finalEnd = draftEnd || draftStart;
		onChange({ startDate: draftStart, endDate: finalEnd });
		setIsOpen(false);
	};

	// Clear all
	const handleClear = () => {
		setDraftStart('');
		setDraftEnd('');
		onChange({ startDate: '', endDate: '' });
		setIsOpen(false);
	};

	// Quick presets
	const applyPreset = (preset) => {
		const now = new Date();
		const toStr = (d) =>
			`${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

		if (preset === 'all') {
			onChange({ startDate: '', endDate: '' });
			setIsOpen(false);
			return;
		}
		if (preset === 'this-month') {
			const start = new Date(now.getFullYear(), now.getMonth(), 1);
			const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			setDraftStart(toStr(start));
			setDraftEnd(toStr(end));
			setView({ year: now.getFullYear(), month: now.getMonth() });
			return;
		}
		if (preset === 'last-month') {
			const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const end = new Date(now.getFullYear(), now.getMonth(), 0);
			setDraftStart(toStr(start));
			setDraftEnd(toStr(end));
			setView({ year: start.getFullYear(), month: start.getMonth() });
			return;
		}
		if (preset === 'year-2026') {
			setDraftStart('01-01-2026');
			setDraftEnd('31-12-2026');
			setView({ year: 2026, month: 0 });
			return;
		}
	};

	const hasFilter = Boolean(startDate || endDate);
	const triggerLabel = formatDateRangeLabel(startDate, endDate);

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			<div className="flex items-center gap-1.5">
				{/* Trigger Button */}
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isOpen
						? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
						: hasFilter
							? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
							: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
						}`}
				>
					<span className="material-symbols-outlined text-[16px] text-slate-500 flex-shrink-0">date_range</span>
					<span className="font-extrabold text-slate-800 max-w-[180px] truncate">{triggerLabel}</span>
					<span
						className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''
							}`}
					>
						expand_more
					</span>
				</button>
			</div>

			{/* Calendar Popover */}
			{isOpen && (
				<div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 w-[308px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
					{/* Month Navigation */}
					<div className="flex items-center justify-between px-3 py-2.5">
						<button
							type="button"
							onClick={handlePrevMonth}
							className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
						>
							<span className="material-symbols-outlined text-[18px]">chevron_left</span>
						</button>
						<span className="text-[13.5px] font-extrabold text-slate-800 select-none">
							{CALENDAR_MONTH_NAMES[view.month]} {view.year}
						</span>
						<button
							type="button"
							onClick={handleNextMonth}
							className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
						>
							<span className="material-symbols-outlined text-[18px]">chevron_right</span>
						</button>
					</div>

					{/* Day of Week Headers */}
					<div className="grid grid-cols-7 gap-0.5 px-2">
						{CALENDAR_DAY_NAMES.map((name) => (
							<span
								key={name}
								className="text-center text-[10px] font-bold text-slate-400 py-1 uppercase tracking-wider select-none"
							>
								{name}
							</span>
						))}
					</div>

					{/* Day Grid */}
					<div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
						{/* Prev month placeholder days */}
						{prevMonthDays.map((d, idx) => (
							<span
								key={`prev-${idx}`}
								className="h-8 flex items-center justify-center text-[11px] text-slate-300 select-none"
							>
								{d}
							</span>
						))}

						{/* Current month days */}
						{days.map((item) => {
							const style = getDayStyle(item.dateStr);
							let cls = '';
							if (style === 'range-endpoint') {
								cls = 'bg-primary text-white font-extrabold shadow-sm ring-2 ring-primary/25 z-10 rounded-lg';
							} else if (style === 'range-middle') {
								cls = 'bg-primary/15 text-primary font-semibold rounded-lg';
							} else {
								cls = 'text-slate-700 hover:bg-primary/10 hover:text-primary rounded-lg';
							}

							return (
								<button
									key={item.dateStr}
									type="button"
									onClick={() => handleDayClick(item.dateStr)}
									onMouseEnter={() => setHoverDate(item.dateStr)}
									onMouseLeave={() => setHoverDate('')}
									className={`h-8 w-full flex items-center justify-center text-[11.5px] font-semibold transition-all cursor-pointer select-none ${cls}`}
									title={item.dateStr}
								>
									{item.dayNum}
								</button>
							);
						})}

						{/* Next month placeholder days */}
						{nextMonthDays.map((d, idx) => (
							<span
								key={`next-${idx}`}
								className="h-8 flex items-center justify-center text-[11px] text-slate-300 select-none"
							>
								{d}
							</span>
						))}
					</div>

					{/* Footer: preview and action buttons */}
					<div className="px-3 pb-3 pt-2 border-t border-slate-100 flex flex-col gap-2">
						{/* Date preview */}
						<div className="flex items-center justify-center text-[11px] text-slate-500">
							<span className="flex items-center justify-between gap-1">
								{draftStart ? (
									<span className="font-bold text-slate-700">{formatDisplayDate(draftStart)}</span>
								) : (
									<span className="text-slate-400 italic">Pick start date</span>
								)}
								<span className="material-symbols-outlined" style={{ fontSize: "18px" }}>arrow_right_alt</span>
								{draftEnd ? (
									<span className="font-bold text-slate-700">{formatDisplayDate(draftEnd)}</span>
								) : draftStart ? (
									<span className="text-slate-400 italic">Same date (or pick end date)</span>
								) : null}
							</span>
						</div>

						{/* Action Buttons */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleClear}
								className="flex-1 py-2 rounded-xl text-[12px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
							>
								Clear
							</button>
							<button
								type="button"
								onClick={handleApply}
								disabled={!draftStart}
								className="flex-1 py-2 rounded-xl text-[12px] font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
							>
								Apply
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// Partial Payment Split Modal Component (Option B)
export function PartialPaymentModal({
	isOpen,
	inst,
	primaryTag = 'SCS',
	secTag = 'FC',
	primarySharePct = 60,
	secAccounts = [],
	formatCurrency,
	onClose,
	onConfirm,
	onRevert,
}) {
	if (!isOpen || !inst) return null;

	const fullAmount = Number(inst.amount) || 0;
	const isCurrentlyPartial = Boolean(inst.isPartial);
	const alreadyPaid = isCurrentlyPartial ? Number(inst.partialPaidAmount) || 0 : 0;
	const currentBalance = isCurrentlyPartial ? Math.max(0, fullAmount - alreadyPaid) : fullAmount;

	// 1st partial payment date (when creating 2nd partial payment from balance)
	const firstPartialDate = useMemo(() => {
		if (!isCurrentlyPartial) return '';
		const raw = inst.subInstallments?.[0]?.receivedDate || inst.receivedDate || '';
		const str = String(raw).trim();
		if (str.length === 10 && parseDDMMYYYY(str)) {
			return str;
		}
		return '';
	}, [isCurrentlyPartial, inst.subInstallments, inst.receivedDate]);

	// Minimum allowed date for payment received: cannot be before EMI date or 1st partial payment date
	const minAllowedDate = useMemo(() => {
		if (isCurrentlyPartial && firstPartialDate) {
			if (inst.date && isDateBefore(firstPartialDate, inst.date)) {
				return inst.date;
			}
			return firstPartialDate;
		}
		return inst.date || '';
	}, [isCurrentlyPartial, firstPartialDate, inst.date]);

	// Resolve all secondary accounts for this installment
	const effectiveSecAccounts = useMemo(() => {
		if (Array.isArray(inst.secAccounts) && inst.secAccounts.length > 0) {
			return inst.secAccounts;
		}
		if (Array.isArray(secAccounts) && secAccounts.length > 0) {
			const totalSecShare = 100 - primarySharePct;
			return secAccounts.map((sa, idx) => ({
				accountName: sa.accountName || `Secondary ${idx + 1}`,
				accountTag: sa.accountTag || sa.initials || `SEC${idx + 1}`,
				share: Number(sa.share) || Math.round(totalSecShare / secAccounts.length),
				amount: Number(sa.amount) || Math.round((fullAmount * (Number(sa.share) || totalSecShare / secAccounts.length)) / 100),
				tds: Number(sa.tds) || 0,
			}));
		}
		return [
			{
				accountName: 'Secondary Account',
				accountTag: secTag || 'FC',
				share: 100 - primarySharePct,
				amount: fullAmount - (inst.primaryAmount != null ? Number(inst.primaryAmount) : Math.round((fullAmount * primarySharePct) / 100)),
				tds: Number(inst.tds) || 0,
			},
		];
	}, [inst.secAccounts, inst.primaryAmount, inst.tds, secAccounts, primarySharePct, secTag, fullAmount]);

	const isFirstEmi = Boolean(
		inst.sNo === 1 ||
		Number(inst.sNo) === 1 ||
		inst.parentSNo === 1 ||
		String(inst.sNo).startsWith('1')
	);
	const hasSecTds = Boolean(
		isFirstEmi ||
		(Array.isArray(effectiveSecAccounts) && effectiveSecAccounts.some((sa) => (Number(sa.tds) || 0) > 0)) ||
		(Number(inst.tds) || 0) > 0
	);

	// Helper to get total 1st EMI TDS for a secondary account
	const getSaFullTds = useCallback((idx) => {
		const sa = effectiveSecAccounts[idx];
		if (!sa) return 0;
		if (inst.secAccounts?.[idx]?.tds != null && !isNaN(Number(inst.secAccounts[idx].tds))) {
			const direct = Number(inst.secAccounts[idx].tds);
			if (direct > 0) return direct;
		}
		if (isCurrentlyPartial && Array.isArray(inst.subInstallments)) {
			const subTdsSum = inst.subInstallments.reduce((sum, sub) => sum + (Number(sub.secAccounts?.[idx]?.tds) || 0), 0);
			if (subTdsSum > 0) return subTdsSum;
		}
		if (secAccounts?.[idx]?.tds != null && !isNaN(Number(secAccounts[idx].tds))) {
			const propTds = Number(secAccounts[idx].tds);
			if (propTds > 0) return propTds;
		}
		if (sa.tds != null && !isNaN(Number(sa.tds)) && Number(sa.tds) > 0) {
			return Number(sa.tds);
		}
		if (effectiveSecAccounts.length === 1 && inst.tds != null && !isNaN(Number(inst.tds))) {
			return Number(inst.tds);
		}
		return 0;
	}, [effectiveSecAccounts, inst, isCurrentlyPartial, secAccounts]);

	const getSaAlreadyPaidTds = useCallback((idx) => {
		if (!isCurrentlyPartial || !Array.isArray(inst.subInstallments) || inst.subInstallments.length === 0) {
			return 0;
		}
		return Number(inst.subInstallments[0]?.secAccounts?.[idx]?.tds || 0);
	}, [isCurrentlyPartial, inst.subInstallments]);

	const getSaBalanceTds = useCallback((idx) => {
		const fullTds = getSaFullTds(idx);
		const alreadyPaidTds = getSaAlreadyPaidTds(idx);
		return Math.max(0, fullTds - alreadyPaidTds);
	}, [getSaFullTds, getSaAlreadyPaidTds]);

	const total1stEmiTds = useMemo(() => {
		return effectiveSecAccounts.reduce((sum, _, idx) => sum + getSaFullTds(idx), 0);
	}, [effectiveSecAccounts, getSaFullTds]);

	const totalAlreadyPaidTds = useMemo(() => {
		return effectiveSecAccounts.reduce((sum, _, idx) => sum + getSaAlreadyPaidTds(idx), 0);
	}, [effectiveSecAccounts, getSaAlreadyPaidTds]);

	const getSaSharePct = (sa) => {
		if (sa.share !== undefined && sa.share !== null && !isNaN(Number(sa.share))) {
			return Number(sa.share);
		}
		if (fullAmount > 0 && sa.amount) {
			return Math.round((Number(sa.amount) / fullAmount) * 100);
		}
		const totalSecShare = 100 - primarySharePct;
		return Math.round(totalSecShare / effectiveSecAccounts.length);
	};

	// Default pure share split for initial mount before any user locks
	const getInitialPureSplit = (recdNum) => {
		if (!recdNum || recdNum <= 0) {
			return {
				pri: '',
				secs: effectiveSecAccounts.map(() => ''),
				tds: effectiveSecAccounts.map(() => ''),
			};
		}
		const priAmt = Math.round((recdNum * primarySharePct) / 100);
		const remainingSec = recdNum - priAmt;
		const totalSecShare =
			effectiveSecAccounts.reduce((sum, sa) => sum + getSaSharePct(sa), 0) || (100 - primarySharePct) || 1;

		const baseMax = isCurrentlyPartial ? currentBalance : fullAmount;
		const ratio = baseMax > 0 ? (recdNum / baseMax) : 0.5;

		let allocatedSec = 0;
		const computedTds = effectiveSecAccounts.map((sa, idx) => {
			if (!hasSecTds) return 0;
			if (isCurrentlyPartial) {
				const existingBalTds = inst.subInstallments?.[1]?.secAccounts?.[idx]?.tds;
				if (existingBalTds != null && !isNaN(Number(existingBalTds))) {
					const bTds = Number(existingBalTds);
					return Math.min(bTds, Math.round(bTds * ratio));
				}
				const balTds = getSaBalanceTds(idx);
				return Math.min(balTds, Math.round(balTds * ratio));
			}
			const fullTds = getSaFullTds(idx);
			return Math.min(fullTds, Math.round(fullTds * ratio));
		});

		const secAmts = effectiveSecAccounts.map((sa, idx) => {
			let grossAmt = 0;
			if (idx === effectiveSecAccounts.length - 1) {
				grossAmt = Math.max(0, remainingSec - allocatedSec);
			} else {
				const saShare = getSaSharePct(sa);
				grossAmt = Math.round((remainingSec * saShare) / totalSecShare);
				allocatedSec += grossAmt;
			}
			const saTds = computedTds[idx] || 0;
			const netAmt = Math.max(0, grossAmt - saTds);
			return String(netAmt);
		});

		return {
			pri: priAmt > 0 ? formatIndianNumber(priAmt) : '',
			secs: secAmts.map((amt) => (Number(amt) > 0 ? formatIndianNumber(amt) : '0')),
			tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
		};
	};

	const initialRecd = isCurrentlyPartial ? Math.round(currentBalance * 0.5) : Math.round(fullAmount * 0.5);
	const initialSplit = getInitialPureSplit(initialRecd);

	// When already partial, input represents payment from remaining balance; otherwise partial from full amount
	const [payAmountInput, setPayAmountInput] = useState(() => formatIndianNumber(initialRecd));

	// Primary & Secondary amounts auto-filled from Received Amount based on share %, with TDS deducted for secondary accounts
	const [primaryAmountInput, setPrimaryAmountInput] = useState(() => initialSplit.pri);
	const [secAmountsInput, setSecAmountsInput] = useState(() => initialSplit.secs);

	// Secondary account TDS inputs (only for 1st EMI which has upfront TDS deduction)
	const [secTdsInputs, setSecTdsInputs] = useState(() => initialSplit.tds);

	// Lock states: allow user to freeze specific account amounts or TDS from auto-adjusting
	const [isPriLocked, setIsPriLocked] = useState(false);
	const [lockedSecAmounts, setLockedSecAmounts] = useState(() => effectiveSecAccounts.map(() => false));
	const [lockedSecTds, setLockedSecTds] = useState(() => effectiveSecAccounts.map(() => false));

	// Helper to split a given received amount into primary and per-secondary amounts based on share %
	// Supports locking individual fields (Primary, Secondary Amounts, Secondary TDS)
	const calculateShareSplit = (recdNum, customTds = null, locks = null, currentValues = null) => {
		if (!recdNum || recdNum <= 0) {
			return {
				pri: '',
				secs: effectiveSecAccounts.map(() => ''),
				tds: effectiveSecAccounts.map(() => ''),
			};
		}

		const priLocked = locks?.pri ?? isPriLocked;
		const secLocked = locks?.secs ?? lockedSecAmounts;
		const tdsLocked = locks?.tds ?? lockedSecTds;

		const curPri = currentValues?.pri !== undefined
			? (Number(String(currentValues.pri).replace(/[^0-9]/g, '')) || 0)
			: (Number(String(primaryAmountInput || '').replace(/[^0-9]/g, '')) || 0);

		const curSecs = currentValues?.secs !== undefined
			? currentValues.secs.map((v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0)
			: secAmountsInput.map((v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0);

		const curTds = currentValues?.tds !== undefined
			? currentValues.tds.map((v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0)
			: secTdsInputs.map((v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0);

		const baseMax = isCurrentlyPartial ? currentBalance : fullAmount;
		const ratio = baseMax > 0 ? (recdNum / baseMax) : 0.5;

		// 1. Determine TDS for each secondary account
		const computedTds = effectiveSecAccounts.map((sa, idx) => {
			if (!hasSecTds) return 0;
			if (tdsLocked && tdsLocked[idx]) {
				return curTds[idx] || 0;
			}
			if (customTds && customTds[idx] !== undefined && customTds[idx] !== '') {
				return Number(String(customTds[idx]).replace(/[^0-9]/g, '')) || 0;
			}
			if (isCurrentlyPartial) {
				const existingBalTds = inst.subInstallments?.[1]?.secAccounts?.[idx]?.tds;
				if (existingBalTds != null && !isNaN(Number(existingBalTds))) {
					const bTds = Number(existingBalTds);
					return Math.min(bTds, Math.round(bTds * ratio));
				}
				const balTds = getSaBalanceTds(idx);
				return Math.min(balTds, Math.round(balTds * ratio));
			}
			const fullTds = getSaFullTds(idx);
			return Math.min(fullTds, Math.round(fullTds * ratio));
		});

		// 2. Check lock distribution
		const allSecLocked = effectiveSecAccounts.length > 0 && effectiveSecAccounts.every((_, i) => secLocked && secLocked[i]);
		const anySecLocked = effectiveSecAccounts.some((_, i) => secLocked && secLocked[i]);

		// Case A: Everything is locked -> Keep all current amounts
		if (priLocked && allSecLocked) {
			return {
				pri: curPri > 0 ? formatIndianNumber(curPri) : '',
				secs: curSecs.map((amt) => (amt > 0 ? formatIndianNumber(amt) : '0')),
				tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
			};
		}

		// Case B: Primary is locked, but at least one secondary is unlocked
		if (priLocked && !allSecLocked) {
			const priAmt = curPri;
			const remForSec = Math.max(0, recdNum - priAmt);
			const unlockedIndices = effectiveSecAccounts.map((_, i) => i).filter((i) => !secLocked || !secLocked[i]);
			const lockedGrossSum = effectiveSecAccounts.reduce((sum, _, i) => {
				if (secLocked && secLocked[i]) {
					return sum + (curSecs[i] || 0) + (computedTds[i] || 0);
				}
				return sum;
			}, 0);
			const unlockedPool = Math.max(0, remForSec - lockedGrossSum);
			const unlockedWeights = unlockedIndices.reduce((sum, i) => sum + getSaSharePct(effectiveSecAccounts[i]), 0) || 1;

			const secAmts = [...curSecs];
			let allocatedUnlocked = 0;
			unlockedIndices.forEach((i, idx) => {
				let gross = 0;
				if (idx === unlockedIndices.length - 1) {
					gross = Math.max(0, unlockedPool - allocatedUnlocked);
				} else {
					const sPct = getSaSharePct(effectiveSecAccounts[i]);
					gross = Math.round((unlockedPool * sPct) / unlockedWeights);
					allocatedUnlocked += gross;
				}
				secAmts[i] = Math.max(0, gross - (computedTds[i] || 0));
			});

			return {
				pri: priAmt > 0 ? formatIndianNumber(priAmt) : '',
				secs: secAmts.map((amt) => (amt > 0 ? formatIndianNumber(amt) : '0')),
				tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
			};
		}

		// Case C: Primary is unlocked, but ALL secondaries are locked
		if (!priLocked && allSecLocked) {
			const lockedSecGrossSum = effectiveSecAccounts.reduce((sum, _, i) => {
				return sum + (curSecs[i] || 0) + (computedTds[i] || 0);
			}, 0);
			const priAmt = Math.max(0, recdNum - lockedSecGrossSum);
			return {
				pri: priAmt > 0 ? formatIndianNumber(priAmt) : '',
				secs: curSecs.map((amt) => (amt > 0 ? formatIndianNumber(amt) : '0')),
				tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
			};
		}

		// Case D: Primary is unlocked, and SOME secondaries are locked
		if (!priLocked && anySecLocked) {
			const lockedSecIndices = effectiveSecAccounts.map((_, i) => i).filter((i) => secLocked && secLocked[i]);
			const unlockedSecIndices = effectiveSecAccounts.map((_, i) => i).filter((i) => !secLocked || !secLocked[i]);
			const lockedSecGrossSum = lockedSecIndices.reduce((sum, i) => sum + (curSecs[i] || 0) + (computedTds[i] || 0), 0);
			const pool = Math.max(0, recdNum - lockedSecGrossSum);

			const unlockedSecWeights = unlockedSecIndices.reduce((sum, i) => sum + getSaSharePct(effectiveSecAccounts[i]), 0);
			const totalUnlockedWeight = primarySharePct + unlockedSecWeights;

			const priAmt = Math.round((pool * primarySharePct) / (totalUnlockedWeight || 1));
			const remSec = Math.max(0, pool - priAmt);

			const secAmts = [...curSecs];
			let allocatedUnlocked = 0;
			unlockedSecIndices.forEach((i, idx) => {
				let gross = 0;
				if (idx === unlockedSecIndices.length - 1) {
					gross = Math.max(0, remSec - allocatedUnlocked);
				} else {
					const sPct = getSaSharePct(effectiveSecAccounts[i]);
					gross = Math.round((remSec * sPct) / (unlockedSecWeights || 1));
					allocatedUnlocked += gross;
				}
				secAmts[i] = Math.max(0, gross - (computedTds[i] || 0));
			});

			return {
				pri: priAmt > 0 ? formatIndianNumber(priAmt) : '',
				secs: secAmts.map((amt) => (amt > 0 ? formatIndianNumber(amt) : '0')),
				tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
			};
		}

		// Case E: Nothing locked (pure standard split)
		const priAmt = Math.round((recdNum * primarySharePct) / 100);
		const remainingSec = recdNum - priAmt;
		const totalSecShare =
			effectiveSecAccounts.reduce((sum, sa) => sum + getSaSharePct(sa), 0) || (100 - primarySharePct) || 1;

		let allocatedSec = 0;
		const secAmts = effectiveSecAccounts.map((sa, idx) => {
			let grossAmt = 0;
			if (idx === effectiveSecAccounts.length - 1) {
				grossAmt = Math.max(0, remainingSec - allocatedSec);
			} else {
				const saShare = getSaSharePct(sa);
				grossAmt = Math.round((remainingSec * saShare) / totalSecShare);
				allocatedSec += grossAmt;
			}
			// Secondary account TDS is deducted from the secondary share
			const saTds = computedTds[idx] || 0;
			const netAmt = Math.max(0, grossAmt - saTds);
			return String(netAmt);
		});

		return {
			pri: priAmt > 0 ? formatIndianNumber(priAmt) : '',
			secs: secAmts.map((amt) => (Number(amt) > 0 ? formatIndianNumber(amt) : '0')),
			tds: computedTds.map((amt) => (amt > 0 ? formatIndianNumber(amt) : (hasSecTds ? '0' : ''))),
		};
	};

	const [recdDate, setRecdDate] = useState(() => {
		const today = getTodayDDMMYYYY();
		const baseMin = isCurrentlyPartial && firstPartialDate
			? (inst.date && isDateBefore(firstPartialDate, inst.date) ? inst.date : firstPartialDate)
			: inst.date;
		if (baseMin && isDateBefore(today, baseMin)) {
			return baseMin;
		}
		return today;
	});

	const [payoutDate, setPayoutDate] = useState(() => {
		const existingDue = inst.subInstallments?.[0]?.dueDate || inst.dueDate;
		if (existingDue && existingDue !== '-' && existingDue !== '-' && parseDDMMYYYY(existingDue)) {
			return existingDue;
		}
		const today = getTodayDDMMYYYY();
		const baseMin = isCurrentlyPartial && firstPartialDate
			? (inst.date && isDateBefore(firstPartialDate, inst.date) ? inst.date : firstPartialDate)
			: inst.date;
		if (baseMin && isDateBefore(today, baseMin)) {
			return baseMin;
		}
		return today;
	});

	const [remarks, setRemarks] = useState(() => {
		return inst.subInstallments?.[0]?.remarks || inst.remarks || '';
	});

	const [chqNoA, setChqNoA] = useState(() => inst.subInstallments?.[0]?.chqNo || `${inst.chqNo || 'CHQ-000000'}-A`);
	const [chqNoB, setChqNoB] = useState(() => inst.subInstallments?.[1]?.chqNo || `${inst.chqNo || 'CHQ-000000'}-B`);
	const [error, setError] = useState('');

	// Prevent background page from scrolling while modal is open
	useEffect(() => {
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	}, []);

	const handleReceivedDateChange = (val) => {
		setRecdDate(val);
		setError('');
		if (val && parseDDMMYYYY(val)) {
			if (!payoutDate || !parseDDMMYYYY(payoutDate) || isDateBefore(payoutDate, val)) {
				setPayoutDate(val);
			}
		}
	};

	const maxAllowed = isCurrentlyPartial ? currentBalance : fullAmount;

	const handleReceivedAmountChange = (val) => {
		const rawDigits = String(val).replace(/[^0-9]/g, '');
		if (!rawDigits) {
			setPayAmountInput('');
			setError('');
			if (!isPriLocked) setPrimaryAmountInput('');
			setSecAmountsInput((prev) => prev.map((v, i) => (lockedSecAmounts[i] ? v : '')));
			if (hasSecTds) {
				setSecTdsInputs((prev) => prev.map((v, i) => (lockedSecTds[i] ? v : '')));
			}
			return;
		}

		let recdNum = Number(rawDigits) || 0;
		if (maxAllowed > 0 && recdNum > maxAllowed) {
			recdNum = maxAllowed;
			setError(
				isCurrentlyPartial
					? `Received amount cannot exceed balance due amount (${formatCurrency(maxAllowed)})`
					: `Received amount cannot exceed EMI amount (${formatCurrency(maxAllowed)})`
			);
		} else {
			setError('');
		}

		const formattedVal = formatIndianNumber(recdNum);
		setPayAmountInput(formattedVal);

		const { pri, secs, tds } = calculateShareSplit(recdNum);
		if (!isPriLocked) {
			setPrimaryAmountInput(pri);
		}
		setSecAmountsInput((prev) =>
			effectiveSecAccounts.map((_, i) => (lockedSecAmounts[i] ? prev[i] : secs[i]))
		);
		if (hasSecTds) {
			setSecTdsInputs((prev) =>
				effectiveSecAccounts.map((_, i) => (lockedSecTds[i] ? prev[i] : tds[i]))
			);
		}
	};

	const handlePrimaryAmountChange = (val) => {
		const rawDigits = String(val).replace(/[^0-9]/g, '');
		let priNum = Number(rawDigits) || 0;
		if (maxAllowed > 0 && priNum > maxAllowed) {
			priNum = maxAllowed;
			setError(
				isCurrentlyPartial
					? `Primary account amount cannot exceed balance due amount (${formatCurrency(maxAllowed)})`
					: `Primary account amount cannot exceed EMI amount (${formatCurrency(maxAllowed)})`
			);
		} else {
			setError('');
		}
		setPrimaryAmountInput(!rawDigits ? '' : formatIndianNumber(priNum));
	};

	const handleSecAmountChange = (idx, val) => {
		const rawDigits = String(val).replace(/[^0-9]/g, '');
		let secNum = Number(rawDigits) || 0;
		if (maxAllowed > 0 && secNum > maxAllowed) {
			secNum = maxAllowed;
			setError(
				isCurrentlyPartial
					? `Secondary account amount cannot exceed balance due amount (${formatCurrency(maxAllowed)})`
					: `Secondary account amount cannot exceed EMI amount (${formatCurrency(maxAllowed)})`
			);
		} else {
			setError('');
		}
		setSecAmountsInput((prev) => {
			const next = [...prev];
			next[idx] = !rawDigits ? '' : formatIndianNumber(secNum);
			return next;
		});
	};

	const handleSecTdsChange = (idx, val) => {
		const rawDigits = String(val).replace(/[^0-9]/g, '');
		let tdsNum = Number(rawDigits) || 0;
		const maxTds = isCurrentlyPartial ? getSaBalanceTds(idx) : getSaFullTds(idx);
		if (maxTds > 0 && tdsNum > maxTds) {
			setError(
				isCurrentlyPartial
					? `Secondary account TDS cannot exceed balance TDS amount (${formatCurrency(maxTds)})`
					: `Secondary account TDS cannot exceed total 1st EMI TDS amount (${formatCurrency(maxTds)})`
			);
		} else {
			setError('');
		}

		// Current secondary net amount and previous TDS
		const currentNet = Number(String(secAmountsInput[idx] || '').replace(/[^0-9]/g, '')) || 0;
		const previousTds = Number(String(secTdsInputs[idx] || '').replace(/[^0-9]/g, '')) || 0;
		const currentGross = currentNet + previousTds;

		// Deduct new TDS from Gross share to get updated secondary net amount (if secondary amount is not locked)
		if (currentGross > 0 && !lockedSecAmounts[idx]) {
			const newNet = Math.max(0, currentGross - tdsNum);
			setSecAmountsInput((prev) => {
				const next = [...prev];
				next[idx] = formatIndianNumber(newNet);
				return next;
			});
		}

		setSecTdsInputs((prev) => {
			const next = [...prev];
			next[idx] = !rawDigits ? '' : formatIndianNumber(tdsNum);
			return next;
		});
	};

	const togglePriLock = () => {
		const nextLocked = !isPriLocked;
		setIsPriLocked(nextLocked);
		if (nextLocked && parsedInputAmount > 0) {
			const split = calculateShareSplit(
				parsedInputAmount,
				null,
				{ pri: true, secs: lockedSecAmounts, tds: lockedSecTds },
				{ pri: primaryAmountInput, secs: secAmountsInput, tds: secTdsInputs }
			);
			setSecAmountsInput((prev) =>
				effectiveSecAccounts.map((_, i) => (lockedSecAmounts[i] ? prev[i] : split.secs[i]))
			);
			if (hasSecTds) {
				setSecTdsInputs((prev) =>
					effectiveSecAccounts.map((_, i) => (lockedSecTds[i] ? prev[i] : split.tds[i]))
				);
			}
			setError('');
		}
	};

	const toggleSecAmountLock = (idx) => {
		const nextLocked = [...lockedSecAmounts];
		nextLocked[idx] = !nextLocked[idx];
		setLockedSecAmounts(nextLocked);
		if (nextLocked[idx] && parsedInputAmount > 0) {
			const split = calculateShareSplit(
				parsedInputAmount,
				null,
				{ pri: isPriLocked, secs: nextLocked, tds: lockedSecTds },
				{ pri: primaryAmountInput, secs: secAmountsInput, tds: secTdsInputs }
			);
			if (!isPriLocked) {
				setPrimaryAmountInput(split.pri);
			}
			setSecAmountsInput((prev) =>
				effectiveSecAccounts.map((_, i) => (nextLocked[i] ? prev[i] : split.secs[i]))
			);
			if (hasSecTds) {
				setSecTdsInputs((prev) =>
					effectiveSecAccounts.map((_, i) => (lockedSecTds[i] ? prev[i] : split.tds[i]))
				);
			}
			setError('');
		}
	};

	const toggleSecTdsLock = (idx) => {
		const nextLocked = [...lockedSecTds];
		nextLocked[idx] = !nextLocked[idx];
		setLockedSecTds(nextLocked);
		if (nextLocked[idx] && parsedInputAmount > 0) {
			const split = calculateShareSplit(
				parsedInputAmount,
				null,
				{ pri: isPriLocked, secs: lockedSecAmounts, tds: nextLocked },
				{ pri: primaryAmountInput, secs: secAmountsInput, tds: secTdsInputs }
			);
			if (!isPriLocked) {
				setPrimaryAmountInput(split.pri);
			}
			setSecAmountsInput((prev) =>
				effectiveSecAccounts.map((_, i) => (lockedSecAmounts[i] ? prev[i] : split.secs[i]))
			);
			setError('');
		}
	};

	const anyLocked = isPriLocked || lockedSecAmounts.some(Boolean) || (hasSecTds && lockedSecTds.some(Boolean));

	const unlockAll = () => {
		setIsPriLocked(false);
		setLockedSecAmounts(effectiveSecAccounts.map(() => false));
		setLockedSecTds(effectiveSecAccounts.map(() => false));
		if (parsedInputAmount > 0) {
			const capped = maxAllowed > 0 ? Math.min(parsedInputAmount, maxAllowed) : parsedInputAmount;
			const split = calculateShareSplit(
				capped,
				null,
				{ pri: false, secs: effectiveSecAccounts.map(() => false), tds: effectiveSecAccounts.map(() => false) }
			);
			setPrimaryAmountInput(split.pri);
			setSecAmountsInput(split.secs);
			if (hasSecTds) {
				setSecTdsInputs(split.tds);
			}
			setError('');
		}
	};

	const parsedInputAmount = Number(String(payAmountInput).replace(/[^0-9]/g, '')) || 0;
	const parsedPaidAmount = isCurrentlyPartial
		? alreadyPaid + parsedInputAmount
		: parsedInputAmount;
	const remainingBalance = Math.max(0, fullAmount - parsedPaidAmount);

	const parsedPriAmount = Number(String(primaryAmountInput).replace(/[^0-9]/g, '')) || 0;
	const parsedSecAmounts = secAmountsInput.map((val) => Number(String(val).replace(/[^0-9]/g, '')) || 0);
	const totalSecAllocated = parsedSecAmounts.reduce((sum, v) => sum + v, 0);

	const parsedSecTds = secTdsInputs.map((val) => Number(String(val).replace(/[^0-9]/g, '')) || 0);
	const totalSecTds = parsedSecTds.reduce((sum, v) => sum + v, 0);

	// Total allocated of received amount accounts for Primary + Secondary Net + Secondary TDS
	const totalAllocated = parsedPriAmount + totalSecAllocated + (hasSecTds ? totalSecTds : 0);
	const diffAllocated = parsedInputAmount - totalAllocated;

	const handleAutoBalance = () => {
		if (parsedInputAmount > 0) {
			const capped = maxAllowed > 0 ? Math.min(parsedInputAmount, maxAllowed) : parsedInputAmount;
			setIsPriLocked(false);
			setLockedSecAmounts(effectiveSecAccounts.map(() => false));
			setLockedSecTds(effectiveSecAccounts.map(() => false));
			const { pri, secs, tds } = calculateShareSplit(
				capped,
				null,
				{ pri: false, secs: effectiveSecAccounts.map(() => false), tds: effectiveSecAccounts.map(() => false) }
			);
			setPrimaryAmountInput(pri);
			setSecAmountsInput(secs);
			if (hasSecTds) {
				setSecTdsInputs(tds);
			}
			setError('');
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (parsedInputAmount <= 0) {
			setError('Payment amount must be greater than ₹0');
			return;
		}
		if (isCurrentlyPartial) {
			if (parsedInputAmount > currentBalance) {
				setError(`Received amount cannot exceed balance due amount of ${formatCurrency(currentBalance)}`);
				return;
			}
		} else {
			if (parsedInputAmount > fullAmount) {
				setError(`Received amount cannot exceed installment EMI amount of ${formatCurrency(fullAmount)}`);
				return;
			}
		}
		if (!recdDate || recdDate.length !== 10 || !parseDDMMYYYY(recdDate)) {
			setError('Please select a valid payment received date in dd-mm-yyyy format');
			return;
		}
		if (isDateBefore(recdDate, inst.date)) {
			setError(`Payment received date cannot be earlier than installment EMI date (${inst.date})`);
			return;
		}
		if (isCurrentlyPartial && firstPartialDate && isDateBefore(recdDate, firstPartialDate)) {
			setError(
				`2nd payment date (${recdDate}) cannot be earlier than 1st partial payment date (${firstPartialDate})`
			);
			return;
		}
		if (payoutDate && parseDDMMYYYY(payoutDate) && recdDate && parseDDMMYYYY(recdDate)) {
			if (isDateBefore(payoutDate, recdDate)) {
				setError(`Payout date (${payoutDate}) cannot be earlier than Payment Received date (${recdDate})`);
				return;
			}
		}
		if (parsedInputAmount > 0 && totalAllocated !== parsedInputAmount) {
			setError(
				`The sum of all account shares (${formatCurrency(totalAllocated)}) must equal Received Amount (${formatCurrency(
					parsedInputAmount
				)}). Click "Auto-balance" or adjust the amounts.`
			);
			return;
		}

		if (hasSecTds) {
			for (let idx = 0; idx < effectiveSecAccounts.length; idx++) {
				const maxTds = isCurrentlyPartial ? getSaBalanceTds(idx) : getSaFullTds(idx);
				if (maxTds > 0 && parsedSecTds[idx] > maxTds) {
					setError(
						isCurrentlyPartial
							? `TDS for ${effectiveSecAccounts[idx].accountTag || 'Secondary'} cannot exceed balance TDS of ${formatCurrency(maxTds)}`
							: `TDS for ${effectiveSecAccounts[idx].accountTag || 'Secondary'} cannot exceed 1st EMI TDS of ${formatCurrency(maxTds)}`
					);
					return;
				}
			}
		}

		const alreadyPaidPri = isCurrentlyPartial
			? (inst.subInstallments?.[0]?.primaryAmount != null ? Number(inst.subInstallments[0].primaryAmount) : Math.round((alreadyPaid * primarySharePct) / 100))
			: 0;

		const alreadyPaidSecAccounts =
			isCurrentlyPartial && Array.isArray(inst.subInstallments?.[0]?.secAccounts)
				? inst.subInstallments[0].secAccounts.map((sa) => Number(sa.amount) || 0)
				: effectiveSecAccounts.map(() => 0);

		const alreadyPaidSecTds =
			isCurrentlyPartial && Array.isArray(inst.subInstallments?.[0]?.secAccounts)
				? inst.subInstallments[0].secAccounts.map((sa) => Number(sa.tds) || 0)
				: effectiveSecAccounts.map(() => 0);

		const cumulativePri = alreadyPaidPri + parsedPriAmount;
		const cumulativeSecAmounts = parsedSecAmounts.map(
			(amt, idx) => (alreadyPaidSecAccounts[idx] || 0) + amt
		);
		const cumulativeSecTotal = cumulativeSecAmounts.reduce((sum, v) => sum + v, 0);

		const cumulativeSecTds = parsedSecTds.map(
			(amt, idx) => (alreadyPaidSecTds[idx] || 0) + amt
		);
		const cumulativeSecTdsTotal = cumulativeSecTds.reduce((sum, v) => sum + v, 0);

		onConfirm({
			sNo: inst.sNo,
			isSecondPayment: isCurrentlyPartial,
			paidAmount: parsedPaidAmount,
			thisPaidAmount: parsedInputAmount,
			thisPriAmount: parsedPriAmount,
			thisSecAmounts: parsedSecAmounts,
			thisSecAmount: totalSecAllocated,
			thisSecTdsAmounts: parsedSecTds,
			thisSecTds: totalSecTds,
			recdDate,
			payoutDate: payoutDate || recdDate,
			remarks: (remarks || '').trim(),
			firstPaidAmount: alreadyPaid,
			firstPriAmount: alreadyPaidPri,
			firstSecAmounts: alreadyPaidSecAccounts,
			firstSecTdsAmounts: alreadyPaidSecTds,
			firstRecdDate: inst.subInstallments?.[0]?.receivedDate || '',
			firstPayoutDate: inst.subInstallments?.[0]?.dueDate || '',
			firstRemarks: inst.subInstallments?.[0]?.remarks || '',
			priAmount: cumulativePri,
			secAmount: cumulativeSecTotal,
			secAmounts: cumulativeSecAmounts,
			secTds: cumulativeSecTdsTotal,
			secTdsAmounts: cumulativeSecTds,
			chqNoA: chqNoA.trim() || `${inst.chqNo}-A`,
			chqNoB: chqNoB.trim() || `${inst.chqNo}-B`,
		});
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-sans overscroll-contain"
			onClick={onClose}
		>
			<div
				className="bg-white rounded-2xl max-w-2xl h-[calc(100vh-8rem)] max-h-[85vh] w-full flex flex-col shadow-2xl ring-1 ring-slate-200/80 overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Modal Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
					<div className="flex items-center gap-2.5">
						<div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200 flex items-center justify-center">
							<span className="material-symbols-outlined text-[20px]">payments</span>
						</div>
						<div>
							<h3 className="font-bold text-[17px] text-slate-900">
								{isCurrentlyPartial
									? `Partial Payment on Balance (EMI #${inst.sNo})`
									: `Partial Payment (EMI #${inst.sNo})`}
							</h3>
							<p className="text-[12px] text-slate-500">
								{isCurrentlyPartial
									? 'Pay from remaining balance'
									: 'Split into collected sub-row and remaining balance'}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1 h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
					>
						<span className="material-symbols-outlined text-[20px]">close</span>
					</button>
				</div>

				{/* Modal Form */}
				<form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
					{/* Scrollable Form Content */}
					<div className="overflow-y-auto p-6 space-y-4 flex-1">
						{/* EMI Context & Status Metric Card */}
						<div className="bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
							<div className="grid grid-cols-3 gap-3 text-center divide-x divide-slate-200/80">
								<div className="px-1">
									<span className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
										Total EMI
									</span>
									<span className="text-[14px] font-extrabold text-slate-900 font-mono">
										{formatCurrency(fullAmount)}
									</span>
								</div>
								<div className="px-1">
									<span className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
										{isCurrentlyPartial ? 'Already Paid' : 'EMI Date'}
									</span>
									<span
										className={`text-[14px] font-extrabold font-mono ${isCurrentlyPartial ? 'text-emerald-700' : 'text-slate-800'
											}`}
									>
										{isCurrentlyPartial ? formatCurrency(alreadyPaid) : inst.date}
									</span>
								</div>
								<div className="px-1">
									<span className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
										{isCurrentlyPartial ? 'Balance Due' : 'Co-Lending'}
									</span>
									<span
										className={`text-[14px] font-extrabold font-mono ${isCurrentlyPartial ? 'text-rose-700' : 'text-slate-800'
											}`}
									>
										{isCurrentlyPartial
											? formatCurrency(currentBalance)
											: `${formatSharePercent(primarySharePct)}% / ${formatSharePercent(100 - primarySharePct)}%`}
									</span>
								</div>
							</div>
							{isCurrentlyPartial && fullAmount > 0 && (
								<div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
									<span className="text-slate-500 font-medium flex items-center gap-1.5">
										<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
										<span>1st Payment Date:</span>
										<strong className="text-slate-700 font-mono">{firstPartialDate || 'Recorded'}</strong>
									</span>
									<span className="font-bold text-slate-700 font-mono">
										{Math.min(100, Math.round((alreadyPaid / fullAmount) * 100))}% Cleared
									</span>
								</div>
							)}
							{hasSecTds && total1stEmiTds > 0 && (
								<div className="flex items-center justify-between text-[11px]">
									{isCurrentlyPartial && (
										<span className="text-slate-600 font-medium">
											Already Deducted: <strong className="text-slate-800 font-mono">{formatCurrency(totalAlreadyPaidTds)}</strong>
										</span>
									)}
								</div>
							)}
						</div>

						{/* Payment Receipt Details Card */}
						<div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-3 shadow-2xs">
							<div className="flex items-center justify-between border-b border-slate-100 pb-2">
								<span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
									<span className="material-symbols-outlined text-[15px] text-primary">event_available</span>
									Receipt Details
								</span>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-1">
								{/* Payment Received Date */}
								<div>
									<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
										Payment Received Date
									</label>
									<EditableDateCell
										value={recdDate}
										onChange={handleReceivedDateChange}
										minDate={minAllowedDate}
										minDateLabel={isCurrentlyPartial && firstPartialDate ? '1st Payment Date' : 'EMI Date'}
										placeholder="dd-mm-yyyy"
										align="left"
										fullWidth={true}
									/>
									<p className="text-[10.5px] text-slate-400 mt-1.5">
										{isCurrentlyPartial && firstPartialDate
											? `Cannot be earlier than 1st partial payment date (${firstPartialDate})`
											: `Cannot be earlier than EMI date (${inst.date})`}
									</p>
								</div>

								{/* Received Amount */}
								<div>
									<div className="flex items-center justify-between mb-1.5">
										<label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
											Received Amount
										</label>
									</div>
									<div className="relative">
										<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-[15px]">
											₹
										</span>
										<input
											type="text"
											inputMode="numeric"
											value={payAmountInput}
											onChange={(e) => handleReceivedAmountChange(e.target.value)}
											placeholder="0"
											className={`w-full pl-8 pr-4 h-[42px] bg-white border ${parsedInputAmount > maxAllowed && maxAllowed > 0
												? 'border-rose-400 ring-2 ring-rose-200'
												: 'border-slate-300 focus:ring-2 focus:ring-primary/20 focus:border-primary'
												} rounded-xl text-[14px] font-extrabold font-mono text-slate-900 focus:outline-none transition-all`}
										/>
									</div>
									<p className="text-[10.5px] text-slate-400 mt-1.5">
										{isCurrentlyPartial
											? `Up to ${formatCurrency(currentBalance)} outstanding balance`
											: `Up to ${formatCurrency(fullAmount)} EMI amount`}
									</p>
								</div>

								{/* Payout Date (Secondary Remittance) */}
								<div>
									<div className="flex items-center justify-between mb-1.5">
										<label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
											Payout Date
										</label>
									</div>
									<EditableDateCell
										value={payoutDate}
										onChange={(val) => {
											setPayoutDate(val);
											setError('');
										}}
										minDate={recdDate || minAllowedDate}
										minDateLabel="Recd Date"
										placeholder="dd-mm-yyyy"
										align="left"
										fullWidth={true}
									/>
								</div>

								{/* Remarks Field */}
								<div>
									<div className="flex items-center justify-between mb-1.5">
										<label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
											Remarks
										</label>
									</div>
									<input
										type="text"
										value={remarks}
										onChange={(e) => setRemarks(e.target.value)}
										placeholder="e.g. Paid via NEFT / Remittance pending"
										className="w-full px-3.5 h-[42px] bg-white border border-slate-300 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
									/>
								</div>
							</div>
						</div>

						{/* Co-Lending Share Distribution Card */}
						<div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
							<div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-wrap gap-2">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
										<span className="material-symbols-outlined text-[15px] text-indigo-600">pie_chart</span>
										Co-Lending Share Distribution
									</span>
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={handleAutoBalance}
										className="text-[11px] font-bold text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer transition-colors"
										title="Reset distribution to exact share percentages and unlock all"
									>
										<span className="material-symbols-outlined text-[13px]">sync</span>
										<span>Auto-split by %</span>
									</button>
								</div>
							</div>

							{/* Account Share Cards Grid */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start pt-1">
								{/* Primary Account Card */}
								<div className={`border rounded-xl p-3 space-y-2 transition-all ${isPriLocked ? 'bg-amber-50/30 border-amber-300 ring-1 ring-amber-300/50' : 'bg-blue-50/40 border-blue-200/80'}`}>
									<div className="flex items-center justify-between">
										<span className="text-[11.5px] font-extrabold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
											<span className="w-2 h-2 rounded-full bg-blue-600" />
											{primaryTag} (Primary)
										</span>
										<div className="flex items-center gap-1.5">
											<button
												type="button"
												onClick={togglePriLock}
												className={`h-5 w-5 p-1 rounded flex items-center justify-center cursor-pointer transition-all ${isPriLocked
													? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-extrabold'
													: 'bg-white/80 text-slate-500 hover:text-slate-700 hover:bg-white border border-slate-200'
												}`}
												title={isPriLocked ? 'Primary amount is locked. Click to unlock.' : 'Lock Primary amount from auto-adjusting'}
											>
												<span className="material-symbols-outlined" style={{fontSize: "14px"}}>
													{isPriLocked ? 'lock' : 'lock_open'}
												</span>
											</button>
											<span className="text-[10px] font-extrabold px-1 rounded-md bg-blue-100 text-blue-800">
												{formatSharePercent(primarySharePct)}%
											</span>
										</div>
									</div>
									{hasSecTds ? (
										<div className="pt-0.5">
											<label className="block text-[10.5px] font-bold text-slate-600 uppercase tracking-wider mb-1">
												Amount
											</label>
											<div className="relative">
												<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px]">
													₹
												</span>
												<input
													type="text"
													inputMode="numeric"
													value={primaryAmountInput}
													onChange={(e) => handlePrimaryAmountChange(e.target.value)}
													placeholder="0"
													className={`w-full pl-7 ${isPriLocked ? 'pr-7 bg-amber-50/30 border-amber-300 text-amber-950' : 'pr-3 bg-white border-blue-300/80 text-slate-900'} h-[36px] border rounded-lg text-[13.5px] font-bold font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`}
												/>
												{isPriLocked && (
													<span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" title="Amount is locked">
														<span className="material-symbols-outlined text-[14px]">lock</span>
													</span>
												)}
											</div>
										</div>
									) : (
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px]">
												₹
											</span>
											<input
												type="text"
												inputMode="numeric"
												value={primaryAmountInput}
												onChange={(e) => handlePrimaryAmountChange(e.target.value)}
												placeholder="0"
												className={`w-full pl-7 ${isPriLocked ? 'pr-7 bg-amber-50/30 border-amber-300 text-amber-950' : 'pr-3 bg-white border-blue-300/80 text-slate-900'} h-[38px] border rounded-lg text-[13.5px] font-bold font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`}
											/>
											{isPriLocked && (
												<span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" title="Amount is locked">
													<span className="material-symbols-outlined text-[14px]">lock</span>
												</span>
											)}
										</div>
									)}
								</div>

								{/* All Secondary Account Cards */}
								{effectiveSecAccounts.map((sa, idx) => {
									const sharePct = getSaSharePct(sa);
									const secColorThemes = [
										{
											bg: 'bg-purple-50/40',
											border: 'border-purple-200/80',
											dot: 'bg-purple-600',
											text: 'text-purple-950',
											badge: 'bg-purple-100 text-purple-800',
											inputBorder: 'border-purple-300/80',
											ring: 'focus:ring-purple-500/20 focus:border-purple-500',
											hint: 'text-purple-900/70',
										},
										{
											bg: 'bg-teal-50/40',
											border: 'border-teal-200/80',
											dot: 'bg-teal-600',
											text: 'text-teal-950',
											badge: 'bg-teal-100 text-teal-800',
											inputBorder: 'border-teal-300/80',
											ring: 'focus:ring-teal-500/20 focus:border-teal-500',
											hint: 'text-teal-900/70',
										},
										{
											bg: 'bg-indigo-50/40',
											border: 'border-indigo-200/80',
											dot: 'bg-indigo-600',
											text: 'text-indigo-950',
											badge: 'bg-indigo-100 text-indigo-800',
											inputBorder: 'border-indigo-300/80',
											ring: 'focus:ring-indigo-500/20 focus:border-indigo-500',
											hint: 'text-indigo-900/70',
										},
										{
											bg: 'bg-amber-50/40',
											border: 'border-amber-200/80',
											dot: 'bg-amber-600',
											text: 'text-amber-950',
											badge: 'bg-amber-100 text-amber-800',
											inputBorder: 'border-amber-300/80',
											ring: 'focus:ring-amber-500/20 focus:border-amber-500',
											hint: 'text-amber-900/70',
										},
										{
											bg: 'bg-rose-50/40',
											border: 'border-rose-200/80',
											dot: 'bg-rose-600',
											text: 'text-rose-950',
											badge: 'bg-rose-100 text-rose-800',
											inputBorder: 'border-rose-300/80',
											ring: 'focus:ring-rose-500/20 focus:border-rose-500',
											hint: 'text-rose-900/70',
										},
									];
									const theme = secColorThemes[idx % secColorThemes.length];
									const labelText = sa.accountTag || sa.accountName || `Secondary ${idx + 1}`;
									const isSecAmtLocked = Boolean(lockedSecAmounts[idx]);
									const isSecTdsLocked = Boolean(lockedSecTds[idx]);
									const isAnySaLocked = isSecAmtLocked || isSecTdsLocked;

									return (
										<div key={sa.accountTag || idx} className={`${theme.bg} border ${isAnySaLocked ? 'border-amber-300 ring-1 ring-amber-300/50' : theme.border} rounded-xl p-3 space-y-2 transition-all`}>
											<div className="flex items-center justify-between">
												<span className={`text-[11.5px] font-extrabold ${theme.text} uppercase tracking-wider flex items-center gap-1.5`}>
													<span className={`w-2 h-2 rounded-full ${theme.dot}`} />
													{labelText}
												</span>
												<div className="flex items-center gap-1.5">
													{!hasSecTds && (
														<button
															type="button"
															onClick={() => toggleSecAmountLock(idx)}
															className={`h-5 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
																isSecAmtLocked
																	? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-extrabold'
																	: 'bg-white/80 text-slate-500 hover:text-slate-700 hover:bg-white border border-slate-200'
															}`}
															title={isSecAmtLocked ? 'Secondary amount is locked. Click to unlock.' : 'Lock Secondary amount from auto-adjusting'}
														>
															<span className="material-symbols-outlined text-[12px]">
																{isSecAmtLocked ? 'lock' : 'lock_open'}
															</span>
															<span>{isSecAmtLocked ? 'Locked' : 'Lock'}</span>
														</button>
													)}
													<span className={`text-[10px] font-extrabold px-1 rounded-md ${theme.badge}`}>
														{formatSharePercent(sharePct)}%
													</span>
												</div>
											</div>
											{hasSecTds ? (
												<div className="grid grid-cols-2 gap-2 pt-0.5">
													<div>
														<div className="flex items-center justify-between mb-1">
															<label className="block text-[10.5px] font-bold text-slate-600 uppercase tracking-wider">
																Amount
															</label>
															<button
																type="button"
																onClick={() => toggleSecAmountLock(idx)}
																className={`h-5 w-5 p-1 rounded flex items-center justify-center cursor-pointer transition-all ${
																	isSecAmtLocked
																		? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-extrabold'
																		: 'text-slate-400 hover:text-slate-600 bg-white/60 border border-slate-200/70'
																}`}
																title={isSecAmtLocked ? 'Amount is locked. Click to unlock.' : 'Lock amount from auto-adjusting'}
															>
																<span className="material-symbols-outlined" style={{fontSize: "14px"}}>
																	{isSecAmtLocked ? 'lock' : 'lock_open'}
																</span>
															</button>
														</div>
														<div className="relative">
															<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[12px]">
																₹
															</span>
															<input
																type="text"
																inputMode="numeric"
																value={secAmountsInput[idx] ?? ''}
																onChange={(e) => handleSecAmountChange(idx, e.target.value)}
																placeholder="0"
																className={`w-full pl-6 ${isSecAmtLocked ? 'pr-6 bg-amber-50/30 border-amber-300 text-amber-950' : `pr-2 bg-white ${theme.inputBorder} text-slate-900`} h-[36px] border rounded-lg text-[13px] font-bold font-mono focus:outline-none focus:ring-2 ${theme.ring} transition-all`}
															/>
														</div>
													</div>
													<div>
														<div className="flex items-center justify-between mb-1">
															<label className="block text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">
																TDS
															</label>
															<button
																type="button"
																onClick={() => toggleSecTdsLock(idx)}
																className={`h-5 w-5 p-1 rounded flex items-center justify-center cursor-pointer transition-all ${
																	isSecTdsLocked
																		? 'bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs font-extrabold'
																		: 'text-amber-700/70 hover:text-amber-900 bg-white/60 border border-amber-200/80'
																}`}
																title={isSecTdsLocked ? 'TDS is locked. Click to unlock.' : 'Lock TDS from auto-adjusting'}
															>
																<span className="material-symbols-outlined" style={{fontSize: "14px"}}>
																	{isSecTdsLocked ? 'lock' : 'lock_open'}
																</span>
															</button>
														</div>
														<div className="relative">
															<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-600 font-bold text-[12px]">
																₹
															</span>
															<input
																type="text"
																inputMode="numeric"
																value={secTdsInputs[idx] ?? ''}
																onChange={(e) => handleSecTdsChange(idx, e.target.value)}
																placeholder="0"
																className={`w-full pl-6 ${isSecTdsLocked ? 'pr-6 bg-amber-100/70 border-amber-400 font-black' : 'pr-2 bg-amber-50/60 border-amber-300'} h-[36px] border rounded-lg text-[13px] font-bold font-mono text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 transition-all`}
															/>
														</div>
													</div>
												</div>
											) : (
												<div className="relative">
													<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px]">
														₹
													</span>
													<input
														type="text"
														inputMode="numeric"
														value={secAmountsInput[idx] ?? ''}
														onChange={(e) => handleSecAmountChange(idx, e.target.value)}
														placeholder="0"
														className={`w-full pl-7 ${isSecAmtLocked ? 'pr-7 bg-amber-50/30 border-amber-300 text-amber-950' : `pr-3 bg-white ${theme.inputBorder} text-slate-900`} h-[38px] border rounded-lg text-[13.5px] font-bold font-mono focus:outline-none focus:ring-2 ${theme.ring} transition-all`}
													/>
													{isSecAmtLocked && (
														<span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" title="Amount is locked">
															<span className="material-symbols-outlined text-[14px]">lock</span>
														</span>
													)}
												</div>
											)}
										</div>
									);
								})}
							</div>

							{/* Distribution Share Match Indicator */}
							{parsedInputAmount > 0 && (
								<div
									className={`rounded-xl px-3 py-2 text-[10px] flex flex-col gap-1.5 transition-colors ${diffAllocated === 0
										? 'bg-emerald-50/80 border border-emerald-200 text-emerald-800'
										: 'bg-amber-50/90 border border-amber-300 text-amber-900'
										}`}
								>
									<div className="flex items-center justify-between flex-wrap gap-2">
										<div className="flex items-center gap-2 font-medium flex-wrap">
											{diffAllocated === 0 ? (
												<span>
													<strong>All shares match Received Amount</strong>: {primaryTag} ({formatCurrency(parsedPriAmount)})
													{effectiveSecAccounts.map(
														(sa, idx) =>
															` + ${sa.accountTag || `SEC${idx + 1}`} (${formatCurrency(
																parsedSecAmounts[idx] || 0
															)})`
													)}
													{hasSecTds && totalSecTds > 0 ? ` + TDS (${formatCurrency(totalSecTds)})` : ''}
													{' '} = <strong>{formatCurrency(parsedInputAmount)}</strong>
												</span>
											) : (
												<span>
													Allocated: <strong>{formatCurrency(totalAllocated)}</strong> of {formatCurrency(parsedInputAmount)}
													{' '}&bull; Difference: <strong>{formatCurrency(Math.abs(diffAllocated))}</strong> ({diffAllocated > 0 ? 'unallocated' : 'exceeds received amount'})
												</span>
											)}
										</div>
										{diffAllocated !== 0 && (
											<button
												type="button"
												onClick={handleAutoBalance}
												className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer transition-colors shrink-0 ml-auto"
											>
												Auto-balance
											</button>
										)}
									</div>
								</div>
							)}
						</div>

						{/* Error message */}
						{error && (
							<div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] flex items-center gap-2">
								<span className="material-symbols-outlined text-[18px]">error</span>
								<span>{error}</span>
							</div>
						)}
					</div>

					{/* Fixed Action Buttons Footer */}
					<div className="flex items-center justify-between gap-2.5 px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
						<div>
							{isCurrentlyPartial && onRevert && (
								<button
									type="button"
									onClick={() => onRevert(inst.sNo)}
									className="px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200/80 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
									title="Revert back to a standard single installment"
								>
									<span className="material-symbols-outlined text-[16px]">restart_alt</span>
									<span>Reset to Full EMI</span>
								</button>
							)}
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[12.5px] hover:bg-slate-50 cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="submit"
								className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold text-[12.5px] hover:bg-primary/95 shadow-sm active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[18px]">check_circle</span>
								<span>Save Partial Payment</span>
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}

// Full-Page Joint Loan Details View

// Edit Account Allocations Card Component
// Edit Account Allocations Popup Modal Component
function EditAllocationsModal({
	isOpen,
	editAccounts,
	loan,
	availableAccountOptions = [],
	availableAccountObjects = [],
	onAccountChange,
	onToggleLock,
	onAddSecondary,
	onRemoveSecondary,
	onSave,
	onCancel,
	formatCurrency,
	facilityTotalInterest,
	facilityTotalRepay,
}) {
	const toggleLock = (accId) => {
		if (onToggleLock) {
			onToggleLock(accId);
		} else if (onAccountChange) {
			onAccountChange(accId, 'toggleLock');
		}
	};

	const [dbAccounts, setDbAccounts] = useState(() => {
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			return availableAccountObjects;
		}
		if (Array.isArray(availableAccountOptions) && availableAccountOptions.length > 0) {
			return availableAccountOptions.map((a) => (typeof a === 'object' && a !== null ? a : { name: a }));
		}
		return secondaryAccountOptions.map((a) => ({ name: a }));
	});

	useEffect(() => {
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			setDbAccounts(availableAccountObjects);
		}
	}, [availableAccountObjects]);

	useEffect(() => {
		let isMounted = true;
		const loadAccountNames = async () => {
			try {
				const accs = await api.getAccountNames();
				if (isMounted && Array.isArray(accs) && accs.length > 0) {
					setDbAccounts(accs);
					setCachedGlobalAccountObjects(accs);
				}
			} catch (err) {
				console.warn('Backend account names unavailable in modal:', err);
			}
		};
		loadAccountNames();
		return () => {
			isMounted = false;
		};
	}, []);

	const dbAccountNames = useMemo(() => {
		return dbAccounts.map((a) => (typeof a === 'object' && a !== null ? a.name : a)).filter(Boolean);
	}, [dbAccounts]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape' && isOpen) {
				onCancel();
			}
		};
		if (isOpen) {
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen, onCancel]);

	if (!isOpen) return null;

	const primaryAcc = editAccounts.find((a) => a.isPrimary) || editAccounts[0] || {};
	const secondaryAccs = editAccounts.filter((a) => !a.isPrimary);

	// Compute live totals
	const totalPrincipal = editAccounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0);
	const totalInterest = editAccounts.reduce((sum, a) => sum + (Number(a.interest) || 0), 0);
	const totalRepay = editAccounts.reduce((sum, a) => sum + (Number(a.repayAmount) || 0), 0);
	const totalShare = editAccounts.reduce((sum, a) => sum + (Number(a.share) || 0), 0);
	const roundedTotalShare = Math.round(totalShare * 100) / 100;
	const isShareBalanced = Math.abs(roundedTotalShare - 100) < 0.05;

	const displayedTotalInterest = isShareBalanced && facilityTotalInterest > 0
		? facilityTotalInterest
		: totalInterest;
	const displayedTotalRepay = isShareBalanced && facilityTotalRepay > 0
		? facilityTotalRepay
		: totalRepay;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm font-sans overscroll-contain animate-fadeIn"
			onClick={onCancel}
		>
			<div
				className="bg-white rounded-2xl max-w-4xl max-h-[calc(100vh-6rem)] w-full flex flex-col shadow-2xl ring-1 ring-slate-200/80 overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Modal Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
							<span className="material-symbols-outlined text-[22px]">tune</span>
						</div>
						<div>
							<h3 className="font-extrabold text-[17px] text-slate-900">
								Edit Account Allocations
							</h3>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Configure co-lender facility distribution, shares, and manage secondary partners.
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onCancel}
						className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
						title="Close"
					>
						<span className="material-symbols-outlined text-[20px]">close</span>
					</button>
				</div>

				{/* Scrollable Form Body */}
				<div className="overflow-y-auto px-6 py-5 flex flex-col gap-5 flex-1">
					{/* 1. Primary Account Card */}
					<div className="border border-purple-200/90 bg-purple-50/25 rounded-2xl p-5 shadow-2xs">
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-2">
								<span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
								<h4 className="font-extrabold text-[13px] text-slate-900">
									Primary Lender (Lead Account)
								</h4>
								<span className="text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 ring-1 ring-purple-200">
									Primary
								</span>
							</div>
						</div>

						{/* 12-Column Responsive Form Row: matching Secondary rows width with w-8 spacer */}
						<div className="flex items-center gap-3">
							<div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start flex-1">
								{/* Primary Account Name - NON EDITABLE (6 cols) */}
								<div className="sm:col-span-6">
									<div className="h-5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
										<span className="flex items-center gap-1">
											<span>Account Name</span>
										</span>
									</div>
									<input
										type="text"
										value={primaryAcc.accountName || ''}
										disabled
										title="Primary account name cannot be edited"
										className="w-full h-10 px-3.5 text-[12px] font-bold text-slate-600 bg-slate-100/90 border border-slate-200 rounded-xl cursor-not-allowed select-none shadow-2xs"
									/>
								</div>

								{/* Principal (4 cols) with ₹ prefix, lock icon & Indian comma format */}
								<div className="sm:col-span-4">
									<div className="h-5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
										<span className="flex items-center gap-1.5">
											<span>Principal (₹)</span>
										</span>
									</div>
									<div className="relative">
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px] pointer-events-none select-none">
											₹
										</span>
										<input
											type="text"
											inputMode="numeric"
											value={formatIndianNumber(primaryAcc.principal)}
											placeholder="0"
											onWheel={(e) => e.target.blur()}
											onChange={(e) => onAccountChange(primaryAcc.id, 'principal', e.target.value)}
											className={`w-full h-10 pl-7 pr-10 text-[12px] font-bold text-slate-900 bg-white border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all ${primaryAcc.isLocked
													? 'border-amber-400/90 bg-amber-50/25 ring-1 ring-amber-300/40 text-amber-950'
													: 'border-slate-200'
												}`}
										/>
										<button
											type="button"
											onClick={() => toggleLock(primaryAcc.id)}
											className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${primaryAcc.isLocked
													? 'text-amber-700 bg-amber-100/90 hover:bg-amber-200 ring-1 ring-amber-300/60 shadow-2xs'
													: 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
												}`}
											title={primaryAcc.isLocked ? 'Amount locked (will not change when editing other accounts). Click to unlock.' : 'Amount unlocked. Click to lock.'}
										>
											<span className="material-symbols-outlined" style={{ fontSize: "15px" }}>
												{primaryAcc.isLocked ? 'lock' : 'lock_open'}
											</span>
										</button>
									</div>
								</div>

								{/* Share % (2 cols) with % suffix & wheel scroll disabled */}
								<div className="sm:col-span-2">
									<div className="h-5 flex items-center text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
										<span>Share %</span>
									</div>
									<div className="relative">
										<input
											type="number"
											min="0"
											max="100"
											step="0.01"
											value={typeof primaryAcc.share === 'number' ? formatSharePercent(primaryAcc.share) : (primaryAcc.share ?? '')}
											placeholder="0"
											onWheel={(e) => e.target.blur()}
											onChange={(e) => onAccountChange(primaryAcc.id, 'share', e.target.value)}
											onBlur={() => {
												if (primaryAcc.share !== '' && primaryAcc.share != null) {
													onAccountChange(primaryAcc.id, 'share', Number(primaryAcc.share));
												}
											}}
											className={`w-full h-10 pl-3 pr-7 text-[12px] font-bold bg-white border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all ${primaryAcc.isLocked
													? 'border-amber-400/90 bg-amber-50/25 ring-1 ring-amber-300/40 text-amber-950'
													: 'border-slate-200 text-slate-800'
												}`}
										/>
										<span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[12px] pointer-events-none select-none">
											%
										</span>
									</div>
								</div>
							</div>
							<div className="w-8 flex-shrink-0" />
						</div>
					</div>

					{/* 2. Secondary Accounts Card */}
					<div className="border border-slate-200/90 bg-white rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
								<h4 className="font-extrabold text-[13px] text-slate-900">
									Secondary Lenders
								</h4>
								<span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
									{secondaryAccs.length}
								</span>
							</div>

							{(() => {
								const canonicalize = (str) => String(str || '').replace(/[\s._-]+/g, '').toLowerCase();
								const primaryCanon = canonicalize(primaryAcc?.accountName || loan?.primary_account_name || loan?.primaryBorrower?.name);
								const selectedCanons = editAccounts.map((a) => canonicalize(a.accountName)).filter(Boolean);
								const hasAvailableAccounts = dbAccountNames.some((name) => {
									const canon = canonicalize(name);
									return canon && canon !== primaryCanon && !selectedCanons.includes(canon);
								});
								return (
									<button
										type="button"
										onClick={onAddSecondary}
										disabled={!hasAvailableAccounts}
										className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold transition-all ${hasAvailableAccounts
											? 'bg-primary-container text-on-primary shadow-xs hover:bg-primary/90 cursor-pointer'
											: 'bg-slate-200 text-slate-400 cursor-not-allowed'
											}`}
										title={hasAvailableAccounts ? 'Add another secondary account' : 'All accounts from database are already allocated'}
									>
										<span className="material-symbols-outlined text-[16px]">add</span>
										<span>Add Account</span>
									</button>
								);
							})()}
						</div>

						{/* Column Headers for Secondary Accounts */}
						<div className="flex items-center gap-3">
							<div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 flex-1">
								<div className="sm:col-span-6 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
									Account Name *
								</div>
								<div className="sm:col-span-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
									Principal (₹)
								</div>
								<div className="sm:col-span-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
									Share %
								</div>
							</div>
							<div className="w-8 flex-shrink-0" />
						</div>

						{/* Secondary Accounts List (Rows below each other) */}
						<div className="flex flex-col gap-3">
							{secondaryAccs.map((sec, idx) => {
								// Filter options: Other selected accounts and Primary account are not displayed in the dropdown options
								const canonicalize = (str) => String(str || '').replace(/[\s._-]+/g, '').toLowerCase();
								const primaryCanon = canonicalize(primaryAcc?.accountName || loan?.primary_account_name || loan?.primaryBorrower?.name);
								const otherSelectedCanons = editAccounts
									.filter((a) => a.id !== sec.id)
									.map((a) => canonicalize(a.accountName))
									.filter(Boolean);

								const rawAccountsList = (Array.isArray(dbAccounts) && dbAccounts.length > 0)
									? dbAccounts
									: (Array.isArray(availableAccountOptions) && availableAccountOptions.length > 0
										? availableAccountOptions
										: secondaryAccountOptions);

								const dropdownOptions = rawAccountsList
									.map((item) => {
										const rawName = typeof item === 'object' && item !== null ? item.name : item;
										const name = String(rawName || '').trim();
										const acronym = (typeof item === 'object' && item !== null && item.acronym)
											? item.acronym
											: getAcronym(name, dbAccounts);
										return {
											id: item?.id,
											name,
											acronym: acronym ? String(acronym).trim().toUpperCase() : '',
										};
									})
									.filter((item) => {
										const canon = canonicalize(item.name);
										if (!canon) return false;
										if (canon === primaryCanon) return false;
										if (otherSelectedCanons.includes(canon)) return false;
										return true;
									})
									.map((item) => {
										const cleanName = item.name.toUpperCase();
										let label = cleanName;
										if (item.acronym && item.acronym !== cleanName && !cleanName.endsWith(`(${item.acronym})`)) {
											label = `${cleanName} (${item.acronym})`;
										}
										return {
											id: item.id,
											name: cleanName,
											acronym: item.acronym,
											value: cleanName,
											label: label,
										};
									})
									// Sort secondary account names in ascending order (A-Z)
									.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

								return (
									<div key={sec.id || idx} className="flex items-center gap-3">
										<div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center flex-1">
											{/* Account Name Dropdown */}
											<div className="sm:col-span-6">
												<ModernAccountSelect
													value={sec.accountName || ''}
													placeholder="Select secondary account..."
													onChange={(val) => onAccountChange(sec.id, 'accountName', val)}
													options={dropdownOptions}
													accountObjects={dbAccounts}
												/>
											</div>

											{/* Principal with ₹ prefix, lock icon & Indian comma format */}
											<div className="sm:col-span-4">
												<div className="relative">
													<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px] pointer-events-none select-none">
														₹
													</span>
													<input
														type="text"
														inputMode="numeric"
														value={formatIndianNumber(sec.principal)}
														placeholder="0"
														onWheel={(e) => e.target.blur()}
														onChange={(e) => onAccountChange(sec.id, 'principal', e.target.value)}
														className={`w-full h-10 pl-7 pr-10 text-[12px] font-bold text-slate-900 bg-white border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all ${sec.isLocked
																? 'border-amber-400/90 bg-amber-50/25 ring-1 ring-amber-300/40 text-amber-950'
																: 'border-slate-200'
															}`}
													/>
													<button
														type="button"
														onClick={() => toggleLock(sec.id)}
														className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${sec.isLocked
																? 'text-amber-700 bg-amber-100/90 hover:bg-amber-200 ring-1 ring-amber-300/60 shadow-2xs'
																: 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
															}`}
														title={sec.isLocked ? 'Amount locked (will not change when editing other accounts). Click to unlock.' : 'Amount unlocked. Click to lock.'}
													>
														<span className="material-symbols-outlined" style={{ fontSize: "15px" }}>
															{sec.isLocked ? 'lock' : 'lock_open'}
														</span>
													</button>
												</div>
											</div>

											{/* Share % with % suffix & wheel scroll disabled */}
											<div className="sm:col-span-2">
												<div className="relative">
													<input
														type="number"
														min="0"
														max="100"
														step="0.01"
														value={typeof sec.share === 'number' ? formatSharePercent(sec.share) : (sec.share ?? '')}
														placeholder="0"
														onWheel={(e) => e.target.blur()}
														onChange={(e) => onAccountChange(sec.id, 'share', e.target.value)}
														onBlur={() => {
															if (sec.share !== '' && sec.share != null) {
																onAccountChange(sec.id, 'share', Number(sec.share));
															}
														}}
														className={`w-full h-10 pl-3 pr-7 text-[12px] font-bold bg-white border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all ${sec.isLocked
																? 'border-amber-400/90 bg-amber-50/25 ring-1 ring-amber-300/40 text-amber-950'
																: 'border-slate-200 text-slate-800'
															}`}
													/>
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[12px] pointer-events-none select-none">
														%
													</span>
												</div>
											</div>
										</div>

										{/* Delete Icon: Only shown for secondary accounts after the first (idx > 0) */}
										<div className="w-8 flex items-center justify-center flex-shrink-0">
											{idx > 0 && (
												<button
													type="button"
													onClick={() => onRemoveSecondary(sec.id)}
													className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
													title="Remove this secondary account"
												>
													<span className="material-symbols-outlined text-[18px]">delete</span>
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* 3. Summary & Allocation Status */}
					<div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-5 flex-wrap">
							<div>
								<span className="text-slate-500 text-[11px] uppercase font-bold block">Total Principal</span>
								<strong className="text-[13px] font-black text-slate-900">{formatCurrency(totalPrincipal)}</strong>
							</div>
							<div className="h-7 w-px bg-slate-200" />
							<div>
								<span className="text-slate-500 text-[11px] uppercase font-bold block">Total Interest</span>
								<strong className="text-[13px] font-black text-slate-800">{formatCurrency(displayedTotalInterest)}</strong>
							</div>
							<div className="h-7 w-px bg-slate-200" />
							<div>
								<span className="text-slate-500 text-[11px] uppercase font-bold block">Total Repayment</span>
								<strong className="text-[13px] font-black text-emerald-800">{formatCurrency(displayedTotalRepay)}</strong>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<span
								className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-extrabold ring-1 ${isShareBalanced
									? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
									: 'bg-amber-50 text-amber-800 ring-amber-200'
									}`}
							>
								<span className="material-symbols-outlined text-[16px]">
									{isShareBalanced ? 'check_circle' : 'warning'}
								</span>
								<span>Total Share: {roundedTotalShare}% {isShareBalanced ? '(100% Balanced)' : '(Should equal 100%)'}</span>
							</span>
						</div>
					</div>
				</div>

				{/* Modal Footer */}
				<div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
					<div>
						{isShareBalanced ? (
							<span className="text-[12px] text-emerald-700 font-bold flex items-center gap-1">
								<span className="material-symbols-outlined text-[16px]">verified</span>
								<span>Allocations are fully balanced</span>
							</span>
						) : (
							<span className="text-[12px] text-amber-700 font-bold flex items-center gap-1">
								<span className="material-symbols-outlined text-[16px]">info</span>
								<span>Total shares currently sum to {roundedTotalShare}%</span>
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onCancel}
							className="px-4 py-2 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-600 hover:bg-white hover:border-slate-300 transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={onSave}
							disabled={!isShareBalanced}
							className={`px-5 py-2 rounded-xl text-on-primary text-[13px] font-extrabold shadow-xs transition-all flex items-center gap-1.5 ${isShareBalanced
								? 'bg-primary-container hover:bg-primary/95 cursor-pointer'
								: 'bg-slate-400 cursor-not-allowed opacity-60'
								}`}
							title={isShareBalanced ? 'Save Allocations' : 'Total share % must equal 100%'}
						>
							<span className="material-symbols-outlined text-[17px]">check</span>
							<span>Save Allocations</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function getFormattedNow() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	const day = pad(d.getDate());
	const month = pad(d.getMonth() + 1);
	const year = d.getFullYear();
	let hours = d.getHours();
	const minutes = pad(d.getMinutes());
	const ampm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12;
	hours = hours ? hours : 12;
	return `${day}-${month}-${year} ${pad(hours)}:${minutes} ${ampm}`;
}

// Lifecycle priority weights for tie-breaking events on the exact same date/time
export const TYPE_RECENCY_WEIGHT = {
	payout_approval: 50,
	payout_rejection: 50,
	audit_note: 45,
	payout_date_update: 40,
	recd_date_update: 35,
	admin_approval: 30,
	sec_manager_approval: 20,
	loan_rejected: 25,
	loan_created: 10,
};

// Parse an event's timestamp into a millisecond epoch value for accurate chronological comparison
export function getHistoryItemTimestamp(item) {
	if (!item) return 0;
	if (typeof item.timestamp === 'number') return item.timestamp;
	if (item.timestamp instanceof Date && !isNaN(item.timestamp.getTime())) return item.timestamp.getTime();

	if (item.isoDate) {
		const t = new Date(item.isoDate).getTime();
		if (!isNaN(t)) return t;
	}
	if (item.createdAt || item.created_at) {
		const t = new Date(item.createdAt || item.created_at).getTime();
		if (!isNaN(t)) return t;
	}

	const raw = item.timestamp || item.date || item.time || '';
	if (raw) {
		const str = String(raw).trim();

		// DD-MM-YYYY or DD/MM/YYYY with optional time (e.g., "08-10-2026 11:30 AM", "15-03-2026")
		const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?/i);
		if (dmyMatch) {
			const day = parseInt(dmyMatch[1], 10);
			const month = parseInt(dmyMatch[2], 10) - 1;
			const year = parseInt(dmyMatch[3], 10);
			let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
			const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
			const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
			const ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;
			if (ampm === 'PM' && hours < 12) hours += 12;
			if (ampm === 'AM' && hours === 12) hours = 0;
			const d = new Date(year, month, day, hours, minutes, seconds);
			if (!isNaN(d.getTime())) return d.getTime();
		}

		// YYYY-MM-DD or YYYY/MM/DD with optional time (e.g., "2026-03-15 11:30 AM", "2026-03-15")
		const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?/i);
		if (ymdMatch) {
			const year = parseInt(ymdMatch[1], 10);
			const month = parseInt(ymdMatch[2], 10) - 1;
			const day = parseInt(ymdMatch[3], 10);
			let hours = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
			const minutes = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
			const seconds = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
			const ampm = ymdMatch[7] ? ymdMatch[7].toUpperCase() : null;
			if (ampm === 'PM' && hours < 12) hours += 12;
			if (ampm === 'AM' && hours === 12) hours = 0;
			const d = new Date(year, month, day, hours, minutes, seconds);
			if (!isNaN(d.getTime())) return d.getTime();
		}

		const parsed = Date.parse(str);
		if (!isNaN(parsed)) return parsed;
	}

	if (item.id && typeof item.id === 'string') {
		const idMatch = item.id.match(/hist_(\d{10,13})/);
		if (idMatch) {
			let num = parseInt(idMatch[1], 10);
			if (idMatch[1].length === 10) num *= 1000;
			return num;
		}
	}

	return 0;
}

// Check if a string is a complete 10-character date (DD-MM-YYYY or YYYY-MM-DD)
export function isCompleteDateString(val) {
	if (!val || typeof val !== 'string') return false;
	const s = val.trim();
	if (s.length !== 10) return false;
	return /^\d{2}[-/.]\d{2}[-/.]\d{4}$/.test(s) || /^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(s);
}

// Clean up duplicate intermediate typing keystroke events and normalize history
export function cleanAndConsolidateLoanHistory(historyList) {
	if (!Array.isArray(historyList) || historyList.length === 0) return [];

	// Step 1: Filter out date update events where newValue is an incomplete partial digit string
	// (e.g. user typing digit-by-digit: "2", "20", "20-07", "20-07-2", "20-07-20", "20-07-202")
	const filtered = historyList.filter((item) => {
		if (!item) return false;
		if (item.type === 'recd_date_update' || item.type === 'payout_date_update') {
			if (item.newValue !== undefined && item.newValue !== null) {
				const nVal = String(item.newValue).trim();
				// Explicit clear or empty is allowed
				if (nVal === '' || nVal === '-' || nVal === 'None') return true;
				if (!isCompleteDateString(nVal)) return false;
			} else if (item.description) {
				const toMatch = item.description.match(/to\s+["']([^"']+)["']/i);
				if (toMatch) {
					const targetVal = toMatch[1].trim();
					if (targetVal !== '' && targetVal !== '-' && targetVal !== 'None' && !isCompleteDateString(targetVal)) {
						return false;
					}
				}
			}
		}
		return true;
	});

	// Step 2: Deduplicate redundant date updates for same emiNo + field within the same burst/minute
	const deduped = [];
	const seenKeys = new Set();
	for (const item of filtered) {
		if (item.type === 'recd_date_update' || item.type === 'payout_date_update') {
			const emiKey = `${item.emiNo || ''}_${item.fieldName || item.type}_${item.timestamp || ''}`;
			if (seenKeys.has(emiKey)) {
				continue;
			}
			seenKeys.add(emiKey);
		}
		deduped.push(item);
	}

	// Step 3: Clean up descriptions where oldValue was an incomplete digit string (e.g. from "20-07-202" to "20-07-2026") and ensure stable unique id
	return deduped.map((item, idx) => {
		let updated = { ...item };
		if (item.type === 'recd_date_update' || item.type === 'payout_date_update') {
			let desc = item.description || '';
			const fromMatch = desc.match(/from\s+["']([^"']+)["']\s+to\s+["']([^"']+)["']/i);
			if (fromMatch) {
				const oldPart = fromMatch[1].trim();
				const newPart = fromMatch[2].trim();
				if (!isCompleteDateString(oldPart) && oldPart !== 'None' && oldPart !== '') {
					const fieldLabel = item.type === 'recd_date_update' ? 'received date' : 'payout date';
					const emiLabel = item.emiNo !== undefined ? `EMI #${item.emiNo} ` : '';
					desc = `${emiLabel}${fieldLabel} updated to "${newPart}".`;
					updated = {
						...updated,
						description: desc,
						oldValue: '',
					};
				}
			}
		}
		if (!updated.id) {
			const fallbackId = `hist_${updated.type || 'entry'}_${updated.timestamp || 'ts'}_${updated.emiNo ?? ''}_${idx}`;
			updated.id = fallbackId;
		}
		return updated;
	});
}

// Arrange loan history events in strictly descending order (most recent first) and clean incomplete events
export function sortLoanHistoryRecentFirst(historyList) {
	const cleaned = cleanAndConsolidateLoanHistory(historyList);
	if (!Array.isArray(cleaned) || cleaned.length <= 1) {
		return cleaned || [];
	}
	return [...cleaned].sort((a, b) => {
		const timeA = getHistoryItemTimestamp(a);
		const timeB = getHistoryItemTimestamp(b);
		if (timeB !== timeA) {
			return timeB - timeA; // Recent first
		}

		// Tie-breaker 1: EMI Number (higher EMI installment was processed later)
		const emiA = a.emiNo != null ? Number(a.emiNo) : null;
		const emiB = b.emiNo != null ? Number(b.emiNo) : null;
		if (emiA != null && emiB != null && emiA !== emiB) {
			return emiB - emiA;
		}
		if (emiA != null && emiB == null) return -1;
		if (emiB != null && emiA == null) return 1;

		// Tie-breaker 2: Event Type Lifecycle Recency Weight
		const weightA = TYPE_RECENCY_WEIGHT[a.type] || 0;
		const weightB = TYPE_RECENCY_WEIGHT[b.type] || 0;
		if (weightB !== weightA) {
			return weightB - weightA;
		}

		return 0;
	});
}

export function generateInitialLoanHistory(l) {
	if (!l) return [];
	if (Array.isArray(l.history) && l.history.length > 0) {
		return sortLoanHistoryRecentFirst(l.history);
	}
	const entries = [];
	const loanDate = l.loan_date || l.appliedDate || '01-01-2026';
	const createdTime = l.requested_at || l.requestedAt || `${loanDate} 10:00 AM`;
	const creator = l.requester_name || l.requesterName || l.edited_by || 'Loan Desk';
	const clientName = l.client_account_name || l.primaryBorrower?.name || 'Applicant';
	const loanAmt = Number(l.amount || 0).toLocaleString('en-IN');
	const priAcc = l.primaryAccountName || l.primary || 'Primary Account';

	// 1. Creation Entry
	entries.push({
		id: `hist_init_created_${l.id || l.db_id || 1}`,
		type: 'loan_created',
		title: 'Loan Created & Registered',
		description: `Joint loan facility ${l.id || ''} created for ${clientName} with initial volume of ₹${loanAmt}. Primary Partner: ${priAcc}.`,
		timestamp: createdTime,
		userName: creator,
		userRole: 'Staff',
		userEmployeeCode: '',
	});

	// 2. Secondary Manager Approval(s)
	let secMgrs = [];
	if (l.verified_by || l.verifiedBy) {
		const raw = l.verified_by || l.verifiedBy;
		if (Array.isArray(raw)) {
			secMgrs = raw;
		} else if (typeof raw === 'string') {
			try {
				const parsed = JSON.parse(raw);
				secMgrs = Array.isArray(parsed) ? parsed : [raw];
			} catch (e) {
				secMgrs = [raw];
			}
		}
	} else if (l.approval_status === 'APPROVED' || l.approvalStatus === 'APPROVED' || l.status === 'Active') {
		secMgrs = ['Secondary Manager Verified'];
	}

	secMgrs.forEach((mgr, idx) => {
		entries.push({
			id: `hist_init_sec_${idx}`,
			type: 'sec_manager_approval',
			title: 'Secondary Manager Approved',
			description: `Secondary partner loan terms, interest rates, and allocations verified and approved by ${mgr}.`,
			timestamp: l.requested_at || createdTime,
			userName: mgr,
			userRole: 'manager',
			userEmployeeCode: '',
		});
	});

	// 3. Admin Approval
	if (l.actioned_at || l.actionedAt || l.approval_status === 'APPROVED' || l.approvalStatus === 'APPROVED' || l.status === 'Active') {
		const adminName = l.actioned_by || l.actionedBy || 'System Administrator';
		const adminTime = l.actioned_at || l.actionedAt || createdTime;
		entries.push({
			id: `hist_init_admin_${l.id || l.db_id || 1}`,
			type: 'admin_approval',
			title: 'Admin Final Approval',
			description: `Joint loan facility officially authorized, approved, and released for active portfolio servicing by Administrator ${adminName}.`,
			timestamp: adminTime,
			userName: adminName,
			userRole: 'admin',
			userEmployeeCode: '',
		});
	}

	// 4. Existing EMI Received / Payout dates
	if (l.repaymentSchedule && Array.isArray(l.repaymentSchedule)) {
		l.repaymentSchedule.forEach((sch) => {
			const recd = sch.received_date || sch.receivedDate;
			if (recd && recd !== '-' && recd !== '-') {
				entries.push({
					id: `hist_init_recd_${sch.sNo}`,
					type: 'recd_date_update',
					title: `EMI #${sch.sNo} Received Date Recorded`,
					description: `EMI installment #${sch.sNo} client payment marked as received on ${recd}.`,
					timestamp: `${recd} 11:30 AM`,
					userName: 'Servicing Desk',
					userRole: 'user',
					emiNo: sch.sNo,
					fieldName: 'receivedDate',
					newValue: recd,
				});
			}
			const payout = sch.payment_date || sch.paymentDate;
			if (payout && payout !== '-' && payout !== '-') {
				entries.push({
					id: `hist_init_payout_${sch.sNo}`,
					type: 'payout_date_update',
					title: `EMI #${sch.sNo} Payout Date Recorded`,
					description: `EMI installment #${sch.sNo} secondary partner remittance payout scheduled for ${payout}.`,
					timestamp: `${payout} 02:30 PM`,
					userName: 'Servicing Desk',
					userRole: 'user',
					emiNo: sch.sNo,
					fieldName: 'payoutDate',
					newValue: payout,
				});
			}
		});
	}

	return sortLoanHistoryRecentFirst(entries);
}

export function JointLoanDetailsPage({
	loan,
	onBack,
	onUpdateLoan,
	onSecManagerApprove,
	onDeleteLoan,
	formatCurrency,
	formatLoanDate,
	getStatusBadge,
	getPrimaryTagColor,
	availableAccountOptions = [],
	isSecondaryLoan = false,
	currentUser,
	availableAccountObjects = [],
	allUsers = [],
}) {
	const activeUser = useMemo(() => {
		if (currentUser) return currentUser;
		try {
			const stored = sessionStorage.getItem('loanDesk_user') || localStorage.getItem('loanDesk_user');
			return stored ? JSON.parse(stored) : null;
		} catch (e) {
			return null;
		}
	}, [currentUser]);

	const [usersList, setUsersList] = useState(allUsers);
	useEffect(() => {
		if (Array.isArray(allUsers) && allUsers.length > 0) {
			setUsersList(allUsers);
		} else {
			api.getUsers().then((res) => {
				if (Array.isArray(res)) setUsersList(res);
			}).catch(() => { });
		}
	}, [allUsers]);

	const [accountObjectsList, setAccountObjectsList] = useState(availableAccountObjects);
	useEffect(() => {
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			setAccountObjectsList(availableAccountObjects);
			setCachedGlobalAccountObjects(availableAccountObjects);
		} else {
			api.getAccountNames().then((res) => {
				if (Array.isArray(res) && res.length > 0) {
					setAccountObjectsList(res);
					setCachedGlobalAccountObjects(res);
				}
			}).catch(() => { });
		}
	}, [availableAccountObjects]);

	const isSystemAdmin = useMemo(() => {
		const role = (activeUser?.role || '').trim().toLowerCase();
		const name = (activeUser?.name || '').trim().toLowerCase();
		const username = (activeUser?.username || '').trim().toLowerCase();
		const code = (activeUser?.employee_code || '').trim().toLowerCase();
		return ['admin', 'super admin'].includes(role) || Boolean(activeUser?.permissions?.isAdmin) || name === 'system admin' || username === 'system admin' || code === 'jc0033' || code === 'admin';
	}, [activeUser]);

	const userPerms = useMemo(() => {
		const isAdmin = isSystemAdmin;
		let primary = [];
		let secondary = [];
		if (activeUser?.permissions) {
			if (typeof activeUser.permissions === 'object' && !Array.isArray(activeUser.permissions)) {
				primary = Array.isArray(activeUser.permissions.primary) ? activeUser.permissions.primary : [];
				secondary = Array.isArray(activeUser.permissions.secondary) ? activeUser.permissions.secondary : [];
			} else if (Array.isArray(activeUser.permissions)) {
				primary = activeUser.permissions;
			}
		}
		return { isAdmin, primary, secondary };
	}, [activeUser, isSystemAdmin]);

	const hasPayoutPending = isLoanPayoutPending(loan);
	const isLoanCreatedBySuperAdmin = Boolean(
		loan?.is_super_admin ||
		(loan?.actioned_by && ['admin', 'super admin', 'dhinakaran sekar', 'administrator', 'system admin'].includes(String(loan.actioned_by).trim().toLowerCase())) ||
		(loan?.requester_name && ['system admin', 'super admin', 'dhinakaran sekar'].includes(String(loan.requester_name).trim().toLowerCase()))
	);
	const isOperationalFacility = ['Active', 'Overdue', 'Date Overdue', 'Settled', 'Closed'].includes(loan?.status);
	const isFinallyApproved =
		loan?.approval_status === 'APPROVED' ||
		isOperationalFacility ||
		isLoanCreatedBySuperAdmin ||
		hasPayoutPending;
	const isPendingSecondary =
		!isFinallyApproved &&
		!hasPayoutPending &&
		(loan?.approval_status === 'PENDING_SECONDARY' ||
			(loan?.approval_status === 'PENDING' && !loan?.verified_by) ||
			(!loan?.approval_status && loan?.status === 'Pending'));
	const isPendingAdmin =
		!isFinallyApproved &&
		!hasPayoutPending &&
		(loan?.approval_status === 'PENDING_ADMIN' || loan?.approval_status === 'VERIFIED');
	const isRejected =
		!isFinallyApproved &&
		(loan?.approval_status === 'REJECTED' || loan?.status === 'Rejected');

	const isUserSecManager = useMemo(() => {
		if (userPerms?.isAdmin) return false;
		const accList = accountObjectsList?.length > 0 ? accountObjectsList : availableAccountObjects;
		return Boolean(isSecondaryLoan || checkUserHasPrimaryAccessForLoanSecondary(activeUser, loan, accList));
	}, [activeUser, loan, accountObjectsList, availableAccountObjects, userPerms?.isAdmin, isSecondaryLoan]);

	const isUserPriManager = useMemo(() => {
		if (userPerms?.isAdmin) return false;
		if (isSecondaryLoan) return false;
		const accList = accountObjectsList?.length > 0 ? accountObjectsList : availableAccountObjects;
		if (checkUserHasPrimaryAccessForLoanPrimary(activeUser, loan, accList)) return true;
		return !isUserSecManager;
	}, [userPerms?.isAdmin, isSecondaryLoan, activeUser, loan, accountObjectsList, availableAccountObjects, isUserSecManager]);

	// Payout date approval access is per installment:
	// If primary manager edit payout date -> approve/reject access to secondary manager.
	// If secondary manager edit payout date -> approve/reject access to primary manager.
	// System admin has immediate approval authority.
	const getCanApprovePayoutForInst = useCallback((inst) => {
		if (!inst) return false;
		if (userPerms?.isAdmin || isSystemAdmin) return true;
		const targetRole = inst.payout_approval_target || inst.payoutApprovalTarget;
		if (targetRole === 'PRIMARY') return isUserPriManager;
		if (targetRole === 'SECONDARY') return isUserSecManager;
		const editorRole =
			inst.payout_editor_role ||
			inst.payoutEditorRole ||
			inst.payout_requested_role ||
			inst.payoutRequestedRole;
		if (editorRole === 'SECONDARY') return isUserPriManager;
		if (editorRole === 'PRIMARY') return isUserSecManager;
		return isUserSecManager;
	}, [userPerms?.isAdmin, isSystemAdmin, isUserPriManager, isUserSecManager]);

	const hasAccess = useMemo(() => {
		return canUserAccessLoan(loan, activeUser, userPerms, availableAccountObjects, usersList);
	}, [loan, activeUser, userPerms, availableAccountObjects, usersList]);

	const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
	const [rejectReason, setRejectReason] = useState('');

	// Payout Date Approval Modal State
	const [payoutModalData, setPayoutModalData] = useState({
		isOpen: false,
		action: 'APPROVE',
		sNo: null,
		row: null,
		notes: '',
	});
	const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
	const [submittingPayoutSNo, setSubmittingPayoutSNo] = useState(null);

	// Loan Lifecycle & Audit History State
	const [loanHistory, setLoanHistory] = useState(() => {
		if (loan && Array.isArray(loan.history) && loan.history.length > 0) {
			return sortLoanHistoryRecentFirst(loan.history);
		}
		if (loan && Array.isArray(loan.history) && loan.history.length === 0) {
			return [];
		}
		return generateInitialLoanHistory(loan);
	});

	useEffect(() => {
		if (loan) {
			if (Array.isArray(loan.history) && loan.history.length > 0) {
				setLoanHistory(sortLoanHistoryRecentFirst(loan.history));
			} else if (Array.isArray(loan.history) && loan.history.length === 0) {
				setLoanHistory([]);
			} else {
				setLoanHistory(generateInitialLoanHistory(loan));
			}
		}
	}, [loan]);

	const cleanLoanHistory = useMemo(() => sortLoanHistoryRecentFirst(loanHistory), [loanHistory]);

	const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL' | 'approvals' | 'recd' | 'payout' | 'created'
	const [historySearch, setHistorySearch] = useState('');
	const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false);
	const [noteText, setNoteText] = useState('');
	const [noteEmiNo, setNoteEmiNo] = useState('');
	const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
	const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
	const [isHistorySelectMode, setIsHistorySelectMode] = useState(false);
	const [historyDeleteModal, setHistoryDeleteModal] = useState({
		isOpen: false,
		itemIds: [],
		items: [],
		isDeleting: false,
	});

	const [accounts, setAccounts] = useState(() => getLoanAccountDetails(loan));
	const [currentStatus, setCurrentStatus] = useState(() => getComputedLoanStatus(loan) || loan?.status);
	const [isEditing, setIsEditing] = useState(false);
	const [editAccounts, setEditAccounts] = useState(() => getLoanAccountDetails(loan));
	const [saveFeedback, setSaveFeedback] = useState(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [exportNotification, setExportNotification] = useState(null);
	const exportNotificationTimerRef = useRef(null);

	const handleCloseExportNotification = useCallback(() => {
		if (exportNotificationTimerRef.current) {
			clearTimeout(exportNotificationTimerRef.current);
			exportNotificationTimerRef.current = null;
		}
		setExportNotification(null);
	}, []);

	useEffect(() => {
		return () => {
			if (exportNotificationTimerRef.current) {
				clearTimeout(exportNotificationTimerRef.current);
			}
		};
	}, []);

	const prevLoanIdRef = useRef(null);
	const committedDatesRef = useRef({});
	useEffect(() => {
		if (loan) {
			const currentId = loan.id || loan.db_id || loan.loan_id;
			if (prevLoanIdRef.current && prevLoanIdRef.current !== currentId) {
				setExpandedRows({});
				committedDatesRef.current = {};
			}
			prevLoanIdRef.current = currentId;
			const accs = getLoanAccountDetails(loan);
			setAccounts(accs);
			setEditAccounts(accs);
			setCurrentStatus(getComputedLoanStatus(loan) || loan.status);
			const rawSch = (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule))
				? loan.repaymentSchedule
				: ((loan.repayment_schedule && Array.isArray(loan.repayment_schedule)) ? loan.repayment_schedule : null);
			if (rawSch) {
				const fromLoan = {};
				const nullSplits = new Set();
				rawSch.forEach((sch) => {
					const sno = sch.sNo || sch.s_no || sch.installmentNumber;
					if (sch.splits) {
						fromLoan[sno] = sch.splits;
					} else if (sch.splits === null) {
						nullSplits.add(String(sno));
						nullSplits.add(Number(sno));
					}
				});
				setSplitInstallments((prev) => {
					const next = { ...fromLoan, ...prev };
					nullSplits.forEach((k) => {
						delete next[k];
					});
					Object.keys(fromLoan).forEach((k) => {
						if (nullSplits.has(k)) return;
						const existing = prev[k] || {};
						const incoming = fromLoan[k] || {};
						next[k] = { ...incoming, ...existing };
						const amountKeys = ['amountA', 'paidAmount', 'amountB', 'amountC', 'priAmount', 'priAmountA', 'priAmountB', 'priAmountC', 'secAmount', 'secAmountA', 'secAmountB', 'secAmountC', 'secAmounts', 'secAmountsA', 'secAmountsB', 'secAmountsC', 'secTds', 'secTdsA', 'secTdsB', 'secTdsC', 'secTdsAmounts', 'secTdsAmountsA', 'secTdsAmountsB', 'secTdsAmountsC'];
						amountKeys.forEach((ak) => {
							if (existing[ak] !== undefined && (next[ak] === undefined || next[ak] === null)) {
								next[ak] = existing[ak];
							} else if (incoming[ak] !== undefined && (next[ak] === undefined || next[ak] === null)) {
								next[ak] = incoming[ak];
							}
						});
					});
					return next;
				});
			}
		}
	}, [loan]);

	// Secondary Manager Approval Action Handler
	const handleSecondaryManagerApprove = async () => {
		if (isSubmittingApproval) return;
		setIsSubmittingApproval(true);
		const nowStr = getFormattedNow();
		const mgrName = activeUser?.name || 'Secondary Manager';
		const mgrCode = activeUser?.employee_code || '';
		const secAccounts = getLoanSecondaryAccounts(loan);
		const mgrAccount = secAccounts[0] || 'Secondary Account';
		const verifiedLabel = `${mgrName}${mgrCode ? ` (${mgrCode})` : ''}`;

		const histEntry = {
			id: `hist_${Date.now()}_sec`,
			type: 'sec_manager_approval',
			title: 'Secondary Manager Approved',
			description: `Secondary partner share verification approved by ${verifiedLabel} for ${mgrAccount}. Request moved to Admin for final approval.`,
			timestamp: nowStr,
			isoDate: new Date().toISOString(),
			userName: mgrName,
			userRole: 'manager',
			userEmployeeCode: mgrCode,
			accountName: mgrAccount,
		};

		const nextHist = [histEntry, ...loanHistory];
		setLoanHistory(nextHist);

		const updatedLoan = {
			...loan,
			verified_by: verifiedLabel,
			verifiedBy: verifiedLabel,
			approval_status: 'PENDING_ADMIN',
			approvalStatus: 'PENDING_ADMIN',
			status: 'Pending',
			history: nextHist,
		};

		const loanIdentifier = loan?.db_id || loan?.id;
		if (loanIdentifier) {
			try {
				await api.approveJointLoanSecondary(loanIdentifier, {
					userName: mgrName,
					userCode: mgrCode,
					accountName: mgrAccount,
				});
			} catch (err) {
				console.warn('Could not save secondary approval to backend:', err);
			}
		}
		setIsSubmittingApproval(false);

		if (onSecManagerApprove) {
			onSecManagerApprove(updatedLoan);
		} else {
			if (onUpdateLoan) onUpdateLoan(updatedLoan);
			if (onBack) onBack();
		}
	};

	// Administrator Final Approval Action Handler
	const handleAdminApprove = async () => {
		if (isSubmittingApproval) return;
		setIsSubmittingApproval(true);
		const nowStr = getFormattedNow();
		const adminName = activeUser?.name || 'Administrator';
		const adminCode = activeUser?.employee_code || '';

		const histEntry = {
			id: `hist_${Date.now()}_admin`,
			type: 'admin_approval',
			title: 'Admin Final Approval',
			description: `Facility officially authorized and activated for live loan servicing by Administrator ${adminName}${adminCode ? ` (${adminCode})` : ''}.`,
			timestamp: nowStr,
			isoDate: new Date().toISOString(),
			userName: adminName,
			userRole: 'admin',
			userEmployeeCode: adminCode,
		};

		const nextHist = [histEntry, ...loanHistory];
		setLoanHistory(nextHist);
		setCurrentStatus('Active');

		const updatedLoan = {
			...loan,
			status: 'Active',
			approval_status: 'APPROVED',
			approvalStatus: 'APPROVED',
			actioned_by: adminName,
			actionedBy: adminName,
			actioned_at: nowStr,
			actionedAt: nowStr,
			history: nextHist,
		};

		if (onUpdateLoan) onUpdateLoan(updatedLoan);
		setSaveFeedback(`Loan successfully authorized and approved by Admin!`);

		const loanIdentifier = loan?.db_id || loan?.id;
		if (loanIdentifier) {
			try {
				await api.approveJointLoanAdmin(loanIdentifier, {
					userName: adminName,
					userCode: adminCode,
				});
			} catch (err) {
				console.warn('Could not save admin approval to backend:', err);
			}
		}
		setIsSubmittingApproval(false);
	};

	// Reject Loan Action Handler
	const handleRejectLoan = async (reason) => {
		if (isSubmittingApproval) return;
		setIsSubmittingApproval(true);
		const nowStr = getFormattedNow();
		const reviewerName = activeUser?.name || 'Reviewer';
		const reviewerCode = activeUser?.employee_code || '';
		const reviewerRole = ['admin', 'super admin'].includes((activeUser?.role || '').toLowerCase()) ? 'admin' : 'manager';

		const histEntry = {
			id: `hist_${Date.now()}_reject`,
			type: 'loan_rejected',
			title: 'Loan Request Rejected',
			description: `Joint facility rejected by ${reviewerName}${reviewerCode ? ` (${reviewerCode})` : ''}. Reason: ${reason || 'Terms declined.'}`,
			timestamp: nowStr,
			isoDate: new Date().toISOString(),
			userName: reviewerName,
			userRole: reviewerRole,
			userEmployeeCode: reviewerCode,
		};

		const nextHist = [histEntry, ...loanHistory];
		setLoanHistory(nextHist);
		setCurrentStatus('Rejected');

		const updatedLoan = {
			...loan,
			status: 'Rejected',
			approval_status: 'REJECTED',
			approvalStatus: 'REJECTED',
			rejection_reason: reason,
			history: nextHist,
		};

		if (onUpdateLoan) onUpdateLoan(updatedLoan);
		setSaveFeedback(`Loan application has been rejected.`);

		const loanIdentifier = loan?.db_id || loan?.id;
		if (loanIdentifier) {
			try {
				await api.rejectJointLoan(loanIdentifier, {
					reason,
					userName: reviewerName,
					userCode: reviewerCode,
				});
			} catch (err) {
				console.warn('Could not save rejection to backend:', err);
			}
		}
		setIsRejectModalOpen(false);
		setIsSubmittingApproval(false);
	};

	// Direct EMI Payout Approval Handler (no confirmation modal)
	const handleDirectApprovePayout = async (inst) => {
		if (isSubmittingPayout || !inst || !inst.sNo) return;
		setIsSubmittingPayout(true);
		setSubmittingPayoutSNo(inst.sNo);
		const rawSNo = inst.sNo;
		const sNo = typeof rawSNo === 'number' ? rawSNo : (parseInt(String(rawSNo).replace(/\D/g, ''), 10) || rawSNo);
		const loanIdentifier = loan?.db_id || loan?.id;

		try {
			const isPrimaryApprover = isSystemAdmin ? true : (targetRole === 'PRIMARY' || (!targetRole && !isSecondaryLoan));
			const approverRole = isSystemAdmin ? 'System Admin' : (isPrimaryApprover ? 'Primary Manager' : 'Secondary Manager');
			const approverName = activeUser?.name || (isSystemAdmin ? 'System Admin' : (isPrimaryApprover ? 'Primary Manager' : 'Secondary Manager'));
			const approverCode = activeUser?.employee_code || '';
			const payload = {
				action: 'APPROVE',
				approver_employee_code: approverCode,
				approver_name: approverName,
				approver_role: isSystemAdmin ? 'ADMIN' : (isPrimaryApprover ? 'PRIMARY' : 'SECONDARY'),
				notes: '',
			};

			const res = await api.approvePayoutDate(loanIdentifier, sNo, payload);

			if (res && res.success) {
				const nowStr = getFormattedNow();

				// Update schedule overrides locally across rawSNo, parent sNo, and sub-parts
				const updatedOverrides = {
					payout_approval_status: 'APPROVED',
					payoutApprovalStatus: 'APPROVED',
					payout_approval_target: null,
					payoutApprovalTarget: null,
					payout_approved_by: approverName,
					payout_approved_at: nowStr,
					payout_notes: '',
				};

				setScheduleOverrides((prev) => {
					const next = { ...prev };
					next[rawSNo] = { ...(next[rawSNo] || {}), ...updatedOverrides };
					next[sNo] = { ...(next[sNo] || {}), ...updatedOverrides };
					if (next[`${sNo}A`]) {
						next[`${sNo}A`] = { ...next[`${sNo}A`], ...updatedOverrides };
					}
					if (next[`${sNo}B`]) {
						next[`${sNo}B`] = { ...next[`${sNo}B`], ...updatedOverrides };
					}
					return next;
				});

				const histEntry = {
					id: `hist_${Date.now()}_payout_approve`,
					type: 'payout_approval',
					title: `EMI #${sNo} Payout Approved & Settled`,
					description: `${approverRole} ${approverName}${approverCode ? ` (${approverCode})` : ''} confirmed and approved payout remittance. EMI #${sNo} is now full settled.`,
					timestamp: nowStr,
					isoDate: new Date().toISOString(),
					userName: approverName,
					userRole: isPrimaryApprover ? 'primary_manager' : 'sec_manager',
					userEmployeeCode: approverCode,
					emiNo: sNo,
					status: 'APPROVED',
					notes: '',
				};

				setLoanHistory((prevHist) => {
					if (Array.isArray(res.loan?.history)) {
						return sortLoanHistoryRecentFirst(res.loan.history);
					}
					const nextHist = [histEntry, ...prevHist];
					if (onUpdateLoan) {
						onUpdateLoan({ ...loan, history: nextHist });
					}
					return nextHist;
				});

				if (onUpdateLoan) {
					onUpdateLoan({
						...loan,
						history: [histEntry, ...(loan.history || [])],
					});
				}
			}
		} catch (err) {
			console.error('Error submitting payout approval:', err);
			setSaveFeedback(`Failed to update payout approval: ${err.message || 'Error occurred'}`);
		} finally {
			setIsSubmittingPayout(false);
			setSubmittingPayoutSNo(null);
		}
	};

	// Secondary Manager EMI Payout Approval Action Handler
	const handleConfirmPayoutAction = async () => {
		if (isSubmittingPayout || !payoutModalData.sNo) return;
		setIsSubmittingPayout(true);
		const rawSNo = payoutModalData.sNo;
		const sNo = typeof rawSNo === 'number' ? rawSNo : (parseInt(String(rawSNo).replace(/\D/g, ''), 10) || rawSNo);
		const action = payoutModalData.action;
		const notes = payoutModalData.notes || '';
		const loanIdentifier = loan?.db_id || loan?.id;

		try {
			const isPrimaryApprover = isSystemAdmin ? true : (targetRole === 'PRIMARY' || (!targetRole && !isSecondaryLoan));
			const approverRole = isSystemAdmin ? 'System Admin' : (isPrimaryApprover ? 'Primary Manager' : 'Secondary Manager');
			const approverName = activeUser?.name || (isSystemAdmin ? 'System Admin' : (isPrimaryApprover ? 'Primary Manager' : 'Secondary Manager'));
			const approverCode = activeUser?.employee_code || '';
			const payload = {
				action,
				approver_employee_code: approverCode,
				approver_name: approverName,
				approver_role: isSystemAdmin ? 'ADMIN' : (isPrimaryApprover ? 'PRIMARY' : 'SECONDARY'),
				notes,
			};

			const res = action === 'APPROVE'
				? await api.approvePayoutDate(loanIdentifier, sNo, payload)
				: await api.rejectPayoutDate(loanIdentifier, sNo, payload);

			if (res && res.success) {
				const nowStr = getFormattedNow();

				// Update schedule overrides locally across rawSNo, parent sNo, and sub-parts
				const updatedOverrides = {
					payout_approval_status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
					payoutApprovalStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
					payout_approval_target: null,
					payoutApprovalTarget: null,
					payout_approved_by: approverName,
					payout_approved_at: nowStr,
					payout_notes: notes,
				};

				setScheduleOverrides((prev) => {
					const next = { ...prev };
					next[rawSNo] = { ...(next[rawSNo] || {}), ...updatedOverrides };
					next[sNo] = { ...(next[sNo] || {}), ...updatedOverrides };
					if (next[`${sNo}A`]) {
						next[`${sNo}A`] = { ...next[`${sNo}A`], ...updatedOverrides };
					}
					if (next[`${sNo}B`]) {
						next[`${sNo}B`] = { ...next[`${sNo}B`], ...updatedOverrides };
					}
					return next;
				});

				const histEntry = {
					id: `hist_${Date.now()}_payout_${action.toLowerCase()}`,
					type: action === 'APPROVE' ? 'payout_approval' : 'payout_rejection',
					title: action === 'APPROVE' ? `EMI #${sNo} Payout Approved & Settled` : `EMI #${sNo} Payout Discrepancy Flagged`,
					description: action === 'APPROVE'
						? `${approverRole} ${approverName}${approverCode ? ` (${approverCode})` : ''} confirmed and approved payout remittance. EMI #${sNo} is now full settled.`
						: `${approverRole} ${approverName}${approverCode ? ` (${approverCode})` : ''} flagged payout discrepancy for EMI #${sNo}.${notes ? ` Reason: ${notes}` : ''}`,
					timestamp: nowStr,
					isoDate: new Date().toISOString(),
					userName: approverName,
					userRole: isPrimaryApprover ? 'primary_manager' : 'sec_manager',
					userEmployeeCode: approverCode,
					emiNo: sNo,
					status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
					notes,
				};

				setLoanHistory((prevHist) => [histEntry, ...prevHist]);

				setSaveFeedback(
					action === 'APPROVE'
						? `EMI #${sNo} payout approved! Installment marked Full Settled.`
						: `EMI #${sNo} payout discrepancy flagged for review.`
				);

				if (res.loan && onUpdateLoan) {
					onUpdateLoan(res.loan);
				} else if (onUpdateLoan) {
					onUpdateLoan({
						...loan,
						history: [histEntry, ...(loan.history || [])],
					});
				}
			}
		} catch (err) {
			console.error('Error submitting payout approval:', err);
			setSaveFeedback(`Failed to update payout approval: ${err.message || 'Error occurred'}`);
		} finally {
			setIsSubmittingPayout(false);
			setPayoutModalData({
				isOpen: false,
				action: 'APPROVE',
				sNo: null,
				row: null,
				notes: '',
			});
		}
	};

	// Add Manual Audit Note Handler
	const handleAddAuditNote = async (text, emiVal) => {
		if (!text || !text.trim()) return;
		const nowStr = getFormattedNow();
		const authorName = activeUser?.name || 'Staff User';
		const authorRole = activeUser?.role || 'user';
		const authorCode = activeUser?.employee_code || '';

		const histEntry = {
			id: `hist_${Date.now()}_note`,
			type: 'audit_note',
			title: emiVal ? `Audit Note on EMI #${emiVal}` : 'Servicing Audit Note',
			description: text.trim(),
			timestamp: nowStr,
			isoDate: new Date().toISOString(),
			userName: authorName,
			userRole: authorRole,
			userEmployeeCode: authorCode,
			emiNo: emiVal || null,
		};

		const nextHist = [histEntry, ...loanHistory];
		setLoanHistory(nextHist);

		const updatedLoan = { ...loan, history: nextHist };
		if (onUpdateLoan) onUpdateLoan(updatedLoan);
		setSaveFeedback('Audit note added to loan history!');

		const loanIdentifier = loan?.id || loan?.loan_ref_id || loan?.db_id;
		if (loanIdentifier) {
			try {
				await api.updateJointLoan(loanIdentifier, {
					history: nextHist,
					db_id: loan?.db_id,
				});
			} catch (err) {
				console.warn('Could not save note to backend via updateJointLoan:', err);
				try {
					await api.addLoanHistory(loanIdentifier, histEntry);
				} catch (addErr) {
					console.warn('Could not save note to backend:', addErr);
				}
			}
		}
	};

	// History Item Selection and Deletion Handlers (Super Admin Only)
	const handleToggleSelectHistoryItem = useCallback((id) => {
		setSelectedHistoryIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const handleSelectAllHistory = useCallback((itemsToSelect) => {
		const targetItems = itemsToSelect || cleanLoanHistory;
		const targetIds = (targetItems || []).map((h) => h?.id).filter(Boolean);
		setSelectedHistoryIds(new Set(targetIds));
	}, [cleanLoanHistory]);

	const handleClearHistorySelection = useCallback(() => {
		setSelectedHistoryIds(new Set());
	}, []);

	const handlePromptDeleteSelectedHistory = useCallback(() => {
		if (selectedHistoryIds.size === 0) return;
		const itemsToDelete = cleanLoanHistory.filter((h) => selectedHistoryIds.has(h.id));
		setHistoryDeleteModal({
			isOpen: true,
			itemIds: Array.from(selectedHistoryIds),
			items: itemsToDelete,
			isDeleting: false,
		});
	}, [selectedHistoryIds, cleanLoanHistory]);

	const handlePromptDeleteSingleHistory = useCallback((item) => {
		if (!item || !item.id) return;
		setHistoryDeleteModal({
			isOpen: true,
			itemIds: [item.id],
			items: [item],
			isDeleting: false,
		});
	}, []);

	const handleConfirmDeleteHistory = useCallback(async () => {
		const idsToDelete = new Set(historyDeleteModal.itemIds);
		if (idsToDelete.size === 0) {
			setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false });
			return;
		}

		setHistoryDeleteModal((prev) => ({ ...prev, isDeleting: true }));

		const nextHistory = loanHistory.filter((h) => !idsToDelete.has(h.id));
		setLoanHistory(nextHistory);

		setSelectedHistoryIds((prev) => {
			const next = new Set(prev);
			idsToDelete.forEach((id) => next.delete(id));
			return next;
		});

		const updatedLoan = { ...loan, history: nextHistory };
		if (onUpdateLoan) onUpdateLoan(updatedLoan);

		const loanIdentifier = loan?.id || loan?.loan_ref_id || loan?.db_id;
		if (loanIdentifier) {
			try {
				await api.updateJointLoan(loanIdentifier, {
					history: nextHistory,
					db_id: loan?.db_id,
				});
			} catch (err) {
				console.warn('Could not update history via updateJointLoan, trying updateLoanHistory:', err);
				try {
					await api.updateLoanHistory(loanIdentifier, nextHistory);
				} catch (updateErr) {
					console.error('Failed to update loan history in backend:', updateErr);
				}
			}
		}

		setSaveFeedback(`${idsToDelete.size} history record${idsToDelete.size > 1 ? 's' : ''} deleted successfully.`);
		setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false });
	}, [historyDeleteModal.itemIds, loanHistory, loan, onUpdateLoan]);

	const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'penal' | 'accounts' | 'contact' | 'history'
	const [scheduleFilter, setScheduleFilter] = useState('ALL');
	const [isDetailedView, setIsDetailedView] = useState(false);

	// Penal Interest State & Handlers
	const loanIdKey = loan?.db_id || loan?.id || loan?.loan_ref_id || 'unknown';
	const [penalInterestList, setPenalInterestList] = useState(() => {
		if (Array.isArray(loan?.penal_interest) && loan.penal_interest.length > 0) {
			return loan.penal_interest;
		}
		if (Array.isArray(loan?.penalInterests) && loan.penalInterests.length > 0) {
			return loan.penalInterests;
		}
		try {
			const stored = localStorage.getItem(`loanDesk_penal_${loanIdKey}`);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) return parsed;
			}
		} catch (e) {
			console.warn('Error reading stored penal interest:', e);
		}
		return [];
	});

	useEffect(() => {
		const key = loan?.db_id || loan?.id || loan?.loan_ref_id || 'unknown';
		if (Array.isArray(loan?.penal_interest)) {
			setPenalInterestList(loan.penal_interest);
		} else if (Array.isArray(loan?.penalInterests)) {
			setPenalInterestList(loan.penalInterests);
		} else {
			try {
				const stored = localStorage.getItem(`loanDesk_penal_${key}`);
				if (stored) {
					const parsed = JSON.parse(stored);
					if (Array.isArray(parsed)) {
						setPenalInterestList(parsed);
						return;
					}
				}
			} catch (e) { }
			setPenalInterestList([]);
		}
	}, [loan]);

	// Modal open state for Penal Interest
	const [isAddPenalModalOpen, setIsAddPenalModalOpen] = useState(false);
	const [penalDeleteTarget, setPenalDeleteTarget] = useState(null);

	// Client contact & address details
	const [clientAddress, setClientAddress] = useState(
		loan?.address || loan?.primaryBorrower?.address || ''
	);
	const [clientContact, setClientContact] = useState(
		loan?.contact || loan?.primaryBorrower?.contact || loan?.phone || ''
	);
	const [isEditingContact, setIsEditingContact] = useState(false);
	const [editAddress, setEditAddress] = useState(clientAddress);
	const [editContact, setEditContact] = useState(clientContact);
	const [copiedField, setCopiedField] = useState(null);

	useEffect(() => {
		if (loan) {
			const addr = loan.address || loan.primaryBorrower?.address || '';
			const cont = loan.contact || loan.primaryBorrower?.contact || loan?.phone || '';
			setClientAddress(addr);
			setClientContact(cont);
			setEditAddress(addr);
			setEditContact(cont);
		}
	}, [loan]);

	const handleSaveContactDetails = async () => {
		const updatedLoan = {
			...loan,
			address: editAddress,
			contact: editContact,
			primaryBorrower: {
				...(loan.primaryBorrower || {}),
				address: editAddress,
				contact: editContact,
			},
		};
		setClientAddress(editAddress);
		setClientContact(editContact);
		onUpdateLoan(updatedLoan);
		const loanIdentifier = loan?.db_id || loan?.id;
		if (api.updateJointLoan && loanIdentifier) {
			try {
				await api.updateJointLoan(loanIdentifier, updatedLoan);
			} catch (err) {
				console.warn('Could not persist contact details to backend:', err);
			}
		}
		setIsEditingContact(false);
		setSaveFeedback('Contact Details Saved');
		setTimeout(() => setSaveFeedback(null), 2500);
	};

	const handleCopy = (text, field) => {
		if (!text) return;
		navigator.clipboard.writeText(text);
		setCopiedField(field);
		setTimeout(() => setCopiedField(null), 2000);
	};

	const baseRepaymentSchedule = useMemo(() => generateRepaymentSchedule(loan, accounts), [loan, accounts]);
	const [scheduleOverrides, setScheduleOverrides] = useState({});
	const [splitInstallments, setSplitInstallments] = useState(() => {
		const init = {};
		if (loan?.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
			loan.repaymentSchedule.forEach((sch) => {
				if (sch.splits) {
					init[sch.sNo] = sch.splits;
				}
			});
		}
		return init;
	});
	const [splitModalTarget, setSplitModalTarget] = useState(null);

	// Prevent background page from scrolling when modal is open (payout approval card, partial payment, edit allocations, contact edit, penal interest, delete history, etc.)
	useEffect(() => {
		const isAnyModalOpen = Boolean(
			payoutModalData.isOpen ||
			splitModalTarget ||
			isEditing ||
			isEditingContact ||
			isRejectModalOpen ||
			isAddNoteModalOpen ||
			isAddPenalModalOpen ||
			penalDeleteTarget ||
			confirmDelete ||
			historyDeleteModal.isOpen
		);

		if (isAnyModalOpen) {
			const originalBodyOverflow = document.body.style.overflow;
			const originalHtmlOverflow = document.documentElement.style.overflow;
			document.body.style.overflow = 'hidden';
			document.documentElement.style.overflow = 'hidden';

			const handleKeyDown = (e) => {
				if (e.key === 'Escape') {
					if (payoutModalData.isOpen && !isSubmittingPayout) {
						setPayoutModalData({ isOpen: false, action: 'APPROVE', sNo: null, row: null, notes: '' });
					}
					if (isAddPenalModalOpen) {
						setIsAddPenalModalOpen(false);
					}
					if (penalDeleteTarget) {
						setPenalDeleteTarget(null);
					}
					if (historyDeleteModal.isOpen && !historyDeleteModal.isDeleting) {
						setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false });
					}
				}
			};
			window.addEventListener('keydown', handleKeyDown);

			return () => {
				document.body.style.overflow = originalBodyOverflow || '';
				document.documentElement.style.overflow = originalHtmlOverflow || '';
				window.removeEventListener('keydown', handleKeyDown);
			};
		} else {
			document.body.style.overflow = '';
			document.documentElement.style.overflow = '';
		}
	}, [
		payoutModalData.isOpen,
		isSubmittingPayout,
		splitModalTarget,
		isEditing,
		isEditingContact,
		isRejectModalOpen,
		isAddNoteModalOpen,
		isAddPenalModalOpen,
		penalDeleteTarget,
		confirmDelete,
		historyDeleteModal.isOpen,
		historyDeleteModal.isDeleting,
	]);

	// Tracks which partial EMI rows are expanded (default: collapsed/hidden)
	const [expandedRows, setExpandedRows] = useState({});

	// Fetch saved splits and schedule overrides from Flask backend
	useEffect(() => {
		let isMounted = true;
		setScheduleOverrides({});
		const loadSplits = async () => {
			const loanIdentifier = loan?.db_id || loan?.id;
			if (!loanIdentifier) return;
			try {
				const data = await api.getLoanSplits(loanIdentifier);
				if (isMounted && data) {
					if (data.splits && Object.keys(data.splits).length > 0) {
						setSplitInstallments((prev) => {
							const next = { ...prev };
							Object.entries(data.splits).forEach(([k, v]) => {
								const existing = prev[k] || {};
								next[k] = { ...existing, ...v };
								const amountKeys = ['amountA', 'paidAmount', 'amountB', 'amountC', 'priAmount', 'priAmountA', 'priAmountB', 'priAmountC', 'secAmount', 'secAmountA', 'secAmountB', 'secAmountC', 'secAmounts', 'secAmountsA', 'secAmountsB', 'secAmountsC', 'secTds', 'secTdsA', 'secTdsB', 'secTdsC', 'secTdsAmounts', 'secTdsAmountsA', 'secTdsAmountsB', 'secTdsAmountsC'];
								amountKeys.forEach((ak) => {
									if (existing[ak] !== undefined && (v[ak] === undefined || v[ak] === null)) {
										next[ak] = existing[ak];
									}
								});
							});
							return next;
						});
					} else {
						setSplitInstallments({});
					}
					if (data.overrides && Object.keys(data.overrides).length > 0) {
						setScheduleOverrides(data.overrides);
					} else {
						setScheduleOverrides({});
					}
				}
			} catch (err) {
				console.warn('Backend splits unavailable, using local default:', err);
			}
		};
		loadSplits();
		return () => {
			isMounted = false;
		};
	}, [loan?.id, loan?.db_id]);

	const toggleRowExpand = (sNo) => {
		setExpandedRows((prev) => {
			const currentlyExpanded = Boolean(prev[sNo] || prev[Number(sNo)]);
			return {
				...prev,
				[sNo]: !currentlyExpanded,
				[Number(sNo)]: !currentlyExpanded,
			};
		});
	};

	// Merge generated schedule with user manual date overrides & partial payment splits (Option B)
	const repaymentSchedule = useMemo(() => {
		const result = [];
		for (const inst of baseRepaymentSchedule) {
			const sNoStr = String(inst.sNo);
			const sNoNum = Number(inst.sNo);
			const override = scheduleOverrides[inst.sNo] || scheduleOverrides[sNoNum] || scheduleOverrides[sNoStr];
			const isExplicitlyClearedSplit = override && override.splits === null;
			const splitInfo = isExplicitlyClearedSplit
				? null
				: (splitInstallments[inst.sNo] || splitInstallments[sNoNum] || splitInstallments[sNoStr]);
			if (splitInfo) {
				const fullAmount = Number(inst.amount) || 0;
				let resolvedPaidA = splitInfo.amountA ?? splitInfo.paidAmount ?? splitInfo.paid_amount ?? splitInfo.amount_a ?? splitInfo.thisPaidAmount ?? splitInfo.firstPaidAmount;
				if ((resolvedPaidA === undefined || resolvedPaidA === null || Number(resolvedPaidA) === 0) && loan?.repaymentSchedule) {
					const schItem = loan.repaymentSchedule.find((s) => s.sNo === inst.sNo || s.sNo === Number(inst.sNo));
					if (schItem?.splits) {
						resolvedPaidA = schItem.splits.amountA ?? schItem.splits.paidAmount ?? schItem.splits.paid_amount;
					}
				}

				// Fallback: If splitInfo has raw account breakdown { "FINOVA CAPITAL": [...], "SURGE CAPITAL SOLUTIONS": [...] }
				if (resolvedPaidA === undefined || resolvedPaidA === null || Number(resolvedPaidA) === 0) {
					const priAccName = (inst.primaryAccountName || loan?.primaryAccountName || loan?.primary_account_name || '').trim();
					let priSlices = priAccName && Array.isArray(splitInfo[priAccName]) ? splitInfo[priAccName] : null;
					if (!priSlices) {
						priSlices = Object.values(splitInfo).find((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && 'amount' in v[0]);
					}
					if (Array.isArray(priSlices) && priSlices.length > 0) {
						const pri0 = Number(priSlices[0]?.amount) || 0;
						let sec0 = 0;
						const secAmts0 = [];
						Object.entries(splitInfo).forEach(([accKey, accSlices]) => {
							if (accKey !== priAccName && Array.isArray(accSlices) && accSlices.length > 0 && typeof accSlices[0] === 'object' && 'amount' in accSlices[0]) {
								const s0 = Number(accSlices[0]?.amount) || 0;
								sec0 += s0;
								secAmts0.push(s0);
							}
						});
						if (pri0 > 0 || sec0 > 0) {
							resolvedPaidA = pri0 + sec0;
							if (splitInfo.priAmountA === undefined) splitInfo.priAmountA = pri0;
							if (splitInfo.secAmountA === undefined) splitInfo.secAmountA = sec0;
							if (splitInfo.secAmountsA === undefined) splitInfo.secAmountsA = secAmts0;
							if (splitInfo.amountA === undefined) splitInfo.amountA = pri0 + sec0;
							if (splitInfo.paidAmount === undefined) splitInfo.paidAmount = pri0 + sec0;
							if (splitInfo.amountB === undefined) splitInfo.amountB = Math.max(0, fullAmount - (pri0 + sec0));
						}
					}
				}

				const paidAmountA = resolvedPaidA !== undefined && resolvedPaidA !== null && !isNaN(Number(resolvedPaidA)) && Number(resolvedPaidA) > 0
					? Math.min(fullAmount, Math.max(0, Number(resolvedPaidA)))
					: (splitInfo.amountA !== undefined
						? Number(splitInfo.amountA)
						: Math.min(fullAmount, Math.max(0, Number(splitInfo.paidAmount) || 0)));

				const rawBalB = splitInfo.amountB ?? splitInfo.balAmount ?? splitInfo.balanceAmount ?? splitInfo.amount_b;
				const balAmountB = rawBalB !== undefined && rawBalB !== null && !isNaN(Number(rawBalB))
					? Number(rawBalB)
					: Math.max(0, fullAmount - paidAmountA);

				// Pro-rata ratio for splitting interest & account shares
				const ratioA = fullAmount > 0 ? paidAmountA / fullAmount : 0.5;

				// Interest split
				const fullInterest = Number(inst.interest) || 0;
				const interestA = Math.round(fullInterest * ratioA);
				const interestB = fullInterest - interestA;

				// Primary share split
				const fullPriAmount = Number(inst.primaryAmount) || 0;
				const rawPriA = splitInfo.priAmountA ?? splitInfo.priAmount ?? splitInfo.pri_amount_a ?? splitInfo.pri_amount ?? splitInfo.firstPriAmount;
				const customPriAmountA = rawPriA !== undefined && rawPriA !== null && !isNaN(Number(rawPriA))
					? Number(rawPriA)
					: (splitInfo.priAmount !== undefined && !splitInfo.isFinalSettled
						? Number(splitInfo.priAmount)
						: (splitInfo.priAmountA !== undefined ? Number(splitInfo.priAmountA) : null));
				const priAmountA = customPriAmountA !== null ? customPriAmountA : Math.round(fullPriAmount * ratioA);
				const priAmountB = splitInfo.priAmountB !== undefined
					? Number(splitInfo.priAmountB)
					: Math.max(0, fullPriAmount - priAmountA);

				const fullPriInterest = Number(inst.primaryInterest) || 0;
				const priInterestA = Math.round(fullPriInterest * ratioA);
				const priInterestB = fullPriInterest - priInterestA;

				// Secondary accounts split
				const rawSecA = splitInfo.secAmountA ?? splitInfo.secAmount ?? splitInfo.sec_amount_a ?? splitInfo.sec_amount ?? splitInfo.firstSecAmount;
				const customSecAmountA = rawSecA !== undefined && rawSecA !== null && !isNaN(Number(rawSecA))
					? Number(rawSecA)
					: (splitInfo.secAmount !== undefined && !splitInfo.isFinalSettled
						? Number(splitInfo.secAmount)
						: (splitInfo.secAmountA !== undefined ? Number(splitInfo.secAmountA) : null));
				const rawSecAmtsA = splitInfo.secAmountsA ?? splitInfo.secAmounts ?? splitInfo.sec_amounts ?? splitInfo.firstSecAmounts;
				const customSecAmountsA = Array.isArray(rawSecAmtsA)
					? rawSecAmtsA
					: (Array.isArray(splitInfo.secAmountsA) ? splitInfo.secAmountsA : (Array.isArray(splitInfo.secAmounts) && !splitInfo.isFinalSettled ? splitInfo.secAmounts : null));
				const customSecAmountsB = Array.isArray(splitInfo.secAmountsB) ? splitInfo.secAmountsB : null;

				// Secondary accounts TDS split
				const rawSecTdsA = splitInfo.secTdsAmountsA ?? splitInfo.secTdsAmounts ?? splitInfo.sec_tds_amounts ?? splitInfo.firstSecTdsAmounts;
				const customSecTdsA = Array.isArray(rawSecTdsA)
					? rawSecTdsA
					: (Array.isArray(splitInfo.secTdsAmountsA) ? splitInfo.secTdsAmountsA : (Array.isArray(splitInfo.secTdsAmounts) && !splitInfo.isFinalSettled ? splitInfo.secTdsAmounts : null));
				const customSecTdsB = Array.isArray(splitInfo.secTdsAmountsB) ? splitInfo.secTdsAmountsB : null;
				const rawSecTdsSingleA = splitInfo.secTdsA ?? splitInfo.secTds ?? splitInfo.sec_tds_a ?? splitInfo.sec_tds ?? splitInfo.firstSecTds;
				const customSecTdsSingleA = rawSecTdsSingleA !== undefined && rawSecTdsSingleA !== null && !isNaN(Number(rawSecTdsSingleA)) ? Number(rawSecTdsSingleA) : null;

				const fullSecTotal = (inst.secAccounts || []).reduce((sum, sa) => sum + (Number(sa.amount) || 0), 0);
				const secAccountsA = (inst.secAccounts || []).map((sa, idx) => {
					const saAmt = Number(sa.amount) || 0;
					const saInt = Number(sa.interest) || 0;
					const saTds = Number(sa.tds) || 0;
					let targetAmt = Math.round(saAmt * ratioA);
					if (customSecAmountsA && customSecAmountsA[idx] !== undefined) {
						targetAmt = Number(customSecAmountsA[idx]);
					} else if (customSecAmountA !== null) {
						if ((inst.secAccounts || []).length <= 1) {
							targetAmt = customSecAmountA;
						} else if (fullSecTotal > 0) {
							targetAmt = Math.round((customSecAmountA * saAmt) / fullSecTotal);
						}
					}
					let targetTds = Math.round(saTds * ratioA);
					if (customSecTdsA && customSecTdsA[idx] !== undefined && customSecTdsA[idx] !== null && !isNaN(Number(customSecTdsA[idx]))) {
						targetTds = Number(customSecTdsA[idx]);
					} else if (customSecTdsSingleA !== null && (inst.secAccounts || []).length <= 1) {
						targetTds = customSecTdsSingleA;
					}
					return {
						...sa,
						amount: targetAmt,
						grossAmount: targetAmt + targetTds,
						interest: Math.round(saInt * ratioA),
						tds: targetTds,
					};
				});

				const secAccountsB = (inst.secAccounts || []).map((sa, idx) => {
					const saAmt = Number(sa.amount) || 0;
					const saInt = Number(sa.interest) || 0;
					const saTds = Number(sa.tds) || 0;
					const saAmtA = secAccountsA[idx]?.amount || 0;
					const saIntA = secAccountsA[idx]?.interest || 0;
					const saTdsA = secAccountsA[idx]?.tds || 0;
					let targetAmtB = Math.max(0, saAmt - saAmtA);
					if (customSecAmountsB && customSecAmountsB[idx] !== undefined) {
						targetAmtB = Number(customSecAmountsB[idx]);
					}
					let targetTdsB = Math.max(0, saTds - saTdsA);
					if (customSecTdsB && customSecTdsB[idx] !== undefined && customSecTdsB[idx] !== null && !isNaN(Number(customSecTdsB[idx]))) {
						targetTdsB = Number(customSecTdsB[idx]);
					}
					return {
						...sa,
						amount: targetAmtB,
						grossAmount: targetAmtB + targetTdsB,
						interest: saInt - saIntA,
						tds: targetTdsB,
					};
				});

				const sNoA = `${inst.sNo}A`;
				const sNoB = `${inst.sNo}B`;

				const overrideA = scheduleOverrides[sNoA] || {};
				const overrideB = scheduleOverrides[sNoB] || {};
				const overrideMain = scheduleOverrides[inst.sNo] || {};

				const recdDateA = overrideA.receivedDate !== undefined
					? overrideA.receivedDate
					: (overrideMain.receivedDate !== undefined ? overrideMain.receivedDate : (splitInfo.recdDateA || splitInfo.recdDate || ''));
				const dueDateA = overrideA.dueDate !== undefined
					? overrideA.dueDate
					: (overrideMain.dueDate !== undefined ? overrideMain.dueDate : (splitInfo.dueDateA || splitInfo.dueDate || splitInfo.payoutDate || '-'));
				const remarksA = overrideA.remarks !== undefined
					? overrideA.remarks
					: (overrideMain.remarks !== undefined ? overrideMain.remarks : (splitInfo.remarksA || splitInfo.remarks || ''));

				const recdDateB = overrideB.receivedDate !== undefined ? overrideB.receivedDate : (splitInfo.recdDateB || '');
				const dueDateB = overrideB.dueDate !== undefined ? overrideB.dueDate : (splitInfo.dueDateB || '-');
				const remarksB = overrideB.remarks !== undefined ? overrideB.remarks : (splitInfo.remarksB || '');

				const isPartBPaid = Boolean(
					recdDateB &&
					String(recdDateB).trim().length === 10 &&
					String(recdDateB).trim() !== '-' &&
					String(recdDateB).trim() !== '—' &&
					parseDDMMYYYY(String(recdDateB).trim()) !== null
				);

				// Part A: Paid partial amount
				const partA = {
					...inst,
					...overrideA,
					sNo: sNoA,
					displaySNo: `#${String(inst.sNo).padStart(2, '0')}A`,
					parentSNo: inst.sNo,
					isSubRow: true,
					subType: 'paid',
					subLabel: 'Payment #1',
					amount: paidAmountA,
					interest: interestA,
					primaryAmount: priAmountA,
					primaryInterest: priInterestA,
					secAccounts: secAccountsA,
					secAmount: secAccountsA.reduce((sum, sa) => sum + (sa.amount || 0), 0),
					secInterest: secAccountsA.reduce((sum, sa) => sum + (sa.interest || 0), 0),
					tds: secAccountsA.reduce((sum, sa) => sum + (sa.tds || 0), 0),
					chqNo: splitInfo.chqNoA || `${inst.chqNo}-A`,
					receivedDate: recdDateA,
					dueDate: dueDateA,
					remarks: remarksA,
					payout_approval_status: overrideA.payout_approval_status || splitInfo.payoutApprovalStatusA || splitInfo.payout_approval_status || inst.payout_approval_status || 'APPROVED',
					payoutApprovalStatus: overrideA.payoutApprovalStatus || splitInfo.payoutApprovalStatusA || splitInfo.payoutApprovalStatus || inst.payoutApprovalStatus || 'APPROVED',
					payout_approval_target: overrideA.payout_approval_target || splitInfo.payoutApprovalTargetA || splitInfo.payout_approval_target || inst.payout_approval_target,
					payoutApprovalTarget: overrideA.payoutApprovalTarget || splitInfo.payoutApprovalTargetA || splitInfo.payoutApprovalTarget || inst.payoutApprovalTarget,
					payout_approved_by: overrideA.payout_approved_by || splitInfo.payout_approved_by || inst.payout_approved_by,
					payout_approved_at: overrideA.payout_approved_at || splitInfo.payout_approved_at || inst.payout_approved_at,
				};

				// Part B: Balance remaining OR Final Payment #2
				const partB = {
					...inst,
					...overrideB,
					sNo: sNoB,
					displaySNo: `#${String(inst.sNo).padStart(2, '0')}B`,
					parentSNo: inst.sNo,
					isSubRow: true,
					subType: isPartBPaid ? 'paid' : 'balance',
					subLabel: isPartBPaid ? 'Payment #2' : 'Balance',
					amount: balAmountB,
					interest: interestB,
					primaryAmount: priAmountB,
					primaryInterest: priInterestB,
					secAccounts: secAccountsB,
					secAmount: secAccountsB.reduce((sum, sa) => sum + (sa.amount || 0), 0),
					secInterest: secAccountsB.reduce((sum, sa) => sum + (sa.interest || 0), 0),
					tds: secAccountsB.reduce((sum, sa) => sum + (sa.tds || 0), 0),
					chqNo: splitInfo.chqNoB || `${inst.chqNo}-B`,
					receivedDate: recdDateB,
					dueDate: dueDateB,
					remarks: remarksB,
					payout_approval_status: isPartBPaid ? (overrideB.payout_approval_status || splitInfo.payoutApprovalStatusB || (splitInfo.isFinalSettled ? 'APPROVED' : null)) : null,
					payoutApprovalStatus: isPartBPaid ? (overrideB.payoutApprovalStatus || splitInfo.payoutApprovalStatusB || (splitInfo.isFinalSettled ? 'APPROVED' : null)) : null,
					payout_approval_target: isPartBPaid ? (overrideB.payout_approval_target || splitInfo.payoutApprovalTargetB || splitInfo.payout_approval_target || inst.payout_approval_target) : null,
					payoutApprovalTarget: isPartBPaid ? (overrideB.payoutApprovalTarget || splitInfo.payoutApprovalTargetB || splitInfo.payoutApprovalTarget || inst.payoutApprovalTarget) : null,
					payout_approved_by: isPartBPaid ? (overrideB.payout_approved_by || splitInfo.payout_approved_by || inst.payout_approved_by) : null,
					payout_approved_at: isPartBPaid ? (overrideB.payout_approved_at || splitInfo.payout_approved_at || inst.payout_approved_at) : null,
				};

				const computeStatus = (row) => {
					const currentRecd = row.receivedDate ? String(row.receivedDate).trim() : '';
					const currentDue = row.dueDate ? String(row.dueDate).trim() : '';

					const isValidRec = Boolean(
						currentRecd &&
						currentRecd.length === 10 &&
						currentRecd !== '-' &&
						currentRecd !== '—' &&
						parseDDMMYYYY(currentRecd) !== null &&
						!isDateBefore(currentRecd, row.date)
					);

					const isValidDue = Boolean(
						currentDue &&
						currentDue.length === 10 &&
						currentDue !== '-' &&
						currentDue !== '—' &&
						parseDDMMYYYY(currentDue) !== null &&
						isValidRec &&
						!isDateBefore(currentDue, currentRecd)
					);

					const payoutStatus = row.payout_approval_status || row.payoutApprovalStatus || 'APPROVED';

					if (isValidDue) {
						if (payoutStatus === 'PENDING') {
							row.status = 'Pending Payout Approval';
							row.badgeClass = 'bg-amber-50 text-amber-800 ring-amber-300';
							row.dotClass = 'bg-amber-500 animate-pulse';
						} else if (payoutStatus === 'REJECTED') {
							row.status = 'Payout Discrepancy';
							row.badgeClass = 'bg-rose-50 text-rose-700 ring-rose-300';
							row.dotClass = 'bg-rose-500';
						} else {
							row.status = 'Settled';
							row.badgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
							row.dotClass = 'bg-emerald-500';
						}
					} else if (isValidRec) {
						row.status = 'Collected';
						row.badgeClass = 'bg-blue-50 text-blue-700 ring-blue-200';
						row.dotClass = 'bg-blue-500';
					} else {
						const isOverdue = isDueDateCrossed(row.date);
						row.status = isOverdue ? 'Overdue' : 'Active';
						row.badgeClass = isOverdue
							? 'bg-rose-50 text-rose-700 ring-rose-200'
							: 'bg-emerald-50 text-emerald-700 ring-emerald-200';
						row.dotClass = isOverdue ? 'bg-rose-500' : 'bg-emerald-500';
					}
				};

				computeStatus(partA);
				computeStatus(partB);

				// Part C: Remaining Balance OR Payment #3 when Part B was paid as partial payment
				const remainingBalAfterB = Math.max(0, fullAmount - (paidAmountA + (isPartBPaid ? balAmountB : 0)));

				const sNoC = `${inst.sNo}C`;
				const overrideC = scheduleOverrides[sNoC] || {};
				const recdDateC = overrideC.receivedDate !== undefined ? overrideC.receivedDate : (splitInfo.recdDateC || '');
				const dueDateC = overrideC.dueDate !== undefined ? overrideC.dueDate : (splitInfo.dueDateC || '-');
				const remarksC = overrideC.remarks !== undefined ? overrideC.remarks : (splitInfo.remarksC || '');
				const isPartCPaid = Boolean(recdDateC && recdDateC.length === 10 && recdDateC !== '-' && recdDateC !== '—');

				const rawBalC = splitInfo.amountC ?? splitInfo.balAmountC;
				const balAmountC = rawBalC !== undefined && rawBalC !== null && !isNaN(Number(rawBalC))
					? Number(rawBalC)
					: remainingBalAfterB;

				const interestC = Math.max(0, fullInterest - (interestA + interestB));
				const priAmountC = splitInfo.priAmountC !== undefined
					? Number(splitInfo.priAmountC)
					: Math.max(0, fullPriAmount - (priAmountA + (isPartBPaid ? priAmountB : 0)));
				const priInterestC = Math.max(0, fullPriInterest - (priInterestA + (isPartBPaid ? priInterestB : 0)));

				const customSecAmountsC = Array.isArray(splitInfo.secAmountsC) ? splitInfo.secAmountsC : null;
				const customSecTdsC = Array.isArray(splitInfo.secTdsAmountsC) ? splitInfo.secTdsAmountsC : null;
				const secAccountsC = (inst.secAccounts || []).map((sa, idx) => {
					const saAmt = Number(sa.amount) || 0;
					const saInt = Number(sa.interest) || 0;
					const saTds = Number(sa.tds) || 0;
					const saAmtA = secAccountsA[idx]?.amount || 0;
					const saIntA = secAccountsA[idx]?.interest || 0;
					const saTdsA = secAccountsA[idx]?.tds || 0;
					const saAmtB = isPartBPaid ? (secAccountsB[idx]?.amount || 0) : 0;
					const saIntB = isPartBPaid ? (secAccountsB[idx]?.interest || 0) : 0;
					const saTdsB = isPartBPaid ? (secAccountsB[idx]?.tds || 0) : 0;
					let targetAmtC = Math.max(0, saAmt - (saAmtA + saAmtB));
					if (customSecAmountsC && customSecAmountsC[idx] !== undefined) {
						targetAmtC = Number(customSecAmountsC[idx]);
					}
					let targetTdsC = Math.max(0, saTds - (saTdsA + saTdsB));
					if (customSecTdsC && customSecTdsC[idx] !== undefined && customSecTdsC[idx] !== null && !isNaN(Number(customSecTdsC[idx]))) {
						targetTdsC = Number(customSecTdsC[idx]);
					}
					return {
						...sa,
						amount: targetAmtC,
						grossAmount: targetAmtC + targetTdsC,
						interest: Math.max(0, saInt - (saIntA + saIntB)),
						tds: targetTdsC,
					};
				});

				let partC = null;
				if (isPartBPaid && (remainingBalAfterB > 0 || isPartCPaid || splitInfo.amountC !== undefined)) {
					partC = {
						...inst,
						...overrideC,
						sNo: sNoC,
						displaySNo: `#${String(inst.sNo).padStart(2, '0')}C`,
						parentSNo: inst.sNo,
						isSubRow: true,
						subType: isPartCPaid ? 'paid' : 'balance',
						subLabel: isPartCPaid ? 'Payment #3' : 'Balance',
						amount: balAmountC,
						interest: interestC,
						primaryAmount: priAmountC,
						primaryInterest: priInterestC,
						secAccounts: secAccountsC,
						secAmount: secAccountsC.reduce((sum, sa) => sum + (sa.amount || 0), 0),
						secInterest: secAccountsC.reduce((sum, sa) => sum + (sa.interest || 0), 0),
						tds: secAccountsC.reduce((sum, sa) => sum + (sa.tds || 0), 0),
						chqNo: splitInfo.chqNoC || `${inst.chqNo}-C`,
						receivedDate: recdDateC,
						dueDate: dueDateC,
						remarks: remarksC,
						payout_approval_status: isPartCPaid ? (overrideC.payout_approval_status || splitInfo.payoutApprovalStatusC || 'APPROVED') : null,
						payoutApprovalStatus: isPartCPaid ? (overrideC.payoutApprovalStatus || splitInfo.payoutApprovalStatusC || 'APPROVED') : null,
						payout_approval_target: isPartCPaid ? (overrideC.payout_approval_target || splitInfo.payoutApprovalTargetC || inst.payout_approval_target) : null,
						payoutApprovalTarget: isPartCPaid ? (overrideC.payoutApprovalTarget || splitInfo.payoutApprovalTargetC || inst.payoutApprovalTarget) : null,
						payout_approved_by: isPartCPaid ? (overrideC.payout_approved_by || splitInfo.payout_approved_by || inst.payout_approved_by) : null,
						payout_approved_at: isPartCPaid ? (overrideC.payout_approved_at || splitInfo.payout_approved_at || inst.payout_approved_at) : null,
					};
					computeStatus(partC);
				}

				// Part D: Remaining Balance when Part C was also paid
				const remainingBalAfterC = Math.max(0, fullAmount - (paidAmountA + balAmountB + (isPartCPaid ? balAmountC : 0)));

				let partD = null;
				if (partC && isPartCPaid && remainingBalAfterC > 0) {
					const sNoD = `${inst.sNo}D`;
					const overrideD = scheduleOverrides[sNoD] || {};
					const recdDateD = overrideD.receivedDate !== undefined ? overrideD.receivedDate : (splitInfo.recdDateD || '');
					const dueDateD = overrideD.dueDate !== undefined ? overrideD.dueDate : (splitInfo.dueDateD || '-');
					const remarksD = overrideD.remarks !== undefined ? overrideD.remarks : (splitInfo.remarksD || '');
					const isPartDPaid = Boolean(recdDateD && recdDateD.length === 10 && recdDateD !== '-' && recdDateD !== '—');

					const interestD = Math.max(0, fullInterest - (interestA + interestB + interestC));
					const priAmountD = Math.max(0, fullPriAmount - (priAmountA + priAmountB + priAmountC));
					const priInterestD = Math.max(0, fullPriInterest - (priInterestA + priInterestB + priInterestC));

					const secAccountsD = (inst.secAccounts || []).map((sa, idx) => {
						const saAmt = Number(sa.amount) || 0;
						const saInt = Number(sa.interest) || 0;
						const saTds = Number(sa.tds) || 0;
						const saAmtA = secAccountsA[idx]?.amount || 0;
						const saIntA = secAccountsA[idx]?.interest || 0;
						const saTdsA = secAccountsA[idx]?.tds || 0;
						const saAmtB = secAccountsB[idx]?.amount || 0;
						const saIntB = secAccountsB[idx]?.interest || 0;
						const saTdsB = secAccountsB[idx]?.tds || 0;
						const saAmtC = secAccountsC[idx]?.amount || 0;
						const saIntC = secAccountsC[idx]?.interest || 0;
						const saTdsC = secAccountsC[idx]?.tds || 0;
						const targetTdsD = Math.max(0, saTds - (saTdsA + saTdsB + saTdsC));
						const targetAmtD = Math.max(0, saAmt - (saAmtA + saAmtB + saAmtC));
						return {
							...sa,
							amount: targetAmtD,
							grossAmount: targetAmtD + targetTdsD,
							interest: Math.max(0, saInt - (saIntA + saIntB + saIntC)),
							tds: targetTdsD,
						};
					});

					partD = {
						...inst,
						...overrideD,
						sNo: sNoD,
						displaySNo: `#${String(inst.sNo).padStart(2, '0')}D`,
						parentSNo: inst.sNo,
						isSubRow: true,
						subType: isPartDPaid ? 'paid' : 'balance',
						subLabel: isPartDPaid ? 'Payment #4' : 'Balance',
						amount: remainingBalAfterC,
						interest: interestD,
						primaryAmount: priAmountD,
						primaryInterest: priInterestD,
						secAccounts: secAccountsD,
						secAmount: secAccountsD.reduce((sum, sa) => sum + (sa.amount || 0), 0),
						secInterest: secAccountsD.reduce((sum, sa) => sum + (sa.interest || 0), 0),
						tds: secAccountsD.reduce((sum, sa) => sum + (sa.tds || 0), 0),
						chqNo: splitInfo.chqNoD || `${inst.chqNo}-D`,
						receivedDate: recdDateD,
						dueDate: dueDateD,
						remarks: remarksD,
						payout_approval_status: isPartDPaid ? (overrideD.payout_approval_status || 'APPROVED') : null,
						payoutApprovalStatus: isPartDPaid ? (overrideD.payoutApprovalStatus || 'APPROVED') : null,
					};
					computeStatus(partD);
				}

				const hasPartB = (balAmountB > 0) || isPartBPaid;
				const subInstallments = [
					partA,
					...(hasPartB ? [partB] : []),
					...(partC && ((partC.amount > 0) || isPartCPaid) ? [partC] : []),
					...(partD && ((partD.amount > 0) || isPartDPaid) ? [partD] : []),
				];

				const totalPaidOnRow = paidAmountA + (isPartBPaid ? balAmountB : 0) + (partC && isPartCPaid ? (partC.amount || 0) : 0) + (partD && partD.subType === 'paid' ? (partD.amount || 0) : 0);
				const remainingBal = Math.max(0, fullAmount - totalPaidOnRow);
				const isRowFullyPaid = remainingBal === 0;

				const isAllSettled = isRowFullyPaid && subInstallments.every((sub) => sub.status === 'Settled');
				const hasPendingApproval = subInstallments.some((sub) => sub.status === 'Pending Payout Approval');
				const isAllCollected = isRowFullyPaid && (isAllSettled || hasPendingApproval || subInstallments.every((sub) => (
					sub.status === 'Collected' || sub.status === 'Settled' || sub.status === 'Pending Payout Approval'
				)));

				let mainStatus = 'Partial';
				let mainBadgeClass = 'bg-amber-50 text-amber-800 ring-amber-200';
				let mainDotClass = 'bg-amber-500';

				if (isAllSettled) {
					mainStatus = 'Settled';
					mainBadgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
					mainDotClass = 'bg-emerald-500';
				} else if (hasPendingApproval) {
					mainStatus = 'Pending Payout Approval';
					mainBadgeClass = 'bg-amber-50 text-amber-800 ring-amber-300';
					mainDotClass = 'bg-amber-500 animate-pulse';
				} else if (isAllCollected) {
					mainStatus = 'Collected';
					mainBadgeClass = 'bg-blue-50 text-blue-700 ring-blue-200';
					mainDotClass = 'bg-blue-500';
				} else if (isDueDateCrossed(inst.date)) {
					mainStatus = 'Overdue';
					mainBadgeClass = 'bg-rose-50 text-rose-700 ring-rose-200';
					mainDotClass = 'bg-rose-500';
				}

				// Main EMI row maintains ORIGINAL amount, interest, and account shares
				const mainRow = {
					...inst,
					...overrideMain,
					displaySNo: `#${String(inst.sNo).padStart(2, '0')}`,
					isPartial: true,
					partialPaidAmount: totalPaidOnRow,
					partialBalAmount: remainingBal,
					status: mainStatus,
					badgeClass: mainBadgeClass,
					dotClass: mainDotClass,
					payout_approval_status: isRowFullyPaid && !hasPendingApproval ? (overrideMain.payout_approval_status || inst.payout_approval_status || 'APPROVED') : (hasPendingApproval ? 'PENDING' : null),
					payoutApprovalStatus: isRowFullyPaid && !hasPendingApproval ? (overrideMain.payout_approval_status || inst.payout_approval_status || 'APPROVED') : (hasPendingApproval ? 'PENDING' : null),
					payout_approval_target: overrideMain.payout_approval_target || inst.payout_approval_target || (overrideMain.payout_requested_role === 'SECONDARY' || inst.payout_requested_role === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY'),
					payoutApprovalTarget: overrideMain.payout_approval_target || inst.payout_approval_target || (overrideMain.payout_requested_role === 'SECONDARY' || inst.payout_requested_role === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY'),
					payout_requested_role: overrideMain.payout_requested_role || inst.payout_requested_role || 'PRIMARY',
					// Parent row always displays 1st partial payment's received date and payout date
					receivedDate: recdDateA || partA.receivedDate || splitInfo.recdDateA || splitInfo.recdDate || '',
					dueDate: (dueDateA && dueDateA !== '-' && dueDateA !== '—')
						? dueDateA
						: ((partA.dueDate && partA.dueDate !== '-' && partA.dueDate !== '—')
							? partA.dueDate
							: ((splitInfo.dueDateA && splitInfo.dueDateA !== '-' && splitInfo.dueDateA !== '—')
								? splitInfo.dueDateA
								: (splitInfo.dueDate || splitInfo.payoutDate || '-'))),
					remarks: overrideMain.remarks !== undefined ? overrideMain.remarks : ((partD && partD.remarks) || (partC && partC.remarks) || remarksB || remarksA || inst.remarks || ''),
					subInstallments,
				};

				result.push(mainRow);
			} else {
				const override = scheduleOverrides[inst.sNo] || scheduleOverrides[Number(inst.sNo)] || scheduleOverrides[String(inst.sNo)];
				const merged = override ? { ...inst, ...override } : { ...inst };
				merged.displaySNo = `#${String(inst.sNo).padStart(2, '0')}`;
				merged.isPartial = false;

				const currentRecd = merged.receivedDate ? String(merged.receivedDate).trim() : '';
				const currentDue = merged.dueDate ? String(merged.dueDate).trim() : '';

				const isValidRec = Boolean(
					currentRecd &&
					currentRecd.length === 10 &&
					currentRecd !== '-' &&
					currentRecd !== '-' &&
					parseDDMMYYYY(currentRecd) !== null &&
					!isDateBefore(currentRecd, inst.date)
				);

				const isValidDue = Boolean(
					currentDue &&
					currentDue.length === 10 &&
					currentDue !== '-' &&
					currentDue !== '-' &&
					parseDDMMYYYY(currentDue) !== null &&
					isValidRec &&
					!isDateBefore(currentDue, currentRecd)
				);

				const payoutStatus = merged.payout_approval_status || merged.payoutApprovalStatus || 'APPROVED';

				if (isValidDue) {
					if (payoutStatus === 'PENDING') {
						merged.status = 'Pending Payout Approval';
						merged.badgeClass = 'bg-amber-50 text-amber-800 ring-amber-300';
						merged.dotClass = 'bg-amber-500 animate-pulse';
					} else if (payoutStatus === 'REJECTED') {
						merged.status = 'Payout Discrepancy';
						merged.badgeClass = 'bg-rose-50 text-rose-700 ring-rose-300';
						merged.dotClass = 'bg-rose-500';
					} else {
						merged.status = 'Settled';
						merged.badgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
						merged.dotClass = 'bg-emerald-500';
					}
				} else if (isValidRec) {
					merged.status = 'Collected';
					merged.badgeClass = 'bg-blue-50 text-blue-700 ring-blue-200';
					merged.dotClass = 'bg-blue-500';
				} else {
					const isOverdue = isDueDateCrossed(inst.date);
					merged.status = isOverdue ? 'Overdue' : 'Active';
					merged.badgeClass = isOverdue
						? 'bg-rose-50 text-rose-700 ring-rose-200'
						: 'bg-emerald-50 text-emerald-700 ring-emerald-200';
					merged.dotClass = isOverdue ? 'bg-rose-500' : 'bg-emerald-500';
				}
				result.push(merged);
			}
		}
		return result;
	}, [baseRepaymentSchedule, scheduleOverrides, splitInstallments]);

	// Flat list of all items (main installments + sub-installments) for handlers
	const allScheduleItems = useMemo(() => {
		return repaymentSchedule.flatMap((inst) => [inst, ...(inst.subInstallments || [])]);
	}, [repaymentSchedule]);

	// Keep currentStatus in sync with repaymentSchedule (if loan has balance and crossed EMI dates, status is Overdue; if all emi completed and balance 0, status is Closed)
	useEffect(() => {
		if (loan) {
			const compStatus = getComputedLoanStatus(loan, repaymentSchedule);
			if (compStatus && compStatus !== currentStatus) {
				setCurrentStatus(compStatus);
				if (compStatus !== loan.status && onUpdateLoan) {
					const badgeInfo = getStatusBadge(compStatus);
					const updated = {
						...loan,
						status: compStatus,
						statusColor: badgeInfo.color,
						statusDot: badgeInfo.dot,
					};
					onUpdateLoan(updated);
					const loanIdentifier = loan?.db_id || loan?.id;
					if (api.updateJointLoan && loanIdentifier) {
						api.updateJointLoan(loanIdentifier, { status: compStatus, db_id: loan?.db_id }).catch((err) => {
							console.warn('Could not persist status update to backend:', err);
						});
					}
				}
			}
		}
	}, [loan, repaymentSchedule, currentStatus, onUpdateLoan]);

	const handleConfirmSplit = ({
		sNo,
		isSecondPayment,
		paidAmount,
		thisPaidAmount,
		thisPriAmount,
		thisSecAmounts,
		thisSecAmount,
		thisSecTdsAmounts,
		thisSecTds,
		firstPaidAmount,
		firstPriAmount,
		firstSecAmounts,
		firstSecTdsAmounts,
		firstRecdDate,
		firstPayoutDate,
		firstRemarks,
		recdDate,
		payoutDate,
		remarks,
		priAmount,
		secAmount,
		secAmounts,
		secTds,
		secTdsAmounts,
		chqNoA,
		chqNoB,
	}) => {
		const targetInst = allScheduleItems.find((i) => i.sNo === sNo || i.sNo === Number(sNo));
		const fullAmt = targetInst ? Number(targetInst.amount) || 0 : 0;
		const effectiveDueDate = payoutDate && parseDDMMYYYY(payoutDate) ? payoutDate : (recdDate || getTodayDDMMYYYY());

		const existingSplit = splitInstallments[sNo] || {};
		const existingOverrideA = scheduleOverrides[`${sNo}A`] || {};
		const loanIdentifier = loan?.db_id || loan?.id;

		if (isSecondPayment) {
			const existingOverrideB = scheduleOverrides[`${sNo}B`] || {};
			const hasPaidB = Boolean(
				(existingSplit.recdDateB && String(existingSplit.recdDateB).trim() && existingSplit.recdDateB !== '-' && existingSplit.recdDateB !== '—') ||
				(existingOverrideB.receivedDate && String(existingOverrideB.receivedDate).trim() && existingOverrideB.receivedDate !== '-' && existingOverrideB.receivedDate !== '—') ||
				(targetInst?.subInstallments?.length > 1 && targetInst.subInstallments[1]?.subType === 'paid' && targetInst.subInstallments[1]?.receivedDate)
			);

			const isThirdPayment = hasPaidB;

			const amtA = firstPaidAmount || existingSplit.amountA || Number(existingSplit.paidAmount) || 0;
			const amtB = isThirdPayment ? (existingSplit.amountB || 0) : (thisPaidAmount || (fullAmt - amtA));
			const amtC = isThirdPayment ? (thisPaidAmount || Math.max(0, fullAmt - (amtA + amtB))) : 0;

			const totalPaid = amtA + amtB + amtC;
			const isFinalSettled = totalPaid >= fullAmt;

			const dateRecdA = firstRecdDate || existingOverrideA.receivedDate || existingSplit.recdDateA || existingSplit.recdDate || '';
			const dateDueA = firstPayoutDate || existingOverrideA.dueDate || existingSplit.dueDateA || existingSplit.dueDate || '-';
			const remA = firstRemarks !== undefined ? firstRemarks : (existingOverrideA.remarks || existingSplit.remarksA || existingSplit.remarks || '');

			const dateRecdB = isThirdPayment ? (existingOverrideB.receivedDate || existingSplit.recdDateB || '') : (recdDate || getTodayDDMMYYYY());
			const dateDueB = isThirdPayment ? (existingOverrideB.dueDate || existingSplit.dueDateB || '-') : effectiveDueDate;
			const remB = isThirdPayment ? (existingOverrideB.remarks || existingSplit.remarksB || '') : (remarks || '');

			const dateRecdC = isThirdPayment ? (recdDate || getTodayDDMMYYYY()) : '';
			const dateDueC = isThirdPayment ? effectiveDueDate : '-';
			const remC = isThirdPayment ? (remarks || '') : '';

			const currentAccounts = accountObjectsList?.length > 0 ? accountObjectsList : availableAccountObjects;
			const secRequiresApproval = checkLoanSecondaryRequiresApproval(loan, currentAccounts);
			const isAutoApprove = isSystemAdmin || userPerms?.isAdmin || !secRequiresApproval;
			const payoutAppStatus = isAutoApprove ? 'APPROVED' : 'PENDING';
			const payoutAppBy = isAutoApprove ? (isSystemAdmin || userPerms?.isAdmin ? (activeUser?.name || 'System Admin') : 'Auto Approved') : null;
			const payoutAppAt = isAutoApprove ? getFormattedNow() : null;
			const payoutAppNotes = isSystemAdmin || userPerms?.isAdmin ? 'Auto-approved by System Admin' : (secRequiresApproval ? null : 'Auto approved: Secondary account approval access is disabled');

			const splitPayload = {
				sNo,
				paidAmount: totalPaid,
				amountA: amtA,
				amountB: amtB,
				isFinalSettled,
				recdDateA: dateRecdA,
				dueDateA: dateDueA,
				remarksA: remA,
				recdDateB: dateRecdB,
				dueDateB: dateDueB,
				remarksB: remB,
				...(isThirdPayment ? {
					amountC: amtC,
					recdDateC: dateRecdC,
					dueDateC: dateDueC,
					remarksC: remC,
					priAmountC: thisPriAmount,
					secAmountsC: thisSecAmounts,
					secAmountC: thisSecAmount,
					secTdsAmountsC: thisSecTdsAmounts,
					secTdsC: thisSecTds,
					payoutApprovalStatusC: payoutAppStatus,
				} : {
					priAmountB: thisPriAmount,
					secAmountsB: thisSecAmounts,
					secAmountB: thisSecAmount,
					secTdsAmountsB: thisSecTdsAmounts,
					secTdsB: thisSecTds,
					payoutApprovalStatusB: payoutAppStatus,
				}),
				recdDate: dateRecdA,
				dueDate: dateDueA,
				payoutDate: dateDueA,
				payout_approval_status: isFinalSettled ? payoutAppStatus : (payoutAppStatus === 'APPROVED' ? 'APPROVED' : null),
				payoutApprovalStatus: isFinalSettled ? payoutAppStatus : (payoutAppStatus === 'APPROVED' ? 'APPROVED' : null),
				payoutApprovalStatusA: payoutAppStatus,
				payout_approved_by: payoutAppBy,
				payout_approved_at: payoutAppAt,
				remarks: remC || remB || remA || '',
				priAmountA: firstPriAmount !== undefined ? firstPriAmount : existingSplit.priAmountA,
				secAmountsA: firstSecAmounts || existingSplit.secAmountsA,
				secAmountA: existingSplit.secAmountA,
				secTdsAmountsA: firstSecTdsAmounts || existingSplit.secTdsAmountsA,
				secTdsA: existingSplit.secTdsA,
				priAmount: priAmount !== undefined ? Number(priAmount) : undefined,
				secAmount: secAmount !== undefined ? Number(secAmount) : undefined,
				secAmounts: Array.isArray(secAmounts) ? secAmounts : undefined,
				secTds: secTds !== undefined ? Number(secTds) : undefined,
				secTdsAmounts: Array.isArray(secTdsAmounts) ? secTdsAmounts : undefined,
				chqNoA,
				chqNoB,
				chqNoC: isThirdPayment ? `${sNo}-C` : undefined,
				db_id: loan?.db_id,
			};

			setSplitInstallments((prev) => ({
				...prev,
				[sNo]: splitPayload,
			}));

			setScheduleOverrides((prev) => ({
				...prev,
				[sNo]: {
					...(prev[sNo] || {}),
					receivedDate: dateRecdA,
					dueDate: dateDueA,
					remarks: remC || remB || remA || '',
					payout_approval_status: isFinalSettled ? payoutAppStatus : (prev[sNo]?.payout_approval_status || null),
					payoutApprovalStatus: isFinalSettled ? payoutAppStatus : (prev[sNo]?.payoutApprovalStatus || null),
					payout_approved_by: isFinalSettled ? payoutAppBy : (prev[sNo]?.payout_approved_by || null),
					payout_approved_at: isFinalSettled ? payoutAppAt : (prev[sNo]?.payout_approved_at || null),
					payout_notes: payoutAppNotes,
				},
				[`${sNo}A`]: {
					...(prev[`${sNo}A`] || {}),
					receivedDate: dateRecdA,
					dueDate: dateDueA,
					remarks: remA,
					payout_approval_status: payoutAppStatus,
					payoutApprovalStatus: payoutAppStatus,
					payout_approved_by: payoutAppBy,
					payout_approved_at: payoutAppAt,
					payout_notes: payoutAppNotes,
				},
				[`${sNo}B`]: {
					...(prev[`${sNo}B`] || {}),
					receivedDate: dateRecdB,
					dueDate: dateDueB,
					remarks: remB,
					payout_approval_status: isThirdPayment ? (prev[`${sNo}B`]?.payout_approval_status || payoutAppStatus) : payoutAppStatus,
					payoutApprovalStatus: isThirdPayment ? (prev[`${sNo}B`]?.payoutApprovalStatus || payoutAppStatus) : payoutAppStatus,
					payout_approved_by: isThirdPayment ? (prev[`${sNo}B`]?.payout_approved_by || payoutAppBy) : payoutAppBy,
					payout_approved_at: isThirdPayment ? (prev[`${sNo}B`]?.payout_approved_at || payoutAppAt) : payoutAppAt,
					payout_notes: payoutAppNotes,
				},
				...(isThirdPayment ? {
					[`${sNo}C`]: {
						...(prev[`${sNo}C`] || {}),
						receivedDate: dateRecdC,
						dueDate: dateDueC,
						remarks: remC,
						payout_approval_status: payoutAppStatus,
						payoutApprovalStatus: payoutAppStatus,
						payout_approved_by: payoutAppBy,
						payout_approved_at: payoutAppAt,
						payout_notes: payoutAppNotes,
					}
				} : {})
			}));

			setExpandedRows((prev) => ({
				...prev,
				[sNo]: true,
			}));
			setSplitModalTarget(null);

			if (loanIdentifier) {
				api.saveLoanSplit(loanIdentifier, splitPayload)
					.then((res) => {
						if (res?.splits) {
							setSplitInstallments((prev) => {
								const next = { ...prev };
								Object.entries(res.splits).forEach(([k, v]) => {
									const existing = prev[k] || {};
									next[k] = { ...existing, ...v };
									const amountKeys = ['amountA', 'paidAmount', 'amountB', 'amountC', 'priAmount', 'priAmountA', 'priAmountB', 'priAmountC', 'secAmount', 'secAmountA', 'secAmountB', 'secAmountC', 'secAmounts', 'secAmountsA', 'secAmountsB', 'secAmountsC', 'secTds', 'secTdsA', 'secTdsB', 'secTdsC', 'secTdsAmounts', 'secTdsAmountsA', 'secTdsAmountsB', 'secTdsAmountsC'];
									amountKeys.forEach((ak) => {
										if (existing[ak] !== undefined && (v[ak] === undefined || v[ak] === null)) {
											next[ak] = existing[ak];
										}
									});
								});
								return next;
							});
						}
						if (res?.overrides) setScheduleOverrides((prev) => ({ ...prev, ...res.overrides }));
					})
					.catch((err) => console.warn('Could not persist split to backend:', err));
			}

			if (onUpdateLoan && loan) {
				const updatedSchedule = (loan.repaymentSchedule || []).map((sch) => {
					if (sch.sNo === sNo || sch.sNo === Number(sNo)) {
						return { ...sch, splits: splitPayload };
					}
					return sch;
				});
				onUpdateLoan({ ...loan, repaymentSchedule: updatedSchedule });
			}
			return;
		}

		// 1st partial payment
		const currentAccounts = accountObjectsList?.length > 0 ? accountObjectsList : availableAccountObjects;
		const secRequiresApproval = checkLoanSecondaryRequiresApproval(loan, currentAccounts);
		const isAutoApprove = isSystemAdmin || userPerms?.isAdmin || !secRequiresApproval;
		const payoutAppStatus = isAutoApprove ? 'APPROVED' : 'PENDING';
		const payoutAppBy = isAutoApprove ? (isSystemAdmin || userPerms?.isAdmin ? (activeUser?.name || 'System Admin') : 'Auto Approved') : null;
		const payoutAppAt = isAutoApprove ? getFormattedNow() : null;
		const payoutAppNotes = isSystemAdmin || userPerms?.isAdmin ? 'Auto-approved by System Admin' : (secRequiresApproval ? null : 'Auto approved: Secondary account approval access is disabled');

		const splitPayload = {
			sNo,
			paidAmount: Number(paidAmount),
			amountA: Number(paidAmount),
			amountB: Math.max(0, fullAmt - Number(paidAmount)),
			isFinalSettled: Number(paidAmount) >= fullAmt,
			recdDateA: recdDate,
			dueDateA: effectiveDueDate,
			remarksA: remarks || '',
			recdDateB: '',
			dueDateB: '-',
			remarksB: '',
			recdDate,
			payoutDate: effectiveDueDate,
			dueDate: effectiveDueDate,
			payout_approval_status: payoutAppStatus,
			payoutApprovalStatus: payoutAppStatus,
			payoutApprovalStatusA: payoutAppStatus,
			payout_approved_by: payoutAppBy,
			payout_approved_at: payoutAppAt,
			remarks: remarks || '',
			priAmount: priAmount !== undefined ? Number(priAmount) : undefined,
			secAmount: secAmount !== undefined ? Number(secAmount) : undefined,
			secAmounts: Array.isArray(secAmounts) ? secAmounts : undefined,
			priAmountA: priAmount !== undefined ? Number(priAmount) : undefined,
			secAmountA: secAmount !== undefined ? Number(secAmount) : undefined,
			secAmountsA: Array.isArray(secAmounts) ? secAmounts : undefined,
			secTds: secTds !== undefined ? Number(secTds) : undefined,
			secTdsA: thisSecTds !== undefined ? Number(thisSecTds) : undefined,
			secTdsAmounts: Array.isArray(secTdsAmounts) ? secTdsAmounts : undefined,
			secTdsAmountsA: Array.isArray(thisSecTdsAmounts) ? thisSecTdsAmounts : undefined,
			chqNoA,
			chqNoB,
			db_id: loan?.db_id,
		};

		setSplitInstallments((prev) => ({
			...prev,
			[sNo]: splitPayload,
		}));
		setScheduleOverrides((prev) => ({
			...prev,
			[sNo]: {
				...(prev[sNo] || {}),
				receivedDate: recdDate || getTodayDDMMYYYY(),
				dueDate: effectiveDueDate,
				remarks: remarks || '',
				payout_approval_status: payoutAppStatus,
				payoutApprovalStatus: payoutAppStatus,
				payout_approved_by: payoutAppBy,
				payout_approved_at: payoutAppAt,
				payout_notes: payoutAppNotes,
			},
			[`${sNo}A`]: {
				...(prev[`${sNo}A`] || {}),
				receivedDate: recdDate || getTodayDDMMYYYY(),
				dueDate: effectiveDueDate,
				remarks: remarks || '',
				payout_approval_status: payoutAppStatus,
				payoutApprovalStatus: payoutAppStatus,
				payout_approved_by: payoutAppBy,
				payout_approved_at: payoutAppAt,
				payout_notes: payoutAppNotes,
			},
			[`${sNo}B`]: {
				...(prev[`${sNo}B`] || {}),
				receivedDate: '',
				dueDate: '-',
				remarks: '',
			},
		}));
		setExpandedRows((prev) => ({
			...prev,
			[sNo]: true,
		}));
		setSplitModalTarget(null);

		// Persist split to Flask backend
		if (loanIdentifier) {
			api.saveLoanSplit(loanIdentifier, splitPayload)
				.then((res) => {
					if (res?.splits) {
						setSplitInstallments((prev) => {
							const next = { ...prev };
							Object.entries(res.splits).forEach(([k, v]) => {
								const existing = prev[k] || {};
								next[k] = { ...existing, ...v };
								const amountKeys = ['amountA', 'paidAmount', 'amountB', 'amountC', 'priAmount', 'priAmountA', 'priAmountB', 'priAmountC', 'secAmount', 'secAmountA', 'secAmountB', 'secAmountC', 'secAmounts', 'secAmountsA', 'secAmountsB', 'secAmountsC', 'secTds', 'secTdsA', 'secTdsB', 'secTdsC', 'secTdsAmounts', 'secTdsAmountsA', 'secTdsAmountsB', 'secTdsAmountsC'];
								amountKeys.forEach((ak) => {
									if (existing[ak] !== undefined && (v[ak] === undefined || v[ak] === null)) {
										next[ak] = existing[ak];
									}
								});
							});
							return next;
						});
					}
					if (res?.overrides) setScheduleOverrides((prev) => ({ ...prev, ...res.overrides }));
				})
				.catch((err) => console.warn('Could not persist split to backend:', err));
		}

		if (onUpdateLoan && loan) {
			const updatedSchedule = (loan.repaymentSchedule || []).map((sch) => {
				if (sch.sNo === sNo || sch.sNo === Number(sNo)) {
					return { ...sch, splits: splitPayload };
				}
				return sch;
			});
			onUpdateLoan({ ...loan, repaymentSchedule: updatedSchedule });
		}
	};

	const handleRevertSplit = (parentSNo) => {
		setSplitInstallments((prev) => {
			const next = { ...prev };
			delete next[parentSNo];
			delete next[Number(parentSNo)];
			return next;
		});
		setExpandedRows((prev) => {
			const next = { ...prev };
			delete next[parentSNo];
			delete next[Number(parentSNo)];
			return next;
		});
		setScheduleOverrides((prev) => {
			const next = { ...prev };
			delete next[`${parentSNo}A`];
			delete next[`${parentSNo}B`];
			delete next[`${parentSNo}C`];
			delete next[`${parentSNo}D`];
			return next;
		});
		setSplitModalTarget(null);

		// Revert on Flask backend
		const loanIdentifier = loan?.db_id || loan?.id;
		if (loanIdentifier) {
			api.revertLoanSplit(loanIdentifier, parentSNo).catch((err) =>
				console.warn('Could not revert split on backend:', err)
			);
		}

		if (onUpdateLoan && loan) {
			const updatedSchedule = (loan.repaymentSchedule || []).map((sch) => {
				if (sch.sNo === parentSNo || sch.sNo === Number(parentSNo)) {
					return { ...sch, splits: null };
				}
				return sch;
			});
			onUpdateLoan({ ...loan, repaymentSchedule: updatedSchedule });
		}
	};

	const handleScheduleDateChange = (sNo, field, val) => {
		const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
		if (isSecEditor && field !== 'dueDate') return;
		setScheduleOverrides((prev) => {
			const currentInst = allScheduleItems.find((item) => String(item.sNo) === String(sNo)) || {};
			const instOverrides = { ...(prev[sNo] || {}) };

			// Once payout date is approved, that payout date and respected recd dates are not editable
			const effectiveDueDate = instOverrides.dueDate !== undefined ? instOverrides.dueDate : currentInst.dueDate;
			const isAlreadyApproved = Boolean(
				effectiveDueDate &&
				effectiveDueDate !== '-' &&
				effectiveDueDate !== '-' &&
				(instOverrides.payout_approval_status === 'APPROVED' ||
					instOverrides.payoutApprovalStatus === 'APPROVED' ||
					(!instOverrides.payout_approval_status && !instOverrides.payoutApprovalStatus && (currentInst.status === 'Settled' || currentInst.payout_approval_status === 'APPROVED' || currentInst.payoutApprovalStatus === 'APPROVED')))
			);
			const isAnySubApproved = Boolean(
				currentInst.isPartial &&
				currentInst.subInstallments?.some(
					(sub) =>
						sub.dueDate &&
						sub.dueDate !== '-' &&
						sub.dueDate !== '-' &&
						(sub.status === 'Settled' ||
							sub.payout_approval_status === 'APPROVED' ||
							sub.payoutApprovalStatus === 'APPROVED')
				)
			);
			// Determine if this is a partial payment row (sub-row, parent partial, or has splits)
			const isPartialPayment = Boolean(
				currentInst.isPartial ||
				currentInst.isSubRow ||
				currentInst.parentSNo ||
				splitInstallments[sNo] ||
				splitInstallments[Number(sNo)] ||
				(currentInst.parentSNo && (splitInstallments[currentInst.parentSNo] || splitInstallments[Number(currentInst.parentSNo)]))
			);

			// Once payout date approved, recd date and payout date are NOT editable, EVEN FOR SYSTEM ADMIN!
			if (isAlreadyApproved || isAnySubApproved) {
				return prev;
			}

			let finalVal = val;
			const oldVal = instOverrides[field] !== undefined ? instOverrides[field] : (field === 'receivedDate' ? currentInst.receivedDate : currentInst.dueDate);

			// Validation rules:
			// 1. Recd date cannot be a past date of EMI date (inst.date) or 1st payment date (for balance rows)
			if (field === 'receivedDate') {
				if (finalVal && finalVal.length === 10) {
					if (currentInst.date && isDateBefore(finalVal, currentInst.date)) {
						finalVal = currentInst.date;
					}
					if (currentInst.isSubRow && currentInst.subType === 'balance') {
						const parentSplit = splitInstallments[currentInst.parentSNo] || splitInstallments[Number(currentInst.parentSNo)];
						const firstDate = parentSplit?.recdDate || prev[`${currentInst.parentSNo}A`]?.receivedDate;
						if (firstDate && parseDDMMYYYY(firstDate) && isDateBefore(finalVal, firstDate)) {
							finalVal = firstDate;
						}
					}
				}

				// If client paid (recd date entered), remittance to secondary partner is pending approval (or auto-approved if System Admin)
				if (finalVal && finalVal.length === 10) {
					const isAlreadyApproved = Boolean(
						currentInst.payout_approved_by ||
						currentInst.payoutApprovedBy ||
						currentInst.status === 'Settled'
					);
					if (!isAlreadyApproved) {
						if (isSystemAdmin || userPerms?.isAdmin) {
							const adminName = activeUser?.name || 'System Admin';
							const nowStr = getFormattedNow();
							instOverrides.payout_approval_status = 'APPROVED';
							instOverrides.payoutApprovalStatus = 'APPROVED';
							instOverrides.payout_approval_target = null;
							instOverrides.payoutApprovalTarget = null;
							instOverrides.payout_editor_role = 'ADMIN';
							instOverrides.payoutEditorRole = 'ADMIN';
							instOverrides.payout_requested_role = 'ADMIN';
							instOverrides.payoutRequestedRole = 'ADMIN';
							instOverrides.payout_requested_by = adminName;
							instOverrides.payout_requested_at = nowStr;
							instOverrides.payout_approved_by = adminName;
							instOverrides.payoutApprovedBy = adminName;
							instOverrides.payout_approved_at = nowStr;
							instOverrides.payoutApprovedAt = nowStr;
							instOverrides.payout_notes = 'Auto-approved by System Admin';
						} else {
							const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
							const targetRole = isSecEditor ? 'PRIMARY' : 'SECONDARY';
							const editorRole = isSecEditor ? 'SECONDARY' : 'PRIMARY';
							const editorName = activeUser?.name || activeUser?.employee_code || (isSecEditor ? 'Secondary Manager' : 'Primary Manager');

							instOverrides.payout_approval_status = 'PENDING';
							instOverrides.payoutApprovalStatus = 'PENDING';
							instOverrides.payout_approval_target = targetRole;
							instOverrides.payoutApprovalTarget = targetRole;
							instOverrides.payout_editor_role = editorRole;
							instOverrides.payoutEditorRole = editorRole;
							instOverrides.payout_requested_role = editorRole;
							instOverrides.payoutRequestedRole = editorRole;
							instOverrides.payout_requested_by = editorName;
							instOverrides.payout_requested_at = getFormattedNow();
							instOverrides.payout_approved_by = null;
							instOverrides.payout_approved_at = null;
							instOverrides.payout_notes = null;
						}
					}
				}

				// If new recd date is after due date, advance due date to match recd date (due date >= recd date)
				const effectiveDueDate = instOverrides.dueDate || currentInst.dueDate;
				if (
					finalVal &&
					finalVal.length === 10 &&
					effectiveDueDate &&
					effectiveDueDate !== '-' &&
					effectiveDueDate !== '-'
				) {
					if (isDateBefore(effectiveDueDate, finalVal)) {
						instOverrides.dueDate = finalVal;
					}
				}
			}

			// 2. Due date cannot be a past date of Recd date (inst.receivedDate)
			if (field === 'dueDate') {
				const effectiveRecdDate = instOverrides.receivedDate || currentInst.receivedDate;
				if (
					finalVal &&
					finalVal.length === 10 &&
					effectiveRecdDate &&
					effectiveRecdDate !== '-' &&
					effectiveRecdDate !== '-'
				) {
					if (isDateBefore(finalVal, effectiveRecdDate)) {
						finalVal = effectiveRecdDate;
					}
				}

				if (finalVal && finalVal.length === 10 && finalVal !== '-' && finalVal !== '—') {
					if (isSystemAdmin || userPerms?.isAdmin) {
						// System Admin auto-approves payout date immediately
						const adminName = activeUser?.name || 'System Admin';
						const nowStr = getFormattedNow();
						instOverrides.payout_approval_status = 'APPROVED';
						instOverrides.payoutApprovalStatus = 'APPROVED';
						instOverrides.payout_approval_target = null;
						instOverrides.payoutApprovalTarget = null;
						instOverrides.payout_editor_role = 'ADMIN';
						instOverrides.payoutEditorRole = 'ADMIN';
						instOverrides.payout_requested_role = 'ADMIN';
						instOverrides.payoutRequestedRole = 'ADMIN';
						instOverrides.payout_requested_by = adminName;
						instOverrides.payout_requested_at = nowStr;
						instOverrides.payout_approved_by = adminName;
						instOverrides.payoutApprovedBy = adminName;
						instOverrides.payout_approved_at = nowStr;
						instOverrides.payoutApprovedAt = nowStr;
						instOverrides.payout_notes = 'Auto-approved by System Admin';
					} else {
						// Every time any manager edits payout date:
						// - If secondary manager edits -> approval request sent to primary manager (target: 'PRIMARY')
						// - If primary manager edits -> approval request sent to secondary manager (target: 'SECONDARY')
						const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
						const targetRole = isSecEditor ? 'PRIMARY' : 'SECONDARY';
						const editorRole = isSecEditor ? 'SECONDARY' : 'PRIMARY';
						const editorName = activeUser?.name || activeUser?.employee_code || (isSecEditor ? 'Secondary Manager' : 'Primary Manager');

						instOverrides.payout_approval_status = 'PENDING';
						instOverrides.payoutApprovalStatus = 'PENDING';
						instOverrides.payout_approval_target = targetRole;
						instOverrides.payoutApprovalTarget = targetRole;
						instOverrides.payout_editor_role = editorRole;
						instOverrides.payoutEditorRole = editorRole;
						instOverrides.payout_requested_role = editorRole;
						instOverrides.payoutRequestedRole = editorRole;
						instOverrides.payout_requested_by = editorName;
						instOverrides.payout_requested_at = getFormattedNow();
						instOverrides.payout_approved_by = null;
						instOverrides.payout_approved_at = null;
						instOverrides.payout_notes = null;
					}
				} else {
					instOverrides.payout_approval_status = null;
					instOverrides.payoutApprovalStatus = null;
					instOverrides.payout_approval_target = null;
					instOverrides.payoutApprovalTarget = null;
					instOverrides.payout_editor_role = null;
					instOverrides.payoutEditorRole = null;
					instOverrides.payout_requested_role = null;
					instOverrides.payoutRequestedRole = null;
					instOverrides.payout_requested_by = null;
					instOverrides.payout_requested_at = null;
					instOverrides.payout_approved_by = null;
					instOverrides.payout_approved_at = null;
					instOverrides.payout_notes = null;
				}
			}

			instOverrides[field] = finalVal;

			// A date field is only "fully changed" when:
			// 1. It is a complete 10-char date and a valid calendar date (finalVal.length === 10 && parseDDMMYYYY(finalVal) !== null), OR
			// 2. It is explicitly cleared (!finalVal || finalVal === '-' || finalVal === '').
			// Partial intermediate keystrokes (e.g. "2", "20", "20-07", "20-07-2", "20-07-202") MUST NOT trigger history events or backend saves.
			const isCompleteDate = Boolean(finalVal && finalVal.length === 10 && parseDDMMYYYY(finalVal) !== null);
			const isExplicitlyCleared = !finalVal || finalVal === '-' || finalVal === '';
			const isFullyChanged = isCompleteDate || isExplicitlyCleared;

			const cellKey = `${sNo}_${field}`;
			if (committedDatesRef.current[cellKey] === undefined) {
				const origVal = currentInst[field] || '';
				committedDatesRef.current[cellKey] = (origVal && origVal !== '-') ? origVal : '';
			}
			const baselineVal = committedDatesRef.current[cellKey];

			// Construct History Entry ONLY when date is fully changed and differs from the baseline
			let histEntry = null;
			if (isFullyChanged && finalVal !== baselineVal) {
				const isRecd = field === 'receivedDate';
				const fieldLabel = isRecd ? 'Received Date' : 'Payout Date';
				const nowStr = getFormattedNow();
				const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
				const displayOld = baselineVal || 'None';
				const displayNew = finalVal || 'None';

				histEntry = {
					id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
					type: isRecd ? 'recd_date_update' : 'payout_date_update',
					title: field === 'dueDate'
						? (isSystemAdmin || userPerms?.isAdmin
							? `EMI #${sNo} Payout Date Auto-Approved by System Admin`
							: (isSecEditor
								? `EMI #${sNo} Payout Date Updated by Secondary Manager`
								: `EMI #${sNo} Payout Date Updated by Primary Manager`))
						: `EMI #${sNo} ${fieldLabel} Updated`,
					description: field === 'dueDate'
						? (isSystemAdmin || userPerms?.isAdmin
							? `System Admin set EMI #${sNo} payout date to "${finalVal}". Auto-approved.`
							: (isSecEditor
								? `Secondary Manager updated EMI #${sNo} payout date to "${finalVal}". Approval request sent to primary manager.`
								: `Primary Manager updated EMI #${sNo} payout date to "${finalVal}". Approval request sent to secondary manager.`))
						: (displayOld !== 'None'
							? `EMI #${sNo} ${fieldLabel.toLowerCase()} updated from "${displayOld}" to "${displayNew}".`
							: `EMI #${sNo} ${fieldLabel.toLowerCase()} updated to "${displayNew}".`),
					timestamp: nowStr,
					isoDate: new Date().toISOString(),
					userName: activeUser?.name || activeUser?.employee_code || (isSystemAdmin || userPerms?.isAdmin ? 'System Admin' : (isSecEditor ? 'Secondary Manager' : 'Primary Manager')),
					userRole: activeUser?.role || (isSystemAdmin || userPerms?.isAdmin ? 'admin' : (isSecEditor ? 'sec_manager' : 'primary_manager')),
					userEmployeeCode: activeUser?.employee_code || '',
					emiNo: sNo,
					fieldName: field,
					oldValue: displayOld,
					newValue: displayNew,
				};

				// Update committed baseline so subsequent keystrokes don't duplicate
				committedDatesRef.current[cellKey] = finalVal;

				setLoanHistory((prevHist) => {
					// If top item is from the same cell in the current session, update in place
					const top = prevHist[0];
					if (
						top &&
						String(top.emiNo) === String(sNo) &&
						top.fieldName === field &&
						(top.type === 'recd_date_update' || top.type === 'payout_date_update') &&
						top.timestamp === nowStr
					) {
						const updatedTop = {
							...top,
							...histEntry,
							id: top.id,
							oldValue: top.oldValue,
							description: field === 'dueDate'
								? histEntry.description
								: (top.oldValue && top.oldValue !== 'None'
									? `EMI #${sNo} ${fieldLabel.toLowerCase()} updated from "${top.oldValue}" to "${displayNew}".`
									: `EMI #${sNo} ${fieldLabel.toLowerCase()} updated to "${displayNew}".`),
						};
						const nextHist = [updatedTop, ...prevHist.slice(1)];
						if (onUpdateLoan) {
							onUpdateLoan({ ...loan, history: nextHist });
						}
						return nextHist;
					}
					const nextHist = [histEntry, ...prevHist];
					if (onUpdateLoan) {
						onUpdateLoan({ ...loan, history: nextHist });
					}
					return nextHist;
				});
			}

			// Persist schedule override to Flask backend ONLY when date is fully changed
			const loanIdentifier = loan?.db_id || loan?.id;
			if (loanIdentifier && isFullyChanged) {
				api.saveScheduleOverride(loanIdentifier, {
					sNo,
					field,
					value: finalVal,
					payout_approval_status: instOverrides.payout_approval_status,
					payoutApprovalStatus: instOverrides.payoutApprovalStatus,
					payout_approval_target: instOverrides.payout_approval_target,
					payoutApprovalTarget: instOverrides.payoutApprovalTarget,
					payout_editor_role: instOverrides.payout_editor_role,
					payoutEditorRole: instOverrides.payoutEditorRole,
					payout_requested_role: instOverrides.payout_requested_role,
					payoutRequestedRole: instOverrides.payoutRequestedRole,
					payout_requested_by: instOverrides.payout_requested_by,
					payout_requested_at: instOverrides.payout_requested_at,
					payout_approved_by: instOverrides.payout_approved_by,
					payout_approved_at: instOverrides.payout_approved_at,
					payout_notes: instOverrides.payout_notes,
					userName: activeUser?.name || (isSystemAdmin || userPerms?.isAdmin ? 'System Admin' : ''),
					userRole: activeUser?.role || (isSystemAdmin || userPerms?.isAdmin ? 'admin' : ''),
					historyEntry: histEntry,
				}).catch((err) =>
					console.warn('Could not save schedule override to backend:', err)
				);
			}

			const nextOverrides = {
				...prev,
				[sNo]: instOverrides,
			};

			// Keep parent and sub-installment A in sync (never sync sub-installment B to parent)
			if (currentInst.isSubRow && currentInst.parentSNo) {
				const parentSNo = currentInst.parentSNo;
				if (String(sNo).endsWith('A')) {
					nextOverrides[parentSNo] = {
						...(nextOverrides[parentSNo] || {}),
						[field]: finalVal,
						...(field === 'dueDate' ? {
							payout_approval_status: instOverrides.payout_approval_status,
							payoutApprovalStatus: instOverrides.payoutApprovalStatus,
							payout_approval_target: instOverrides.payout_approval_target,
							payoutApprovalTarget: instOverrides.payoutApprovalTarget,
							payout_editor_role: instOverrides.payout_editor_role,
							payoutEditorRole: instOverrides.payoutEditorRole,
							payout_requested_role: instOverrides.payout_requested_role,
							payoutRequestedRole: instOverrides.payoutRequestedRole,
							payout_requested_by: instOverrides.payout_requested_by,
							payout_requested_at: instOverrides.payout_requested_at,
						} : {})
					};
				}
				// Explicitly keep the parent row expanded so it does not collapse when sub-installment dates are updated
				setExpandedRows((prevExp) => ({
					...prevExp,
					[parentSNo]: true,
					[Number(parentSNo)]: true,
				}));
			} else if (splitInstallments[sNo] || splitInstallments[Number(sNo)]) {
				nextOverrides[`${sNo}A`] = {
					...(nextOverrides[`${sNo}A`] || {}),
					[field]: finalVal,
					...(field === 'dueDate' ? {
						payout_approval_status: instOverrides.payout_approval_status,
						payoutApprovalStatus: instOverrides.payoutApprovalStatus,
						payout_approval_target: instOverrides.payout_approval_target,
						payoutApprovalTarget: instOverrides.payoutApprovalTarget,
						payout_editor_role: instOverrides.payout_editor_role,
						payoutEditorRole: instOverrides.payoutEditorRole,
						payout_requested_role: instOverrides.payout_requested_role,
						payoutRequestedRole: instOverrides.payoutRequestedRole,
						payout_requested_by: instOverrides.payout_requested_by,
						payout_requested_at: instOverrides.payout_requested_at,
					} : {})
				};
			}

			return nextOverrides;
		});
	};

	const handleClearRowDates = (sNo) => {
		const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
		if (isSecEditor) return;

		const sNoStr = String(sNo);
		const sNoNum = Number(sNo);
		const currentInst = allScheduleItems.find(
			(item) => String(item.sNo) === sNoStr || String(item.installmentNumber) === sNoStr
		) || {};

		const isPartial = Boolean(
			splitInstallments[sNo] ||
			splitInstallments[sNoNum] ||
			splitInstallments[sNoStr] ||
			currentInst.isPartial ||
			currentInst.splits ||
			(currentInst.subInstallments && currentInst.subInstallments.length > 0) ||
			(loan?.repaymentSchedule && loan.repaymentSchedule.some((sch) => String(sch.sNo || sch.s_no || sch.installmentNumber) === sNoStr && sch.splits)) ||
			(loan?.repayment_schedule && loan.repayment_schedule.some((sch) => String(sch.sNo || sch.s_no || sch.installmentNumber) === sNoStr && sch.splits)) ||
			(baseRepaymentSchedule && baseRepaymentSchedule.some((sch) => String(sch.sNo || sch.installmentNumber) === sNoStr && sch.splits))
		);

		// If clear is applied on a partial EMI, remove the split and child sub-rows completely
		setSplitInstallments((prev) => {
			const next = { ...prev };
			delete next[sNo];
			delete next[sNoNum];
			delete next[sNoStr];
			return next;
		});

		setExpandedRows((prev) => {
			const next = { ...prev };
			delete next[sNo];
			delete next[sNoNum];
			delete next[sNoStr];
			return next;
		});

		setScheduleOverrides((prev) => {
			const next = { ...prev };
			// Delete child sub-installment overrides completely
			delete next[`${sNo}A`];
			delete next[`${sNo}B`];
			delete next[`${sNo}C`];
			delete next[`${sNo}D`];
			delete next[`${sNoStr}A`];
			delete next[`${sNoStr}B`];
			delete next[`${sNoStr}C`];
			delete next[`${sNoStr}D`];
			if (!isNaN(sNoNum)) {
				delete next[`${sNoNum}A`];
				delete next[`${sNoNum}B`];
				delete next[`${sNoNum}C`];
				delete next[`${sNoNum}D`];
			}
			const clearedItem = {
				...(next[sNo] || next[sNoNum] || next[sNoStr] || {}),
				receivedDate: '',
				dueDate: '-',
				splits: null,
				isPartial: false,
				subInstallments: undefined,
				payout_approval_status: null,
				payoutApprovalStatus: null,
				payout_approved_by: null,
				payout_approved_at: null,
				status: 'Active',
			};
			next[sNo] = clearedItem;
			if (!isNaN(sNoNum)) {
				next[sNoNum] = clearedItem;
			}
			next[sNoStr] = clearedItem;
			return next;
		});

		delete committedDatesRef.current[`${sNo}_receivedDate`];
		delete committedDatesRef.current[`${sNo}_dueDate`];
		delete committedDatesRef.current[`${sNoStr}_receivedDate`];
		delete committedDatesRef.current[`${sNoStr}_dueDate`];
		if (!isNaN(sNoNum)) {
			delete committedDatesRef.current[`${sNoNum}_receivedDate`];
			delete committedDatesRef.current[`${sNoNum}_dueDate`];
		}
		delete committedDatesRef.current[`${sNoStr}A_receivedDate`];
		delete committedDatesRef.current[`${sNoStr}A_dueDate`];
		delete committedDatesRef.current[`${sNoStr}B_receivedDate`];
		delete committedDatesRef.current[`${sNoStr}B_dueDate`];
		delete committedDatesRef.current[`${sNoStr}C_receivedDate`];
		delete committedDatesRef.current[`${sNoStr}C_dueDate`];
		delete committedDatesRef.current[`${sNoStr}D_receivedDate`];
		delete committedDatesRef.current[`${sNoStr}D_dueDate`];
		delete committedDatesRef.current[`${sNo}A_receivedDate`];
		delete committedDatesRef.current[`${sNo}A_dueDate`];
		delete committedDatesRef.current[`${sNo}B_receivedDate`];
		delete committedDatesRef.current[`${sNo}B_dueDate`];
		delete committedDatesRef.current[`${sNo}C_receivedDate`];
		delete committedDatesRef.current[`${sNo}C_dueDate`];
		delete committedDatesRef.current[`${sNo}D_receivedDate`];
		delete committedDatesRef.current[`${sNo}D_dueDate`];

		const histEntry = {
			id: `hist_${Date.now()}_clear`,
			type: 'recd_date_update',
			title: isPartial ? `EMI #${sNo} Partial Split & Dates Cleared` : `EMI #${sNo} Dates Cleared`,
			description: isPartial
				? `EMI #${sNo} partial split removed and dates cleared by ${activeUser?.name || 'Staff'}.`
				: `EMI #${sNo} client received date and partner payout dates cleared by ${activeUser?.name || 'Staff'}.`,
			timestamp: getFormattedNow(),
			isoDate: new Date().toISOString(),
			userName: activeUser?.name || activeUser?.employee_code || 'Staff Officer',
			userRole: activeUser?.role || 'user',
			userEmployeeCode: activeUser?.employee_code || '',
			emiNo: sNo,
		};
		setLoanHistory((prevHist) => {
			const nextHist = [histEntry, ...prevHist];
			if (onUpdateLoan) onUpdateLoan({ ...loan, history: nextHist });
			return nextHist;
		});

		const loanIdentifier = loan?.db_id || loan?.id;
		if (loanIdentifier) {
			if (isPartial) {
				api.revertLoanSplit(loanIdentifier, sNo).then((res) => {
					if (res?.splits) {
						setSplitInstallments((prev) => {
							const next = { ...res.splits };
							delete next[sNo];
							delete next[sNoNum];
							delete next[sNoStr];
							return next;
						});
					}
				}).catch((err) => {
					console.warn('Backend split revert warning:', err);
				});
			}
			api.saveScheduleOverride(loanIdentifier, {
				sNo: sNoNum || sNo,
				field: 'receivedDate',
				value: '',
				splits: null,
				payout_approval_status: null,
				payoutApprovalStatus: null,
				historyEntry: histEntry,
			}).catch(() => { });
			api.saveScheduleOverride(loanIdentifier, {
				sNo: sNoNum || sNo,
				field: 'dueDate',
				value: '-',
				splits: null,
				payout_approval_status: null,
				payoutApprovalStatus: null,
			}).catch(() => { });
		}

		if (onUpdateLoan && loan) {
			const updateScheduleList = (list) => {
				if (!Array.isArray(list)) return list;
				return list.map((sch) => {
					const schSNo = String(sch.sNo || sch.s_no || sch.installmentNumber);
					if (schSNo === sNoStr) {
						return {
							...sch,
							splits: null,
							isPartial: false,
							subInstallments: undefined,
							receivedDate: '',
							received_date: null,
							dueDate: '-',
							paymentDate: null,
							payment_date: null,
							payout_approval_status: null,
							payoutApprovalStatus: null,
							payout_approved_by: null,
							payout_approved_at: null,
							status: 'Active',
						};
					}
					return sch;
				});
			};
			const nextRepaymentSchedule = updateScheduleList(loan.repaymentSchedule);
			const nextRepayment_schedule = updateScheduleList(loan.repayment_schedule);
			onUpdateLoan({
				...loan,
				...(nextRepaymentSchedule ? { repaymentSchedule: nextRepaymentSchedule } : {}),
				...(nextRepayment_schedule ? { repayment_schedule: nextRepayment_schedule } : {}),
			});
		}
	};

	const firstUnpaidIndex = useMemo(() => {
		return repaymentSchedule.findIndex(
			(inst) =>
				!inst.receivedDate ||
				!String(inst.receivedDate).trim() ||
				String(inst.receivedDate).trim() === '-' ||
				String(inst.receivedDate).trim() === '-' ||
				inst.status === 'Overdue' ||
				inst.status === 'Partial'
		);
	}, [repaymentSchedule]);
	const filteredSchedule = useMemo(() => {
		if (scheduleFilter === 'SETTLED') return repaymentSchedule.filter((s) => s.status === 'Settled');
		if (scheduleFilter === 'COLLECTED') return repaymentSchedule.filter((s) => s.status === 'Collected');
		if (scheduleFilter === 'PAID')
			return repaymentSchedule.filter((s) => s.status === 'Settled' || s.status === 'Collected' || s.status === 'Paid');
		if (scheduleFilter === 'OVERDUE' || scheduleFilter === 'DUE')
			return repaymentSchedule.filter((s) => s.status === 'Overdue' || s.status === 'Partial');
		if (scheduleFilter === 'PARTIAL')
			return repaymentSchedule.filter((s) => s.isPartial);
		if (scheduleFilter === 'ACTIVE' || scheduleFilter === 'UPCOMING')
			return repaymentSchedule.filter((s) => s.status === 'Active' || s.status === 'Upcoming');
		return repaymentSchedule;
	}, [repaymentSchedule, scheduleFilter]);

	// Helper to focus input by ID with retries (handling React re-render when field transitions from disabled to enabled)
	const focusScheduleInput = useCallback((targetId) => {
		if (!targetId) return;
		const attempt = () => {
			const el = document.getElementById(targetId);
			if (el && el.tagName === 'INPUT' && !el.disabled) {
				el.focus();
				el.select?.();
				el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
				return true;
			}
			return false;
		};

		if (!attempt()) {
			setTimeout(attempt, 40);
			setTimeout(attempt, 120);
			setTimeout(attempt, 250);
		}
	}, []);

	// Move cursor from Recd Date to Payout Date of the same EMI
	const handleRecdDateEnter = useCallback((inst, sub = null) => {
		const targetSNo = sub ? sub.sNo : inst.sNo;
		focusScheduleInput(`schedule-payout-${targetSNo}`);
	}, [focusScheduleInput]);

	// Move cursor from Payout Date to next EMI's Recd Date
	const handlePayoutDateEnter = useCallback((inst, rowIdx, sub = null, subIdx = 0) => {
		// If currently on partial sub-installment row
		if (sub && inst.isPartial && Array.isArray(inst.subInstallments)) {
			if (subIdx < inst.subInstallments.length - 1) {
				const nextSub = inst.subInstallments[subIdx + 1];
				focusScheduleInput(`schedule-recd-${nextSub.sNo}`);
				return;
			}
		}

		// Move to the next installment row in filteredSchedule
		for (let i = rowIdx + 1; i < filteredSchedule.length; i++) {
			const nextInst = filteredSchedule[i];
			if (!nextInst) continue;
			const isNextExpanded = Boolean(expandedRows[nextInst.sNo] || expandedRows[Number(nextInst.sNo)]);
			const nextTargetId = (nextInst.isPartial && isNextExpanded && nextInst.subInstallments?.[0])
				? `schedule-recd-${nextInst.subInstallments[0].sNo}`
				: `schedule-recd-${nextInst.sNo}`;

			focusScheduleInput(nextTargetId);
			break;
		}
	}, [filteredSchedule, expandedRows, focusScheduleInput]);


	const settledCount = useMemo(
		() => repaymentSchedule.filter((s) => s.status === 'Settled').length,
		[repaymentSchedule]
	);
	const collectedCount = useMemo(
		() => repaymentSchedule.filter((s) => s.status === 'Collected').length,
		[repaymentSchedule]
	);
	const overdueCount = useMemo(
		() => repaymentSchedule.filter((s) => s.status === 'Overdue' || s.status === 'Partial').length,
		[repaymentSchedule]
	);
	const activeCount = useMemo(
		() => repaymentSchedule.filter((s) => s.status === 'Active' || s.status === 'Upcoming').length,
		[repaymentSchedule]
	);
	const partialCount = useMemo(
		() => repaymentSchedule.filter((s) => s.isPartial).length,
		[repaymentSchedule]
	);
	const scheduleStatusOptions = useMemo(
		() => [
			{ id: 'ALL', label: 'All Statuses', count: repaymentSchedule.length, dot: 'bg-slate-400' },
			{ id: 'SETTLED', label: 'Settled', count: settledCount, dot: 'bg-emerald-500' },
			{ id: 'COLLECTED', label: 'Collected', count: collectedCount, dot: 'bg-blue-500' },
			{ id: 'ACTIVE', label: 'Active', count: activeCount, dot: 'bg-emerald-500' },
			{ id: 'OVERDUE', label: 'Overdue', count: overdueCount, dot: 'bg-rose-500' },
			{ id: 'PARTIAL', label: 'Partial', count: partialCount, dot: 'bg-amber-500' },
		],
		[repaymentSchedule.length, settledCount, collectedCount, overdueCount, partialCount, activeCount]
	);
	const paidInstallmentsCount = useMemo(
		() => repaymentSchedule.filter((s) => s.status === 'Settled' || s.status === 'Collected' || s.status === 'Paid').length,
		[repaymentSchedule]
	);
	const totalPaidAmount = useMemo(
		() =>
			repaymentSchedule
				.filter((s) => s.status === 'Settled' || s.status === 'Collected' || s.status === 'Paid')
				.reduce((sum, s) => sum + s.totalEmi, 0),
		[repaymentSchedule]
	);
	const totalScheduleAmount = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
		[repaymentSchedule]
	);
	const totalScheduleInterest = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.interest) || 0), 0),
		[repaymentSchedule]
	);
	const totalSchedulePriAmount = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.primaryAmount) || 0), 0),
		[repaymentSchedule]
	);
	const totalSchedulePriInterest = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.primaryInterest) || 0), 0),
		[repaymentSchedule]
	);
	const totalScheduleSecAmount = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.secAmount) || 0), 0),
		[repaymentSchedule]
	);
	const totalScheduleSecInterest = useMemo(
		() => repaymentSchedule.reduce((sum, s) => sum + (Number(s.secInterest) || 0), 0),
		[repaymentSchedule]
	);
	const totalScheduleTds = useMemo(
		() => Number(baseRepaymentSchedule[0]?.tds ?? repaymentSchedule[0]?.tds ?? 0),
		[repaymentSchedule, baseRepaymentSchedule]
	);
	const primaryAccount = useMemo(() => {
		return accounts.find((a) => a.isPrimary) || accounts[0];
	}, [accounts]);
	const secAccounts = useMemo(() => {
		return accounts.filter((a) => !a.isPrimary);
	}, [accounts]);
	// legacy single-secondary tag (first secondary)
	const secAccount = secAccounts[0] || { accountName: 'Secondary Partner', accountTag: 'SEC', share: 40 };

	const primaryTag = useMemo(() => {
		return primaryAccount?.accountTag || primaryAccount?.initials || 'PRI';
	}, [primaryAccount]);
	const secTag = useMemo(() => {
		return secAccount?.accountTag || secAccount?.initials || 'SEC';
	}, [secAccount]);

	const primarySharePct = (accounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) > 0 && primaryAccount?.principal != null && Number(primaryAccount.principal) > 0)
		? ((Number(primaryAccount.principal) / accounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0)) * 100)
		: (primaryAccount?.share != null && primaryAccount.share !== ''
			? Number(primaryAccount.share)
			: (secAccounts.length > 0 ? Math.max(0, 100 - secAccounts.reduce((sum, s) => sum + Number(s.share || 0), 0)) : 60));

	// Per-secondary-account totals across all schedule rows
	const secAccountTotals = useMemo(() => {
		if (!repaymentSchedule.length) return [];
		const numSecs = (repaymentSchedule[0]?.secAccounts || []).length || secAccounts.length;
		const firstInst = repaymentSchedule[0];
		const firstInstBase = baseRepaymentSchedule[0];
		return Array.from({ length: numSecs }, (_, idx) => {
			const firstEmiTds = Number(
				firstInstBase?.secAccounts?.[idx]?.tds ??
				firstInst?.secAccounts?.[idx]?.tds ??
				0
			);
			return {
				totalAmount: repaymentSchedule.reduce(
					(sum, s) => sum + (Number(s.secAccounts?.[idx]?.amount) || 0),
					0
				),
				totalInterest: repaymentSchedule.reduce(
					(sum, s) => sum + (Number(s.secAccounts?.[idx]?.interest) || 0),
					0
				),
				// TDS total is specifically the 1st EMI TDS value
				totalTds: firstEmiTds,
			};
		});
	}, [repaymentSchedule, secAccounts, baseRepaymentSchedule]);

	// Breakdown of Schedule Totals: Total Received vs Total Balance
	const scheduleReceivedTotals = useMemo(() => {
		let recdAmount = 0;
		let recdInterest = 0;
		let recdPriAmount = 0;
		let recdPriInterest = 0;
		const numSecs = (repaymentSchedule[0]?.secAccounts || []).length || secAccounts.length;
		const recdSecAmounts = Array(numSecs).fill(0);
		const recdSecInterests = Array(numSecs).fill(0);
		const recdSecTds = Array(numSecs).fill(0);

		for (const inst of repaymentSchedule) {
			if (inst.isPartial && Array.isArray(inst.subInstallments)) {
				for (const sub of inst.subInstallments) {
					const isSubPaid =
						sub.subType === 'paid' ||
						sub.status === 'Settled' ||
						sub.status === 'Collected' ||
						sub.status === 'Paid';
					if (isSubPaid) {
						recdAmount += Number(sub.amount) || 0;
						recdInterest += Number(sub.interest) || 0;
						recdPriAmount += Number(sub.primaryAmount) || 0;
						recdPriInterest += Number(sub.primaryInterest) || 0;
						(sub.secAccounts || []).forEach((sa, idx) => {
							if (idx < numSecs) {
								recdSecAmounts[idx] += Number(sa.amount) || 0;
								recdSecInterests[idx] += Number(sa.interest) || 0;
							}
						});
					}
				}
			} else {
				const isPaid =
					inst.status === 'Settled' ||
					inst.status === 'Collected' ||
					inst.status === 'Paid';
				if (isPaid) {
					recdAmount += Number(inst.amount) || 0;
					recdInterest += Number(inst.interest) || 0;
					recdPriAmount += Number(inst.primaryAmount) || 0;
					recdPriInterest += Number(inst.primaryInterest) || 0;
					(inst.secAccounts || []).forEach((sa, idx) => {
						if (idx < numSecs) {
							recdSecAmounts[idx] += Number(sa.amount) || 0;
							recdSecInterests[idx] += Number(sa.interest) || 0;
						}
					});
				}
			}
		}

		// TDS calculation: only 1st EMI has TDS, and it is received based on whether 1st EMI payout date is filled
		const firstInst = repaymentSchedule[0];
		const firstInstBase = baseRepaymentSchedule[0];
		const isDateFilled = (d) => {
			if (!d) return false;
			const str = String(d).trim();
			return str !== '' && str !== '-' && str !== '-';
		};
		const is1stPayoutFilled = Boolean(
			(firstInst?.isPartial && firstInst?.subInstallments?.some((s) => isDateFilled(s.dueDate))) ||
			isDateFilled(firstInst?.dueDate)
		);

		for (let idx = 0; idx < numSecs; idx++) {
			const firstEmiTds = Number(
				firstInstBase?.secAccounts?.[idx]?.tds ??
				firstInst?.secAccounts?.[idx]?.tds ??
				0
			);
			if (firstInst?.isPartial && Array.isArray(firstInst?.subInstallments)) {
				let subTdsAcc = 0;
				firstInst.subInstallments.forEach((s) => {
					if (isDateFilled(s.dueDate)) {
						subTdsAcc += Number(s.secAccounts?.[idx]?.tds || 0);
					}
				});
				recdSecTds[idx] = subTdsAcc;
			} else {
				recdSecTds[idx] = is1stPayoutFilled ? firstEmiTds : 0;
			}
		}

		return {
			recdAmount,
			recdInterest,
			recdPriAmount,
			recdPriInterest,
			recdSecAmounts,
			recdSecInterests,
			recdSecTds,
		};
	}, [repaymentSchedule, secAccounts, baseRepaymentSchedule]);

	const scheduleBalanceTotals = useMemo(() => {
		const numSecs = (repaymentSchedule[0]?.secAccounts || []).length || secAccounts.length;
		const balAmount = Math.max(0, totalScheduleAmount - scheduleReceivedTotals.recdAmount);
		const balInterest = Math.max(0, totalScheduleInterest - scheduleReceivedTotals.recdInterest);
		const balPriAmount = Math.max(0, totalSchedulePriAmount - scheduleReceivedTotals.recdPriAmount);
		const balPriInterest = Math.max(0, totalSchedulePriInterest - scheduleReceivedTotals.recdPriInterest);
		const balSecAmounts = Array.from({ length: numSecs }, (_, idx) =>
			Math.max(0, (secAccountTotals[idx]?.totalAmount || 0) - (scheduleReceivedTotals.recdSecAmounts[idx] || 0))
		);
		const balSecInterests = Array.from({ length: numSecs }, (_, idx) =>
			Math.max(0, (secAccountTotals[idx]?.totalInterest || 0) - (scheduleReceivedTotals.recdSecInterests[idx] || 0))
		);

		// TDS balance: if payout date is filled -> 0, otherwise full 1st EMI TDS amount
		const firstInst = repaymentSchedule[0];
		const firstInstBase = baseRepaymentSchedule[0];
		const balSecTds = Array.from({ length: numSecs }, (_, idx) => {
			const firstEmiTds = Number(
				firstInstBase?.secAccounts?.[idx]?.tds ??
				firstInst?.secAccounts?.[idx]?.tds ??
				secAccountTotals[idx]?.totalTds ??
				0
			);
			return Math.max(0, firstEmiTds - (scheduleReceivedTotals.recdSecTds[idx] || 0));
		});

		return {
			balAmount,
			balInterest,
			balPriAmount,
			balPriInterest,
			balSecAmounts,
			balSecInterests,
			balSecTds,
		};
	}, [
		totalScheduleAmount,
		totalScheduleInterest,
		totalSchedulePriAmount,
		totalSchedulePriInterest,
		secAccountTotals,
		scheduleReceivedTotals,
		repaymentSchedule,
		secAccounts,
		baseRepaymentSchedule,
	]);


	// Recalculate dynamic totals
	const totalPrincipal = useMemo(
		() => accounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0),
		[accounts]
	);
	const totalRepayAmount = useMemo(() => {
		if (totalScheduleAmount && totalScheduleAmount > 0) {
			return totalScheduleAmount;
		}
		const loanRepay = Number(loan?.total_repayment_amount || loan?.total_repayment || loan?.totalRepayAmount);
		if (loanRepay > 0) {
			return loanRepay;
		}
		return accounts.reduce((sum, a) => sum + (Number(a.repayAmount) || 0), 0);
	}, [totalScheduleAmount, loan, accounts]);

	const totalInterest = useMemo(() => {
		if (totalRepayAmount > totalPrincipal && totalPrincipal > 0) {
			return totalRepayAmount - totalPrincipal;
		}
		if (totalScheduleInterest && totalScheduleInterest > 0) {
			return totalScheduleInterest;
		}
		const loanInterest = Number(loan?.total_interest || loan?.totalInterest);
		if (loanInterest > 0) {
			return loanInterest;
		}
		return accounts.reduce((sum, a) => sum + (Number(a.interest) || 0), 0);
	}, [totalRepayAmount, totalPrincipal, totalScheduleInterest, loan, accounts]);

	const facilityTotalPrincipal = useMemo(() => {
		return Number(totalPrincipal) ||
			Number(loan?.amount) ||
			Number(loan?.sanctioned_amount) ||
			accounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) ||
			0;
	}, [totalPrincipal, loan, accounts]);

	const facilityTotalRepay = useMemo(() => {
		return Number(totalRepayAmount) ||
			Number(loan?.total_repayment_amount || loan?.total_repayment || loan?.totalRepayAmount || 0) ||
			accounts.reduce((sum, a) => sum + (Number(a.repayAmount) || 0), 0) ||
			0;
	}, [totalRepayAmount, loan, accounts]);

	const facilityTotalInterest = useMemo(() => {
		return Number(totalInterest) ||
			(facilityTotalRepay > facilityTotalPrincipal ? facilityTotalRepay - facilityTotalPrincipal : 0) ||
			Number(loan?.total_interest || loan?.totalInterest || 0) ||
			accounts.reduce((sum, a) => sum + (Number(a.interest) || 0), 0) ||
			0;
	}, [totalInterest, facilityTotalRepay, facilityTotalPrincipal, loan, accounts]);

	const avgInterestRate = useMemo(() => {
		if (totalPrincipal === 0) return 0;
		const weightedSum = accounts.reduce(
			(sum, a) => sum + (Number(a.principal) || 0) * (Number(a.interestRate) || 0),
			0
		);
		return weightedSum / totalPrincipal;
	}, [accounts, totalPrincipal]);

	const principalPercent = useMemo(() => {
		if (!totalRepayAmount || totalRepayAmount <= 0) return 100;
		const val = (totalPrincipal / totalRepayAmount) * 100;
		return Number(val.toFixed(2));
	}, [totalPrincipal, totalRepayAmount]);

	const interestPercent = useMemo(() => {
		if (!totalRepayAmount || totalRepayAmount <= 0 || !totalInterest || totalInterest <= 0) return 0;
		const val = (totalInterest / totalRepayAmount) * 100;
		return Number(val.toFixed(2));
	}, [totalInterest, totalRepayAmount]);

	const primaryAcc = accounts.find((a) => a.isPrimary) || accounts[0];
	const secondaryAccountsList = accounts.filter((a) => !a.isPrimary);
	const primarySharePercent = useMemo(() => {
		let raw = 60;
		if (primaryAcc?.share != null && primaryAcc.share !== '') {
			raw = Number(primaryAcc.share);
		} else if (totalPrincipal > 0 && primaryAcc && primaryAcc.principal != null) {
			raw = ((Number(primaryAcc.principal) || 0) / totalPrincipal) * 100;
		} else if (secondaryAccountsList.length > 0) {
			const secSum = secondaryAccountsList.reduce((sum, s) => sum + Number(s.share || 0), 0);
			raw = Math.max(0, 100 - secSum);
		} else if ((loan.primaryShare != null && loan.primaryShare !== '') || (loan.primary_account_share != null && loan.primary_account_share !== '')) {
			raw = Number(loan.primaryShare ?? loan.primary_account_share);
		}
		return formatSharePercent(raw);
	}, [totalPrincipal, primaryAcc, secondaryAccountsList, loan.primaryShare]);

	const secondarySharePercents = useMemo(() => {
		if (secondaryAccountsList.length > 0) {
			return secondaryAccountsList.map((a) => {
				let raw = 20;
				if (a.share != null && a.share !== '') {
					raw = Number(a.share);
				} else if (totalPrincipal > 0) {
					raw = ((Number(a.principal) || 0) / totalPrincipal) * 100;
				}
				return formatSharePercent(raw);
			});
		}
		const fallbackSec = loan.coShare != null ? Number(loan.coShare) : (100 - Number(primarySharePercent));
		return [formatSharePercent(fallbackSec)];
	}, [totalPrincipal, secondaryAccountsList, primarySharePercent, loan.coShare]);

	const shareRatioText = useMemo(() => {
		return [primarySharePercent, ...secondarySharePercents].join('-');
	}, [primarySharePercent, secondarySharePercents]);

	// Effective secondary accounts list (fallback to 1 secondary account if none configured)
	const effectiveSecAccounts = useMemo(() => {
		if (secondaryAccountsList && secondaryAccountsList.length > 0) {
			return secondaryAccountsList;
		}
		return [{
			accountName: secAccount?.accountName || 'Secondary Partner',
			accountTag: secTag || 'SEC',
			share: 100 - Number(primarySharePercent),
		}];
	}, [secondaryAccountsList, secAccount, secTag, primarySharePercent]);

	// Penal form states
	const [penalFormDate, setPenalFormDate] = useState(getTodayDDMMYYYY());
	const [penalFormAmount, setPenalFormAmount] = useState('');
	const [penalPriAmount, setPenalPriAmount] = useState('');
	const [penalSecAmounts, setPenalSecAmounts] = useState([]);
	const [penalSecPayoutDates, setPenalSecPayoutDates] = useState([]);
	const [penalFormRemarks, setPenalFormRemarks] = useState('');
	const [penalFormError, setPenalFormError] = useState('');

	// Calendar popover states for Penal Interest form
	const [showPenalDateCalendar, setShowPenalDateCalendar] = useState(false);
	const [showCommonSecCalendar, setShowCommonSecCalendar] = useState(false);
	const [openSecPayoutCalendarIdx, setOpenSecPayoutCalendarIdx] = useState(null);
	const penalDateContainerRef = useRef(null);
	const commonSecPayoutRef = useRef(null);
	const secPayoutContainerRefs = useRef({});

	// Click outside / escape listener for penal date calendars
	useEffect(() => {
		if (!showPenalDateCalendar && openSecPayoutCalendarIdx === null && !showCommonSecCalendar) return;
		const handleClickOutside = (e) => {
			if (showPenalDateCalendar && penalDateContainerRef.current && !penalDateContainerRef.current.contains(e.target)) {
				setShowPenalDateCalendar(false);
			}
			if (showCommonSecCalendar && commonSecPayoutRef.current && !commonSecPayoutRef.current.contains(e.target)) {
				setShowCommonSecCalendar(false);
			}
			if (openSecPayoutCalendarIdx !== null) {
				const targetRef = secPayoutContainerRefs.current[openSecPayoutCalendarIdx];
				if (targetRef && !targetRef.contains(e.target)) {
					setOpenSecPayoutCalendarIdx(null);
				}
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				if (showPenalDateCalendar) {
					e.stopPropagation();
					setShowPenalDateCalendar(false);
				}
				if (showCommonSecCalendar) {
					e.stopPropagation();
					setShowCommonSecCalendar(false);
				}
				if (openSecPayoutCalendarIdx !== null) {
					e.stopPropagation();
					setOpenSecPayoutCalendarIdx(null);
				}
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown, true);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown, true);
		};
	}, [showPenalDateCalendar, openSecPayoutCalendarIdx, showCommonSecCalendar]);

	// Total allocated to primary + secondaries in form
	const penalAllocatedTotal = useMemo(() => {
		const pri = parseFloat(String(penalPriAmount).replace(/,/g, '')) || 0;
		const sec = (penalSecAmounts || []).reduce(
			(sum, v) => sum + (parseFloat(String(v).replace(/,/g, '')) || 0),
			0
		);
		return Math.round((pri + sec) * 100) / 100;
	}, [penalPriAmount, penalSecAmounts]);

	// Check if allocated exceeds total penal amount
	const isPenalExceeded = useMemo(() => {
		const totalAmt = parseFloat(String(penalFormAmount).replace(/,/g, '')) || 0;
		if (totalAmt <= 0) return false;
		return penalAllocatedTotal > (totalAmt + 0.01);
	}, [penalAllocatedTotal, penalFormAmount]);

	// Total penal amount across existing entries
	const totalPenalAmount = useMemo(() => {
		return penalInterestList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
	}, [penalInterestList]);

	// Total primary penal amount across existing entries
	const totalPenalPriAmount = useMemo(() => {
		return penalInterestList.reduce((sum, item) => {
			const priAmt = item.primaryAmount != null
				? Number(item.primaryAmount)
				: Math.round(((Number(item.amount) || 0) * Number(primarySharePercent)) / 100);
			return sum + (priAmt || 0);
		}, 0);
	}, [penalInterestList, primarySharePercent]);

	// Total secondary penal amounts per account
	const totalPenalSecAmounts = useMemo(() => {
		const numSecs = effectiveSecAccounts.length;
		return Array.from({ length: numSecs }, (_, sIdx) => {
			return penalInterestList.reduce((sum, item) => {
				let secAmt = 0;
				if (item.secAmounts && item.secAmounts[sIdx] != null) {
					secAmt = Number(item.secAmounts[sIdx]) || 0;
				} else if (sIdx === 0 && item.secAmount != null) {
					secAmt = Number(item.secAmount) || 0;
				} else {
					const sPct = Number(secondarySharePercents[sIdx]) || (100 - Number(primarySharePercent));
					secAmt = Math.round(((Number(item.amount) || 0) * sPct) / 100);
				}
				return sum + (secAmt || 0);
			}, 0);
		});
	}, [penalInterestList, effectiveSecAccounts, secondarySharePercents, primarySharePercent]);

	// Auto-split penal amount when user types/changes total penal amount
	const handlePenalAmountChange = (val) => {
		setPenalFormAmount(val);
		setPenalFormError('');
		const num = parseFloat(String(val).replace(/,/g, ''));
		if (!isNaN(num) && num > 0) {
			const pShare = Number(primarySharePercent) || 0;
			const priAmt = Math.round((num * pShare) / 100);
			setPenalPriAmount(String(priAmt));

			const numSecs = effectiveSecAccounts.length;
			if (numSecs === 1) {
				const secAmt = Math.max(0, Math.round(num - priAmt));
				setPenalSecAmounts([String(secAmt)]);
			} else {
				let remainingForSec = num - priAmt;
				const calculatedSecs = effectiveSecAccounts.map((sec, idx) => {
					if (idx === numSecs - 1) {
						return String(Math.max(0, Math.round(remainingForSec)));
					}
					const secShare = Number(secondarySharePercents[idx]) || (100 - pShare) / numSecs;
					const allocated = Math.round((num * secShare) / 100);
					remainingForSec -= allocated;
					return String(Math.max(0, allocated));
				});
				setPenalSecAmounts(calculatedSecs);
			}
		} else {
			setPenalPriAmount('');
			setPenalSecAmounts(effectiveSecAccounts.map(() => ''));
		}
	};

	// Handlers for user editing primary and secondary account amounts directly with auto-adjustment
	const handlePriAmountChange = (val) => {
		setPenalPriAmount(val);
		setPenalFormError('');

		const totalAmt = parseFloat(String(penalFormAmount).replace(/,/g, '')) || 0;
		if (totalAmt <= 0) return;

		const priNum = val === '' ? 0 : (parseFloat(String(val).replace(/,/g, '')) || 0);
		const remaining = Math.max(0, Math.round((totalAmt - priNum) * 100) / 100);

		const numSecs = effectiveSecAccounts.length;
		if (numSecs === 1) {
			setPenalSecAmounts([String(remaining)]);
		} else if (numSecs > 1) {
			const totalSecPct = effectiveSecAccounts.reduce(
				(sum, _, i) => sum + (Number(secondarySharePercents[i]) || 0),
				0
			) || 1;
			let remSec = remaining;
			const calculatedSecs = effectiveSecAccounts.map((_, idx) => {
				if (idx === numSecs - 1) {
					return String(Math.max(0, Math.round(remSec * 100) / 100));
				}
				const secShare = Number(secondarySharePercents[idx]) || 0;
				const allocated = Math.round((remaining * (secShare / totalSecPct)) * 100) / 100;
				remSec = Math.max(0, Math.round((remSec - allocated) * 100) / 100);
				return String(Math.max(0, allocated));
			});
			setPenalSecAmounts(calculatedSecs);
		}
	};

	const handleSecAmountChange = (val, idx) => {
		setPenalFormError('');

		const totalAmt = parseFloat(String(penalFormAmount).replace(/,/g, '')) || 0;
		const numSecs = effectiveSecAccounts.length;

		const currentSecs = effectiveSecAccounts.map((_, i) =>
			i === idx ? val : (penalSecAmounts[i] !== undefined ? penalSecAmounts[i] : '')
		);
		setPenalSecAmounts(currentSecs);

		if (totalAmt <= 0) return;

		if (numSecs === 1) {
			const secNum = val === '' ? 0 : (parseFloat(String(val).replace(/,/g, '')) || 0);
			const remPri = Math.max(0, Math.round((totalAmt - secNum) * 100) / 100);
			setPenalPriAmount(String(remPri));
		} else {
			// In multi-secondary accounts, auto-adjust the primary account to absorb the change
			const secSum = currentSecs.reduce((sum, v) => {
				const parsed = v === '' ? 0 : (parseFloat(String(v).replace(/,/g, '')) || 0);
				return sum + parsed;
			}, 0);
			const remPri = Math.max(0, Math.round((totalAmt - secSum) * 100) / 100);
			setPenalPriAmount(String(remPri));
		}
	};

	const handleOpenAddPenalModal = () => {
		const today = getTodayDDMMYYYY();
		setPenalFormDate(today);
		setPenalFormAmount('');
		setPenalPriAmount('');
		setPenalSecAmounts(effectiveSecAccounts.map(() => ''));
		setPenalSecPayoutDates(effectiveSecAccounts.map(() => today));
		setPenalFormRemarks('');
		setPenalFormError('');
		setShowPenalDateCalendar(false);
		setShowCommonSecCalendar(false);
		setOpenSecPayoutCalendarIdx(null);
		setIsAddPenalModalOpen(true);
	};

	const handleCreatePenalInterest = async (e) => {
		if (e) e.preventDefault();
		setPenalFormError('');

		const trimmedDate = String(penalFormDate || '').trim();
		if (!trimmedDate) {
			setPenalFormError('Please enter a valid date (DD-MM-YYYY)');
			return;
		}
		const numAmount = parseFloat(String(penalFormAmount).replace(/,/g, ''));
		if (isNaN(numAmount) || numAmount <= 0) {
			setPenalFormError('Please enter a valid positive penal amount');
			return;
		}

		const priVal = parseFloat(String(penalPriAmount).replace(/,/g, '')) || 0;
		const secAmts = penalSecAmounts.map((v) => parseFloat(String(v).replace(/,/g, '')) || 0);
		const secSum = secAmts.reduce((sum, v) => sum + v, 0);
		const totalAllocated = Math.round((priVal + secSum) * 100) / 100;

		if (totalAllocated > numAmount + 0.01) {
			setPenalFormError(
				`Total of primary and secondary amounts (₹${totalAllocated.toLocaleString('en-IN')}) cannot exceed penal amount (₹${numAmount.toLocaleString('en-IN')}). Excess: ₹${(totalAllocated - numAmount).toLocaleString('en-IN')}`
			);
			return;
		}

		const trimmedPayoutDates = penalSecPayoutDates.map((d) => String(d || '').trim());
		const primaryPayoutDate = trimmedPayoutDates[0] || '';

		const newEntry = {
			id: `penal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			sNo: penalInterestList.length + 1,
			date: trimmedDate,
			amount: Math.round(numAmount),
			receivedDate: trimmedDate,
			recdDate: trimmedDate,
			primaryAmount: Math.round(priVal),
			primaryAccountName: primaryAcc?.accountName || primaryTag,
			primaryTag: primaryTag,
			dueDate: primaryPayoutDate,
			payoutDate: primaryPayoutDate,
			secAmounts: secAmts.map((v) => Math.round(v)),
			secAmount: Math.round(secSum),
			secondaryAccounts: effectiveSecAccounts.map((sec, idx) => ({
				accountName: sec.accountName,
				accountTag: sec.accountTag || sec.initials || `SEC${idx + 1}`,
				amount: Math.round(secAmts[idx] || 0),
				payoutDate: trimmedPayoutDates[idx] || primaryPayoutDate,
				dueDate: trimmedPayoutDates[idx] || primaryPayoutDate,
			})),
			remarks: String(penalFormRemarks || '').trim(),
			createdAt: new Date().toISOString(),
			createdBy: activeUser?.name || 'Staff User',
		};

		const updatedList = [...penalInterestList, newEntry];
		setPenalInterestList(updatedList);

		// Persist locally
		const currentKey = loan?.db_id || loan?.id || loan?.loan_ref_id || 'unknown';
		try {
			localStorage.setItem(`loanDesk_penal_${currentKey}`, JSON.stringify(updatedList));
		} catch (err) {
			console.warn('Could not save penal interest to localStorage:', err);
		}

		// Update loan state
		const updatedLoan = {
			...loan,
			penal_interest: updatedList,
			penalInterests: updatedList,
		};
		if (onUpdateLoan) {
			onUpdateLoan(updatedLoan);
		}

		// Persist to backend if API supports
		if (api.updateJointLoan && (loan?.db_id || loan?.id)) {
			try {
				await api.updateJointLoan(loan.db_id || loan.id, updatedLoan);
			} catch (err) {
				console.warn('Could not persist penal interest to backend:', err);
			}
		}

		// Also record in loan history
		const authorName = activeUser?.name || 'Staff User';
		const histEntry = {
			id: `hist_${Date.now()}_penal`,
			type: 'penal_interest',
			title: `Penal Interest Added (₹${numAmount.toLocaleString('en-IN')})`,
			description: `Penal interest of ₹${numAmount.toLocaleString('en-IN')} recorded on ${trimmedDate} (Primary: ₹${Math.round(priVal).toLocaleString('en-IN')}, Secondary: ₹${Math.round(secSum).toLocaleString('en-IN')}).${newEntry.remarks ? ` Remarks: ${newEntry.remarks}` : ''}`,
			timestamp: getFormattedNow(),
			isoDate: new Date().toISOString(),
			userName: authorName,
			userRole: activeUser?.role || 'user',
			amount: numAmount,
		};
		const nextHist = [histEntry, ...(loanHistory || [])];
		setLoanHistory(nextHist);
		if (api.addLoanHistory && (loan?.db_id || loan?.id)) {
			try {
				await api.addLoanHistory(loan.db_id || loan.id, histEntry);
			} catch (e) { }
		}

		setIsAddPenalModalOpen(false);
		setSaveFeedback('Penal interest recorded successfully!');
		setTimeout(() => setSaveFeedback(null), 3000);
	};

	const handleConfirmDeletePenal = async () => {
		if (!penalDeleteTarget) return;
		const idToDelete = penalDeleteTarget.id;
		setPenalDeleteTarget(null);

		const updatedList = penalInterestList
			.filter((item) => item.id !== idToDelete)
			.map((item, idx) => ({ ...item, sNo: idx + 1 }));
		setPenalInterestList(updatedList);

		const currentKey = loan?.db_id || loan?.id || loan?.loan_ref_id || 'unknown';
		try {
			localStorage.setItem(`loanDesk_penal_${currentKey}`, JSON.stringify(updatedList));
		} catch (err) {
			console.warn('Could not save updated penal list to localStorage:', err);
		}

		const updatedLoan = {
			...loan,
			penal_interest: updatedList,
			penalInterests: updatedList,
		};
		if (onUpdateLoan) {
			onUpdateLoan(updatedLoan);
		}
		if (api.updateJointLoan && (loan?.db_id || loan?.id)) {
			try {
				await api.updateJointLoan(loan.db_id || loan.id, updatedLoan);
			} catch (err) {
				console.warn('Could not persist delete to backend:', err);
			}
		}

		setSaveFeedback('Penal interest entry removed');
		setTimeout(() => setSaveFeedback(null), 2500);
	};

	const handleStatusChange = async (newStatus) => {
		setCurrentStatus(newStatus);
		const badgeInfo = getStatusBadge(newStatus);
		const updated = {
			...loan,
			status: newStatus,
			statusColor: badgeInfo.color,
			statusDot: badgeInfo.dot,
		};
		onUpdateLoan(updated);
		const loanIdentifier = loan?.db_id || loan?.id;
		if (api.updateJointLoan && loanIdentifier) {
			try {
				await api.updateJointLoan(loanIdentifier, { status: newStatus, db_id: loan?.db_id });
			} catch (err) {
				console.warn('Could not persist status to backend:', err);
			}
		}
		setSaveFeedback('Status Updated');
		setTimeout(() => setSaveFeedback(null), 2000);
	};

	const handleSaveEditAccounts = async () => {
		const currentTotalShare = editAccounts.reduce((sum, a) => sum + (Number(a.share) || 0), 0);
		if (Math.abs(currentTotalShare - 100) > 0.05) {
			alert(`Total share % must equal 100% (currently ${Math.round(currentTotalShare * 100) / 100}%). Please adjust allocations before saving.`);
			return;
		}
		const primary = editAccounts.find((a) => a.isPrimary) || editAccounts[0];
		const secondaries = editAccounts.filter((a) => a.id !== primary.id);
		const finalizedAccounts = [primary, ...secondaries];

		setAccounts(finalizedAccounts);
		const newTotalPrincipal = finalizedAccounts.reduce(
			(sum, a) => sum + (Number(a.principal) || 0),
			0
		);
		const updated = {
			...loan,
			db_id: loan?.db_id,
			amount: newTotalPrincipal > 0 ? newTotalPrincipal : loan.amount,
			accountDetails: finalizedAccounts,
			secondaryAccounts: secondaries.map((sec, idx) => ({
				id: sec.id,
				accountName: sec.accountName,
				accountTag: sec.accountTag || `SEC${idx + 1}`,
				name: sec.accountName,
				amount: sec.principal,
				principal: sec.principal,
				interest: sec.interest,
				rate: sec.interestRate,
				share: sec.share,
				repayAmount: sec.repayAmount,
				tds: sec.tds || Math.round((sec.interest || 0) * 0.1),
			})),
			primaryShare: primary.share,
			primary_account_name: primary.accountName,
			primary_account_amount: primary.principal,
			primary_account_interest: primary.interest,
		};
		onUpdateLoan(updated);
		const loanIdentifier = loan?.db_id || updated?.db_id || updated?.id || loan?.id;
		if (api.updateJointLoan && loanIdentifier) {
			try {
				const res = await api.updateJointLoan(loanIdentifier, updated);
				if (res && res.loan) {
					onUpdateLoan(res.loan);
				}
			} catch (err) {
				console.warn('Could not persist updated allocations to backend:', err);
			}
		}
		setIsEditing(false);
		setSaveFeedback('Allocations Saved');
		setTimeout(() => setSaveFeedback(null), 2500);
	};

	const handleCancelEdit = () => {
		setEditAccounts(JSON.parse(JSON.stringify(accounts)));
		setIsEditing(false);
	};

	const handleAddSecondaryAccount = () => {
		setEditAccounts((prev) => {
			const currentSecs = prev.filter((a) => !a.isPrimary);
			const newIdx = currentSecs.length + 1;
			const defaultRate = Math.round(((parseFloat(loan.rate || '7.2') || 7.2) + 0.2) * 100) / 100;
			const tenureMatch = String(loan.tenure || '').match(/\d+/);
			const tenureMonths = tenureMatch ? parseInt(tenureMatch[0], 10) : 36;
			const tenureYears = Math.max(1, Math.round((tenureMonths / 12) * 10) / 10);

			const totalAmt = facilityTotalPrincipal ||
				Number(loan?.amount) ||
				Number(loan?.sanctioned_amount) ||
				prev.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) ||
				0;

			// Calculate remaining share from current accounts
			const currentTotalShare = prev.reduce((sum, a) => sum + (Number(a.share) || 0), 0);
			let remShare = Math.max(0, Math.round((100 - currentTotalShare) * 100) / 100);
			let baseAccounts = prev;

			// If current shares already total 100%, carve out a default 10% share from the primary account
			if (remShare <= 0) {
				const primaryAcc = prev.find((a) => a.isPrimary) || prev[0];
				const priShare = primaryAcc ? Number(primaryAcc.share) || 0 : 0;
				const carveOut = priShare > 20 ? 10 : Math.max(1, Math.floor(priShare * 0.25));
				if (carveOut > 0 && primaryAcc) {
					remShare = carveOut;
					const newPriShare = Math.round((priShare - carveOut) * 100) / 100;
					const newPriPrincipal = Math.round((totalAmt * newPriShare) / 100);
					const priRate = Number(primaryAcc.interestRate) || Number(loan.rate) || 7.2;
					const priInterest = facilityTotalInterest > 0
						? Math.round((facilityTotalInterest * newPriShare) / 100)
						: Math.round(newPriPrincipal * (priRate / 100) * (tenureYears * 0.55));
					baseAccounts = prev.map((a) =>
						a.id === primaryAcc.id
							? {
								...a,
								share: newPriShare,
								principal: newPriPrincipal,
								interest: priInterest,
								repayAmount: newPriPrincipal + priInterest,
							}
							: a
					);
				}
			}

			const remPrincipal = Math.max(0, Math.round((totalAmt * remShare) / 100));
			const remInterest = facilityTotalInterest > 0
				? Math.round((facilityTotalInterest * remShare) / 100)
				: Math.round(remPrincipal * (defaultRate / 100) * (tenureYears * 0.55));

			// Determine first available DB account name not already selected
			const canonicalize = (str) => String(str || '').replace(/[\s._-]+/g, '').toLowerCase();
			const primaryCanon = canonicalize(loan.primary_account_name || loan.primaryBorrower?.name || loan.leadAccount);
			const usedCanons = new Set(prev.map((a) => canonicalize(a.accountName)).filter(Boolean));
			const allOptions = (accountObjectsList && accountObjectsList.length > 0)
				? accountObjectsList
				: ((availableAccountOptions && availableAccountOptions.length > 0)
					? availableAccountOptions
					: secondaryAccountOptions);
			const nextAvailableObj = allOptions.find((opt) => {
				const name = typeof opt === 'string' ? opt : opt?.name;
				const canon = canonicalize(name);
				return canon && canon !== primaryCanon && !usedCanons.has(canon);
			});

			const rawName = typeof nextAvailableObj === 'string' ? nextAvailableObj : (nextAvailableObj?.name || '');
			const finalName = rawName ? rawName.toUpperCase() : '';
			const officialAcronym = getAcronym(finalName, accountObjectsList || availableAccountObjects);
			const parts = finalName.split(/\s+/);
			const fallbackInitials = parts.length > 1
				? (parts[0][0] + parts[1][0]).toUpperCase()
				: finalName.slice(0, 2).toUpperCase();
			const initials = (officialAcronym && officialAcronym !== finalName) ? officialAcronym : (finalName ? fallbackInitials : `S${newIdx}`);
			const tag = initials || `SEC${newIdx}`;

			const newSec = {
				id: `acc-sec-${Date.now()}-${newIdx}`,
				isPrimary: false,
				accountCategory: 'Secondary Account',
				accountName: finalName,
				accountTag: tag,
				role: 'Secondary Account',
				initials: initials,
				principal: remPrincipal,
				interest: remInterest,
				interestRate: defaultRate,
				repayAmount: remPrincipal + remInterest,
				share: remShare,
				tds: Math.round(remInterest * 0.1),
				isLocked: false,
			};
			return [...baseAccounts, newSec];
		});
	};

	const handleRemoveSecondaryAccount = (idToRemove) => {
		setEditAccounts((prev) => {
			const target = prev.find((a) => a.id === idToRemove);
			if (!target || target.isPrimary) return prev;
			const currentSecs = prev.filter((a) => !a.isPrimary);
			if (currentSecs.length <= 1) return prev; // min 1 secondary account

			const survivingAccounts = prev.filter((a) => a.id !== idToRemove);
			const totalAmt = facilityTotalPrincipal ||
				Number(loan?.amount) ||
				Number(loan?.sanctioned_amount) ||
				prev.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) ||
				0;

			const tenureMatch = String(loan.tenure || '').match(/\d+/);
			const tenureMonths = tenureMatch ? parseInt(tenureMatch[0], 10) : 36;
			const tenureYears = Math.max(1, Math.round((tenureMonths / 12) * 10) / 10);

			const calcFinancials = (acc, principal, share) => {
				const p = Math.max(0, Number(principal) || 0);
				const s = (totalAmt > 0 && p > 0) ? (p / totalAmt) * 100 : (Number(share) || 0);
				const interestVal = facilityTotalInterest > 0
					? Math.round((facilityTotalInterest * s) / 100)
					: Math.round(p * (Number(acc.interestRate || loan.rate || 7.2) / 100) * (tenureYears * 0.55));
				return {
					...acc,
					principal: p,
					share: s,
					interest: interestVal,
					repayAmount: p + interestVal,
					tds: !acc.isPrimary ? Math.round(interestVal * 0.1) : 0,
				};
			};

			// Distribute 100% across the surviving accounts proportionally
			const survivingShareSum = survivingAccounts.reduce((s, a) => s + (parseFloat(a.share) || 0), 0);
			let allocatedShareSum = 0;
			let allocatedPrincipalSum = 0;

			const updatedSurviving = survivingAccounts.map((acc, idx) => {
				const isLast = idx === survivingAccounts.length - 1;
				if (isLast) {
					const finalShare = Math.max(0, 100 - allocatedShareSum);
					const finalPrincipal = Math.max(0, totalAmt - allocatedPrincipalSum);
					return calcFinancials(acc, finalPrincipal, finalShare);
				}

				const weight = survivingShareSum > 0 ? (parseFloat(acc.share) || 0) / survivingShareSum : 1 / survivingAccounts.length;
				const accShare = Math.max(0, 100 * weight);
				const accPrincipal = Math.max(0, Math.round(totalAmt * weight));

				allocatedShareSum += accShare;
				allocatedPrincipalSum += accPrincipal;

				return calcFinancials(acc, accPrincipal, accShare);
			});

			if (facilityTotalInterest > 0) {
				const currentInterestSum = updatedSurviving.reduce((sum, a) => sum + (Number(a.interest) || 0), 0);
				const intDiff = facilityTotalInterest - currentInterestSum;
				if (intDiff !== 0) {
					const targetAcc = updatedSurviving[0];
					return updatedSurviving.map((a) => {
						if (a.id === targetAcc.id) {
							const adjustedInt = Math.max(0, (Number(a.interest) || 0) + intDiff);
							const p = Number(a.principal) || 0;
							return {
								...a,
								interest: adjustedInt,
								repayAmount: p + adjustedInt,
								tds: !a.isPrimary ? Math.round(adjustedInt * 0.1) : 0,
							};
						}
						return a;
					});
				}
			}

			return updatedSurviving;
		});
	};

	const handleToggleLock = (id) => {
		setEditAccounts((prev) =>
			prev.map((acc) =>
				acc.id === id ? { ...acc, isLocked: !acc.isLocked } : acc
			)
		);
	};

	const handleEditAccountChange = (id, field, value) => {
		setEditAccounts((prev) => {
			const targetIndex = prev.findIndex((acc) => acc.id === id);
			if (targetIndex === -1) return prev;
			const targetAcc = prev[targetIndex];

			// Manual lock toggle
			if (field === 'toggleLock') {
				return prev.map((acc) =>
					acc.id === id ? { ...acc, isLocked: !acc.isLocked } : acc
				);
			}

			// Do not edit primary account name
			if (targetAcc.isPrimary && field === 'accountName') {
				return prev;
			}

			const tenureMatch = String(loan.tenure || '').match(/\d+/);
			const tenureMonths = tenureMatch ? parseInt(tenureMatch[0], 10) : 36;
			const tenureYears = Math.max(1, Math.round((tenureMonths / 12) * 10) / 10);

			// Helper to compute interest, repayAmount, and TDS for an account based on %
			const calcFinancials = (acc, principal, share) => {
				const p = principal === '' ? '' : Math.max(0, Number(principal) || 0);
				const isTypingDecimal = typeof share === 'string' && (share.endsWith('.') || share.match(/\.\d*0$/));
				const s = share === '' ? '' : (isTypingDecimal ? share : Number(share));
				const exactSharePct = (facilityTotalPrincipal > 0 && p !== '')
					? (Number(p) / facilityTotalPrincipal) * 100
					: (s !== '' ? Number(s) : 0);

				let interestVal;
				if (facilityTotalInterest > 0) {
					// Interest updated based on % share of total facility interest using exact share %
					interestVal = Math.round((facilityTotalInterest * exactSharePct) / 100);
				} else {
					const r = Number(acc.interestRate) || Number(loan.rate) || 7.2;
					interestVal = Math.round((p === '' ? 0 : p) * (r / 100) * (tenureYears * 0.55));
				}

				const numP = p === '' ? 0 : p;
				return {
					...acc,
					principal: p,
					share: isTypingDecimal ? share : (s !== '' ? (field === 'share' ? s : exactSharePct) : ''),
					interest: interestVal,
					repayAmount: numP + interestVal,
					tds: !acc.isPrimary ? Math.round(interestVal * 0.1) : 0,
				};
			};

			// 1. Handling non-share/principal fields: accountName, accountTag, interestRate
			if (field === 'accountName') {
				const nameStr = String(value || '').trim().toUpperCase();
				const officialAcronym = getAcronym(nameStr, accountObjectsList || availableAccountObjects);
				const parts = nameStr.split(/\s+/);
				const fallbackInitials = parts.length > 1
					? (parts[0][0] + parts[1][0]).toUpperCase()
					: nameStr.slice(0, 2).toUpperCase();
				const initials = (officialAcronym && officialAcronym !== nameStr) ? officialAcronym : fallbackInitials;
				return prev.map((acc) =>
					acc.id === id
						? {
							...acc,
							accountName: nameStr,
							accountTag: initials || acc.accountTag,
							initials: initials || acc.initials,
						}
						: acc
				);
			}

			if (field === 'accountTag') {
				const tagStr = String(value || '').toUpperCase();
				return prev.map((acc) =>
					acc.id === id
						? { ...acc, accountTag: tagStr, initials: tagStr }
						: acc
				);
			}

			if (field === 'interestRate') {
				const r = parseFloat(value) || 0;
				return prev.map((acc) => {
					if (acc.id !== id) return acc;
					const p = Number(acc.principal) || 0;
					const interestVal = Math.round(p * (r / 100) * (tenureYears * 0.55));
					return {
						...acc,
						interestRate: r,
						interest: interestVal,
						repayAmount: p + interestVal,
						tds: !acc.isPrimary ? Math.round(interestVal * 0.1) : 0,
					};
				});
			}

			// 2. Handling 'share' and 'principal' changes with automatic remaining account adjustment
			const totalFacilityPrincipal =
				facilityTotalPrincipal ||
				Number(loan?.amount) ||
				Number(loan?.sanctioned_amount) ||
				(accounts || []).reduce((sum, a) => sum + (Number(a.principal) || 0), 0) ||
				prev.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) ||
				0;

			const otherAccounts = prev.filter((a) => a.id !== id);

			// If there are no other accounts, the target account takes 100% and full principal
			if (otherAccounts.length === 0) {
				return prev.map((acc) =>
					acc.id === id ? { ...calcFinancials(acc, totalFacilityPrincipal, 100), isLocked: Boolean(acc.isLocked) } : acc
				);
			}

			let newTargetShare;
			let newTargetPrincipal;
			let isShareInputEmpty = false;
			let isPrincipalInputEmpty = false;

			if (field === 'share') {
				if (value === '' || value === null || value === undefined) {
					isShareInputEmpty = true;
					newTargetShare = 0;
					newTargetPrincipal = 0;
				} else {
					const parsed = parseFloat(value);
					newTargetShare = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
					newTargetPrincipal = Math.round((totalFacilityPrincipal * newTargetShare) / 100);
				}
			} else if (field === 'principal') {
				const rawDigits = String(value || '').replace(/,/g, '').replace(/[^0-9]/g, '');
				if (rawDigits === '') {
					isPrincipalInputEmpty = true;
					newTargetPrincipal = 0;
					newTargetShare = 0;
				} else {
					const parsed = parseInt(rawDigits, 10);
					newTargetPrincipal = isNaN(parsed)
						? 0
						: Math.min(totalFacilityPrincipal, Math.max(0, parsed));
					newTargetShare =
						totalFacilityPrincipal > 0
							? (newTargetPrincipal / totalFacilityPrincipal) * 100
							: 0;
				}
			}

			// Separate other accounts into locked and unlocked
			const lockedOthers = otherAccounts.filter((a) => a.isLocked);
			const unlockedOthers = otherAccounts.filter((a) => !a.isLocked);

			const lockedPrincipalSum = lockedOthers.reduce((sum, a) => sum + (Number(a.principal) || 0), 0);
			const lockedShareSum = lockedOthers.reduce((sum, a) => sum + (Number(a.share) || 0), 0);

			// Cap target if it exceeds available headroom remaining from locked accounts
			if (lockedOthers.length > 0) {
				const maxAllowedPrincipal = Math.max(0, totalFacilityPrincipal - lockedPrincipalSum);
				if (newTargetPrincipal > maxAllowedPrincipal) {
					newTargetPrincipal = maxAllowedPrincipal;
					newTargetShare = totalFacilityPrincipal > 0
						? (newTargetPrincipal / totalFacilityPrincipal) * 100
						: 0;
				}
			}

			// Remaining share and principal to be allocated to the unlocked accounts
			const remainingShare = Math.max(0, 100 - newTargetShare - lockedShareSum);
			const remainingPrincipal = Math.max(0, totalFacilityPrincipal - newTargetPrincipal - lockedPrincipalSum);

			// Distribute remainingShare & remainingPrincipal across unlockedOthers
			let unlockedAllocations = [];

			if (unlockedOthers.length === 1) {
				unlockedAllocations = [
					{
						id: unlockedOthers[0].id,
						share: remainingShare,
						principal: remainingPrincipal,
					},
				];
			} else if (unlockedOthers.length > 1) {
				// Multiple remaining unlocked accounts: distribute proportionally based on previous shares
				const prevUnlockedShares = unlockedOthers.map((a) => Math.max(0, parseFloat(a.share) || 0));
				const prevUnlockedShareSum = prevUnlockedShares.reduce((s, v) => s + v, 0);

				let allocatedShareSum = 0;
				let allocatedPrincipalSum = 0;

				unlockedAllocations = unlockedOthers.map((acc, idx) => {
					const isLast = idx === unlockedOthers.length - 1;
					if (isLast) {
						const finalShare = Math.max(0, remainingShare - allocatedShareSum);
						const finalPrincipal = Math.max(0, remainingPrincipal - allocatedPrincipalSum);
						return {
							id: acc.id,
							share: finalShare,
							principal: finalPrincipal,
						};
					}

					let shareWeight;
					if (prevUnlockedShareSum > 0) {
						shareWeight = prevUnlockedShares[idx] / prevUnlockedShareSum;
					} else {
						shareWeight = 1 / unlockedOthers.length;
					}

					const accShare = Math.max(0, remainingShare * shareWeight);
					const accPrincipal = Math.max(0, Math.round(remainingPrincipal * shareWeight));

					allocatedShareSum += accShare;
					allocatedPrincipalSum += accPrincipal;

					return {
						id: acc.id,
						share: accShare,
						principal: accPrincipal,
					};
				});
			}

			// Map back over prev to preserve order and update all accounts
			const unlockedAllocMap = new Map(unlockedAllocations.map((item) => [item.id, item]));

			const updatedList = prev.map((acc) => {
				if (acc.id === id) {
					// Target account: do NOT auto-lock; user manually clicks lock icon
					const tShare = isShareInputEmpty
						? ''
						: (String(value).endsWith('.') || String(value).match(/\.\d*0$/) ? value : newTargetShare);
					const tPrincipal = isPrincipalInputEmpty ? '' : newTargetPrincipal;
					return {
						...calcFinancials(acc, tPrincipal, tShare),
						isLocked: false,
					};
				}

				// If it is in the unlocked allocations list, update its amount & share
				const alloc = unlockedAllocMap.get(acc.id);
				if (alloc) {
					return {
						...calcFinancials(acc, alloc.principal, alloc.share),
						isLocked: Boolean(acc.isLocked),
					};
				}

				// If it was locked, keep it completely unchanged!
				return acc;
			});

			if (facilityTotalInterest > 0) {
				const currentTotalShare = updatedList.reduce((sum, a) => sum + (Number(a.share) || 0), 0);
				if (Math.abs(currentTotalShare - 100) < 0.05) {
					// Ensure interest sums to EXACTLY facilityTotalInterest with zero rounding discrepancy
					const currentInterestSum = updatedList.reduce((sum, a) => sum + (Number(a.interest) || 0), 0);
					const intDiff = facilityTotalInterest - currentInterestSum;
					if (intDiff !== 0) {
						const adjustTarget = updatedList.find((a) => !a.isLocked) || updatedList[0];
						if (adjustTarget) {
							return updatedList.map((a) => {
								if (a.id === adjustTarget.id) {
									const adjustedInt = Math.max(0, (Number(a.interest) || 0) + intDiff);
									const p = Number(a.principal) || 0;
									return {
										...a,
										interest: adjustedInt,
										repayAmount: p + adjustedInt,
										tds: !a.isPrimary ? Math.round(adjustedInt * 0.1) : 0,
									};
								}
								return a;
							});
						}
					}
				}
			}

			return updatedList;
		});
	};

	function renderHistoryTab() {
		// Filter history items from clean recent-first history
		const filteredHistory = cleanLoanHistory.filter((item) => {
			if (historyFilter === 'approvals') {
				if (item.type !== 'sec_manager_approval' && item.type !== 'admin_approval') return false;
			} else if (historyFilter === 'recd') {
				if (item.type !== 'recd_date_update') return false;
			} else if (historyFilter === 'payout') {
				if (item.type !== 'payout_date_update') return false;
			} else if (historyFilter === 'created') {
				if (item.type !== 'loan_created') return false;
			}

			if (historySearch.trim()) {
				const q = historySearch.toLowerCase();
				const matchTitle = (item.title || '').toLowerCase().includes(q);
				const matchDesc = (item.description || '').toLowerCase().includes(q);
				const matchUser = (item.userName || '').toLowerCase().includes(q);
				const matchEmi = item.emiNo !== undefined && String(item.emiNo).toLowerCase().includes(q);
				const matchDate = (item.timestamp || '').toLowerCase().includes(q);
				if (!matchTitle && !matchDesc && !matchUser && !matchEmi && !matchDate) return false;
			}
			return true;
		});

		const approvalCount = cleanLoanHistory.filter((h) => h.type === 'sec_manager_approval' || h.type === 'admin_approval').length;
		const recdCount = cleanLoanHistory.filter((h) => h.type === 'recd_date_update').length;
		const payoutCount = cleanLoanHistory.filter((h) => h.type === 'payout_date_update').length;
		const createdCount = cleanLoanHistory.filter((h) => h.type === 'loan_created').length;

		// Summary Milestone info
		const creationItem = cleanLoanHistory.find((h) => h.type === 'loan_created') || {
			timestamp: loan.requested_at || loan.loan_date || 'N/A',
			userName: loan.requester_name || 'System Officer',
		};

		const secApprovalItems = cleanLoanHistory.filter((h) => h.type === 'sec_manager_approval');
		const isSecApproved = secApprovalItems.length > 0 || loan.approval_status === 'APPROVED' || loan.approval_status === 'VERIFIED' || loan.status === 'Active';

		const adminApprovalItem = cleanLoanHistory.find((h) => h.type === 'admin_approval');
		const isAdminApproved = Boolean(adminApprovalItem) || loan.approval_status === 'APPROVED' || loan.status === 'Active';

		// Can current user approve?
		// Secondary approval is ONLY for the secondary account primary manager (NEVER for admin)
		const canSecApprove = isUserSecManager && !userPerms?.isAdmin && !isSecApproved;
		// Final approval is sent to System Admin after secondary approval
		const canAdminApprove = userPerms?.isAdmin && isSecApproved && !isAdminApproved;

		return (
			<div className="flex flex-col gap-6 font-sans">

				{/* Main Audit History Panel */}
				<div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col">
					{/* Header with Title, Search & Filter Chips */}
					<div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
						<div>
							<h3 className="flex items-center gap-2">
								<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary text-[20px]">
									<span className="material-symbols-outlined">
										history
									</span>
								</div>
								<div>
									<span className="font-extrabold text-[17px] text-slate-900">Loan Lifecycle &amp; Servicing History</span>
									<p className="text-[12px] text-slate-500 mt-0.5">
										Detailed audit log of loan creation, approval checkpoints, and individual EMI received &amp; payout date updates.
									</p>
								</div>
							</h3>
						</div>

						{/* Action Buttons: Super Admin Select/Delete, Add Note & Approvals */}
						<div className="flex items-center gap-2 flex-wrap">

							{canSecApprove && (
								<button
									type="button"
									disabled={isSubmittingApproval}
									onClick={handleSecondaryManagerApprove}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[12px] shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
								>
									<span className="material-symbols-outlined text-[16px]">verified</span>
									<span>{isSubmittingApproval ? 'Approving...' : 'Approve as Sec. Manager'}</span>
								</button>
							)}

							{canAdminApprove && (
								<button
									type="button"
									onClick={handleAdminApprove}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] shadow-2xs transition-all active:scale-95 cursor-pointer"
								>
									<span className="material-symbols-outlined text-[16px]">shield_person</span>
									<span>Admin Final Approval</span>
								</button>
							)}
						</div>
					</div>

					{/* Filter & Search Bar */}
					<div className="px-6 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						{/* Category Filter Chips */}
						<div className="flex items-center gap-1.5 flex-wrap">
							<button
								type="button"
								onClick={() => setHistoryFilter('ALL')}
								className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${historyFilter === 'ALL'
									? 'bg-primary text-white shadow-2xs'
									: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
									}`}
							>
								All Events ({cleanLoanHistory.length})
							</button>
							<button
								type="button"
								onClick={() => setHistoryFilter('approvals')}
								className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${historyFilter === 'approvals'
									? 'bg-primary text-white shadow-2xs'
									: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
									}`}
							>
								Approvals ({approvalCount})
							</button>
							<button
								type="button"
								onClick={() => setHistoryFilter('recd')}
								className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${historyFilter === 'recd'
									? 'bg-primary text-white shadow-2xs'
									: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
									}`}
							>
								Received Dates ({recdCount})
							</button>
							<button
								type="button"
								onClick={() => setHistoryFilter('payout')}
								className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${historyFilter === 'payout'
									? 'bg-primary text-white shadow-2xs'
									: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
									}`}
							>
								Payout Dates ({payoutCount})
							</button>
							<button
								type="button"
								onClick={() => setHistoryFilter('created')}
								className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${historyFilter === 'created'
									? 'bg-primary text-white shadow-2xs'
									: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
									}`}
							>
								Creation ({createdCount})
							</button>
						</div>

						{/* Search Input */}
						<div className="relative min-w-[260px]">
							<span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
								search
							</span>
							<input
								type="text"
								value={historySearch}
								onChange={(e) => setHistorySearch(e.target.value)}
								placeholder="Search history, EMI #, user..."
								className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[12px] outline-none focus:border-primary transition-all font-medium"
							/>
							{historySearch && (
								<button
									type="button"
									onClick={() => setHistorySearch('')}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
								>
									<span className="material-symbols-outlined text-[15px]">close</span>
								</button>
							)}
						</div>
					</div>

					{/* Super Admin Bulk Selection Strip */}
					{isSystemAdmin && (
						<div className="px-6 py-2.5 bg-rose-50/70 border-b border-rose-200/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
							<div className="flex items-center gap-3">
								<label className="flex items-center gap-2 cursor-pointer select-none text-[12.5px] font-bold text-slate-800">
									<input
										type="checkbox"
										className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer accent-rose-600"
										checked={filteredHistory.length > 0 && filteredHistory.every((item) => selectedHistoryIds.has(item.id))}
										onChange={(e) => {
											if (e.target.checked) {
												handleSelectAllHistory(filteredHistory);
											} else {
												handleClearHistorySelection();
											}
										}}
									/>
									<span>Select All in this View ({filteredHistory.length})</span>
								</label>
								{selectedHistoryIds.size > 0 && (
									<span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-200/90 text-rose-800">
										{selectedHistoryIds.size} selected
									</span>
								)}
							</div>
							<div className="flex items-center gap-2">
								{selectedHistoryIds.size > 0 && (
									<>
										<button
											type="button"
											onClick={handleClearHistorySelection}
											className="px-2.5 py-1 text-[11.5px] font-bold text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
										>
											Deselect All
										</button>
										<button
											type="button"
											onClick={handlePromptDeleteSelectedHistory}
											className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] shadow-xs transition-all active:scale-95 cursor-pointer"
										>
											<span className="material-symbols-outlined text-[15px]">delete_sweep</span>
											<span>Delete ({selectedHistoryIds.size}) Records</span>
										</button>
									</>
								)}
							</div>
						</div>
					)}

					{/* Recent-First Audit Timeline List */}
					<div className="p-6">
						{filteredHistory.length === 0 ? (
							<div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
								<div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
									<span className="material-symbols-outlined text-[24px]">history_toggle_off</span>
								</div>
								<h4 className="text-[14px] font-extrabold text-slate-700">No History Records Found</h4>
								<p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
									{historySearch
										? `No history events match your search term "${historySearch}".`
										: 'No events registered under the selected filter criteria.'}
								</p>
								{(historySearch || historyFilter !== 'ALL') && (
									<button
										type="button"
										onClick={() => {
											setHistorySearch('');
											setHistoryFilter('ALL');
										}}
										className="mt-3 text-[12px] font-bold text-primary hover:underline cursor-pointer"
									>
										Reset filters
									</button>
								)}
							</div>
						) : (
							<div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
								{filteredHistory.map((item, idx) => {
									const isCreated = item.type === 'loan_created';
									const isSecApprove = item.type === 'sec_manager_approval';
									const isAdminApprove = item.type === 'admin_approval';
									const isRecd = item.type === 'recd_date_update';
									const isPayout = item.type === 'payout_date_update';

									let nodeBg = 'bg-slate-100 text-slate-600 border-slate-200';
									let icon = 'info';
									let tagBg = 'bg-slate-100 text-slate-700 ring-slate-200';
									let tagLabel = 'Event';

									if (isCreated) {
										nodeBg = 'bg-purple-100 text-purple-700 border-purple-300';
										icon = 'add_circle';
										tagBg = 'bg-purple-50 text-purple-700 ring-purple-200';
										tagLabel = 'Loan Creation';
									} else if (isSecApprove) {
										nodeBg = 'bg-amber-100 text-amber-700 border-amber-300';
										icon = 'verified';
										tagBg = 'bg-amber-50 text-amber-700 ring-amber-200';
										tagLabel = 'Sec. Manager Approved';
									} else if (isAdminApprove) {
										nodeBg = 'bg-emerald-100 text-emerald-700 border-emerald-300';
										icon = 'shield_person';
										tagBg = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
										tagLabel = 'Admin Approved';
									} else if (isRecd) {
										nodeBg = 'bg-emerald-100 text-emerald-700 border-emerald-300';
										icon = 'event_available';
										tagBg = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
										tagLabel = 'Received Date';
									} else if (isPayout) {
										nodeBg = 'bg-blue-100 text-blue-700 border-blue-300';
										icon = 'payments';
										tagBg = 'bg-blue-50 text-blue-700 ring-blue-200';
										tagLabel = 'Payout Date';
									}

									const isItemSelected = selectedHistoryIds.has(item.id);

									return (
										<div key={item.id || idx} className="relative group">
											{/* Timeline Dot/Icon */}
											<div
												className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 bg-white shadow-2xs group-hover:scale-110 transition-transform ${nodeBg}`}
											>
												<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>{icon}</span>
											</div>

											{/* Event Content Box */}
											<div
												className={`border rounded-2xl p-4 transition-all hover:shadow-xs ${
													isItemSelected
														? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-200/70 shadow-xs'
														: 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/80'
												}`}
											>
												<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
													{/* Title, Checkbox, Badge & EMI Tag */}
													<div className="flex items-center gap-2 flex-wrap">
														{isSystemAdmin && (
															<input
																type="checkbox"
																checked={isItemSelected}
																onChange={() => handleToggleSelectHistoryItem(item.id)}
																className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer accent-rose-600 mr-1"
																title={isItemSelected ? 'Deselect item' : 'Select item'}
															/>
														)}
														<span className={`text-[10.5px] uppercase font-extrabold px-2.5 py-0.5 rounded-full ring-1 ${tagBg}`}>
															{tagLabel}
														</span>
														{item.emiNo !== undefined && item.emiNo !== null && (
															<span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-black bg-slate-900 text-white shadow-2xs">
																EMI #{item.emiNo}
															</span>
														)}
														<h4 className="font-extrabold text-[13.5px] text-slate-900">
															{item.title}
														</h4>
													</div>

													{/* Timestamp & Actions */}
													<div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
														<div className="flex items-center gap-1 font-mono text-[11.5px] font-bold text-slate-500 bg-white px-2.5 py-1 rounded-xl border border-slate-200/80 shadow-3xs">
															<span className="material-symbols-outlined text-slate-400" style={{ fontSize: "15px" }}>
																schedule
															</span>
															<span>{item.timestamp}</span>
														</div>

														{isSystemAdmin && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	handlePromptDeleteSingleHistory(item);
																}}
																title="Delete this history entry"
																className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 transition-all cursor-pointer shadow-3xs group/del"
															>
																<span className="material-symbols-outlined text-[16px] group-hover/del:scale-110 transition-transform">
																	delete
																</span>
															</button>
														)}
													</div>
												</div>

												{/* Description */}
												<p className="text-[12.5px] text-slate-700 mt-2 font-medium leading-relaxed">
													{item.description}
												</p>

												{/* Performed by Footer */}
												<div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
													<div className="flex items-center gap-2">
														<span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-[10px] ring-1 ring-primary/20">
															{(item.userName || 'U')[0].toUpperCase()}
														</span>
														<span className="font-bold text-slate-800">
															{item.userName || 'Staff Officer'}
														</span>
													</div>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>

				{/* Add Manual Audit Note Modal */}
				{isAddNoteModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
						<div
							className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center justify-between pb-3 border-b border-slate-100">
								<h3 className="font-extrabold text-[16px] text-slate-900 flex items-center gap-2">
									<span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
									<span>Add Servicing Audit Note</span>
								</h3>
								<button
									type="button"
									onClick={() => setIsAddNoteModalOpen(false)}
									className="text-slate-400 hover:text-slate-600 p-1"
								>
									<span className="material-symbols-outlined text-[18px]">close</span>
								</button>
							</div>

							<div className="space-y-4 mt-4">
								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Link to EMI Number (Optional)
									</label>
									<select
										value={noteEmiNo}
										onChange={(e) => setNoteEmiNo(e.target.value)}
										className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[12.5px] outline-none font-bold"
									>
										<option value="">General Loan Lifecycle (No specific EMI)</option>
										{(allScheduleItems || []).map((sch) => (
											<option key={sch.sNo} value={sch.sNo}>
												EMI #{sch.sNo} - Due: {sch.date} ({formatCurrency(sch.amount)})
											</option>
										))}
									</select>
								</div>

								<div>
									<label className="block text-[12px] font-bold text-slate-700 mb-1">
										Audit Note / Comment <span className="text-rose-500">*</span>
									</label>
									<textarea
										rows={4}
										value={noteText}
										onChange={(e) => setNoteText(e.target.value)}
										placeholder="e.g., Client confirmed cheque deposit via Axis Bank RTGS; payout to secondary partner approved for Monday."
										className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-primary transition-all font-medium resize-none"
									/>
								</div>
							</div>

							<div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
								<button
									type="button"
									onClick={() => {
										setIsAddNoteModalOpen(false);
										setNoteText('');
										setNoteEmiNo('');
									}}
									className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
								>
									Cancel
								</button>
								<button
									type="button"
									disabled={!noteText.trim()}
									onClick={() => {
										handleAddAuditNote(noteText, noteEmiNo);
										setIsAddNoteModalOpen(false);
										setNoteText('');
										setNoteEmiNo('');
									}}
									className="px-4 py-2 rounded-xl text-[12.5px] font-bold bg-primary text-white hover:bg-primary/95 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
								>
									Save to History
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Super Admin Delete History Confirmation Modal */}
				{historyDeleteModal.isOpen && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in duration-200"
						onClick={() => {
							if (!historyDeleteModal.isDeleting) {
								setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false });
							}
						}}
					>
						<div
							className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200 my-auto"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-start gap-3 pb-3 border-b border-slate-100">
								<div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
									<span className="material-symbols-outlined text-[22px]">delete_forever</span>
								</div>
								<div className="flex-1 min-w-0">
									<h3 className="font-extrabold text-[16px] text-slate-900 leading-snug">
										{historyDeleteModal.itemIds.length === 1
											? 'Delete History Record'
											: `Delete ${historyDeleteModal.itemIds.length} History Records`}
									</h3>
									<p className="text-[12px] text-slate-500 mt-0.5">
										Super Admin History Management
									</p>
								</div>
								<button
									type="button"
									disabled={historyDeleteModal.isDeleting}
									onClick={() => setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false })}
									className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 p-1 cursor-pointer hover:bg-slate-100 rounded-xl disabled:opacity-50"
								>
									<span className="material-symbols-outlined text-[18px]">close</span>
								</button>
							</div>

							<div className="mt-4 space-y-3">
								<p className="text-[13px] text-slate-600 leading-relaxed font-medium">
									Are you sure you want to permanently delete{' '}
									<strong className="text-slate-900 font-bold">
										{historyDeleteModal.itemIds.length === 1
											? 'this history entry'
											: `these ${historyDeleteModal.itemIds.length} history entries`}
									</strong>{' '}
									from this loan facility?
								</p>

								{/* Items Preview */}
								<div className="max-h-48 overflow-y-auto space-y-2 p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
									{historyDeleteModal.items.slice(0, 5).map((item, i) => (
										<div key={item.id || i} className="p-2 bg-white rounded-lg border border-slate-200/70 text-[11.5px]">
											<div className="flex items-center justify-between gap-2">
												<span className="font-bold text-slate-800 truncate">{item.title}</span>
												{item.emiNo != null && (
													<span className="px-1.5 py-0.2 font-mono text-[10px] font-black bg-slate-900 text-white rounded">
														EMI #{item.emiNo}
													</span>
												)}
											</div>
											<div className="flex items-center justify-between gap-2 mt-1 text-[10.5px] text-slate-400">
												<span>{item.userName || 'Officer'}</span>
												<span>{item.timestamp}</span>
											</div>
										</div>
									))}
									{historyDeleteModal.items.length > 5 && (
										<p className="text-[11px] text-slate-400 text-center font-bold pt-1">
											+ {historyDeleteModal.items.length - 5} more entries
										</p>
									)}
								</div>
							</div>

							<div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
								<button
									type="button"
									disabled={historyDeleteModal.isDeleting}
									onClick={() => setHistoryDeleteModal({ isOpen: false, itemIds: [], items: [], isDeleting: false })}
									className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
								>
									Cancel
								</button>
								<button
									type="button"
									disabled={historyDeleteModal.isDeleting}
									onClick={handleConfirmDeleteHistory}
									className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
								>
									{historyDeleteModal.isDeleting ? (
										<>
											<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
											<span>Deleting...</span>
										</>
									) : (
										<>
											<span className="material-symbols-outlined text-[16px]">delete</span>
											<span>Confirm Delete</span>
										</>
									)}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	// Render Penal Interest Tab
	function renderPenalInterestTab() {
		return (
			<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col font-sans">
				{/* Top Header & Action Strip */}
				<div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
					<div>
						<h3 className="flex items-center gap-2">
							<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary text-[20px]">
								<span className="material-symbols-outlined">
									percent
								</span>
							</div>
							<div>
								<span className="font-extrabold text-[17px] text-slate-900">Penal Interest</span>
								<p className="text-[12px] text-slate-500 mt-0.5">
									Track delay penalties, default interest charges, and penalty fee records for this joint loan facility.
								</p>
							</div>
						</h3>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleOpenAddPenalModal}
							className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-[12.5px] font-bold shadow-xs hover:bg-primary/90 transition-all cursor-pointer active:scale-95"
						>
							<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
								add_circle
							</span>
							<span>Add New</span>
						</button>
					</div>
				</div>

				{/* Table or Empty State */}
				{penalInterestList.length === 0 ? (
					<div className="py-20 px-6 text-center flex flex-col items-center justify-center bg-white">
						<h4 className="text-[16px] font-extrabold text-slate-900">No Penal Interest Recorded</h4>
						<p className="text-[12.5px] text-slate-500 max-w-sm mt-1 mb-5">
							No penal interest entries have been added for this loan facility yet. Click the button below to add your first record.
						</p>
						<button
							type="button"
							onClick={handleOpenAddPenalModal}
							className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-[13px] font-bold shadow-xs transition-all cursor-pointer active:scale-95"
						>
							<span className="material-symbols-outlined text-[18px]">add_circle</span>
							<span>Add New</span>
						</button>
					</div>
				) : (
					<div className="overflow-x-auto min-h-[380px]">
						<table className="w-full text-left border-collapse min-w-[780px]">
							<thead>
								<tr className="border-b border-slate-200/80 bg-surface-container-low/60 text-slate-600 font-bold text-[11.5px] uppercase tracking-wider">
									<th className="py-3 px-3 w-14 text-left">#</th>
									<th className="py-3 px-3.5 min-w-[110px]">Date</th>
									<th className="py-3 px-3.5 text-right min-w-[120px]">Amount</th>
									<th className="py-3 px-3.5 text-right min-w-[120px]">{primaryTag}</th>
									<th className="py-3 px-3.5 text-center min-w-[125px]">Payout Date</th>
									{effectiveSecAccounts.map((sa, idx) => {
										const tag = sa.accountTag || sa.initials || `SEC${idx + 1}`;
										return (
											<th key={`penal-hdr-${tag}`} className="py-3 px-3.5 text-right min-w-[120px]">
												{tag}
											</th>
										);
									})}
									<th className="py-3 px-3.5 min-w-[180px]">Remarks</th>
									<th className="py-3 px-3 w-16 text-center">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 text-[13px]">
								{penalInterestList.map((item, idx) => {
									const priAmt = item.primaryAmount != null
										? Number(item.primaryAmount)
										: Math.round(((Number(item.amount) || 0) * Number(primarySharePercent)) / 100);

									const itemPayoutDate = item.payoutDate || item.dueDate || (item.secondaryAccounts?.[0]?.payoutDate) || '';

									return (
										<tr
											key={item.id || idx}
											className="hover:bg-surface-container-low/40 transition-colors group"
										>
											{/* S.No */}
											<td className="py-3 px-3 text-left font-bold text-slate-500 font-mono text-[12px] whitespace-nowrap w-14">
												{idx + 1}
											</td>

											{/* Date */}
											<td className="py-3 px-3.5 font-semibold text-slate-800 text-[12.5px] whitespace-nowrap">
												{item.date}
											</td>

											{/* Total Amount */}
											<td className="py-3 px-3.5 text-right font-black text-[13px] text-slate-900 whitespace-nowrap">
												{formatCurrency(item.amount)}
											</td>

											{/* Primary Share Amount */}
											<td className="py-3 px-3.5 text-right font-black text-[13px] text-blue-900 whitespace-nowrap">
												{formatCurrency(priAmt)}
											</td>

											{/* Payout Date (Secondary Account) */}
											<td className="py-3 px-3.5 text-center whitespace-nowrap font-semibold text-slate-800 text-[12.5px]">
												{itemPayoutDate ? (
													<span>{itemPayoutDate}</span>
												) : (
													<span className="text-slate-400 text-[13px] font-medium select-none">-</span>
												)}
											</td>

											{/* Secondary Share Amounts */}
											{effectiveSecAccounts.map((sa, sIdx) => {
												let secAmt = 0;
												if (item.secAmounts && item.secAmounts[sIdx] != null) {
													secAmt = Number(item.secAmounts[sIdx]) || 0;
												} else if (sIdx === 0 && item.secAmount != null) {
													secAmt = Number(item.secAmount) || 0;
												} else {
													const sPct = Number(secondarySharePercents[sIdx]) || (100 - Number(primarySharePercent));
													secAmt = Math.round(((Number(item.amount) || 0) * sPct) / 100);
												}
												const purpleShades = ['text-purple-900', 'text-violet-900', 'text-fuchsia-900'];
												const shade = purpleShades[sIdx % purpleShades.length];
												return (
													<td key={`penal-sec-${item.id || idx}-${sIdx}`} className={`py-3 px-3.5 text-right font-black text-[13px] ${shade} whitespace-nowrap`}>
														{formatCurrency(secAmt)}
													</td>
												);
											})}

											{/* Remarks */}
											<td className="py-3 px-3.5 text-slate-700 text-[12.5px] max-w-[220px]">
												{item.remarks ? (
													<span
														className="font-semibold text-slate-800 text-[12.5px] truncate block"
														title={item.remarks}
													>
														{item.remarks}
													</span>
												) : (
													<span className="text-slate-400 text-[13px] font-medium select-none">-</span>
												)}
											</td>

											{/* Action */}
											<td className="py-3 px-3 text-center whitespace-nowrap">
												<button
													type="button"
													onClick={() => setPenalDeleteTarget(item)}
													className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
													title="Delete penal interest entry"
												>
													<span className="material-symbols-outlined text-[17px]">delete</span>
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>

							{/* Summary Totals Row: Total */}
							<tfoot>
								<tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-[12.5px] text-slate-800">
									<td className="py-3.5 px-3 text-left text-slate-500 font-extrabold text-[12px]">
										Σ
									</td>
									<td className="py-3.5 px-3.5 font-extrabold text-slate-900 text-[12px] whitespace-nowrap">
										Total
									</td>
									<td className="py-3.5 px-3.5 text-right font-black text-[13.5px] text-slate-900 whitespace-nowrap">
										{formatCurrency(totalPenalAmount)}
									</td>
									<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-blue-900 whitespace-nowrap">
										{formatCurrency(totalPenalPriAmount)}
									</td>
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									{effectiveSecAccounts.map((_, sIdx) => {
										const purpleShades = ['text-purple-900', 'text-violet-900', 'text-fuchsia-900'];
										const shade = purpleShades[sIdx % purpleShades.length];
										return (
											<td key={`penal-foot-sec-${sIdx}`} className={`py-3.5 px-3.5 text-right font-black text-[13px] ${shade} whitespace-nowrap`}>
												{formatCurrency(totalPenalSecAmounts[sIdx] || 0)}
											</td>
										);
									})}
									<td className="py-3.5 px-3.5 text-slate-500 text-[12px] font-bold" colSpan={2}></td>
								</tr>
							</tfoot>
						</table>
					</div>
				)}
			</div>
		);
	}

	if (!hasAccess) {
		const secAccounts = getLoanSecondaryAccounts(loan);
		const assignedSecUsers = getUsersWithPrimaryAccessForLoanSecondary(loan, usersList, availableAccountObjects);
		const assignedNames = assignedSecUsers.map((u) => u.name || u.username).join(', ');

		return (
			<div className="flex flex-col w-full max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl shadow-xl border border-slate-200/80 text-center animate-in zoom-in-95">
				<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shadow-inner">
					<span className="material-symbols-outlined text-[34px]">lock</span>
				</div>
				<span className="inline-block self-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 mb-2">
					Approval In Progress
				</span>
				<h2 className="text-2xl font-black text-slate-900 tracking-tight">
					Access Restricted: Pending Authorization
				</h2>
				<p className="text-slate-600 text-[13.5px] mt-2 max-w-lg mx-auto leading-relaxed">
					This joint loan facility is currently undergoing mandatory multi-stage approval. Before final approval, access is strictly limited to designated approval authorities.
				</p>

				<div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left max-w-md mx-auto space-y-2 text-[13px]">
					<div className="flex justify-between">
						<span className="text-slate-500 font-semibold">Loan ID:</span>
						<span className="font-mono font-bold text-slate-800">{loan.id}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-slate-500 font-semibold">Current Stage:</span>
						<span className="font-bold text-amber-600">
							{isPendingSecondary ? 'Pending Secondary Manager Approval' : isPendingAdmin ? 'Pending Admin Final Approval' : loan.approval_status || 'Under Review'}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-slate-500 font-semibold">Secondary Account(s):</span>
						<span className="font-bold text-slate-800">{secAccounts.join(', ') || 'N/A'}</span>
					</div>
					{isPendingSecondary && assignedNames && (
						<div className="flex justify-between">
							<span className="text-slate-500 font-semibold">Authorized Approver:</span>
							<span className="font-bold text-primary">{assignedNames}</span>
						</div>
					)}
				</div>

				<div className="mt-8">
					<button
						type="button"
						onClick={onBack}
						className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-[13px] shadow-md hover:bg-primary/95 transition-all cursor-pointer"
					>
						<span className="material-symbols-outlined text-[18px]">arrow_back</span>
						<span>Back to Joint Loans</span>
					</button>
				</div>
			</div>
		);
	}

	// Export loan details, account allocations, and repayment schedule to Excel (.xlsx)
	const handleExportExcel = useCallback(() => {
		try {
			const filename = exportJointLoanToExcel(loan, accounts, repaymentSchedule);
			if (filename) {
				if (exportNotificationTimerRef.current) {
					clearTimeout(exportNotificationTimerRef.current);
				}
				setExportNotification(filename);
				exportNotificationTimerRef.current = setTimeout(() => {
					setExportNotification(null);
					exportNotificationTimerRef.current = null;
				}, 5000);
			}
		} catch (err) {
			console.error('Failed to export joint loan schedule to Excel:', err);
			alert('Failed to export Excel file. Please try again.');
		}
	}, [loan, accounts, repaymentSchedule]);

	const badge = getStatusBadge(currentStatus);

	return (
		<div className="flex flex-col w-full gap-space-lg font-sans">
			{/* Top Navigation & Breadcrumbs */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
				{/* Breadcrumb: Joint Loan / Client Name with Loan ID tag */}
				<nav className="flex items-center gap-2 text-[13px] font-medium flex-wrap" aria-label="Breadcrumb">
					<button
						type="button"
						onClick={onBack}
						className="text-slate-500 hover:text-primary font-semibold transition-colors cursor-pointer hover:underline"
					>
						Joint Loan
					</button>
					<span className="text-slate-300 font-normal">/</span>
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-bold text-[14px] text-slate-900">
							{loan.primaryBorrower?.name || 'Client'}
						</span>
						<span className="font-extrabold text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-md ring-1 ring-primary/20 tracking-tight">
							{loan.id}
						</span>
						<span
							className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.color}`}
						>
							<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
							<span>{currentStatus}</span>
						</span>
						{isSecondaryLoan && (
							<span className="font-bold text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md ring-1 ring-amber-200 flex items-center gap-1">
								<span className="material-symbols-outlined" style={{ fontSize: "14px" }}>lock</span>
								<span>Secondary Account View</span>
							</span>
						)}
					</div>
				</nav>

				{/* Quick Actions */}
				<div className="flex items-center gap-2">
					{saveFeedback && (
						<span className="text-[12px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl ring-1 ring-emerald-200 flex items-center gap-1 transition-all">
							<span className="material-symbols-outlined text-[16px]">check_circle</span>
							{saveFeedback}
						</span>
					)}

					<button
						type="button"
						onClick={handleExportExcel}
						title="Export repayment schedule to Excel (.xlsx)"
						className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-[12.5px] shadow-sm transition-all bg-primary-container hover:bg-primary text-on-primary active:scale-95 cursor-pointer"
					>
						<span className="material-symbols-outlined text-[16px]">download</span>
						<span>Export</span>
					</button>

					{onDeleteLoan && (
						<button
							type="button"
							disabled={isSecondaryLoan}
							onClick={() => {
								if (!isSecondaryLoan) {
									onDeleteLoan(loan);
								}
							}}
							className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-[12.5px] shadow-2xs transition-all ${isSecondaryLoan
								? 'border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed opacity-60'
								: 'border-rose-200 text-rose-600 hover:bg-rose-50 active:scale-95 cursor-pointer'
								}`}
							title={isSecondaryLoan ? 'Delete is disabled for secondary account loans' : 'Delete loan'}
						>
							<span className="material-symbols-outlined text-[16px]">delete</span>
							<span>Delete</span>
						</button>
					)}
				</div>
			</div>

			{/* Multi-Stage Approval Workflow Action Banner */}
			{!isFinallyApproved && (isPendingSecondary || isPendingAdmin || isRejected) && (
				<div className={`p-4 sm:p-5 rounded-2xl border shadow-sm transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${isRejected
					? 'bg-rose-50/90 border-rose-200 text-rose-950'
					: isPendingSecondary
						? 'bg-amber-50/90 border-amber-200/90 text-amber-950'
						: 'bg-emerald-50/90 border-emerald-200/90 text-emerald-950'
					}`}>
					<div className="flex items-start gap-3.5">
						<div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${isRejected
							? 'bg-rose-500 text-white'
							: isPendingSecondary
								? 'bg-amber-500 text-white'
								: 'bg-emerald-600 text-white'
							}`}>
							<span className="material-symbols-outlined text-[22px]">
								{isRejected ? 'cancel' : isPendingSecondary ? 'verified' : 'shield_person'}
							</span>
						</div>
						<div>
							<div className="flex items-center gap-2 flex-wrap">
								<span className={`text-[11px] uppercase font-black px-2 py-0.5 rounded-md ${isRejected
									? 'bg-rose-200 text-rose-800'
									: isPendingSecondary
										? 'bg-amber-200 text-amber-900'
										: 'bg-emerald-200 text-emerald-900'
									}`}>
									{isRejected ? 'Rejected' : isPendingSecondary ? 'Stage 1: Secondary Review' : 'Stage 2: Final Admin Review'}
								</span>
								<h4 className="font-extrabold text-[15px]">
									{isRejected
										? 'Joint Facility Application Rejected'
										: isPendingSecondary
											? `Pending Secondary Account Approval (${getLoanSecondaryAccounts(loan).join(', ') || 'Secondary Partner'})`
											: 'Pending Final Authorization by Administrator'}
								</h4>
							</div>
							<p className="text-[12.5px] mt-1 leading-relaxed opacity-90">
								{isRejected ? (
									<span>Reason: {loan.rejection_reason || 'Facility was declined by reviewer.'}</span>
								) : isPendingSecondary ? (
									<span>
										{isUserSecManager && !userPerms?.isAdmin
											? 'You have primary access for this loan\'s secondary account. Please verify loan allocations, interest terms, and provide your approval to advance to Administrator.'
											: userPerms?.isAdmin
												? `This facility is currently awaiting Stage 1 Secondary Approval from the primary manager for ${getLoanSecondaryAccounts(loan).join(', ') || 'Secondary Partner'}. Secondary approval must be completed by the secondary manager before final approval is sent to System Admin.`
												: 'Awaiting review and approval from the designated secondary account primary manager.'}
									</span>
								) : (
									<span>
										{userPerms?.isAdmin
											? `Secondary approval verified by ${loan.verified_by || 'Secondary Manager'}. Please perform final authorization to unlock full operational loan servicing.`
											: `Secondary verification approved by ${loan.verified_by || 'you'}. Now waiting for Administrator to grant final activation.`}
									</span>
								)}
							</p>
						</div>
					</div>

					{/* Action Buttons */}
					{!isRejected && (
						<div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
							{isPendingSecondary && isUserSecManager && !userPerms?.isAdmin && (
								<>
									<button
										type="button"
										disabled={isSubmittingApproval}
										onClick={handleSecondaryManagerApprove}
										className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[12.5px] shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
									>
										<span className="material-symbols-outlined text-[17px]">verified</span>
										<span>{isSubmittingApproval ? 'Approving...' : 'Approve as Sec. Manager'}</span>
									</button>
									<button
										type="button"
										disabled={isSubmittingApproval}
										onClick={() => setIsRejectModalOpen(true)}
										className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-bold text-[12.5px] shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
									>
										<span className="material-symbols-outlined text-[17px]">close</span>
										<span>Reject</span>
									</button>
								</>
							)}

							{isPendingAdmin && userPerms.isAdmin && (
								<>
									<button
										type="button"
										disabled={isSubmittingApproval}
										onClick={handleAdminApprove}
										className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12.5px] shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
									>
										<span className="material-symbols-outlined text-[17px]">shield_person</span>
										<span>Authorize &amp; Activate (Final Approval)</span>
									</button>
									<button
										type="button"
										disabled={isSubmittingApproval}
										onClick={() => setIsRejectModalOpen(true)}
										className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-bold text-[12.5px] shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
									>
										<span className="material-symbols-outlined text-[17px]">close</span>
										<span>Reject</span>
									</button>
								</>
							)}
						</div>
					)}
				</div>
			)}

			{/* 5-Card Financial Metrics Strip */}
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-space-md">
				{/* KPI 1: Total Principal */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Total Principal</span>
						<span className="material-symbols-outlined text-primary text-[20px]">
							account_balance
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[24px] text-slate-900 leading-tight">
							{formatCurrency(totalPrincipal)}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-slate-800">100%</span>
							<span>sanctioned principal</span>
						</div>
					</div>
				</div>

				{/* KPI 2: Total Interest */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Total Interest</span>
						<span className="material-symbols-outlined text-orange-600 text-[20px]">
							percent
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[24px] text-slate-900 leading-tight">
							{formatCurrency(totalInterest)}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-orange-700">{interestPercent}%</span>
							<span>of total obligation</span>
						</div>
					</div>
				</div>

				{/* KPI 3: Share Ratio % */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Share Ratio %</span>
						<span className="material-symbols-outlined text-indigo-600 text-[20px]">
							pie_chart
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[24px] text-slate-900 leading-tight">
							{shareRatioText}
						</div>
						<div className="flex flex-wrap items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-indigo-700">
								{primarySharePercent}% {primaryAcc?.accountTag || 'Primary'}
							</span>
							{secondaryAccountsList.map((a, idx) => (
								<React.Fragment key={a.id || idx}>
									<span>/</span>
									<span className="font-semibold text-slate-700">
										{secondarySharePercents[idx] ?? 0}% {a.accountTag || a.initials || 'Sec'}
									</span>
								</React.Fragment>
							))}
						</div>
					</div>
				</div>

				{/* KPI 4: Total Repay Amount */}
				<div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 flex flex-col justify-between">
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span>Total Repay Amount</span>
						<span className="material-symbols-outlined text-emerald-600 text-[20px]">
							payments
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[24px] text-emerald-700 leading-tight">
							{formatCurrency(totalRepayAmount)}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className="font-bold text-emerald-700">Principal + Interest</span>
						</div>
					</div>
				</div>

				{/* KPI 5: Total Penal Interest */}
				<div
					onClick={() => setActiveTab('penal')}
					className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 ring-slate-200/80 hover:ring-rose-300 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
					title="Click to view Penal Interest records"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider group-hover:text-rose-600 transition-colors">
						<span>Total Penal Interest</span>
						<span className="material-symbols-outlined text-rose-600 text-[20px] group-hover:scale-110 transition-transform">
							gavel
						</span>
					</div>
					<div className="my-2">
						<div className={`font-extrabold text-[24px] leading-tight ${totalPenalAmount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
							{formatCurrency(totalPenalAmount)}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-500 mt-1">
							<span className={`font-bold ${totalPenalAmount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
								{penalInterestList.length} {penalInterestList.length === 1 ? 'entry' : 'entries'}
							</span>
							<span>recorded</span>
						</div>
					</div>
				</div>
			</div>

			{/* Section Tabs */}
			<div className="sticky top-16 z-20 bg-surface/95 backdrop-blur-md pt-2 border-b border-slate-200/80 flex items-center justify-between transition-all">
				<div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
					<button
						type="button"
						onClick={() => setActiveTab('schedule')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'schedule'
							? 'border-primary text-primary'
							: 'border-transparent text-slate-500 hover:text-slate-800'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">calendar_month</span>
						<span>Repayment Schedule</span>
						<span className={`text-[11px] px-2 py-0.2 rounded-full font-extrabold ${activeTab === 'schedule' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-700'}`}>
							{repaymentSchedule.length}
						</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('penal')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'penal'
							? 'border-primary text-primary'
							: 'border-transparent text-slate-500 hover:text-slate-800'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">percent</span>
						<span>Penal Interest</span>
						<span className={`text-[11px] px-2 py-0.2 rounded-full font-extrabold ${activeTab === 'penal' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-700'}`}>
							{penalInterestList.length}
						</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('accounts')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'accounts'
							? 'border-primary text-primary'
							: 'border-transparent text-slate-500 hover:text-slate-800'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
						<span>Account Details</span>
						<span className={`text-[11px] px-2 py-0.2 rounded-full font-extrabold ${activeTab === 'accounts' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-700'}`}>
							{accounts.length}
						</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('contact')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'contact'
							? 'border-primary text-primary'
							: 'border-transparent text-slate-500 hover:text-slate-800'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">account_box</span>
						<span>Contact Details</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('history')}
						className={`px-4 py-2.5 border-b-2 font-bold text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'history'
							? 'border-primary text-primary'
							: 'border-transparent text-slate-500 hover:text-slate-800'
							}`}
					>
						<span className="material-symbols-outlined text-[18px]">history</span>
						<span>Loan History</span>
						<span className={`text-[11px] px-2 py-0.2 rounded-full font-extrabold ${activeTab === 'history' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-700'}`}>
							{cleanLoanHistory.length}
						</span>
					</button>
				</div>


			</div>

			{/* TAB 1: Repayment Schedule */}
			{activeTab === 'schedule' && (
				<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col">
					{/* Top Header & Filter Strip */}
					<div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div>
							<h3 className="flex items-center gap-2">
								<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary text-[20px]">
									<span className="material-symbols-outlined">
										calendar_month
									</span>
								</div>
								<div>
									<span className="font-extrabold text-[17px] text-slate-900">Repayment Schedule</span>
									<p className="text-[12px] text-slate-500 mt-0.5">
										Monthly installment schedule with cheque tracking, co-lending primary &amp; secondary interest split, and 10% TDS deducted from 1st due.
									</p>
								</div>
							</h3>
						</div>

						{/* Modern Status Filter Dropdown & Detailed View Toggle */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setIsDetailedView((prev) => !prev)}
								className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs select-none ${isDetailedView
									? 'bg-primary text-white border-primary shadow-xs'
									: 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:border-slate-300'
									}`}
								title={isDetailedView ? 'Hide detailed columns (Chq No, Interest)' : 'Show all columns including Chq No and Interest'}
							>
								<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
									{isDetailedView ? 'visibility' : 'visibility_off'}
								</span>
								<span>Detailed View</span>
							</button>
						</div>
					</div>

					{/* Schedule Table - dynamic columns based on secondary account count */}
					<div className="overflow-x-auto min-h-[240px]">
						<table className={`w-full text-left border-collapse ${isDetailedView ? 'min-w-[1300px]' : 'min-w-[880px]'}`}>
							<thead>
								<tr className="border-b border-slate-200/80 bg-surface-container-low/60 text-slate-600 font-bold text-[11.5px] uppercase tracking-wider">
									<th className="py-3 px-3 w-14 text-left">#</th>
									<th className="py-3 px-3.5">Date</th>
									{isDetailedView && <th className="py-3 px-3 min-w-[100px] text-center">Chq No</th>}
									<th className="py-3 px-3.5 text-right">Amount</th>
									{isDetailedView && <th className="py-3 px-3.5 text-right">Interest</th>}
									<th className="py-3 px-3 text-center min-w-[145px]">Recd Date</th>
									<th className="py-3 px-3.5 text-right">{primaryTag}</th>
									{isDetailedView && <th className="py-3 px-3.5 text-right min-w-[95px]">{primaryTag} Int</th>}
									<th className="py-3 px-3.5 text-center min-w-[175px]">Payout Date</th>
									{secAccounts.map((sa) => {
										const tag = sa.accountTag || sa.initials || 'SEC';
										return (
											<React.Fragment key={`hdr-${tag}`}>
												<th className="py-3 px-3.5 text-right">{tag}</th>
												{isDetailedView && <th className="py-3 px-3.5 text-right min-w-[95px]">{tag} Int</th>}
												<th className="py-3 px-3.5 text-center">{tag} TDS</th>
											</React.Fragment>
										);
									})}
									<th className="py-3 px-1 w-16 min-w-[64px] max-w-[64px] text-center sticky right-0 z-10 bg-slate-100/95 text-slate-600 font-bold text-[11px] uppercase tracking-wider border-l border-slate-200/80 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
										{/* Approval */}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 text-[13px]">
								{filteredSchedule.map((inst, rowIdx) => {
									const isRecdDateFilled = Boolean(
										inst.receivedDate &&
										String(inst.receivedDate).trim() &&
										String(inst.receivedDate).trim() !== '-' &&
										String(inst.receivedDate).trim() !== '-'
									);
									const effectiveDueDate = inst.isPartial
										? (inst.subInstallments?.find((s) => s.dueDate && s.dueDate !== '-' && s.dueDate !== '-')?.dueDate || inst.dueDate)
										: inst.dueDate;
									const isPayoutDateFilled = Boolean(
										effectiveDueDate &&
										String(effectiveDueDate).trim() &&
										String(effectiveDueDate).trim() !== '-' &&
										String(effectiveDueDate).trim() !== '-'
									);
									const isPayoutPending = Boolean(
										isPayoutDateFilled &&
										(inst.status === 'Pending Payout Approval' ||
											inst.payout_approval_status === 'PENDING' ||
											inst.payoutApprovalStatus === 'PENDING')
									);
									const isPayoutApproved = Boolean(
										isPayoutDateFilled &&
										(inst.status === 'Settled' ||
											inst.payout_approval_status === 'APPROVED' ||
											inst.payoutApprovalStatus === 'APPROVED')
									);
									const isPayoutRejected = Boolean(
										inst.status === 'Payout Discrepancy' ||
										inst.payout_approval_status === 'REJECTED' ||
										inst.payoutApprovalStatus === 'REJECTED'
									);
									const payoutEditorRole =
										inst.payout_editor_role ||
										inst.payout_requested_role ||
										inst.payoutRequestedRole ||
										(inst.payout_approval_target === 'PRIMARY' || inst.payoutApprovalTarget === 'PRIMARY'
											? 'SECONDARY'
											: 'PRIMARY');
									const canApproveThisPayout = getCanApprovePayoutForInst(inst);
									const isRecdDateValid = Boolean(
										isRecdDateFilled &&
										String(inst.receivedDate).trim().length === 10 &&
										parseDDMMYYYY(inst.receivedDate) !== null &&
										!isDateBefore(inst.receivedDate, inst.date)
									);
									const isPastEmiDate = isPastOrTodayDate(inst.date);
									const isSecEditor = !userPerms?.isAdmin && Boolean(isSecondaryLoan || isUserSecManager);
									const isFirstSubPayoutApproved = Boolean(
										inst.isPartial &&
										inst.subInstallments?.[0] &&
										inst.subInstallments[0].dueDate &&
										inst.subInstallments[0].dueDate !== '-' &&
										inst.subInstallments[0].dueDate !== '-' &&
										(inst.subInstallments[0].status === 'Settled' ||
											inst.subInstallments[0].payout_approval_status === 'APPROVED' ||
											inst.subInstallments[0].payoutApprovalStatus === 'APPROVED')
									);
									const isMainRowPayoutApproved = Boolean(isPayoutApproved || isFirstSubPayoutApproved);
									// Once payout date approved, recd date and payout date are NOT editable even for system admin
									const canEditRecdDate = isFinallyApproved && !isSecEditor && !isMainRowPayoutApproved && (isPastEmiDate || isRecdDateFilled);
									const canEditDueDate = isFinallyApproved && !isMainRowPayoutApproved && isRecdDateValid;
									const canCreatePartial = isFinallyApproved && !isSecEditor && !inst.isPartial && isPastEmiDate && !isRecdDateFilled && !isPayoutDateFilled && !isMainRowPayoutApproved;
									const isAnySubApproved = Boolean(
										inst.isPartial &&
										inst.subInstallments?.some(
											(sub) =>
												sub.dueDate &&
												sub.dueDate !== '-' &&
												sub.dueDate !== '-' &&
												(sub.status === 'Settled' ||
													sub.payout_approval_status === 'APPROVED' ||
													sub.payoutApprovalStatus === 'APPROVED')
										)
									);
									const canClearRow =
										isFinallyApproved &&
										!isSecEditor &&
										(isRecdDateFilled ||
											isPayoutDateFilled ||
											inst.isPartial ||
											Boolean(
												inst.isPartial &&
												inst.subInstallments?.some(
													(sub) =>
														(sub.receivedDate &&
															String(sub.receivedDate).trim() &&
															String(sub.receivedDate).trim() !== '-' &&
															String(sub.receivedDate).trim() !== '-') ||
														(sub.dueDate &&
															String(sub.dueDate).trim() &&
															String(sub.dueDate).trim() !== '-' &&
															String(sub.dueDate).trim() !== '-')
												)
											));

									// Amounts split based on account share %
									const priAmount = primarySharePct === 0
										? 0
										: (inst.primaryAmount != null
											? inst.primaryAmount
											: Math.round(((Number(inst.amount) || 0) * primarySharePct) / 100));
									// Generate smart payout date suggestions: Same Day, Next Day, Today
									const sameDay = getOffsetDateDDMMYYYY(inst.receivedDate, 0);
									const nextDay = getOffsetDateDDMMYYYY(inst.receivedDate, 1);
									const todayDate = getTodayDDMMYYYY();
									const isTodayPastOfRecd = isDateBefore(todayDate, inst.receivedDate);

									const payoutSuggestions =
										canEditDueDate && inst.receivedDate && parseDDMMYYYY(inst.receivedDate)
											? [
												{
													date: sameDay,
													label: 'Same Day',
													badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
												},
												{
													date: nextDay,
													label: 'Next Day',
													badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
												},
												{
													date: todayDate,
													label: 'Today',
													badgeClass: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
													disabled: isTodayPastOfRecd,
													tooltip: isTodayPastOfRecd
														? `Today (${todayDate}) is earlier than Recd Date (${inst.receivedDate})`
														: '',
												},
											]
											: null;

									const isExpanded = Boolean(expandedRows[inst.sNo] || expandedRows[Number(inst.sNo)]);

									return (
										<React.Fragment key={inst.sNo || inst.installmentNumber}>
											{/* Main Installment Row (Shows Original Amount & Interest) */}
											<tr
												onClick={() => inst.isPartial && toggleRowExpand(inst.sNo)}
												className={`transition-colors group ${inst.isPartial
													? 'cursor-pointer bg-amber-50/70 hover:bg-amber-100/60'
													: 'hover:bg-surface-container-low/40'
													}`}
												title={
													inst.isPartial
														? isExpanded
															? 'Click row to collapse partial payments'
															: 'Click row to display partial payments'
														: undefined
												}
											>
												{/* 1. S.No with expand/collapse chevron if partial & absolute clear button */}
												<td className="py-3 px-3 text-left text-slate-700 font-extrabold text-[12px] font-mono whitespace-nowrap relative">
													<div className="relative flex items-center gap-2 pr-5">
														<span className="text-slate-400">{inst.sNo}</span>
														{inst.isPartial && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	toggleRowExpand(inst.sNo);
																}}
																className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-amber-600 hover:bg-amber-100/60 transition-colors cursor-pointer"
																title={
																	isExpanded
																		? 'Collapse sub-installments'
																		: 'Expand partial sub-installments'
																}
															>
																<span
																	className={`material-symbols-outlined transition-transform duration-200 ${isExpanded ? 'rotate-90 text-amber-600' : ''
																		}`}
																	style={{ fontSize: '14px' }}
																>
																	chevron_right
																</span>
															</button>
														)}
														{canClearRow && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	handleClearRowDates(inst.sNo);
																}}
																className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all w-5 h-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100 active:scale-95 cursor-pointer z-10"
																title="Clear Recd Date & Payout Date"
															>
																<span className="material-symbols-outlined" style={{fontSize: "15px"}}>
																	close
																</span>
															</button>
														)}
													</div>
												</td>

												{/* 2. Date */}
												<td className="py-3 px-3.5 font-semibold text-slate-800 text-[12.5px] whitespace-nowrap">
													{inst.date}
												</td>

												{/* 3. Chq No */}
												{isDetailedView && (
													<td className="py-3 px-3 text-center whitespace-nowrap">
														{inst.chqNo ? (
															<span className="font-mono text-[11.5px] font-bold text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded ring-1 ring-slate-200/80">
																{inst.chqNo}
															</span>
														) : (
															<span className="text-slate-400 text-[13px] font-medium select-none">-</span>
														)}
													</td>
												)}

												{/* 4. Amount - ORIGINAL AMOUNT (Click to create partial payment only for past EMIs with unfilled dates) */}
												<td
													className={`py-3 px-3.5 text-right font-black text-[13px] whitespace-nowrap ${canCreatePartial
														? 'cursor-pointer hover:bg-amber-100/60 transition-colors group/amt'
														: 'text-slate-900'
														}`}
													onClick={(e) => {
														if (canCreatePartial) {
															e.stopPropagation();
															setSplitModalTarget(inst);
														}
													}}
													title={canCreatePartial ? 'Click to create partial payment' : undefined}
												>
													<div
														className={`inline-flex items-center justify-end gap-1 ${canCreatePartial ? 'text-slate-900 group-hover/amt:text-amber-800' : 'text-slate-900'
															}`}
													>
														<span>{formatCurrency(inst.amount)}</span>
													</div>
												</td>

												{/* 5. Interest - ORIGINAL INTEREST */}
												{isDetailedView && (
													<td className="py-3 px-3.5 text-right font-bold text-[12.5px] text-slate-700 whitespace-nowrap">
														{formatCurrency(inst.interest)}
													</td>
												)}

												{/* 6. Recd Date (Client -> Primary) */}
												<td
													className="py-2 px-3 text-center whitespace-nowrap"
												>
													<EditableDateCell
														id={`schedule-recd-${inst.sNo}`}
														value={inst.isPartial ? (inst.subInstallments?.[0]?.receivedDate || inst.receivedDate) : inst.receivedDate}
														minDate={inst.date}
														minDateLabel="EMI Date"
														disabled={!canEditRecdDate}
														openUpward="auto"
														tooltip={
															isSecEditor
																? 'Received date can only be edited by primary manager'
																: isMainRowPayoutApproved
																	? 'Payout date is approved and settled - received date cannot be edited'
																	: !canEditRecdDate
																		? `Future EMI (${inst.date}) - recd date is only editable for past or current EMIs`
																		: `Recd date cannot be earlier than EMI date (${inst.date})`
														}
														onChange={(newVal) =>
															handleScheduleDateChange(inst.isPartial ? `${inst.sNo}A` : inst.sNo, 'receivedDate', newVal)
														}
														onEnter={() => handleRecdDateEnter(inst)}
														placeholder="dd-mm-yyyy"
													/>
												</td>

												{/* 7. Primary Share of Amount */}
												<td className="py-3 px-3.5 text-right font-black text-[13px] text-blue-900 whitespace-nowrap">
													{formatCurrency(priAmount)}
												</td>

												{/* 8. Primary Interest */}
												{isDetailedView && (
													<td className="py-3 px-3.5 text-right font-extrabold text-[12.5px] text-blue-900 whitespace-nowrap">
														{formatCurrency(primarySharePct === 0 ? 0 : inst.primaryInterest)}
													</td>
												)}

												{/* 9. Sec Payout Date (Primary -> Secondary remittance) */}
												<td
													className="py-2 px-3 text-center whitespace-nowrap"
												>
													<div className="inline-flex flex-col items-center justify-center">
														<EditableDateCell
															id={`schedule-payout-${inst.sNo}`}
															value={inst.isPartial ? (inst.subInstallments?.[0]?.dueDate || inst.dueDate) : inst.dueDate}
															minDate={inst.receivedDate || inst.date}
															minDateLabel="Recd Date"
															disabled={!canEditDueDate}
															tooltip={
																isMainRowPayoutApproved
																	? 'Payout date is approved and settled - cannot be edited'
																	: !canEditDueDate
																		? `Client must pay ${primaryTag} first before ${secTag} payout can be scheduled`
																		: `Payout date to ${secTag} cannot be earlier than client receipt date (${inst.receivedDate})`
															}
															suggestions={payoutSuggestions}
															openUpward="auto"
															align="right"
															onChange={(newVal) =>
																handleScheduleDateChange(inst.isPartial ? `${inst.sNo}A` : inst.sNo, 'dueDate', newVal)
															}
															onEnter={() => handlePayoutDateEnter(inst, rowIdx)}
															placeholder="dd-mm-yyyy"
														/>
													</div>
												</td>

												{/* 10+. Per-secondary-account columns: Amount | Interest | TDS */}
												{(inst.secAccounts || []).map((sa, saIdx) => {
													const hasTds = inst.sNo === 1 && (sa.tds || 0) > 0;
													const purpleShades = [
														'text-purple-900',
														'text-violet-900',
														'text-fuchsia-900',
													];
													const shade = purpleShades[saIdx % purpleShades.length];
													return (
														<React.Fragment key={`sec-${saIdx}-${inst.sNo}`}>
															<td
																title={
																	hasTds
																		? `Net 1st Due Payout: ${formatCurrency(
																			sa.amount
																		)} (Gross ${formatCurrency(
																			sa.grossAmount
																		)} - ${formatCurrency(sa.tds)} TDS)`
																		: ''
																}
																className={`py-3 px-3.5 text-right font-black text-[13px] ${shade} whitespace-nowrap`}
															>
																{formatCurrency(sa.amount)}
															</td>
															{isDetailedView && (
																<td
																	className={`py-3 px-3.5 text-right font-extrabold text-[12.5px] ${shade} whitespace-nowrap`}
																>
																	{formatCurrency(sa.interest)}
																</td>
															)}
															<td className="py-3 px-3.5 text-center whitespace-nowrap">
																{hasTds ? (
																	<span
																		className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded ring-1 ring-amber-200/70 text-[12px]"
																		title={`10% TDS on ${sa.accountTag}'s total interest - collected upfront in 1st EMI`}
																	>
																		{formatCurrency(sa.tds)}
																	</span>
																) : (
																	<span className="text-slate-400 font-bold text-[13px]">
																		-
																	</span>
																)}
															</td>
														</React.Fragment>
													);
												})}

												{/* Action Buttons: Payout Approval & Clear Dates */}
												<td
													className={`py-3 px-1 w-16 min-w-[64px] max-w-[64px] text-center whitespace-nowrap sticky right-0 z-10 border-l border-slate-200/80 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] ${inst.isPartial
														? 'bg-amber-50/95 group-hover:bg-amber-100/90'
														: 'bg-white group-hover:bg-slate-50'
														}`}
												>
													<div className="flex items-center justify-center">
														{isPayoutPending ? (
															canApproveThisPayout ? (
																<div className="inline-flex items-center gap-1.5">
																	<button
																		type="button"
																		disabled={isSubmittingPayout}
																		onClick={(e) => {
																			e.stopPropagation();
																			handleDirectApprovePayout(inst);
																		}}
																		className="p-0.5 text-[10px] font-extrabold bg-emerald-100 hover:bg-emerald-200 text-emerald-600 rounded-lg ring-1 ring-emerald-400 shadow-xs inline-flex items-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
																		title={
																			payoutEditorRole === 'SECONDARY'
																				? 'Approve secondary manager updated payout date'
																				: 'Confirm secondary remittance receipt and approve payout date'
																		}
																	>
																		{isSubmittingPayout && submittingPayoutSNo === inst.sNo ? (
																			<span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
																		) : (
																			<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>check</span>
																		)}
																	</button>
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			setPayoutModalData({
																				isOpen: true,
																				action: 'REJECT',
																				sNo: inst.sNo,
																				row: inst,
																				notes: '',
																			});
																		}}
																		className="p-0.5 text-[10px] font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg ring-1 ring-rose-200 inline-flex items-center transition-all active:scale-95 cursor-pointer"
																		title={
																			payoutEditorRole === 'SECONDARY'
																				? 'Reject secondary manager updated payout date'
																				: 'Reject payout date'
																		}
																	>
																		<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
																	</button>
																</div>
															) : (
																<div
																	className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-amber-700 select-none"
																	title={
																		payoutEditorRole === 'SECONDARY'
																			? 'Payout date approval pending from primary manager'
																			: 'Payout date approval pending from secondary manager'
																	}
																>
																	<span className="material-symbols-outlined text-[14px] text-amber-600 animate-pulse">pending</span>
																</div>
															)
														) : isPayoutApproved ? (
															<span
																className="material-symbols-outlined text-[16px] text-emerald-600 select-none"
																title={`Payout Approved by ${inst.payout_approved_by || 'Manager'}${inst.payout_approved_at ? ` on ${inst.payout_approved_at}` : ''}`}
															>
																check_circle
															</span>
														) : isPayoutRejected ? (
															<span
																className="material-symbols-outlined text-[16px] text-rose-500 select-none"
																title={`Payout Discrepancy Flagged${inst.payout_notes ? `: ${inst.payout_notes}` : ''}`}
															>
																cancel
															</span>
														) : null}
													</div>
												</td>
											</tr>

											{/* Expanded Sub-Rows for Partial Payment (2A - Paid Amount, and below that 2B - Remaining Balance) */}
											{inst.isPartial &&
												isExpanded &&
												(inst.subInstallments || []).map((sub, subIdx) => {
													const isPaidPart = sub.subType === 'paid' && Boolean(
														sub.receivedDate &&
														String(sub.receivedDate).trim() &&
														String(sub.receivedDate).trim() !== '-' &&
														String(sub.receivedDate).trim() !== '—' &&
														parseDDMMYYYY(String(sub.receivedDate).trim()) !== null
													);
													const isSubRecdDateFilled = Boolean(
														sub.receivedDate &&
														String(sub.receivedDate).trim() &&
														String(sub.receivedDate).trim() !== '-' &&
														String(sub.receivedDate).trim() !== '—'
													);
													const isSubRecdDateValid = Boolean(
														isSubRecdDateFilled &&
														String(sub.receivedDate).trim().length === 10 &&
														parseDDMMYYYY(sub.receivedDate) !== null &&
														!isDateBefore(sub.receivedDate, sub.date || inst.date)
													);

													// Payout approval state for sub-row (never approve/pending on unpaid balance row)
													const isBalanceRow = subIdx > 0 ? (!isPaidPart || sub.subType === 'balance') : false;
													const hasValidSubDueDate = Boolean(sub.dueDate && sub.dueDate !== '-' && sub.dueDate !== '-');

													const isSubPayoutPending = Boolean(
														!isBalanceRow &&
														hasValidSubDueDate &&
														(sub.payout_approval_status === 'PENDING' || sub.payoutApprovalStatus === 'PENDING')
													);
													const isSubPayoutApproved = Boolean(
														!isBalanceRow &&
														hasValidSubDueDate &&
														(sub.status === 'Settled' ||
															sub.payout_approval_status === 'APPROVED' ||
															sub.payoutApprovalStatus === 'APPROVED')
													);
													const isSubPayoutRejected = Boolean(
														!isBalanceRow &&
														(sub.payout_approval_status === 'REJECTED' || sub.payoutApprovalStatus === 'REJECTED')
													);
													const subPayoutEditorRole =
														sub.payout_editor_role ||
														sub.payout_requested_role ||
														sub.payoutRequestedRole ||
														(sub.payout_approval_target === 'PRIMARY' || sub.payoutApprovalTarget === 'PRIMARY'
															? 'SECONDARY'
															: 'PRIMARY');
													const canApproveSubPayout = getCanApprovePayoutForInst(sub);

													// For partial payments, once payout date approved, recd and payout date are not editable even for system admin
													const canEditSubRecdDate = isFinallyApproved && !isSecEditor && !isSubPayoutApproved && (isPastEmiDate || isSubRecdDateFilled);
													const canEditSubDueDate = isFinallyApproved && !isSubPayoutApproved && isSubRecdDateValid;

													// Determine minDate for recd date:
													// For sub-installment A: inst.date
													// For sub-installments B, C, D: previous partial payment date or first partial payment date or inst.date
													const prevSubRecd = subIdx > 0 && inst.subInstallments?.[subIdx - 1]?.receivedDate;
													const firstPartialRecdDate = inst.subInstallments?.[0]?.receivedDate;
													const effectivePrevDate = (prevSubRecd && parseDDMMYYYY(prevSubRecd))
														? prevSubRecd
														: (firstPartialRecdDate && parseDDMMYYYY(firstPartialRecdDate) ? firstPartialRecdDate : null);
													const subMinRecdDate = (subIdx > 0 && effectivePrevDate)
														? effectivePrevDate
														: inst.date;
													const subMinRecdLabel = (subIdx > 0 && effectivePrevDate)
														? (effectivePrevDate === prevSubRecd ? `Payment #${subIdx}` : 'Payment #1')
														: 'EMI Date';

													// Payout suggestions for sub-row
													const subSameDay = getOffsetDateDDMMYYYY(sub.receivedDate, 0);
													const subNextDay = getOffsetDateDDMMYYYY(sub.receivedDate, 1);
													const isSubTodayPastOfRecd = isDateBefore(todayDate, sub.receivedDate);
													const subPayoutSuggestions = canEditSubDueDate && sub.receivedDate && parseDDMMYYYY(sub.receivedDate)
														? [
															{ date: subSameDay, label: 'Same Day', badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
															{ date: subNextDay, label: 'Next Day', badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
															{ date: todayDate, label: 'Today', badgeClass: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', disabled: isSubTodayPastOfRecd, tooltip: isSubTodayPastOfRecd ? `Today (${todayDate}) is earlier than Recd Date (${sub.receivedDate})` : '' }
														]
														: null;

													return (
														<tr
															key={sub.sNo}
															className={`transition-colors group ${!isBalanceRow
																? 'bg-blue-50/30 hover:bg-blue-50/50 border-l-blue-500'
																: 'bg-rose-50/30 hover:bg-rose-50/50 border-l-rose-500'
																}`}
														>
															{/* Sub-row S.No */}
															<td className="py-2.5 px-3 text-left whitespace-nowrap w-14">
																<div className="relative flex items-center h-5 text-slate-400 pl-3">
																	<span className="material-symbols-outlined text-slate-400 shrink-0" style={{ fontSize: '14px' }}>
																		subdirectory_arrow_right
																	</span>
																	<div className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap z-10">
																		{isBalanceRow ? (
																			<span className="text-[8px] font-extrabold px-1.5 rounded uppercase tracking-wider bg-rose-100 text-rose-800 ring-1 ring-rose-300">
																				Balance
																			</span>
																		) : (
																			<span className="text-[8.5px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider bg-blue-100 text-blue-800 ring-1 ring-blue-300">
																				{(sub.subLabel || (subIdx === 0 ? 'Payment #1' : `Payment #${subIdx + 1}`)).replace(/\s*\(Balance\)/gi, '')}
																			</span>
																		)}
																		{sub.remarks && (
																			<span
																				className="text-[10px] font-medium text-slate-500 italic max-w-[140px] truncate"
																				title={sub.remarks}
																			>
																				{sub.remarks}
																			</span>
																		)}
																	</div>
																</div>
															</td>

															{/* Sub-row Date */}
															<td className="py-2.5 px-3.5 text-center font-bold text-slate-400 text-[13px] whitespace-nowrap"></td>

															{/* Sub-row Chq No */}
															{isDetailedView && (
																<td className="py-2.5 px-3 text-center font-bold text-slate-400 text-[13px] whitespace-nowrap"></td>
															)}

															{/* Sub-row Amount: Click balance amount to create partial payment from balance */}
															<td
																className={`py-2.5 px-3.5 text-right font-black text-[13px] whitespace-nowrap ${!isBalanceRow
																	? 'text-blue-900'
																	: !isSecEditor
																		? 'text-rose-900 cursor-pointer hover:underline hover:text-rose-950 transition-colors'
																		: 'text-rose-900'
																	}`}
																onClick={(e) => {
																	if (isBalanceRow && !isSecEditor) {
																		e.stopPropagation();
																		setSplitModalTarget(inst);
																	}
																}}
																title={
																	isBalanceRow
																		? isSecEditor
																			? 'Partial payments cannot be created for secondary account loans'
																			: 'Click balance amount to create partial payment'
																		: undefined
																}
															>
																{formatCurrency(sub.amount)}
															</td>

															{/* Sub-row Interest */}
															{isDetailedView && (
																<td className="py-2.5 px-3.5 text-center font-bold text-slate-400 text-[13px] whitespace-nowrap"></td>
															)}

															{/* Sub-row Recd Date */}
															<td className="py-2 px-3 text-center whitespace-nowrap">
																<EditableDateCell
																	id={`schedule-recd-${sub.sNo}`}
																	value={sub.receivedDate}
																	minDate={subMinRecdDate}
																	minDateLabel={subMinRecdLabel}
																	disabled={!canEditSubRecdDate}
																	openUpward="auto"
																	tooltip={
																		isSecEditor
																			? 'Received date cannot be edited by secondary manager'
																			: isSubPayoutApproved
																				? 'Payout date is approved and settled - received date cannot be edited'
																				: !canEditSubRecdDate
																					? `Future EMI (${inst.date}) - recd date is only editable for past or current EMIs`
																					: `Recd date cannot be earlier than ${subMinRecdLabel} (${subMinRecdDate})`
																	}
																	onChange={(newVal) =>
																		handleScheduleDateChange(sub.sNo, 'receivedDate', newVal)
																	}
																	onEnter={() => handleRecdDateEnter(inst, sub)}
																	placeholder="dd-mm-yyyy"
																/>
															</td>

															{/* Sub-row Primary Amount */}
															<td className="py-2.5 px-3.5 text-right font-extrabold text-[12.5px] text-blue-900 whitespace-nowrap">
																{formatCurrency(primarySharePct === 0 ? 0 : sub.primaryAmount)}
															</td>

															{/* Sub-row Primary Interest */}
															{isDetailedView && (
																<td className="py-2.5 px-3.5 text-center font-bold text-slate-400 text-[13px] whitespace-nowrap"></td>
															)}

															{/* Sub-row Payout Date */}
															<td className="py-2 px-3 text-center whitespace-nowrap">
																<div className="inline-flex flex-col items-center justify-center">
																	<EditableDateCell
																		id={`schedule-payout-${sub.sNo}`}
																		value={sub.dueDate}
																		minDate={sub.receivedDate || inst.date}
																		minDateLabel="Recd Date"
																		disabled={!canEditSubDueDate}
																		tooltip={
																			isSubPayoutApproved
																				? 'Payout date is approved and settled - cannot be edited'
																				: !canEditSubDueDate
																					? `Client must pay ${primaryTag} first before ${secTag} payout can be scheduled`
																					: `Payout date to ${secTag} cannot be earlier than client receipt date (${sub.receivedDate})`
																		}
																		suggestions={subPayoutSuggestions}
																		openUpward="auto"
																		align="right"
																		onChange={(newVal) =>
																			handleScheduleDateChange(sub.sNo, 'dueDate', newVal)
																		}
																		onEnter={() => handlePayoutDateEnter(inst, rowIdx, sub, subIdx)}
																		placeholder="dd-mm-yyyy"
																	/>
																</div>
															</td>

															{/* Sub-row Secondary Accounts */}
															{(sub.secAccounts || []).map((sa, saIdx) => {
																const purpleShades = [
																	'text-purple-900',
																	'text-violet-900',
																	'text-fuchsia-900',
																];
																const shade = purpleShades[saIdx % purpleShades.length];
																return (
																	<React.Fragment key={`sub-sec-${saIdx}-${sub.sNo}`}>
																		<td
																			className={`py-2.5 px-3.5 text-right font-extrabold text-[12.5px] ${shade} whitespace-nowrap`}
																		>
																			{formatCurrency(sa.amount)}
																		</td>
																		{isDetailedView && (
																			<td className="py-2.5 px-3.5 text-center font-bold text-slate-400 text-[13px] whitespace-nowrap"></td>
																		)}
																		<td className="py-2.5 px-3.5 text-center whitespace-nowrap">
																			{(inst.sNo === 1 || sub.parentSNo === 1) && (sa.tds || 0) > 0 ? (
																				<span
																					className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded ring-1 ring-amber-200/70 text-[11px]"
																					title={`${formatCurrency(sa.tds)} TDS deducted for ${sub.subLabel || 'Payment'}`}
																				>
																					{formatCurrency(sa.tds)}
																				</span>
																			) : (
																				<span className="text-slate-400 font-bold text-[13px]">
																					{(inst.sNo === 1 || sub.parentSNo === 1) ? '-' : ''}
																				</span>
																			)}
																		</td>
																	</React.Fragment>
																);
															})}

															{/* Sub-row Action (Payout Approval) */}
															<td
																className={`py-2 px-1 w-16 min-w-[64px] max-w-[64px] text-center whitespace-nowrap sticky right-0 z-10 border-l border-slate-200/80 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] ${!isBalanceRow ? 'bg-blue-50/50 group-hover:bg-blue-100/60' : 'bg-rose-50/50 group-hover:bg-rose-100/60'
																	}`}
															>
																<div className="flex items-center justify-center">
																	{isSubPayoutPending ? (
																		canApproveSubPayout ? (
																			<div className="inline-flex items-center gap-1.5">
																				<button
																					type="button"
																					disabled={isSubmittingPayout}
																					onClick={(e) => {
																						e.stopPropagation();
																						handleDirectApprovePayout(sub);
																					}}
																					className="p-0.5 text-[10px] font-extrabold bg-emerald-100 hover:bg-emerald-200 text-emerald-600 rounded-lg ring-1 ring-emerald-400 shadow-xs inline-flex items-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
																					title={
																						subPayoutEditorRole === 'SECONDARY'
																							? 'Approve secondary manager updated payout date'
																							: 'Confirm secondary remittance receipt and approve payout date'
																					}
																				>
																					{isSubmittingPayout && submittingPayoutSNo === sub.sNo ? (
																						<span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
																					) : (
																						<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>check</span>
																					)}
																				</button>
																				<button
																					type="button"
																					onClick={(e) => {
																						e.stopPropagation();
																						setPayoutModalData({
																							isOpen: true,
																							action: 'REJECT',
																							sNo: sub.sNo,
																							row: sub,
																							notes: '',
																						});
																					}}
																					className="p-0.5 text-[10px] font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg ring-1 ring-rose-200 inline-flex items-center transition-all active:scale-95 cursor-pointer"
																					title={
																						subPayoutEditorRole === 'SECONDARY'
																							? 'Reject secondary manager updated payout date'
																							: 'Reject payout date'
																					}
																				>
																					<span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
																				</button>
																			</div>
																		) : (
																			<div
																				className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-amber-700 select-none"
																				title={
																					subPayoutEditorRole === 'SECONDARY'
																						? 'Payout date approval pending from primary manager'
																						: 'Payout date approval pending from secondary manager'
																				}
																			>
																				<span className="material-symbols-outlined text-[14px] text-amber-600 animate-pulse">pending</span>
																			</div>
																		)
																	) : isSubPayoutApproved ? (
																		<span
																			className="material-symbols-outlined text-[16px] text-emerald-600 select-none"
																			title={`Payout Approved by ${sub.payout_approved_by || 'Manager'}${sub.payout_approved_at ? ` on ${sub.payout_approved_at}` : ''}`}
																		>
																			check_circle
																		</span>
																	) : isSubPayoutRejected ? (
																		<span
																			className="material-symbols-outlined text-[16px] text-rose-500 select-none"
																			title={`Payout Discrepancy Flagged${sub.payout_notes ? `: ${sub.payout_notes}` : ''}`}
																		>
																			cancel
																		</span>
																	) : null}
																</div>
															</td>
														</tr>
													);
												})}
										</React.Fragment>
									);
								})}
							</tbody>

							{/* Summary Totals Rows: Total, Total Received, Total Balance */}
							<tfoot>
								{/* 1. Total Row */}
								<tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-[12.5px] text-slate-800">
									<td className="py-3.5 px-3 text-left text-slate-500 font-extrabold text-[12px]">
										Σ
									</td>
									<td className="py-3.5 px-3.5 font-extrabold text-slate-900 text-[12px] whitespace-nowrap">
										Total
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
											-
										</td>
									)}
									<td className="py-3.5 px-3.5 text-right font-black text-[13.5px] text-slate-900 whitespace-nowrap">
										{formatCurrency(totalScheduleAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-slate-800 whitespace-nowrap">
											{formatCurrency(totalScheduleInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-blue-900 whitespace-nowrap">
										{formatCurrency(totalSchedulePriAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-blue-900 whitespace-nowrap">
											{formatCurrency(totalSchedulePriInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									{/* Per-secondary-account totals */}
									{secAccountTotals.map((totals, idx) => {
										const purpleShades = ['text-purple-900', 'text-violet-900', 'text-fuchsia-900'];
										const shade = purpleShades[idx % purpleShades.length];
										return (
											<React.Fragment key={`foot-sec-${idx}`}>
												<td className={`py-3.5 px-3.5 text-right font-black text-[13px] ${shade} whitespace-nowrap`}>
													{formatCurrency(totals.totalAmount)}
												</td>
												{isDetailedView && (
													<td className={`py-3.5 px-3.5 text-right font-black text-[13px] ${shade} whitespace-nowrap`}>
														{formatCurrency(totals.totalInterest)}
													</td>
												)}
												<td className="py-3.5 px-3.5 text-right font-black text-[12.5px] text-amber-900 whitespace-nowrap">
													<span className="bg-amber-100/70 px-2 py-0.5 rounded ring-1 ring-amber-300">
														{formatCurrency(totals.totalTds)}
													</span>
												</td>
											</React.Fragment>
										);
									})}
									<td className="sticky right-0 z-10 bg-slate-50 border-l border-slate-200/80 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] py-3.5 px-1 text-center whitespace-nowrap w-16 min-w-[64px] max-w-[64px]"></td>
								</tr>

								{/* 2. Total Received Row */}
								<tr className="border-t border-emerald-200 bg-emerald-50/50 font-bold text-[12.5px] text-emerald-950">
									<td className="py-3.5 px-3 text-left text-emerald-600 font-extrabold text-[12px]">
										<span className="material-symbols-outlined text-[16px] align-middle">check_circle</span>
									</td>
									<td className="py-3.5 px-3.5 font-extrabold text-emerald-800 text-[12px] whitespace-nowrap">
										<div className="inline-flex items-center gap-1.5">
											<span>Total Received</span>
											<span className="inline-flex items-center px-2 rounded-lg text-[10.5px] font-extrabold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300">
												{totalScheduleAmount > 0 ? Math.round((scheduleReceivedTotals.recdAmount / totalScheduleAmount) * 100) : 0}%
											</span>
										</div>
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
											-
										</td>
									)}
									<td className="py-3.5 px-3.5 text-right font-black text-[13.5px] text-emerald-700 whitespace-nowrap">
										{formatCurrency(scheduleReceivedTotals.recdAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-emerald-700 whitespace-nowrap">
											{formatCurrency(scheduleReceivedTotals.recdInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-emerald-800 whitespace-nowrap">
										{formatCurrency(scheduleReceivedTotals.recdPriAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-emerald-800 whitespace-nowrap">
											{formatCurrency(scheduleReceivedTotals.recdPriInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									{/* Per-secondary-account received totals */}
									{secAccountTotals.map((_, idx) => (
										<React.Fragment key={`foot-sec-recd-${idx}`}>
											<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-emerald-700 whitespace-nowrap">
												{formatCurrency(scheduleReceivedTotals.recdSecAmounts[idx] || 0)}
											</td>
											{isDetailedView && (
												<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-emerald-700 whitespace-nowrap">
													{formatCurrency(scheduleReceivedTotals.recdSecInterests[idx] || 0)}
												</td>
											)}
											<td className="py-3.5 px-3.5 text-right font-black text-[12.5px] text-emerald-900 whitespace-nowrap">
												<span className="bg-emerald-100/70 px-2 py-0.5 rounded ring-1 ring-emerald-300">
													{formatCurrency(scheduleReceivedTotals.recdSecTds[idx] || 0)}
												</span>
											</td>
										</React.Fragment>
									))}
									<td className="sticky right-0 z-10 bg-[#f0fdf4] border-l border-emerald-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] py-3.5 px-1 text-center whitespace-nowrap w-16 min-w-[64px] max-w-[64px]"></td>
								</tr>

								{/* 3. Total Balance Row */}
								<tr className="border-t border-rose-200 bg-rose-50/50 font-bold text-[12.5px] text-rose-950">
									<td className="py-3.5 px-3 text-left text-rose-600 font-extrabold text-[12px]">
										<span className="material-symbols-outlined text-[16px] align-middle">pending</span>
									</td>
									<td className="py-3.5 px-3.5 font-extrabold text-rose-800 text-[12px] whitespace-nowrap">
										<div className="inline-flex items-center gap-1.5">
											<span>Total Balance</span>
											<span className="inline-flex items-center px-2 rounded-lg text-[10.5px] font-extrabold bg-rose-100 text-rose-800 ring-1 ring-rose-300">
												{totalScheduleAmount > 0 ? Math.round((scheduleBalanceTotals.balAmount / totalScheduleAmount) * 100) : 0}%
											</span>
										</div>
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
											-
										</td>
									)}
									<td className="py-3.5 px-3.5 text-right font-black text-[13.5px] text-rose-700 whitespace-nowrap">
										{formatCurrency(scheduleBalanceTotals.balAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-rose-700 whitespace-nowrap">
											{formatCurrency(scheduleBalanceTotals.balInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-rose-800 whitespace-nowrap">
										{formatCurrency(scheduleBalanceTotals.balPriAmount)}
									</td>
									{isDetailedView && (
										<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-rose-800 whitespace-nowrap">
											{formatCurrency(scheduleBalanceTotals.balPriInterest)}
										</td>
									)}
									<td className="py-3.5 px-3 text-center text-slate-400 font-semibold text-[11px]">
										-
									</td>
									{/* Per-secondary-account balance totals */}
									{secAccountTotals.map((_, idx) => (
										<React.Fragment key={`foot-sec-bal-${idx}`}>
											<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-rose-700 whitespace-nowrap">
												{formatCurrency(scheduleBalanceTotals.balSecAmounts[idx] || 0)}
											</td>
											{isDetailedView && (
												<td className="py-3.5 px-3.5 text-right font-black text-[13px] text-rose-700 whitespace-nowrap">
													{formatCurrency(scheduleBalanceTotals.balSecInterests[idx] || 0)}
												</td>
											)}
											<td className="py-3.5 px-3.5 text-right font-black text-[12.5px] text-rose-900 whitespace-nowrap">
												<span className="bg-rose-100/70 px-2 py-0.5 rounded ring-1 ring-rose-300">
													{formatCurrency(scheduleBalanceTotals.balSecTds[idx] || 0)}
												</span>
											</td>
										</React.Fragment>
									))}
									<td className="sticky right-0 z-10 bg-[#fff1f2] border-l border-rose-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] py-3.5 px-1 text-center whitespace-nowrap w-16 min-w-[64px] max-w-[64px]"></td>
								</tr>
							</tfoot>
						</table>
					</div>

				</div>
			)}

			{/* TAB: Penal Interest */}
			{activeTab === 'penal' && renderPenalInterestTab()}

			{/* TAB 2: Core Account Details Table */}
			{activeTab === 'accounts' && (
				<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col">
					<div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div>
							<h3 className="flex items-center gap-2">
								<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary text-[20px]">
									<span className="material-symbols-outlined">
										account_balance_wallet
									</span>
								</div>
								<div>
									<span className="font-extrabold text-[17px] text-slate-900">Account Details &amp; Allocations</span>
									<p className="text-[12px] text-slate-500 mt-0.5">
										Primary and secondary account allocation, principal liability, interest, share %, and total repayment amount.
									</p>
								</div>
							</h3>
						</div>

						<button
							type="button"
							disabled={isSecondaryLoan || (!isFinallyApproved && !userPerms.isAdmin)}
							onClick={() => {
								if (isSecondaryLoan || (!isFinallyApproved && !userPerms.isAdmin)) return;
								setEditAccounts(JSON.parse(JSON.stringify(accounts)).map(acc => {
									const sharePct = (facilityTotalPrincipal > 0 && acc.principal != null && Number(acc.principal) > 0)
										? ((Number(acc.principal) / facilityTotalPrincipal) * 100)
										: (acc.share != null ? Number(acc.share) : 0);
									const accInt = (facilityTotalInterest > 0 && sharePct != null)
										? Math.round((facilityTotalInterest * sharePct) / 100)
										: (Number(acc.interest) || 0);
									const accRepay = (Number(acc.principal) || 0) + accInt;
									return {
										...acc,
										share: sharePct,
										interest: accInt,
										repayAmount: accRepay,
									};
								}));
								setIsEditing(true);
							}}
							title={
								isSecondaryLoan
									? 'Allocations cannot be edited for secondary account loans'
									: !isFinallyApproved && !userPerms.isAdmin
										? 'Allocations locked pending final admin approval'
										: 'Edit allocations'
							}
							className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs transition-all select-none ${isSecondaryLoan || (!isFinallyApproved && !userPerms.isAdmin)
								? 'text-slate-400 bg-slate-100 cursor-not-allowed opacity-60'
								: 'text-slate-700 hover:text-primary bg-surface-container-low hover:bg-surface-container cursor-pointer'
								}`}
						>
							<span className="material-symbols-outlined text-[17px]">edit</span>
							<span>Edit Allocations</span>
						</button>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full text-left border-collapse">
							<thead>
								<tr className="border-b border-slate-200/80 bg-surface-container-low/50 text-slate-600 font-bold text-[12px] uppercase tracking-wider">
									<th className="py-3.5 px-4 w-12 text-center">#</th>
									<th className="py-3.5 px-4">Account Name</th>
									<th className="py-3.5 px-4 text-right">Principal</th>
									<th className="py-3.5 px-4 text-right">Interest</th>
									<th className="py-3.5 px-4 text-center">Share %</th>
									<th className="py-3.5 px-4 text-right">Repayment Amount</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 text-[13px]">
								{accounts.map((acc, idx) => (
									<tr
										key={acc.id || idx}
										className="hover:bg-surface-container-low/40 transition-colors"
									>
										{/* 1. # */}
										<td className="py-3.5 px-4 text-center text-slate-400 font-bold text-[12px]">
											{idx + 1}
										</td>

										{/* 2. Account Name (Primary and Secondary) */}
										<td className="py-3.5 px-4">
											<div className="flex items-center gap-3">
												<div>
													<div className="flex items-center gap-2">
														<span className="font-extrabold text-slate-900 text-[12px]">
															{acc.accountName}
														</span>
														{acc.isPrimary && (
															<span className="inline-block font-extrabold text-[10px] px-2 py-0.5 rounded-md ring-1 bg-purple-50 text-purple-700 ring-purple-200">
																Primary
															</span>
														)}
													</div>
												</div>
											</div>
										</td>

										{/* 3. Principal */}
										<td className="py-3.5 px-4 text-right">
											<div className="font-extrabold text-[13px] text-slate-900">
												{formatCurrency(acc.principal)}
											</div>
										</td>

										{/* 4. Interest */}
										<td className="py-3.5 px-4 text-right">
											<div className="font-bold text-[13px] text-slate-800">
												{formatCurrency(acc.interest)}
											</div>
										</td>

										{/* 5. Share % */}
										<td className="py-3.5 px-4 text-center">
											<span className="inline-block px-2.5 py-1 rounded-md text-[12px] font-extrabold bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80">
												{formatSharePercent(totalPrincipal > 0 && acc.principal != null && Number(acc.principal) > 0 ? ((Number(acc.principal) || 0) / totalPrincipal) * 100 : (acc.share != null ? acc.share : 0))}%
											</span>
										</td>

										{/* 6. Repayment Amount */}
										<td className="py-3.5 px-4 text-right">
											<span className="inline-block font-extrabold text-[13px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg ring-1 ring-emerald-200">
												{formatCurrency(acc.repayAmount)}
											</span>
										</td>
									</tr>
								))}
							</tbody>

							{/* Table Footer: Summary Totals Row */}
							<tfoot>
								<tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-[13px] text-slate-800">
									<td className="p-4 text-center text-slate-400 font-extrabold"></td>
									<td className="p-4 font-extrabold text-slate-900">
										Total Facility Repayment
									</td>
									<td className="p-4 text-right font-extrabold text-[13px] text-slate-900">
										{formatCurrency(totalPrincipal)}
									</td>
									<td className="p-4 text-right font-extrabold text-[13px] text-slate-800">
										{formatCurrency(totalInterest)}
									</td>
									<td className="p-4 text-center">
										<span className="inline-block px-2.5 py-0.5 rounded-md text-[12px] font-extrabold bg-indigo-100/70 text-indigo-800 ring-1 ring-indigo-300">
											100%
										</span>
									</td>
									<td className="p-4 text-right font-extrabold text-[13px] text-emerald-800">
										<span className="bg-emerald-100/70 px-2.5 py-1 rounded-lg ring-1 ring-emerald-300">
											{formatCurrency(totalRepayAmount)}
										</span>
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>
			)}

			{/* TAB 3: Contact Details */}
			{activeTab === 'contact' && (
				<div className="bg-surface-container-lowest rounded-2xl shadow-sm ring-1 ring-slate-200/80 overflow-hidden flex flex-col font-sans bg-white">
					{/* Top Header */}
					<div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div>
							<h3 className="flex items-center gap-2">
								<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary text-[20px]">
									<span className="material-symbols-outlined">
										account_box
									</span>
								</div>
								<div>
									<span className="font-extrabold text-[17px] text-slate-900"	>Contact Details</span>
									<p className="text-[12px] text-slate-500 mt-0.5">
										Communication address and primary contact details for {loan.primaryBorrower?.name || loan.client_account_name || 'Borrower'}.
									</p>
								</div>
							</h3>
						</div>
					</div>

					{/* Contact Cards Grid */}
					<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50/60">
						{/* 1. Contact Number Card */}
						<div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-4">
							<div className="flex items-start justify-between gap-3">
								<div className="flex items-center gap-3.5">
									<div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center ring-1 ring-blue-100 flex-shrink-0">
										<span className="material-symbols-outlined text-[24px]">phone_in_talk</span>
									</div>
									<div>
										<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
											Primary Contact No
										</span>
										<span className="text-[13px] font-black text-slate-900 tracking-tight block">
											{clientContact || 'Not Provided'}
										</span>
									</div>
								</div>

								{clientContact && (
									<button
										type="button"
										onClick={() => handleCopy(clientContact, 'contact')}
										className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-primary hover:bg-primary/5 border border-slate-200 transition-colors cursor-pointer"
										title="Copy contact number"
									>
										<span className="material-symbols-outlined text-[14px]">
											{copiedField === 'contact' ? 'check' : 'content_copy'}
										</span>
										<span>{copiedField === 'contact' ? 'Copied' : 'Copy'}</span>
									</button>
								)}
							</div>

							<div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-500">
								<span className="flex items-center gap-1.5 font-medium">
									<span className="w-2 h-2 rounded-full bg-emerald-500" />
									<span>Active Borrower Line</span>
								</span>
							</div>
						</div>

						{/* 2. Address Card */}
						<div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-4">
							<div className="flex items-start justify-between gap-3">
								<div className="flex items-start gap-3.5">
									<div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center ring-1 ring-emerald-100 flex-shrink-0 mt-0.5">
										<span className="material-symbols-outlined text-[24px]">location_on</span>
									</div>
									<div>
										<span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
											Communication Address
										</span>
										<p className="text-[13px] font-bold text-slate-800 leading-relaxed max-w-md whitespace-pre-line">
											{clientAddress || 'No address registered on record.'}
										</p>
									</div>
								</div>

								{clientAddress && (
									<button
										type="button"
										onClick={() => handleCopy(clientAddress, 'address')}
										className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-primary hover:bg-primary/5 border border-slate-200 transition-colors cursor-pointer flex-shrink-0"
										title="Copy address"
									>
										<span className="material-symbols-outlined text-[14px]">
											{copiedField === 'address' ? 'check' : 'content_copy'}
										</span>
										<span>{copiedField === 'address' ? 'Copied' : 'Copy'}</span>
									</button>
								)}
							</div>

							<div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-500">
								<span className="flex items-center gap-1.5 font-medium">
									<span className="material-symbols-outlined text-[15px] text-slate-400">verified</span>
									<span>Registered Address</span>
								</span>
								<span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
									Official Record
								</span>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* TAB 4: Loan History & Audit */}
			{activeTab === 'history' && renderHistoryTab()}

			{/* Edit Contact Details Modal */}
			{isEditingContact && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm font-sans overscroll-contain animate-fadeIn"
					onClick={() => setIsEditingContact(false)}
				>
					<div
						className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl ring-1 ring-slate-200/80 overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
									<span className="material-symbols-outlined text-[22px]">contact_phone</span>
								</div>
								<div>
									<h3 className="font-extrabold text-[16px] text-slate-900">Edit Contact Details</h3>
									<p className="text-[12px] text-slate-500">Update borrower address and contact number.</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setIsEditingContact(false)}
								className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
							>
								<span className="material-symbols-outlined text-[20px]">close</span>
							</button>
						</div>

						{/* Form */}
						<div className="p-6 flex flex-col gap-4">
							<div>
								<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
									Contact Number *
								</label>
								<div className="relative">
									<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined text-[18px]">
										phone
									</span>
									<input
										type="text"
										value={editContact}
										onChange={(e) => setEditContact(e.target.value)}
										placeholder="e.g. +91 98400 12345"
										className="w-full h-10 pl-10 pr-3 text-[13px] font-bold text-slate-900 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
									/>
								</div>
							</div>

							<div>
								<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
									Communication Address *
								</label>
								<textarea
									rows={4}
									value={editAddress}
									onChange={(e) => setEditAddress(e.target.value)}
									placeholder="Enter street address, building, locality, city, state, pin code..."
									className="w-full p-3.5 text-[13px] font-medium text-slate-900 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs resize-none"
								/>
							</div>
						</div>

						{/* Footer */}
						<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
							<button
								type="button"
								onClick={() => setIsEditingContact(false)}
								className="px-4 py-2 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-600 hover:bg-white transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveContactDetails}
								className="px-5 py-2 rounded-xl bg-primary text-white text-[13px] font-extrabold shadow-xs hover:bg-primary/95 transition-all flex items-center gap-1.5 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[17px]">check</span>
								<span>Save Contact Details</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Edit Allocations Popup Card Modal */}
			<EditAllocationsModal
				isOpen={isEditing}
				editAccounts={editAccounts}
				loan={loan}
				availableAccountOptions={availableAccountOptions}
				availableAccountObjects={accountObjectsList || availableAccountObjects}
				onAccountChange={handleEditAccountChange}
				onToggleLock={handleToggleLock}
				onAddSecondary={handleAddSecondaryAccount}
				onRemoveSecondary={handleRemoveSecondaryAccount}
				onSave={handleSaveEditAccounts}
				onCancel={handleCancelEdit}
				formatCurrency={formatCurrency}
				facilityTotalInterest={facilityTotalInterest}
				facilityTotalRepay={facilityTotalRepay}
			/>

			{/* Partial Payment Split Modal (Option B) */}
			{splitModalTarget && (
				<PartialPaymentModal
					isOpen={Boolean(splitModalTarget)}
					inst={splitModalTarget}
					primaryTag={primaryTag}
					secTag={secTag}
					primarySharePct={primarySharePct}
					secAccounts={secAccounts}
					formatCurrency={formatCurrency}
					onClose={() => setSplitModalTarget(null)}
					onConfirm={handleConfirmSplit}
					onRevert={handleRevertSplit}
				/>
			)}

			{/* Payout Date Discrepancy / Rejection Confirmation Modal */}
			{payoutModalData.isOpen && payoutModalData.action === 'REJECT' && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto overscroll-contain"
					onWheel={(e) => e.stopPropagation()}
					onTouchMove={(e) => e.stopPropagation()}
					onClick={() => {
						if (!isSubmittingPayout) {
							setPayoutModalData({ isOpen: false, action: 'APPROVE', sNo: null, row: null, notes: '' });
						}
					}}
				>
					<div
						className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200 my-auto overscroll-contain"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
							<div className="flex items-center gap-2.5">
								<div className={`w-9 h-9 rounded-xl flex items-center justify-center ${payoutModalData.action === 'APPROVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
									}`}>
									<span className="material-symbols-outlined text-[20px]">
										{payoutModalData.action === 'APPROVE' ? 'verified' : 'flag'}
									</span>
								</div>
								<div>
									<h3 className="font-extrabold text-[15px] text-slate-900">
										{payoutModalData.action === 'APPROVE'
											? (payoutModalData.row?.payout_approval_target === 'PRIMARY' || payoutModalData.row?.payoutApprovalTarget === 'PRIMARY'
												? 'Approve Updated Payout Date'
												: 'Approve EMI Payout Remittance')
											: 'Flag Payout Discrepancy'}
									</h3>
									<p className="text-[11px] text-slate-500 font-medium">
										Installment #{payoutModalData.sNo} • {loan?.client_account_name || loan?.borrower?.name}
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setPayoutModalData({ isOpen: false, action: 'APPROVE', sNo: null, row: null, notes: '' })}
								className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
							>
								<span className="material-symbols-outlined text-[18px]">close</span>
							</button>
						</div>

						{/* Info summary card */}
						<div className="mt-3.5 bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70 text-xs flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<span className="text-slate-500 font-bold">Total Installment EMI:</span>
								<span className="font-extrabold text-slate-900 font-mono">
									{formatCurrency(payoutModalData.row?.amount)}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-slate-500 font-bold">Client Payment Date:</span>
								<span className="font-extrabold text-slate-900 font-mono">
									{payoutModalData.row?.receivedDate || '-'}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-slate-500 font-bold">Scheduled Remittance Date:</span>
								<span className="font-extrabold text-blue-900 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200/70">
									{payoutModalData.row?.dueDate || '-'}
								</span>
							</div>
							{(payoutModalData.row?.secAccounts || []).length > 0 && (
								<div className="pt-2 border-t border-slate-200/60 mt-1 flex flex-col gap-1">
									<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Secondary Account Share</span>
									{payoutModalData.row.secAccounts.map((sa, i) => (
										<div key={i} className="flex items-center justify-between text-xs">
											<span className="text-purple-900 font-bold">{sa.accountTag || sa.accountName}:</span>
											<span className="font-extrabold text-purple-900 font-mono">{formatCurrency(sa.amount)}</span>
										</div>
									))}
								</div>
							)}
						</div>

						<div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-slate-100">
							<button
								type="button"
								onClick={() => setPayoutModalData({ isOpen: false, action: 'APPROVE', sNo: null, row: null, notes: '' })}
								disabled={isSubmittingPayout}
								className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={isSubmittingPayout || (payoutModalData.action === 'REJECT' && !payoutModalData.notes.trim())}
								onClick={handleConfirmPayoutAction}
								className={`px-4 py-2 rounded-xl text-[12.5px] font-extrabold text-white shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${payoutModalData.action === 'APPROVE'
									? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
									: 'bg-rose-600 hover:bg-rose-700 active:scale-95'
									}`}
							>
								{isSubmittingPayout ? (
									<>
										<span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
										<span>Processing...</span>
									</>
								) : payoutModalData.action === 'APPROVE' ? (
									<>
										<span className="material-symbols-outlined text-[16px]">task_alt</span>
										<span>Confirm Payout Date</span>
									</>
								) : (
									<>
										<span className="material-symbols-outlined text-[16px]">report</span>
										<span>Submit Discrepancy</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Reject Loan Confirmation Modal */}
			{isRejectModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
					<div
						className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between pb-3 border-b border-slate-100">
							<h3 className="font-extrabold text-[16px] text-rose-600 flex items-center gap-2">
								<span className="material-symbols-outlined text-[20px]">cancel</span>
								<span>Reject Joint Facility Application</span>
							</h3>
							<button
								type="button"
								onClick={() => {
									setIsRejectModalOpen(false);
									setRejectReason('');
								}}
								className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
							>
								<span className="material-symbols-outlined text-[18px]">close</span>
							</button>
						</div>

						<p className="text-[13px] text-slate-600 mt-3 leading-relaxed">
							Are you sure you want to decline this joint loan? Once rejected, this facility will be locked and removed from live servicing.
						</p>

						<div className="mt-4">
							<label className="block text-[12px] font-bold text-slate-700 mb-1">
								Reason for Rejection <span className="text-rose-500">*</span>
							</label>
							<textarea
								rows={3}
								value={rejectReason}
								onChange={(e) => setRejectReason(e.target.value)}
								placeholder="e.g. Terms declined, KYC mismatch, or interest rates unapproved..."
								className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[12.5px] outline-none focus:border-rose-500 transition-all font-medium resize-none"
							/>
						</div>

						<div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
							<button
								type="button"
								onClick={() => {
									setIsRejectModalOpen(false);
									setRejectReason('');
								}}
								className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={!rejectReason.trim() || isSubmittingApproval}
								onClick={() => handleRejectLoan(rejectReason)}
								className="px-4 py-2 rounded-xl text-[12.5px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
							>
								{isSubmittingApproval ? 'Submitting...' : 'Confirm Rejection'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Add Penal Interest Modal */}
			{isAddPenalModalOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-sans overscroll-contain animate-fadeIn overflow-y-auto"
					onWheel={(e) => e.stopPropagation()}
					onTouchMove={(e) => e.stopPropagation()}
					onClick={() => setIsAddPenalModalOpen(false)}
				>
					<div
						className="bg-white rounded-2xl max-w-xl w-full h-[calc(100vh-5rem)] flex flex-col shadow-2xl ring-1 ring-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/60">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
									<span className="material-symbols-outlined text-[22px]">percent</span>
								</div>
								<div>
									<h3 className="font-extrabold text-[16px] text-slate-900">
										Add Penal Interest
									</h3>
									<p className="text-[11.5px] text-slate-500">
										Record new penal interest for this joint loan
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setIsAddPenalModalOpen(false)}
								className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
								title="Close modal"
							>
								<span className="material-symbols-outlined text-[20px]">close</span>
							</button>
						</div>

						{/* Form */}
						<form onSubmit={handleCreatePenalInterest} className="flex flex-col flex-1 min-h-0 overflow-hidden">
							{/* Scrollable Form Content */}
							<div className="overflow-y-auto overscroll-contain p-6 space-y-4 flex-1">
								{penalFormError && (
									<div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-semibold flex items-center gap-2">
										<span className="material-symbols-outlined text-[18px] text-rose-500">error</span>
										<span>{penalFormError}</span>
									</div>
								)}

								{/* Date & Penal Amount Row */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
									{/* Date Field */}
									<div>
										<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
											Date <span className="text-rose-500">*</span>
										</label>
										<div ref={penalDateContainerRef} className="relative flex items-center">
											<input
												type="text"
												value={penalFormDate}
												placeholder="DD-MM-YYYY"
												maxLength={10}
												onChange={(e) => {
													const formatted = formatWithAutoDash(e.target.value, penalFormDate);
													setPenalFormDate(formatted);
												}}
												className="w-full pl-3.5 pr-24 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-[13.5px] font-semibold text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
												required
											/>
											<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														setShowPenalDateCalendar((prev) => !prev);
														setOpenSecPayoutCalendarIdx(null);
													}}
													className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${showPenalDateCalendar
															? 'bg-primary text-white shadow-xs'
															: 'text-slate-400 hover:text-primary hover:bg-slate-100 active:scale-95'
														}`}
													title="Pick from calendar"
												>
													<span className="material-symbols-outlined text-[17px]">calendar_today</span>
												</button>
												<button
													type="button"
													onClick={() => {
														setPenalFormDate(getTodayDDMMYYYY());
														setShowPenalDateCalendar(false);
													}}
													className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-200/70 text-slate-700 hover:bg-slate-300 transition-colors cursor-pointer"
													title="Set to today's date"
												>
													Today
												</button>
											</div>

											{/* Modern Interactive Calendar Popover */}
											{showPenalDateCalendar && (
												<ModernCalendarPicker
													value={penalFormDate}
													align="left"
													openUpward="auto"
													onChange={(newDate) => {
														setPenalFormDate(newDate);
														setShowPenalDateCalendar(false);
													}}
													onClose={() => setShowPenalDateCalendar(false)}
												/>
											)}
										</div>
									</div>

									{/* Penal Amount Field */}
									<div>
										<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
											Penal Amount <span className="text-rose-500">*</span>
										</label>
										<div className="relative">
											<span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-[14px]">
												₹
											</span>
											<input
												type="number"
												min="1"
												step="any"
												value={penalFormAmount}
												placeholder="e.g. 5000"
												onChange={(e) => handlePenalAmountChange(e.target.value)}
												onWheel={(e) => e.target.blur()}
												className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-[13.5px] font-bold text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
												required
											/>
										</div>
									</div>
								</div>

								{/* Account Split Section */}
								<div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
									<div className="flex items-center justify-between flex-wrap gap-1 pb-1 border-b border-slate-200/70">
										<span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
											<span className="material-symbols-outlined text-[15px] text-primary">pie_chart</span>
											<span>Account Split ({shareRatioText}%)</span>
										</span>
										{penalFormAmount && Number(penalFormAmount) > 0 && (
											<span
												className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${isPenalExceeded
														? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300'
														: Math.abs(penalAllocatedTotal - Number(penalFormAmount)) < 0.01
															? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
															: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
													}`}
											>
												{isPenalExceeded
													? `Exceeds by ₹${(penalAllocatedTotal - Number(penalFormAmount)).toLocaleString('en-IN')}`
													: Math.abs(penalAllocatedTotal - Number(penalFormAmount)) < 0.01
														? '✓ 100% Allocated'
														: `₹${(Number(penalFormAmount) - penalAllocatedTotal).toLocaleString('en-IN')} unallocated`}
											</span>
										)}
									</div>

									<div className="space-y-2.5">
										{/* Primary Account: Amount */}
										<div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-2">
											<div className="flex items-center justify-between pb-1 border-b border-slate-100">
												<span className="truncate text-[11.5px] font-bold text-slate-800" title={primaryAcc?.accountName || primaryTag}>
													{primaryTag} ({primarySharePercent}%)
												</span>
												<span className="text-[9px] text-blue-700 font-bold uppercase bg-blue-50 px-1.5 rounded ring-1 ring-blue-200">
													Primary
												</span>
											</div>
											<div>
												<label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
													Amount
												</label>
												<div className="relative">
													<span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-[12.5px]">
														₹
													</span>
													<input
														type="number"
														min="0"
														step="any"
														value={penalPriAmount}
														placeholder="0"
														onChange={(e) => handlePriAmountChange(e.target.value)}
														onWheel={(e) => e.target.blur()}
														className={`w-full pl-6 pr-2.5 py-2 bg-slate-50/60 border rounded-xl text-[12.5px] font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isPenalExceeded
																? 'border-rose-300 focus:border-rose-500'
																: 'border-slate-200 focus:border-primary'
															}`}
													/>
												</div>
											</div>
										</div>

										{/* When multiple secondary accounts: display 1 shared Payout Date field */}
										{effectiveSecAccounts.length > 1 && (
											<div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-2">
												<div className="flex items-center justify-between pb-1 border-b border-slate-100">
													<span className="text-[11.5px] font-bold text-slate-800 flex items-center gap-1.5">
														<span className="material-symbols-outlined text-[15px] text-purple-600">calendar_month</span>
														<span>Payout Date (Secondary Accounts)</span>
													</span>
													<span className="text-[9px] text-purple-700 font-bold uppercase bg-purple-50 px-1.5 rounded ring-1 ring-purple-200">
														All Secondary
													</span>
												</div>
												<div>
													<label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
														Payout Date
													</label>
													<div
														ref={commonSecPayoutRef}
														className="relative flex items-center"
													>
														<input
															type="text"
															value={penalSecPayoutDates[0] !== undefined ? penalSecPayoutDates[0] : ''}
															placeholder="DD-MM-YYYY"
															maxLength={10}
															onChange={(e) => {
																const prevVal = penalSecPayoutDates[0] || '';
																const formatted = formatWithAutoDash(e.target.value, prevVal);
																setPenalSecPayoutDates(effectiveSecAccounts.map(() => formatted));
															}}
															className="w-full pl-3 pr-9 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-[12.5px] font-semibold text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
														/>
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																setShowCommonSecCalendar((prev) => !prev);
																setShowPenalDateCalendar(false);
															}}
															className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg transition-all cursor-pointer ${showCommonSecCalendar
																	? 'bg-primary text-white shadow-xs'
																	: 'text-slate-400 hover:text-primary hover:bg-slate-100 active:scale-95'
																}`}
															title="Pick Payout Date from calendar"
														>
															<span className="material-symbols-outlined text-[16px]">calendar_today</span>
														</button>

														{/* Modern Interactive Calendar Popover */}
														{showCommonSecCalendar && (
															<ModernCalendarPicker
																value={penalSecPayoutDates[0] || ''}
																align="left"
																openUpward="auto"
																onChange={(newDate) => {
																	setPenalSecPayoutDates(effectiveSecAccounts.map(() => newDate));
																	setShowCommonSecCalendar(false);
																}}
																onClose={() => setShowCommonSecCalendar(false)}
															/>
														)}
													</div>
												</div>
											</div>
										)}

										{/* Secondary Accounts Amount Cards */}
										{effectiveSecAccounts.map((sec, idx) => {
											const tag = sec.accountTag || sec.initials || `SEC${idx + 1}`;
											const sharePct = secondarySharePercents[idx] || (100 - Number(primarySharePercent));
											const isSingleSec = effectiveSecAccounts.length === 1;

											return (
												<div key={`sec-input-${tag}-${idx}`} className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-2">
													<div className="flex items-center justify-between pb-1 border-b border-slate-100">
														<span className="truncate text-[11.5px] font-bold text-slate-800" title={sec.accountName || tag}>
															{tag} ({formatSharePercent(sharePct)}%)
														</span>
														<span className="text-[9px] text-purple-700 font-bold uppercase bg-purple-50 px-1.5 rounded ring-1 ring-purple-200">
															Secondary
														</span>
													</div>

													{isSingleSec ? (
														<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
															{/* Payout Date */}
															<div>
																<label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																	Payout Date
																</label>
																<div
																	ref={(el) => {
																		if (el) secPayoutContainerRefs.current[idx] = el;
																		else delete secPayoutContainerRefs.current[idx];
																	}}
																	className="relative flex items-center"
																>
																	<input
																		type="text"
																		value={penalSecPayoutDates[idx] !== undefined ? penalSecPayoutDates[idx] : ''}
																		placeholder="DD-MM-YYYY"
																		maxLength={10}
																		onChange={(e) => {
																			const prevVal = penalSecPayoutDates[idx] || '';
																			const formatted = formatWithAutoDash(e.target.value, prevVal);
																			setPenalSecPayoutDates((prev) => {
																				const next = [...prev];
																				next[idx] = formatted;
																				return next;
																			});
																		}}
																		className="w-full pl-3 pr-9 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-[12.5px] font-semibold text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
																	/>
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			setOpenSecPayoutCalendarIdx((prev) => (prev === idx ? null : idx));
																			setShowPenalDateCalendar(false);
																		}}
																		className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg transition-all cursor-pointer ${openSecPayoutCalendarIdx === idx
																				? 'bg-primary text-white shadow-xs'
																				: 'text-slate-400 hover:text-primary hover:bg-slate-100 active:scale-95'
																			}`}
																		title="Pick Payout Date from calendar"
																	>
																		<span className="material-symbols-outlined text-[16px]">calendar_today</span>
																	</button>

																	{/* Modern Interactive Calendar Popover */}
																	{openSecPayoutCalendarIdx === idx && (
																		<ModernCalendarPicker
																			value={penalSecPayoutDates[idx] || ''}
																			align="left"
																			openUpward="auto"
																			onChange={(newDate) => {
																				setPenalSecPayoutDates((prev) => {
																					const next = [...prev];
																					next[idx] = newDate;
																					return next;
																				});
																				setOpenSecPayoutCalendarIdx(null);
																			}}
																			onClose={() => setOpenSecPayoutCalendarIdx(null)}
																		/>
																	)}
																</div>
															</div>

															{/* Amount */}
															<div>
																<label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																	Amount
																</label>
																<div className="relative">
																	<span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-[12.5px]">
																		₹
																	</span>
																	<input
																		type="number"
																		min="0"
																		step="any"
																		value={penalSecAmounts[idx] !== undefined ? penalSecAmounts[idx] : ''}
																		placeholder="0"
																		onChange={(e) => handleSecAmountChange(e.target.value, idx)}
																		onWheel={(e) => e.target.blur()}
																		className={`w-full pl-6 pr-2.5 py-2 bg-slate-50/60 border rounded-xl text-[12.5px] font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isPenalExceeded
																				? 'border-rose-300 focus:border-rose-500'
																				: 'border-slate-200 focus:border-primary'
																			}`}
																	/>
																</div>
															</div>
														</div>
													) : (
														/* When multiple secondary accounts: only Amount is displayed per account */
														<div>
															<label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																Amount
															</label>
															<div className="relative">
																<span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-[12.5px]">
																	₹
																</span>
																<input
																	type="number"
																	min="0"
																	step="any"
																	value={penalSecAmounts[idx] !== undefined ? penalSecAmounts[idx] : ''}
																	placeholder="0"
																	onChange={(e) => handleSecAmountChange(e.target.value, idx)}
																	onWheel={(e) => e.target.blur()}
																	className={`w-full pl-6 pr-2.5 py-2 bg-slate-50/60 border rounded-xl text-[12.5px] font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isPenalExceeded
																			? 'border-rose-300 focus:border-rose-500'
																			: 'border-slate-200 focus:border-primary'
																		}`}
																/>
															</div>
														</div>
													)}
												</div>
											);
										})}
									</div>

									{/* Allocation summary text */}
									<div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
										<span>Total Allocated:</span>
										<span className={`font-mono font-extrabold ${isPenalExceeded ? 'text-rose-600' : 'text-slate-800'}`}>
											{formatCurrency(penalAllocatedTotal)} / {formatCurrency(Number(penalFormAmount) || 0)}
										</span>
									</div>
								</div>

								{/* Remarks Field */}
								<div>
									<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
										Remarks
									</label>
									<textarea
										rows={3}
										value={penalFormRemarks}
										placeholder="e.g., Delay penalty for EMI #3, late payment surcharge, etc."
										onChange={(e) => setPenalFormRemarks(e.target.value)}
										className="w-full p-3 bg-slate-50/70 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
									/>
								</div>

							</div>

							{/* Fixed Modal Footer */}
							<div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/60">
								<button
									type="button"
									onClick={() => setIsAddPenalModalOpen(false)}
									className="px-4 py-2 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={isPenalExceeded}
									className={`px-5 py-2 rounded-xl text-[12.5px] font-bold text-white shadow-sm transition-all active:scale-95 flex items-center gap-1.5 ${isPenalExceeded
											? 'bg-slate-400 cursor-not-allowed opacity-60'
											: 'bg-primary hover:bg-primary/90 cursor-pointer'
										}`}
								>
									<span className="material-symbols-outlined text-[18px]">check</span>
									<span>Save Penal Interest</span>
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Delete Confirmation Card for Penal Interest */}
			{penalDeleteTarget && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-sans overscroll-contain animate-fadeIn"
					onClick={() => setPenalDeleteTarget(null)}
				>
					<div
						className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center justify-center shrink-0">
									<span className="material-symbols-outlined text-[22px]">delete_forever</span>
								</div>
								<div>
									<h3 className="font-extrabold text-[15.5px] text-slate-900">
										Delete Penal Interest
									</h3>
									<p className="text-[11.5px] text-slate-500">
										Confirm removal of this penal entry
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setPenalDeleteTarget(null)}
								className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
								title="Close"
							>
								<span className="material-symbols-outlined text-[18px]">close</span>
							</button>
						</div>

						{/* Confirmation Message */}
						<p className="text-[13px] text-slate-600 mt-3.5 leading-relaxed">
							Are you sure you want to remove this penal interest entry?
						</p>

						{/* Target Entry Summary Card */}
						<div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
							<div className="flex items-center justify-between text-[12px]">
								<span className="font-semibold text-slate-500">Record Date</span>
								<span className="font-bold text-slate-800">{penalDeleteTarget.date}</span>
							</div>
							<div className="flex items-center justify-between text-[12px]">
								<span className="font-semibold text-slate-500">Penal Amount</span>
								<span className="font-extrabold text-[13.5px] text-slate-900">
									{formatCurrency(penalDeleteTarget.amount)}
								</span>
							</div>
							<div className="flex items-center justify-between text-[11.5px] pt-1.5 border-t border-slate-200/60">
								<span className="font-medium text-slate-500">
									Primary Share ({penalDeleteTarget.primaryTag || primaryTag})
								</span>
								<span className="font-bold text-blue-900">
									{formatCurrency(
										penalDeleteTarget.primaryAmount != null
											? penalDeleteTarget.primaryAmount
											: Math.round(((Number(penalDeleteTarget.amount) || 0) * Number(primarySharePercent)) / 100)
									)}
								</span>
							</div>
							{effectiveSecAccounts.map((sec, sIdx) => {
								const tag = sec.accountTag || sec.initials || `SEC${sIdx + 1}`;
								let secAmt = 0;
								if (penalDeleteTarget.secAmounts && penalDeleteTarget.secAmounts[sIdx] != null) {
									secAmt = Number(penalDeleteTarget.secAmounts[sIdx]) || 0;
								} else if (sIdx === 0 && penalDeleteTarget.secAmount != null) {
									secAmt = Number(penalDeleteTarget.secAmount) || 0;
								} else {
									const sPct = Number(secondarySharePercents[sIdx]) || (100 - Number(primarySharePercent));
									secAmt = Math.round(((Number(penalDeleteTarget.amount) || 0) * sPct) / 100);
								}
								return (
									<div key={`confirm-sec-${tag}-${sIdx}`} className="flex items-center justify-between text-[11.5px]">
										<span className="font-medium text-slate-500">
											Secondary Share ({tag})
										</span>
										<span className="font-bold text-purple-900">
											{formatCurrency(secAmt)}
										</span>
									</div>
								);
							})}
							{penalDeleteTarget.remarks && (
								<div className="flex items-start justify-between text-[11.5px] pt-1.5 border-t border-slate-200/60">
									<span className="font-medium text-slate-500 shrink-0 mr-2">Remarks</span>
									<span className="font-medium text-slate-700 italic truncate text-right max-w-[240px]">
										"{penalDeleteTarget.remarks}"
									</span>
								</div>
							)}
						</div>

						{/* Actions */}
						<div className="flex items-center justify-end gap-2.5 mt-5 pt-3.5 border-t border-slate-100">
							<button
								type="button"
								onClick={() => setPenalDeleteTarget(null)}
								className="px-4 py-2 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmDeletePenal}
								className="px-4 py-2 rounded-xl text-[12.5px] font-bold bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
							>
								<span className="material-symbols-outlined text-[17px]">delete</span>
								<span>Delete</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Export Download Success Notification Card (Light-green bg, auto-closes in 5s) */}
			{exportNotification && (
				<div
					role="status"
					aria-live="polite"
					className="fixed bottom-6 right-6 z-[100] max-w-[calc(100vw-3rem)] sm:max-w-md w-auto flex items-center justify-between gap-3.5 px-4 py-3 sm:px-5 sm:py-3.5 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl shadow-xl shadow-emerald-950/10 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
				>
					<div className="flex items-center gap-3 min-w-0">
						<div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700">
							<span className="material-symbols-outlined text-[20px]">download_done</span>
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-[13px] font-bold text-emerald-950 leading-tight">
								Repayment Schedule Downloaded
							</span>
							<span className="text-[11.5px] font-medium text-emerald-700 font-mono truncate max-w-[240px] sm:max-w-xs mt-0.5">
								{exportNotification}
							</span>
						</div>
					</div>
					<button
						type="button"
						onClick={handleCloseExportNotification}
						className="w-8 h-8 flex items-center justify-center rounded-xl text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200/60 transition-colors cursor-pointer shrink-0 ml-1"
						title="Close notification"
						aria-label="Close notification"
					>
						<span className="material-symbols-outlined text-[18px]">close</span>
					</button>
				</div>
			)}
		</div>
	);
}

export default function JointLoan({ searchQuery: propSearchQuery = '', currentUser: propCurrentUser, resetViewTrigger }) {
	const [loans, setLoans] = useState([]);
	const [internalSearchQuery, setInternalSearchQuery] = useState('');
	const searchQuery = propSearchQuery !== '' ? propSearchQuery : internalSearchQuery;
	const [statusFilter, setStatusFilter] = useState('ALL');
	const [accountFilter, setAccountFilter] = useState('ALL');
	const [dateRangeFilter, setDateRangeFilter] = useState({ startDate: '', endDate: '' });
	const [selectedLoan, setSelectedLoan] = useState(null);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncFeedback, setSyncFeedback] = useState(null);
	const [lastSyncTime, setLastSyncTime] = useState(() => {
		try {
			return localStorage.getItem('joint_loan_last_sync_time') || null;
		} catch (e) {
			return null;
		}
	});

	const fetchingLoanIdRef = useRef(null);

	// When user clicks the Joint Loan menu in the sidebar while viewing a loan's details,
	// reset selectedLoan to return to the Joint Loan portfolio/table view.
	useEffect(() => {
		if (resetViewTrigger !== undefined && resetViewTrigger > 0) {
			if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
				window.history.pushState({}, '', '/joint-loan');
			}
			setSelectedLoan(null);
			setIsCreateOpen(false);
			setAccessRestrictedModal({ isOpen: false, loan: null });
		}
	}, [resetViewTrigger]);

	useEffect(() => {
		const handleReset = () => {
			if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
				window.history.pushState({}, '', '/joint-loan');
			}
			setSelectedLoan(null);
			setIsCreateOpen(false);
			setAccessRestrictedModal({ isOpen: false, loan: null });
		};
		window.addEventListener('reset-joint-loan-view', handleReset);
		return () => window.removeEventListener('reset-joint-loan-view', handleReset);
	}, []);

	// Pagination state (default 10 records per page)
	const [currentPage, setCurrentPage] = useState(1);
	const pageSize = 10;

	const [availableAccountOptions, setAvailableAccountOptions] = useState(secondaryAccountOptions);
	const [availableAccountObjects, setAvailableAccountObjects] = useState([]);
	const [allUsers, setAllUsers] = useState([]);
	const [accessRestrictedModal, setAccessRestrictedModal] = useState({ isOpen: false, loan: null });
	const [createLoanSuccessAlert, setCreateLoanSuccessAlert] = useState(null);
	const createLoanAlertTimerRef = useRef(null);

	// Helper to resolve respected secondary manager's user name
	const getRespectedSecManagerName = (loanObj, apiSecManagerName) => {
		if (apiSecManagerName && String(apiSecManagerName).trim()) {
			return String(apiSecManagerName).trim();
		}
		const secUsers = getUsersWithPrimaryAccessForLoanSecondary(loanObj, allUsers, availableAccountObjects);
		if (secUsers && secUsers.length > 0) {
			return secUsers.map((u) => u.name || u.employee_code || u.username).filter(Boolean).join(', ');
		}
		const secAccounts = getLoanSecondaryAccounts(loanObj);
		return secAccounts && secAccounts.length > 0 ? `${secAccounts.join(', ')} Manager` : 'Secondary Manager';
	};

	// Helper to display alert message at right side of page and auto-close after 5 seconds
	const showBottomRightAlert = (msg) => {
		if (createLoanAlertTimerRef.current) {
			clearTimeout(createLoanAlertTimerRef.current);
		}
		setCreateLoanSuccessAlert(msg);
		createLoanAlertTimerRef.current = setTimeout(() => {
			setCreateLoanSuccessAlert(null);
		}, 5000);
	};

	const showCreateSuccessAlert = (loanId, secManagerName, isAutoApproved = false) => {
		const msg = isAutoApproved
			? `Joint loan ${loanId} created and approved successfully. Facility is active immediately.`
			: `joint loan ${loanId} created successfully. approval request send to ${secManagerName}.`;
		showBottomRightAlert(msg);
	};

	const showSecApproveSuccessAlert = (loanId) => {
		const msg = `joint loan ${loanId} approved successfully. approval request send to admin.`;
		showBottomRightAlert(msg);
	};

	// Clean up timer on unmount
	useEffect(() => {
		return () => {
			if (createLoanAlertTimerRef.current) {
				clearTimeout(createLoanAlertTimerRef.current);
			}
		};
	}, []);

	// Account role toggle filter: 'all' | 'primary' | 'secondary' (default is 'all')
	const [accountRoleFilter, setAccountRoleFilter] = useState('all');

	// Resolve active logged-in user and permissions
	const activeUser = useMemo(() => {
		if (propCurrentUser) return propCurrentUser;
		try {
			const stored = sessionStorage.getItem('loanDesk_user') || localStorage.getItem('loanDesk_user');
			return stored ? JSON.parse(stored) : null;
		} catch (e) {
			return null;
		}
	}, [propCurrentUser]);

	const isSuperAdmin = useMemo(() => {
		if (!activeUser) return false;
		const role = (activeUser.role || '').trim().toLowerCase();
		const code = (activeUser.employee_code || '').trim().toLowerCase();
		const name = (activeUser.name || '').trim().toLowerCase();
		return role === 'super admin' || role === 'admin' || code === 'jc0033' || code === 'admin' || name === 'system admin' || Boolean(activeUser?.permissions?.isAdmin);
	}, [activeUser]);

	const userPermissions = useMemo(() => {
		if (!activeUser) return { isAdmin: true, primary: [], secondary: [] };
		const isAdmin = ['admin', 'super admin'].includes((activeUser.role || '').toLowerCase()) || Boolean(activeUser?.permissions?.isAdmin);

		let perms = activeUser.permissions;
		if (typeof perms === 'string') {
			try {
				perms = JSON.parse(perms);
			} catch (e) {
				perms = {};
			}
		}

		let primary = [];
		let secondary = [];

		if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
			primary = Array.isArray(perms.primary) ? perms.primary : [];
			secondary = Array.isArray(perms.secondary) ? perms.secondary : [];
		} else if (Array.isArray(perms)) {
			primary = perms;
		}

		return {
			isAdmin,
			primary,
			secondary,
		};
	}, [activeUser]);

	// Counts for toggle buttons (All, Primary, Secondary)
	const roleCounts = useMemo(() => {
		let all = 0;
		let primary = 0;
		let secondary = 0;
		loans.forEach((loan) => {
			if (doesLoanMatchUserPermissions(loan, userPermissions, availableAccountObjects, 'all')) {
				all += 1;
			}
			if (doesLoanMatchUserPermissions(loan, userPermissions, availableAccountObjects, 'primary')) {
				primary += 1;
			}
			if (doesLoanMatchUserPermissions(loan, userPermissions, availableAccountObjects, 'secondary')) {
				secondary += 1;
			}
		});
		return { all, primary, secondary };
	}, [loans, userPermissions, availableAccountObjects]);

	// Filter loans according to user's assigned primary and secondary accounts and role toggle
	const userPermittedLoans = useMemo(() => {
		return loans.filter((loan) => {
			const isPendingSecondary = loan.approval_status === 'PENDING_SECONDARY' || (!loan.approval_status && loan.status === 'Pending');
			if (accountRoleFilter !== 'primary' && isPendingSecondary && checkUserHasPrimaryAccessForLoanSecondary(activeUser, loan, availableAccountObjects)) {
				return true;
			}
			return doesLoanMatchUserPermissions(loan, userPermissions, availableAccountObjects, accountRoleFilter);
		});
	}, [loans, userPermissions, availableAccountObjects, accountRoleFilter, activeUser]);

	// Load joint loans and account names from Flask backend on mount
	useEffect(() => {
		let isMounted = true;
		const loadLoans = async () => {
			try {
				const remote = await api.getJointLoans();
				if (isMounted && Array.isArray(remote)) {
					setLoans(remote);
				}
			} catch (err) {
				console.warn('Backend joint loans unavailable:', err);
			}
		};
		const loadAccountNames = async () => {
			try {
				const accs = await api.getAccountNames();
				if (isMounted && Array.isArray(accs) && accs.length > 0) {
					setAvailableAccountObjects(accs);
					setAvailableAccountOptions(accs.map((a) => a.name));
					setCachedGlobalAccountObjects(accs);
				}
			} catch (err) {
				console.warn('Backend account names unavailable:', err);
			}
		};
		const loadUsers = async () => {
			try {
				const users = await api.getUsers();
				if (isMounted && Array.isArray(users)) {
					setAllUsers(users);
				}
			} catch (err) {
				console.warn('Backend users unavailable:', err);
			}
		};
		const loadSyncStatus = async () => {
			try {
				const status = await api.getSyncStatus();
				if (isMounted && status?.last_sync_time) {
					setLastSyncTime(status.last_sync_time);
					try {
						localStorage.setItem('joint_loan_last_sync_time', status.last_sync_time);
					} catch (e) {}
				}
			} catch (err) {
				console.warn('Sync status load warning:', err);
			}
		};
		loadLoans();
		loadAccountNames();
		loadUsers();
		loadSyncStatus();
		return () => {
			isMounted = false;
		};
	}, []);

	// Synchronize selected loan with URL path (e.g. /joint-loan/JLSS000040)
	useEffect(() => {
		let isCancelled = false;

		const syncLoanFromUrl = async () => {
			const pathLoanId = extractLoanIdFromPath(window.location.pathname);
			if (!pathLoanId) {
				if (selectedLoan) {
					setSelectedLoan(null);
				}
				return;
			}

			// If selectedLoan already matches pathLoanId, nothing more to do
			if (selectedLoan && isMatchingLoan(selectedLoan, pathLoanId)) {
				return;
			}

			// 1. Check if already loaded in loans state
			const existing = loans.find((l) => isMatchingLoan(l, pathLoanId));
			if (existing) {
				const canAccess = canUserAccessLoan(existing, activeUser, userPermissions, availableAccountObjects, allUsers);
				if (!canAccess) {
					setAccessRestrictedModal({ isOpen: true, loan: existing });
					setSelectedLoan(null);
					if (window.location.pathname !== '/joint-loan') {
						window.history.replaceState({}, '', '/joint-loan');
					}
				} else {
					setSelectedLoan(existing);
				}
				return;
			}

			// 2. Fetch directly from backend if not yet in loans state
			if (fetchingLoanIdRef.current === pathLoanId) {
				return;
			}
			fetchingLoanIdRef.current = pathLoanId;

			try {
				const fetched = await api.getJointLoan(pathLoanId);
				if (isCancelled) return;
				if (fetched && !fetched.error) {
					const canAccess = canUserAccessLoan(fetched, activeUser, userPermissions, availableAccountObjects, allUsers);
					if (!canAccess) {
						setAccessRestrictedModal({ isOpen: true, loan: fetched });
						setSelectedLoan(null);
						if (window.location.pathname !== '/joint-loan') {
							window.history.replaceState({}, '', '/joint-loan');
						}
					} else {
						setSelectedLoan(fetched);
					}
				} else {
					if (window.location.pathname !== '/joint-loan') {
						window.history.replaceState({}, '', '/joint-loan');
					}
				}
			} catch (err) {
				if (isCancelled) return;
				console.warn(`Could not load joint loan ${pathLoanId} from URL:`, err);
				if (window.location.pathname !== '/joint-loan') {
					window.history.replaceState({}, '', '/joint-loan');
				}
			} finally {
				if (!isCancelled) {
					fetchingLoanIdRef.current = null;
				}
			}
		};

		syncLoanFromUrl();

		const handlePopState = () => {
			syncLoanFromUrl();
		};
		window.addEventListener('popstate', handlePopState);
		return () => {
			isCancelled = true;
			fetchingLoanIdRef.current = null;
			window.removeEventListener('popstate', handlePopState);
		};
	}, [loans, activeUser, userPermissions, availableAccountObjects, allUsers, selectedLoan]);

	// Handle DB Sync with Flask backend
	const handleDbSync = async () => {
		setIsSyncing(true);
		setSyncFeedback(null);
		try {
			const syncRes = await api.syncData();
			const fresh = await api.getJointLoans();
			if (Array.isArray(fresh) && fresh.length > 0) {
				setLoans(fresh);
				if (selectedLoan) {
					const updated = fresh.find((l) => String(l.id) === String(selectedLoan.id));
					if (updated) {
						setSelectedLoan(updated);
					}
				}
			}
			try {
				const freshAccs = await api.getAccountNames();
				if (Array.isArray(freshAccs) && freshAccs.length > 0) {
					setAvailableAccountObjects(freshAccs);
					setAvailableAccountOptions(freshAccs.map((a) => a.name));
				}
			} catch (accErr) {
				console.warn('Sync account names warning:', accErr);
			}

			// Format current time as DD-MM-YYYY hh:mm AM/PM fallback if not returned by backend
			let syncedTime = syncRes?.last_sync_time;
			if (!syncedTime) {
				const now = new Date();
				const pad = (n) => String(n).padStart(2, '0');
				const day = pad(now.getDate());
				const month = pad(now.getMonth() + 1);
				const year = now.getFullYear();
				let hours = now.getHours();
				const ampm = hours >= 12 ? 'PM' : 'AM';
				hours = hours % 12 || 12;
				const minutes = pad(now.getMinutes());
				syncedTime = `${day}-${month}-${year} ${pad(hours)}:${minutes} ${ampm}`;
			}

			setLastSyncTime(syncedTime);
			try {
				localStorage.setItem('joint_loan_last_sync_time', syncedTime);
			} catch (e) {}

			setIsSyncing(false);
			setSyncFeedback('DB Synced');
			setTimeout(() => setSyncFeedback(null), 2500);
		} catch (err) {
			console.warn('Sync failed:', err);
			setIsSyncing(false);
			setSyncFeedback('Sync Failed');
			setTimeout(() => setSyncFeedback(null), 2500);
		}
	};

	// New loan form state
	const [newPrimaryName, setNewPrimaryName] = useState('');
	const [newCoName, setNewCoName] = useState('');
	const [newPurpose, setNewPurpose] = useState('');
	const [newAmount, setNewAmount] = useState('');
	const [newRate, setNewRate] = useState('7.2% Fixed');
	const [newCategory, setNewCategory] = useState('Commercial');
	const [newStatus, setNewStatus] = useState('Pending');
	const [newPrimaryType, setNewPrimaryType] = useState('SCS');

	// Upload area & secondary accounts state
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const fileInputRef = useRef(null);
	// PDF parsing state
	const [pdfParsing, setPdfParsing] = useState(false);
	const [pdfParsed, setPdfParsed] = useState(null);   // { loan_number, primary_account, client_account, loan_date, loan_amount, total_repayment, table }
	const [pdfError, setPdfError] = useState('');
	const [selectedPdfFile, setSelectedPdfFile] = useState(null); // Actual File object for upload+store
	const [duplicateLoanError, setDuplicateLoanError] = useState(null); // { loanId, clientName, amount, date, status, message }
	const [unauthorizedPrimaryError, setUnauthorizedPrimaryError] = useState(null); // { extractedPrimary, allowedAccounts, allowedLabels, fileName }
	const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);

	// Delete confirmation modal state
	const [loanToDelete, setLoanToDelete] = useState(null);
	const [isDeletingLoan, setIsDeletingLoan] = useState(false);

	// Stop background scrolling when Delete confirmation modal is open
	useEffect(() => {
		if (loanToDelete) {
			document.body.style.overflow = 'hidden';
			const handleKeyDown = (e) => {
				if (e.key === 'Escape' && !isDeletingLoan) {
					setLoanToDelete(null);
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				document.body.style.overflow = '';
				window.removeEventListener('keydown', handleKeyDown);
			};
		} else {
			document.body.style.overflow = '';
		}
	}, [loanToDelete, isDeletingLoan]);

	// Stop background scrolling when New Loan application modal is open
	useEffect(() => {
		if (isCreateOpen) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		} else {
			document.body.style.overflow = '';
		}
	}, [isCreateOpen]);

	const [primaryAmountInput, setPrimaryAmountInput] = useState('');
	const [primaryShareInput, setPrimaryShareInput] = useState('50');
	const [secondaryAccounts, setSecondaryAccounts] = useState(() => [
		{ id: 1, accountName: secondaryAccountOptions[0], amount: '', sharePercent: '' },
	]);

	// Helper to check if an account name matches the loan's primary account (by name, acronym, or canon)
	const isPrimaryAccountMatch = (optionName, primaryName) => {
		if (!optionName || !primaryName) return false;
		const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
		const optClean = clean(optionName);
		const priClean = clean(primaryName);
		if (!optClean || !priClean) return false;
		if (optClean === priClean) return true;

		// Match via account objects (e.g. matching name against acronym or vice versa)
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			const primaryObj = availableAccountObjects.find(
				(a) => clean(a.name) === priClean || clean(a.acronym) === priClean
			);
			if (primaryObj) {
				if (clean(primaryObj.name) === optClean || clean(primaryObj.acronym) === optClean) {
					return true;
				}
			}
			const optObj = availableAccountObjects.find(
				(a) => clean(a.name) === optClean || clean(a.acronym) === optClean
			);
			if (optObj) {
				if (clean(optObj.name) === priClean || clean(optObj.acronym) === priClean) {
					return true;
				}
			}
		}
		return false;
	};

	const handleCloseCreateModal = () => {
		setIsCreateOpen(false);
		setNewPrimaryName('');
		setNewCoName('');
		setNewPurpose('');
		setNewAmount('');
		setNewStatus('Pending');
		setNewPrimaryType('SCS');
		setPrimaryAmountInput('');
		setPrimaryShareInput('50');
		setSecondaryAccounts([{ id: 1, accountName: '', amount: '', sharePercent: '' }]);
		setUploadedFiles([]);
		setPdfParsed(null);
		setPdfError('');
		setSelectedPdfFile(null);
		setDuplicateLoanError(null);
		setUnauthorizedPrimaryError(null);
		setIsSubmittingLoan(false);
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const handleAddSecondaryAccount = () => {
		const priName = pdfParsed?.primary_account || newPrimaryName || '';
		setSecondaryAccounts((prev) => {
			const usedNames = prev.map((a) => a.accountName).filter(Boolean);
			const availableOpt =
				availableAccountOptions.find(
					(opt) => !isPrimaryAccountMatch(opt, priName) && !usedNames.includes(opt)
				) || '';
			return [
				...prev,
				{
					id: Date.now() + Math.random(),
					accountName: availableOpt,
					amount: '',
					sharePercent: '',
				},
			];
		});
	};

	const handleRemoveSecondaryAccount = (id) => {
		if (secondaryAccounts.length > 1) {
			setSecondaryAccounts((prev) => prev.filter((acc) => acc.id !== id));
		}
	};

	const handleUpdateSecondaryAccount = (id, field, value) => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;

		setSecondaryAccounts((prev) => {
			const targetAcc = prev.find((a) => a.id === id);
			if (!targetAcc) return prev;

			const otherAccountsAmount = prev
				.filter((a) => a.id !== id)
				.reduce((sum, a) => sum + (Number(String(a.amount || '').replace(/[^0-9.-]+/g, '')) || 0), 0);

			const maxAllowedAmount = baseLoanAmount > 0
				? Math.max(0, baseLoanAmount - otherAccountsAmount)
				: Infinity;

			if (field === 'accountName') {
				return prev.map((acc) => (acc.id === id ? { ...acc, accountName: value } : acc));
			}

			if (field === 'amount') {
				let cleanAmt = String(value || '').replace(/[^0-9.]/g, '');
				const parts = cleanAmt.split('.');
				if (parts.length > 2) {
					cleanAmt = parts[0] + '.' + parts.slice(1).join('');
				}

				if (!cleanAmt) {
					return prev.map((acc) =>
						acc.id === id ? { ...acc, amount: '', sharePercent: '' } : acc
					);
				}

				let numVal = parseFloat(cleanAmt);
				if (isNaN(numVal)) {
					return prev.map((acc) =>
						acc.id === id ? { ...acc, amount: cleanAmt, sharePercent: '' } : acc
					);
				}

				// Enforce: total secondary account amount cannot exceed total loan amount
				if (baseLoanAmount > 0 && numVal > maxAllowedAmount) {
					numVal = maxAllowedAmount;
					cleanAmt = String(maxAllowedAmount);
				}

				const formattedAmount = formatIndianNumber(cleanAmt);

				// Auto-adjust share percent
				let calculatedShare = '';
				if (baseLoanAmount > 0) {
					const pct = (numVal / baseLoanAmount) * 100;
					calculatedShare = pct === 0 ? '0' : Number(pct.toFixed(2)).toString();
					const newPriAmt = Math.max(0, baseLoanAmount - (numVal + otherAccountsAmount));
					setPrimaryAmountInput(formatIndianNumber(String(newPriAmt)));
					const priPct = (newPriAmt / baseLoanAmount) * 100;
					setPrimaryShareInput(priPct === 0 ? '0' : Number(priPct.toFixed(2)).toString());
				}

				return prev.map((acc) =>
					acc.id === id
						? {
							...acc,
							amount: formattedAmount,
							sharePercent: calculatedShare,
						}
						: acc
				);
			}

			if (field === 'sharePercent') {
				let cleanShare = String(value || '').replace(/[^0-9.]/g, '');
				const parts = cleanShare.split('.');
				if (parts.length > 2) {
					cleanShare = parts[0] + '.' + parts.slice(1).join('');
				}

				if (cleanShare === '') {
					return prev.map((acc) =>
						acc.id === id ? { ...acc, sharePercent: '', amount: '' } : acc
					);
				}

				const numShare = parseFloat(cleanShare);
				if (isNaN(numShare)) {
					return prev.map((acc) =>
						acc.id === id ? { ...acc, sharePercent: cleanShare, amount: '' } : acc
					);
				}

				let effectiveShare = numShare;
				let finalShareStr = cleanShare;

				if (baseLoanAmount > 0) {
					const maxAllowedShare = Number(((maxAllowedAmount / baseLoanAmount) * 100).toFixed(2));
					if (numShare > maxAllowedShare) {
						effectiveShare = maxAllowedShare;
						finalShareStr = maxAllowedShare === 0 ? '0' : Number(maxAllowedShare.toFixed(2)).toString();
					}
				} else if (numShare > 100) {
					effectiveShare = 100;
					finalShareStr = '100';
				}

				// Auto-adjust amount
				let calculatedAmount = '';
				if (baseLoanAmount > 0) {
					let numAmount = Math.round((effectiveShare / 100) * baseLoanAmount);
					if (numAmount > maxAllowedAmount) {
						numAmount = maxAllowedAmount;
					}
					calculatedAmount = formatIndianNumber(String(numAmount));
					const otherSecShare = prev.filter((a) => a.id !== id).reduce((sum, a) => sum + (parseFloat(a.sharePercent) || 0), 0);
					const priPct = Math.max(0, 100 - (effectiveShare + otherSecShare));
					setPrimaryShareInput(priPct === 0 ? '0' : Number(priPct.toFixed(2)).toString());
					const newPriAmt = Math.round((priPct / 100) * baseLoanAmount);
					setPrimaryAmountInput(formatIndianNumber(String(newPriAmt)));
				}

				return prev.map((acc) =>
					acc.id === id
						? {
							...acc,
							sharePercent: finalShareStr,
							amount: calculatedAmount,
						}
						: acc
				);
			}

			return prev;
		});
	};

	const handleStepSecondaryAccount = (id, field, delta) => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;

		setSecondaryAccounts((prev) => {
			const targetAcc = prev.find((a) => a.id === id);
			if (!targetAcc) return prev;

			const otherAccountsAmount = prev
				.filter((a) => a.id !== id)
				.reduce(
					(sum, a) =>
						sum + (Number(String(a.amount || '').replace(/[^0-9.-]+/g, '')) || 0),
					0
				);

			const maxAllowedAmount =
				baseLoanAmount > 0
					? Math.max(0, baseLoanAmount - otherAccountsAmount)
					: Infinity;

			if (field === 'sharePercent') {
				const currentShare = parseFloat(targetAcc.sharePercent) || 0;
				let nextShare = Math.round((currentShare + delta) * 100) / 100;
				nextShare = Math.max(0, nextShare);

				if (baseLoanAmount > 0) {
					const maxAllowedShare = Number(
						((maxAllowedAmount / baseLoanAmount) * 100).toFixed(2)
					);
					if (nextShare > maxAllowedShare) {
						nextShare = maxAllowedShare;
					}
				} else if (nextShare > 100) {
					nextShare = 100;
				}

				const finalShareStr = Number(nextShare.toFixed(2)).toString();

				let calculatedAmount = '';
				if (baseLoanAmount > 0) {
					let numAmount = Math.round(((nextShare / 100) * baseLoanAmount) * 100) / 100;
					if (numAmount > maxAllowedAmount) {
						numAmount = maxAllowedAmount;
					}
					calculatedAmount = formatIndianNumber(String(numAmount));
					const otherSecShare = prev.filter((a) => a.id !== id).reduce((sum, a) => sum + (parseFloat(a.sharePercent) || 0), 0);
					const priPct = Math.max(0, 100 - (nextShare + otherSecShare));
					setPrimaryShareInput(priPct === 0 ? '0' : Number(priPct.toFixed(2)).toString());
					const newPriAmt = Math.round((priPct / 100) * baseLoanAmount);
					setPrimaryAmountInput(formatIndianNumber(String(newPriAmt)));
				}

				return prev.map((acc) =>
					acc.id === id
						? {
							...acc,
							sharePercent: finalShareStr,
							amount: calculatedAmount,
						}
						: acc
				);
			}

			if (field === 'amount') {
				const currentAmt =
					Number(String(targetAcc.amount || '').replace(/[^0-9.-]+/g, '')) || 0;
				let nextAmt = Math.round((currentAmt + delta) * 100) / 100;
				nextAmt = Math.max(0, nextAmt);

				if (baseLoanAmount > 0 && nextAmt > maxAllowedAmount) {
					nextAmt = maxAllowedAmount;
				}

				const formattedAmount = formatIndianNumber(String(nextAmt));

				let calculatedShare = '';
				if (baseLoanAmount > 0) {
					const pct = (nextAmt / baseLoanAmount) * 100;
					calculatedShare = pct === 0 ? '0' : Number(pct.toFixed(2)).toString();
					const newPriAmt = Math.max(0, baseLoanAmount - (nextAmt + otherAccountsAmount));
					setPrimaryAmountInput(formatIndianNumber(String(newPriAmt)));
					const priPct = (newPriAmt / baseLoanAmount) * 100;
					setPrimaryShareInput(priPct === 0 ? '0' : Number(priPct.toFixed(2)).toString());
				}

				return prev.map((acc) =>
					acc.id === id
						? {
							...acc,
							amount: formattedAmount,
							sharePercent: calculatedShare,
						}
						: acc
				);
			}

			return prev;
		});
	};

	const handleUpdatePrimaryAmount = (value) => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;

		let cleanAmt = String(value || '').replace(/[^0-9.]/g, '');
		const parts = cleanAmt.split('.');
		if (parts.length > 2) {
			cleanAmt = parts[0] + '.' + parts.slice(1).join('');
		}

		if (!cleanAmt) {
			setPrimaryAmountInput('');
			setPrimaryShareInput('');
			return;
		}

		let numVal = parseFloat(cleanAmt);
		if (isNaN(numVal)) {
			setPrimaryAmountInput(cleanAmt);
			return;
		}

		if (baseLoanAmount > 0 && numVal > baseLoanAmount) {
			numVal = baseLoanAmount;
			cleanAmt = String(baseLoanAmount);
		}

		const formattedAmount = formatIndianNumber(cleanAmt);
		setPrimaryAmountInput(formattedAmount);

		if (baseLoanAmount > 0) {
			const priPct = (numVal / baseLoanAmount) * 100;
			setPrimaryShareInput(priPct === 0 ? '0' : Number(priPct.toFixed(2)).toString());

			const secAmt = Math.max(0, baseLoanAmount - numVal);
			const secPct = (secAmt / baseLoanAmount) * 100;

			setSecondaryAccounts((prev) => {
				if (!prev.length) return prev;
				const updated = [...prev];
				updated[0] = {
					...updated[0],
					amount: formatIndianNumber(String(secAmt)),
					sharePercent: secPct === 0 ? '0' : Number(secPct.toFixed(2)).toString(),
				};
				return updated;
			});
		}
	};

	const handleUpdatePrimaryShare = (value) => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;

		let cleanShare = String(value || '').replace(/[^0-9.]/g, '');
		const parts = cleanShare.split('.');
		if (parts.length > 2) {
			cleanShare = parts[0] + '.' + parts.slice(1).join('');
		}

		if (cleanShare === '') {
			setPrimaryShareInput('');
			setPrimaryAmountInput('');
			return;
		}

		let numShare = parseFloat(cleanShare);
		if (isNaN(numShare)) {
			setPrimaryShareInput(cleanShare);
			return;
		}

		if (numShare > 100) numShare = 100;
		const finalShareStr = numShare === 0 ? '0' : Number(numShare.toFixed(2)).toString();
		setPrimaryShareInput(finalShareStr);

		if (baseLoanAmount > 0) {
			const priAmt = Math.round((numShare / 100) * baseLoanAmount);
			setPrimaryAmountInput(formatIndianNumber(String(priAmt)));

			const secPct = Math.max(0, 100 - numShare);
			const secAmt = Math.max(0, baseLoanAmount - priAmt);

			setSecondaryAccounts((prev) => {
				if (!prev.length) return prev;
				const updated = [...prev];
				updated[0] = {
					...updated[0],
					amount: formatIndianNumber(String(secAmt)),
					sharePercent: secPct === 0 ? '0' : Number(secPct.toFixed(2)).toString(),
				};
				return updated;
			});
		}
	};

	const handleStepPrimaryAccount = (field, delta) => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;
		if (baseLoanAmount <= 0) return;

		if (field === 'sharePercent') {
			const currentShare = parseFloat(primaryShareInput) || 0;
			let nextShare = Math.round((currentShare + delta) * 100) / 100;
			nextShare = Math.max(0, Math.min(100, nextShare));
			handleUpdatePrimaryShare(String(nextShare));
		}

		if (field === 'amount') {
			const currentAmt = Number(String(primaryAmountInput || '').replace(/[^0-9.-]+/g, '')) || 0;
			let nextAmt = Math.round((currentAmt + delta) * 100) / 100;
			nextAmt = Math.max(0, Math.min(baseLoanAmount, nextAmt));
			handleUpdatePrimaryAmount(String(nextAmt));
		}
	};

	const handleResetUpload = () => {
		setUploadedFiles([]);
		setSelectedPdfFile(null);
		setPdfParsed(null);
		setPdfError('');
		setDuplicateLoanError(null);
		setUnauthorizedPrimaryError(null);
		setPrimaryAmountInput('');
		setPrimaryShareInput('50');
		setSecondaryAccounts([{ id: 1, accountName: '', amount: '', sharePercent: '' }]);
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const handleFileSelect = async (e) => {
		if (!e.target.files || e.target.files.length === 0) return;
		const filesArr = Array.from(e.target.files);
		const docFile = filesArr.find((f) => {
			const n = f.name.toLowerCase();
			return n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc');
		});

		if (!docFile) {
			setPdfError('Please upload a valid PDF or Word (.docx) loan document.');
			return;
		}

		// Add to uploaded files list for display
		setUploadedFiles([
			{ name: docFile.name, size: (docFile.size / 1024).toFixed(1) + ' KB' },
		]);

		setSelectedPdfFile(docFile);
		setPdfParsing(true);
		setPdfParsed(null);
		setPdfError('');
		setDuplicateLoanError(null);

		try {
			const res = await api.uploadPdf(docFile);
			if (res.success && res.data) {
				const d = res.data;
				const rawLoanId = d.loan_number;
				const priName = d.primary_account || '';

				// Verify whether the primary account extracted from PDF is assigned to the current user
				const isPrimaryAllowed = isUserAssignedPrimaryAccount(
					priName,
					userPermissions,
					availableAccountObjects
				);

				if (!isPrimaryAllowed) {
					const userPrimaryLabels = (userPermissions.primary || []).map((p) => {
						const obj = (availableAccountObjects || []).find(
							(o) => isAccountMatch(o.acronym, p, availableAccountObjects) || isAccountMatch(o.name, p, availableAccountObjects)
						);
						return obj ? `${obj.acronym || p} (${obj.name})` : p;
					});

					setUnauthorizedPrimaryError({
						extractedPrimary: priName || 'Not detected in document',
						allowedAccounts: userPermissions.primary || [],
						allowedLabels: userPrimaryLabels,
						fileName: pdfFile.name,
					});
					setPdfParsed(null);
					setDuplicateLoanError(null);
					return;
				}

				// Primary account is authorized
				setUnauthorizedPrimaryError(null);

				// 1. Check if backend reported duplicate
				let duplicateInfo = null;
				if (res.loan_exists && res.existing_loan) {
					duplicateInfo = {
						loanId: res.existing_loan.loan_id || rawLoanId,
						clientName: res.existing_loan.client_account_name || d.client_account || '',
						amount: res.existing_loan.loan_amount || d.loan_amount || null,
						date: res.existing_loan.loan_date || d.loan_date || '',
						status: res.existing_loan.status || 'Active',
						message: res.message || `Loan ID '${res.existing_loan.loan_id || rawLoanId}' already exists in database.`
					};
				} else {
					// 2. Check local frontend list
					const targetCleanId = cleanLoanId(rawLoanId);
					const targetClient = normalizeNameForCompare(d.client_account);
					const targetDate = normalizeDateForCompare(d.loan_date);

					const localMatch = loans.find((l) => {
						// Match by loan ID (without JL prefix)
						if (targetCleanId) {
							const lCleanId = cleanLoanId(l.id);
							const lCleanNum = cleanLoanId(l.loanNumber);
							if ((lCleanId && lCleanId === targetCleanId) || (lCleanNum && lCleanNum === targetCleanId)) {
								return true;
							}
						}
						// Match by client_account_name AND loan_date
						if (targetClient && targetDate) {
							const lClient = normalizeNameForCompare(l.client_account_name || l.primaryBorrower?.name);
							const lDate = normalizeDateForCompare(l.appliedDate || l.loan_date || l.dueDate);
							if (lClient && lDate && lClient === targetClient && lDate === targetDate) {
								return true;
							}
						}
						return false;
					});

					if (localMatch) {
						duplicateInfo = {
							loanId: localMatch.id || rawLoanId,
							clientName: localMatch.client_account_name || localMatch.primaryBorrower?.name || d.client_account || '',
							amount: localMatch.amount || d.loan_amount || null,
							date: localMatch.appliedDate || localMatch.loan_date || d.loan_date || '',
							status: localMatch.status || 'Active',
							message: `Loan ID '${localMatch.id || rawLoanId}' already exists in database.`
						};
					} else if (rawLoanId || (d.client_account && d.loan_date)) {
						// 3. Direct database API check
						try {
							const check = await api.checkLoanIdExists(rawLoanId, d.client_account, d.loan_date);
							if (check && check.exists) {
								duplicateInfo = {
									loanId: check.loan_id || rawLoanId,
									clientName: check.existing_loan?.client_account_name || d.client_account || '',
									amount: check.existing_loan?.loan_amount || d.loan_amount || null,
									date: check.existing_loan?.loan_date || d.loan_date || '',
									status: check.existing_loan?.status || 'Active',
									message: check.message || `Loan ID '${rawLoanId}' already exists in database.`
								};
							}
						} catch (chkErr) {
							console.warn('Backend loan ID existence check error:', chkErr);
						}
					}
				}

				if (duplicateInfo) {
					// Loan is duplicate: show duplicate error, do not reveal parsed data / secondary accounts
					setDuplicateLoanError(duplicateInfo);
					setPdfParsed(null);
				} else {
					// Loan verified as unique and non-duplicate!
					setPdfParsed(d);
					setDuplicateLoanError(null);

					// Auto-fill form fields from parsed data
					const priName = d.primary_account || '';
					if (priName) setNewPrimaryName(priName);
					if (d.client_account) setNewCoName(cleanCustomerName(d.client_account));

					// Filter out primary account from initial secondary account allocation
					const validSecondaryOptions = availableAccountOptions.filter(
						(opt) => !isPrimaryAccountMatch(opt, priName)
					);
					const defaultSecAccount = validSecondaryOptions[0] || '';
					const baseLoanAmt = Number(d.loan_amount) || 0;
					const halfAmt = baseLoanAmt ? Math.round(baseLoanAmt * 0.5 * 100) / 100 : 0;
					const initialAmount = baseLoanAmt ? formatIndianNumber(String(halfAmt)) : '';

					setPrimaryAmountInput(initialAmount);
					setPrimaryShareInput(baseLoanAmt ? '50' : '');

					setSecondaryAccounts([
						{
							id: 1,
							accountName: defaultSecAccount,
							amount: initialAmount,
							sharePercent: baseLoanAmt ? '50' : '',
						},
					]);

					if (d.loan_number) setNewPurpose(`Loan Ref: ${d.loan_number}`);
				}
			} else {
				setPdfError(res.error || 'Failed to parse PDF document. Please verify the document format.');
			}
		} catch (err) {
			setPdfError(err.message || 'Failed to parse PDF. Please verify the document and try again.');
		} finally {
			setPdfParsing(false);
		}
	};

	const handleRemoveFile = (index) => {
		handleResetUpload();
	};

	// Document is verified only when parsed, no parsing in flight, not duplicate, and primary account authorized
	const isDocumentVerified = Boolean(
		pdfParsed && !duplicateLoanError && !unauthorizedPrimaryError && !pdfParsing
	);

	const totalSecondaryAmount = useMemo(() => {
		return secondaryAccounts.reduce((sum, acc) => {
			const parsed = Number(String(acc.amount).replace(/[^0-9.-]+/g, '')) || 0;
			return sum + parsed;
		}, 0);
	}, [secondaryAccounts]);

	const totalSecondaryShare = useMemo(() => {
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;
		if (baseLoanAmount > 0 && totalSecondaryAmount > 0) {
			const pct = (totalSecondaryAmount / baseLoanAmount) * 100;
			return Number(pct.toFixed(2));
		}
		return secondaryAccounts.reduce((sum, acc) => {
			const parsed = parseFloat(acc.sharePercent) || 0;
			return sum + parsed;
		}, 0);
	}, [secondaryAccounts, totalSecondaryAmount, pdfParsed, newAmount]);

	// Dynamic status options with live record counts for modern dropdown:
	// - Active: loan is active, EMI is not pending/overdue
	// - Overdue: loan is active but any one of EMI is overdue (due date crossed and not paid)
	// - Closed: all EMIs are paid
	const statusFilterOptions = useMemo(() => {
		const total = userPermittedLoans.length;
		const activeCount = userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Active').length;
		const pendingCount = userPermittedLoans.filter((l) => isLoanPendingApproval(l)).length;
		const overdueCount = userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Overdue').length;
		const closedCount = userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Closed').length;

		return [
			{ id: 'ALL', label: 'All Statuses', dot: 'bg-primary', count: total },
			{ id: 'Active', label: 'Active', dot: 'bg-emerald-500', count: activeCount },
			{ id: 'Pending', label: 'Pending', dot: 'bg-amber-500', count: pendingCount },
			{ id: 'Overdue', label: 'Overdue', dot: 'bg-rose-500', count: overdueCount },
			{ id: 'Closed', label: 'Closed', dot: 'bg-slate-400', count: closedCount },
		];
	}, [userPermittedLoans]);

	// Dynamic account filter options populated strictly from accounts_name table (availableAccountObjects)
	const accountFilterOptions = useMemo(() => {
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			// Extract options strictly from accounts_name table
			let dbOptions = availableAccountObjects
				.filter((acc) => acc && (acc.name || acc.acronym))
				.map((acc) => {
					const name = (acc.name || acc.acronym).trim();
					const count = userPermittedLoans.filter((loan) =>
						doesLoanMatchAccount(loan, name, availableAccountObjects)
					).length;
					return {
						id: name,
						label: name,
						acronym: acc.acronym || '',
						color: acc.color || 'blue',
						count,
					};
				});

			// If user is not admin and has primary or secondary account permissions configured:
			// only display options corresponding to the user's permitted accounts
			if (!userPermissions.isAdmin && (userPermissions.primary.length > 0 || userPermissions.secondary.length > 0)) {
				const allowedList = [...userPermissions.primary, ...userPermissions.secondary];
				dbOptions = dbOptions.filter((opt) =>
					allowedList.some((target) => isAccountMatch(opt.acronym || opt.label, target, availableAccountObjects))
				);
			}

			// Sort DB accounts: options with active loans first (by count descending), then alphabetically
			dbOptions.sort((a, b) => {
				if (b.count !== a.count) return b.count - a.count;
				return a.label.localeCompare(b.label);
			});

			return [
				{ id: 'ALL', label: 'All Accounts', count: userPermittedLoans.length },
				...dbOptions,
			];
		}

		// Fallback: extract primary & secondary accounts from userPermittedLoans
		const nameMap = new Map();
		userPermittedLoans.forEach((loan) => {
			const names = getLoanAllAccountNames(loan);
			names.forEach((name) => {
				if (name) nameMap.set(name, (nameMap.get(name) || 0) + 1);
			});
		});

		const accountOpts = Array.from(nameMap.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => ({ id: name, label: name, count }));

		return [
			{ id: 'ALL', label: 'All Accounts', count: userPermittedLoans.length },
			...accountOpts,
		];
	}, [availableAccountObjects, userPermittedLoans, userPermissions]);

	// Reference date for calendar (use first loan's date so calendar opens at the right year)
	const calendarReferenceDate = useMemo(() => {
		if (userPermittedLoans.length > 0) {
			return (
				userPermittedLoans[0].loan_date ||
				userPermittedLoans[0].appliedDate ||
				userPermittedLoans[0].loanDate ||
				userPermittedLoans[0].date ||
				userPermittedLoans[0].applied_date ||
				''
			);
		}
		return '';
	}, [userPermittedLoans]);

	// Filter loans by status, account, date range, and search query
	const filteredLoans = useMemo(() => {
		return userPermittedLoans.filter((loan) => {
			const computedStatus = getComputedLoanStatus(loan);
			const matchesStatus =
				statusFilter === 'ALL' ||
				(statusFilter === 'Pending'
					? isLoanPendingApproval(loan)
					: computedStatus === statusFilter);

			const matchesAccount = doesLoanMatchAccount(loan, accountFilter, availableAccountObjects);

			const matchesDateRange = isLoanInDateRange(
				loan,
				dateRangeFilter.startDate,
				dateRangeFilter.endDate
			);

			const q = searchQuery.toLowerCase().trim();
			const matchesQuery =
				!q ||
				(loan.id && loan.id.toLowerCase().includes(q)) ||
				(loan.primaryBorrower?.name && loan.primaryBorrower.name.toLowerCase().includes(q)) ||
				(loan.primary && loan.primary.toLowerCase().includes(q)) ||
				(loan.purpose && loan.purpose.toLowerCase().includes(q)) ||
				(loan.category && loan.category.toLowerCase().includes(q));

			return matchesStatus && matchesAccount && matchesDateRange && matchesQuery;
		});
	}, [userPermittedLoans, searchQuery, statusFilter, accountFilter, dateRangeFilter, availableAccountObjects]);

	// Pagination calculations
	const totalItems = filteredLoans.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	// Keep currentPage in valid range when filtered items or page size changes
	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(Math.max(1, totalPages));
		}
	}, [currentPage, totalPages]);

	// Reset to page 1 whenever filters or search query change
	useEffect(() => {
		setCurrentPage(1);
	}, [statusFilter, searchQuery, accountFilter, dateRangeFilter, accountRoleFilter]);

	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, totalItems);

	const paginatedLoans = useMemo(() => {
		return filteredLoans.slice(startIndex, endIndex);
	}, [filteredLoans, startIndex, endIndex]);

	// Helper to generate page numbers with ellipsis
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

	// Format currency
	const formatCurrency = (val) => {
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR',
			maximumFractionDigits: 0,
		}).format(val);
	};

	// Metrics calculations based on card titles:
	// 1. Total Joints
	const totalJointsCount = userPermittedLoans.length;
	const totalCapital = useMemo(
		() => userPermittedLoans.reduce((acc, curr) => acc + curr.amount, 0),
		[userPermittedLoans]
	);

	// 2. Active Loans (loan is active, EMI not pending/overdue)
	const activeLoansCount = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Active').length,
		[userPermittedLoans]
	);
	const activeCapital = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Active')
			.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
		[userPermittedLoans]
	);

	// 3. Overdue Loans (loan is active but has overdue EMI)
	const overdueLoansCount = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Overdue').length,
		[userPermittedLoans]
	);
	const overdueCapital = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Overdue')
			.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
		[userPermittedLoans]
	);

	// 3. Closed Loans (all EMIs paid)
	const closedLoansCount = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Closed').length,
		[userPermittedLoans]
	);
	const closedCapital = useMemo(
		() => userPermittedLoans.filter((l) => getComputedLoanStatus(l) === 'Closed')
			.reduce((acc, curr) => acc + curr.amount, 0),
		[userPermittedLoans]
	);

	// 4. Approval Pending (multi-stage approval: Secondary or Admin + Payout Pending)
	const pendingNewLoanCount = useMemo(
		() => userPermittedLoans.filter((l) => isNewLoanPendingApproval(l)).length,
		[userPermittedLoans]
	);
	const pendingPayoutCount = useMemo(
		() => userPermittedLoans.filter((l) => isLoanPayoutPending(l)).length,
		[userPermittedLoans]
	);
	const pendingApprovalCount = useMemo(
		() => userPermittedLoans.filter((l) => isLoanPendingApproval(l)).length,
		[userPermittedLoans]
	);
	const pendingApprovalCapital = useMemo(
		() => userPermittedLoans.filter((l) => isLoanPendingApproval(l))
			.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
		[userPermittedLoans]
	);

	const [listExportNotification, setListExportNotification] = useState(null);
	const [listExportError, setListExportError] = useState(null);
	const listExportTimerRef = useRef(null);
	const listExportErrorTimerRef = useRef(null);

	const showListExportError = useCallback((errMsg) => {
		if (listExportErrorTimerRef.current) {
			clearTimeout(listExportErrorTimerRef.current);
		}
		setListExportError(errMsg);
		listExportErrorTimerRef.current = setTimeout(() => {
			setListExportError(null);
			listExportErrorTimerRef.current = null;
		}, 5000);
		alert(errMsg);
	}, []);

	const handleExportLoansList = useCallback(() => {
		try {
			const isFiltered = Boolean(
				(statusFilter && statusFilter !== 'ALL') ||
				(accountFilter && accountFilter !== 'ALL') ||
				dateRangeFilter?.startDate ||
				dateRangeFilter?.endDate ||
				(searchQuery && searchQuery.trim())
			);
			const loansToExport = isFiltered
				? filteredLoans
				: (filteredLoans.length > 0 ? filteredLoans : userPermittedLoans);

			if (!loansToExport || loansToExport.length === 0) {
				showListExportError('No outstanding loans');
				return;
			}
			const result = exportOutstandingReportPerPrimaryAccount(
				loansToExport,
				(loan) => generateRepaymentSchedule(loan, getLoanAccountDetails(loan)),
				availableAccountObjects,
				{ selectedAccount: (accountFilter && accountFilter !== 'ALL') ? accountFilter : null }
			);
			if (!result || result.success === false) {
				const errMsg = (result && result.message) ? result.message : 'No outstanding loans';
				showListExportError(errMsg);
				return;
			}
			const filename = result.filename || (typeof result === 'string' ? result : null);
			if (filename) {
				if (listExportTimerRef.current) {
					clearTimeout(listExportTimerRef.current);
				}
				setListExportNotification(filename);
				listExportTimerRef.current = setTimeout(() => {
					setListExportNotification(null);
					listExportTimerRef.current = null;
				}, 5000);
			}
		} catch (err) {
			console.error('Failed to export outstanding report to Excel:', err);
			showListExportError('Failed to export Excel file. Please try again.');
		}
	}, [filteredLoans, userPermittedLoans, availableAccountObjects, statusFilter, accountFilter, dateRangeFilter, searchQuery, showListExportError]);

	useEffect(() => {
		return () => {
			if (listExportTimerRef.current) {
				clearTimeout(listExportTimerRef.current);
			}
			if (listExportErrorTimerRef.current) {
				clearTimeout(listExportErrorTimerRef.current);
			}
		};
	}, []);

	// Delete loan handler: removes loan and cleans up its repayment schedule, remaining account details, and notifications
	const handleDeleteLoan = async (loanId, targetLoan = null) => {
		const targetDbId = targetLoan?.db_id;
		const targetRefId = targetLoan?.loan_ref_id || targetLoan?.id;

		setLoans((prev) =>
			prev.filter((l) => {
				if (l.id === loanId) return false;
				if (targetDbId && l.db_id === targetDbId) return false;
				if (targetRefId && (l.loan_ref_id === targetRefId || l.id === targetRefId)) return false;
				return true;
			})
		);

		// If currently viewing this loan's details, repayment schedule, or remaining accounts, reset selected loan
		if (
			selectedLoan &&
			(selectedLoan.id === loanId ||
				selectedLoan.loan_ref_id === loanId ||
				selectedLoan.db_id === loanId ||
				(targetDbId && selectedLoan.db_id === targetDbId) ||
				(targetRefId && (selectedLoan.loan_ref_id === targetRefId || selectedLoan.id === targetRefId)))
		) {
			if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
				window.history.pushState({}, '', '/joint-loan');
			}
			setSelectedLoan(null);
		}

		// Sync delete with backend and cascade removal of repayment schedules, remaining accounts, and notifications
		try {
			const idToSend = targetDbId || targetRefId || loanId;
			await api.deleteJointLoan(idToSend, {
				db_id: targetDbId,
				loan_ref_id: targetRefId,
				id: loanId,
			});
			// Notify other components/windows that notifications and loans have been updated
			try {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
				}
			} catch (e) { }

			// Reload fresh list from backend to ensure consistent state
			try {
				const remote = await api.getJointLoans();
				if (Array.isArray(remote)) {
					setLoans(remote);
				}
			} catch (reloadErr) {
				console.warn('Could not reload loans after delete:', reloadErr);
			}
		} catch (err) {
			console.warn('Could not delete loan on backend:', err);
		}
	};

	// Confirm and execute loan deletion from modal
	const handleConfirmDelete = async () => {
		if (!loanToDelete) return;
		const isAdminUser = Boolean(userPermissions?.isAdmin);
		const isPrimaryUser = Boolean(
			checkLoanMatchesUserPrimary(
				loanToDelete,
				userPermissions?.primary,
				availableAccountObjects
			)
		);
		if (!isAdminUser && !isPrimaryUser) {
			console.warn('Cannot delete secondary account loan');
			setLoanToDelete(null);
			return;
		}
		const id = loanToDelete.id;
		const target = loanToDelete;
		setIsDeletingLoan(true);
		try {
			await handleDeleteLoan(id, target);
		} finally {
			setIsDeletingLoan(false);
			setLoanToDelete(null);
		}
	};

	// Handle creating a new joint loan
	const handleCreateLoan = async (e) => {
		e.preventDefault();
		setPdfError('');

		if (duplicateLoanError || unauthorizedPrimaryError) {
			return;
		}

		// Verify that primary account is assigned to current user
		const priAccountCandidate = pdfParsed?.primary_account || newPrimaryName;
		if (!isSuperAdmin && !isUserAssignedPrimaryAccount(priAccountCandidate, userPermissions, availableAccountObjects)) {
			setPdfError(
				`You are only authorized to create loans for your assigned primary account(s): ${(userPermissions.primary || []).join(', ') || 'None assigned'}.`
			);
			return;
		}

		setIsSubmittingLoan(true);

		const borrowerName =
			newPrimaryName.trim() || secondaryAccounts[0]?.accountName || 'Joint Venture Corp';

		const totalSec = secondaryAccounts.reduce(
			(sum, acc) => sum + (Number(String(acc.amount).replace(/[^0-9.-]+/g, '')) || 0),
			0
		);

		// Validate total secondary does not exceed total loan amount
		const baseLoanAmount =
			Number(pdfParsed?.loan_amount) ||
			Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
			0;
		if (baseLoanAmount > 0 && totalSec > baseLoanAmount) {
			setPdfError(
				`Total secondary shares (${formatCurrency(totalSec)}) exceed total loan amount (${formatCurrency(baseLoanAmount)}).`
			);
			setIsSubmittingLoan(false);
			return;
		}

		// Validate secondary account is not same as primary
		const priAcronym = (getAcronym(priAccountCandidate, availableAccountObjects) || priAccountCandidate).trim().toLowerCase();
		const hasSameSec = secondaryAccounts.some((acc) => {
			const sName = (acc.accountName || '').trim();
			if (!sName) return false;
			const sAcronym = (getAcronym(sName, availableAccountObjects) || sName).trim().toLowerCase();
			return isAccountMatch(sName, priAccountCandidate, availableAccountObjects) ||
				(sAcronym && priAcronym && sAcronym === priAcronym) ||
				sName.toLowerCase() === priAccountCandidate.toLowerCase();
		});
		if (hasSameSec) {
			setPdfError('Primary and secondary account cannot be the same. Please check secondary partner allocation.');
			setIsSubmittingLoan(false);
			return;
		}
		const numAmount = totalSec > 0 ? totalSec : Number(newAmount.replace(/[^0-9.-]+/g, '')) || 500000;
		const badge = getStatusBadge(newStatus);
		const hasSchedule = pdfParsed?.table && pdfParsed.table.length > 0;

		// If a PDF was parsed, use the proper upload+store path
		if (pdfParsed && selectedPdfFile) {
			const candidateId = pdfParsed.loan_number || '';
			const candidateClient = pdfParsed.client_account || newCoName || '';
			const candidateDate = pdfParsed.loan_date || '';

			// Verify if loan ID or client+date exists before attempting upload
			if (candidateId || (candidateClient && candidateDate)) {
				try {
					const check = await api.checkLoanIdExists(candidateId, candidateClient, candidateDate);
					if (check && check.exists) {
						setDuplicateLoanError({
							loanId: check.loan_id || candidateId,
							clientName: check.existing_loan?.client_account_name || candidateClient,
							amount: check.existing_loan?.loan_amount || null,
							date: check.existing_loan?.loan_date || candidateDate,
							status: check.existing_loan?.status || 'Active',
							message: check.message || `Loan ID '${candidateId}' already exists in database.`
						});
						setIsSubmittingLoan(false);
						return;
					}
				} catch (chkErr) {
					console.warn('Loan ID check error before store:', chkErr);
				}
			}

			// Build remaining_accounts payload: [{ name, share }]
			const remAccounts = secondaryAccounts
				.filter((acc) => acc.accountName && acc.amount)
				.map((acc) => ({
					name: acc.accountName,
					share: Number(String(acc.amount).replace(/[^0-9.-]+/g, '')) || 0,
				}));

			// Upload PDF with remaining_accounts to properly store to DB
			try {
				const storeRes = await api.uploadPdfAndStore(
					selectedPdfFile,
					remAccounts,
					candidateId,
					activeUser?.employee_code,
					isSuperAdmin,
					activeUser?.role,
					activeUser?.name
				);
				if (storeRes.success) {
					// Reload loans from backend to get the properly stored record
					let fresh = null;
					try {
						const resLoans = await api.getJointLoans();
						if (Array.isArray(resLoans)) {
							setLoans(resLoans);
							setCurrentPage(1);
							fresh = resLoans;
						}
					} catch (loadErr) {
						console.warn('Could not reload loans after store:', loadErr);
					}
					handleCloseCreateModal();

					const createdLoanId = storeRes.loan_ref_id || candidateId || (storeRes.loan_id ? `JL-2026-${storeRes.loan_id}` : 'Loan');
					const matchedLoan = (Array.isArray(fresh) && (
						fresh.find((l) => l.loan_ref_id === createdLoanId || l.id === createdLoanId || String(l.db_id) === String(storeRes.loan_id)) || fresh[0]
					)) || { secondaryAccounts, remaining_accounts: remAccounts.map((a) => ({ account_name: a.name })) };
					const secMgrName = getRespectedSecManagerName(matchedLoan, storeRes.sec_manager_name);
					const isAuto = Boolean(storeRes.is_auto_approved || isSuperAdmin);
					showCreateSuccessAlert(createdLoanId, secMgrName, isAuto);
				} else {
					if (storeRes.loan_exists || (storeRes.error && storeRes.error.toLowerCase().includes('already exists'))) {
						setDuplicateLoanError({
							loanId: storeRes.existing_loan?.loan_id || candidateId,
							clientName: storeRes.existing_loan?.client_account_name || '',
							amount: storeRes.existing_loan?.loan_amount || null,
							date: storeRes.existing_loan?.loan_date || '',
							status: storeRes.existing_loan?.status || 'Active',
							message: storeRes.error || `Loan ID '${candidateId}' already exists in database.`
						});
					} else {
						setPdfError(storeRes.error || 'Failed to store loan. Please try again.');
					}
				}
			} catch (err) {
				const errMsg = err.message || '';
				if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('duplicate')) {
					setDuplicateLoanError({
						loanId: candidateId || 'Duplicate',
						clientName: '',
						amount: null,
						date: '',
						status: 'Active',
						message: errMsg || `Loan ID already exists in database.`
					});
				} else {
					setPdfError(errMsg || 'Failed to store loan. Please try again.');
				}
			} finally {
				setIsSubmittingLoan(false);
			}
			return;
		}

		// No PDF: manual creation via createJointLoan
		const generatedId = `JL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
		const targetId = pdfParsed?.loan_number || generatedId;

		// Check if targetId or client+date already exists
		const targetClient = newCoName || borrowerName || '';
		const targetDate = pdfParsed?.loan_date || '';
		try {
			const check = await api.checkLoanIdExists(targetId, targetClient, targetDate);
			if (check && check.exists) {
				setDuplicateLoanError({
					loanId: check.loan_id || targetId,
					clientName: check.existing_loan?.client_account_name || targetClient,
					amount: check.existing_loan?.loan_amount || null,
					date: check.existing_loan?.loan_date || targetDate,
					status: check.existing_loan?.status || 'Active',
					message: check.message || `Loan ID '${targetId}' already exists in database.`
				});
				setIsSubmittingLoan(false);
				return;
			}
		} catch (chkErr) {
			console.warn('Loan ID check error:', chkErr);
		}

		const newItem = {
			id: targetId,
			loanNumber: pdfParsed?.loan_number || undefined,
			primary: newPrimaryType,
			primaryBorrower: {
				name: borrowerName,
				role: 'Primary Applicant',
				score: 735,
				initials: borrowerName.slice(0, 2).toUpperCase(),
			},
			coBorrower: {
				name: secondaryAccounts[0]?.accountName || newCoName || 'Secondary Partner',
				role: 'Secondary Account',
				score: 725,
				initials: (secondaryAccounts[0]?.accountName || 'SP').slice(0, 2).toUpperCase(),
			},
			secondaryAccounts: [...secondaryAccounts],
			uploadedFiles: [...uploadedFiles],
			purpose: newPurpose || (pdfParsed?.loan_number ? `Loan Ref: ${pdfParsed.loan_number}` : 'Working Capital Joint Facility'),
			category: newCategory,
			categoryColor:
				newCategory === 'Commercial'
					? 'bg-purple-50 text-purple-700 ring-purple-300'
					: 'bg-blue-50 text-blue-700 ring-blue-300',
			amount: numAmount,
			primaryShare: 50,
			coShare: 50,
			rate: newRate,
			tenure: hasSchedule ? `${pdfParsed.table.length} Mo` : '60 Mo',
			monthlyPayment: formatCurrency(hasSchedule && pdfParsed.table[0]?.amount ? pdfParsed.table[0].amount : (numAmount / 48)),
			riskGrade: 'Grade A',
			riskColor: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
			status: isSuperAdmin ? 'Active' : 'Pending',
			approval_status: isSuperAdmin ? 'APPROVED' : 'PENDING_SECONDARY',
			approvalStatus: isSuperAdmin ? 'APPROVED' : 'PENDING_SECONDARY',
			verified_by: undefined,
			actioned_by: isSuperAdmin ? (activeUser?.name || 'Super Admin') : undefined,
			actioned_at: isSuperAdmin ? (getFormattedNow ? getFormattedNow() : new Date().toLocaleString()) : undefined,
			is_super_admin: isSuperAdmin,
			userRole: activeUser?.role,
			employee_code: activeUser?.employee_code,
			requester_name: activeUser?.name || 'Staff Officer',
			requested_at: getFormattedNow ? getFormattedNow() : new Date().toLocaleString(),
			statusColor: isSuperAdmin ? 'bg-emerald-50 text-emerald-700 ring-emerald-300' : 'bg-amber-50 text-amber-800 ring-amber-300',
			statusDot: isSuperAdmin ? 'bg-emerald-500' : 'bg-amber-500',
			appliedDate: pdfParsed?.loan_date || `${String(new Date().getDate()).padStart(2, '0')}-${String(
				new Date().getMonth() + 1
			).padStart(2, '0')}-${new Date().getFullYear()}`,
			dueDate: 'Nov 01, 2026',
			repaymentSchedule: hasSchedule ? pdfParsed.table : [],
		};

		try {
			const createRes = await api.createJointLoan(newItem);
			let fresh = null;
			try {
				const freshRes = await api.getJointLoans();
				if (Array.isArray(freshRes)) {
					setLoans(freshRes);
					fresh = freshRes;
				} else {
					setLoans((prev) => [newItem, ...prev]);
				}
			} catch (errLoad) {
				setLoans((prev) => [newItem, ...prev]);
			}
			setCurrentPage(1);
			handleCloseCreateModal();

			const createdLoanId = createRes?.loan?.loan_ref_id || createRes?.loan?.id || targetId || newItem.id;
			const matchedLoan = (Array.isArray(fresh) && (
				fresh.find((l) => l.loan_ref_id === createdLoanId || l.id === createdLoanId) || fresh[0]
			)) || createRes?.loan || newItem;
			const secMgrName = getRespectedSecManagerName(matchedLoan, createRes?.sec_manager_name);
			const isAuto = Boolean(createRes?.is_auto_approved || isSuperAdmin);
			showCreateSuccessAlert(createdLoanId, secMgrName, isAuto);
		} catch (err) {
			const errMsg = err.message || '';
			if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('duplicate')) {
				setDuplicateLoanError({
					loanId: targetId,
					clientName: borrowerName,
					amount: numAmount,
					date: newItem.appliedDate,
					status: 'Active',
					message: errMsg || `Loan ID '${targetId}' already exists in database.`
				});
			} else {
				setPdfError(errMsg || 'Failed to create joint loan.');
			}
		} finally {
			setIsSubmittingLoan(false);
		}
	};

	// Render Delete Loan confirmation card
	const renderDeleteModal = () => {
		if (!loanToDelete) return null;
		const badge = getStatusBadge(loanToDelete.status || 'Active');

		// Resolve full primary account name (e.g. "S.SUDHAKAR") instead of short acronym (e.g. "SS")
		const fullPrimaryName = (() => {
			if (loanToDelete.primaryAccountName && loanToDelete.primaryAccountName.trim()) {
				return loanToDelete.primaryAccountName;
			}
			if (loanToDelete.primary_account_name && loanToDelete.primary_account_name.trim()) {
				return loanToDelete.primary_account_name;
			}
			if (Array.isArray(loanToDelete.accountDetails)) {
				const priAcc = loanToDelete.accountDetails.find((a) => a.isPrimary);
				if (priAcc?.accountName && priAcc.accountName.trim()) {
					return priAcc.accountName;
				}
			}
			const rawCode = loanToDelete.primary || '';
			if (rawCode && Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
				const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
				const target = clean(rawCode);
				const match = availableAccountObjects.find(
					(a) => clean(a.acronym) === target || clean(a.name) === target
				);
				if (match?.name) {
					return match.name;
				}
			}
			return loanToDelete.primary_account_name || loanToDelete.primaryAccountName || loanToDelete.primary || '-';
		})();

		return (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans overscroll-contain animate-in fade-in duration-200"
				onClick={() => {
					if (!isDeletingLoan) setLoanToDelete(null);
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
								<span className="material-symbols-outlined" style={{ fontSize: "26px" }}>delete_forever</span>
							</div>
							<div className="flex-1 min-w-0">
								<h3 className="text-[17px] font-extrabold text-slate-900 leading-snug">
									Delete Loan Record?
								</h3>
								<p className="text-[12.5px] text-slate-500 leading-relaxed">
									Are you sure you want to delete this joint loan?
								</p>
							</div>
						</div>

						{/* Loan Info Summary Card */}
						<div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
							<div className="flex items-center justify-between gap-2 mb-2">
								<span className="font-mono font-bold text-[12px] text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
									{loanToDelete.id}
								</span>
								{loanToDelete.status && (
									<span
										className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badge.color}`}
									>
										<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
										{loanToDelete.status}
									</span>
								)}
							</div>

							<div className="space-y-1.5 text-[12px]">
								{(loanToDelete.loan_date || loanToDelete.appliedDate || loanToDelete.loanDate || loanToDelete.date || loanToDelete.applied_date) && (
									<div className="flex items-center justify-between text-slate-600">
										<span className="text-slate-400">Date:</span>
										<span className="font-semibold text-slate-700">
											{formatLoanDate(loanToDelete.loan_date || loanToDelete.appliedDate || loanToDelete.loanDate || loanToDelete.date || loanToDelete.applied_date)}
										</span>
									</div>
								)}
								<div className="flex items-center justify-between text-slate-600">
									<span className="text-slate-400">Client Name:</span>
									<span className="font-bold text-slate-800 truncate max-w-[200px]">
										{loanToDelete.primaryBorrower?.name || loanToDelete.client_account_name || 'Client'}
									</span>
								</div>
								<div className="flex items-center justify-between text-slate-600">
									<span className="text-slate-400">Primary Account:</span>
									<span className="font-bold text-slate-800">
										{fullPrimaryName}
									</span>
								</div>
								<div className="flex items-center justify-between text-slate-600">
									<span className="text-slate-400">Loan Amount:</span>
									<span className="font-extrabold text-slate-900">
										{formatCurrency(loanToDelete.amount)}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Footer Actions */}
					<div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100">
						<button
							type="button"
							onClick={() => {
								if (!isDeletingLoan) setLoanToDelete(null);
							}}
							disabled={isDeletingLoan}
							className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleConfirmDelete}
							disabled={isDeletingLoan}
							className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-sm transition-all cursor-pointer disabled:opacity-70 disabled:cursor-wait"
						>
							{isDeletingLoan ? (
								<>
									<span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
									<span>Deleting...</span>
								</>
							) : (
								<>
									<span className="material-symbols-outlined text-[16px]">delete</span>
									<span>Delete Loan</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		);
	};

	// Render Access Restricted modal for locked loans
	const renderAccessRestrictedModal = () => {
		if (!accessRestrictedModal.isOpen || !accessRestrictedModal.loan) return null;
		const targetLoan = accessRestrictedModal.loan;
		const isPendingSec = targetLoan.approval_status === 'PENDING_SECONDARY' || (!targetLoan.approval_status && targetLoan.status === 'Pending');
		const isPendingAdm = targetLoan.approval_status === 'PENDING_ADMIN' || targetLoan.approval_status === 'VERIFIED';
		const secAccounts = getLoanSecondaryAccounts(targetLoan);
		const assignedSecUsers = getUsersWithPrimaryAccessForLoanSecondary(targetLoan, allUsers, availableAccountObjects);
		const approverNames = assignedSecUsers.map((u) => u.name || u.username).join(', ');

		return (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans overscroll-contain animate-in fade-in duration-200"
				onClick={() => {
					setAccessRestrictedModal({ isOpen: false, loan: null });
					if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
						window.history.replaceState({}, '', '/joint-loan');
					}
				}}
			>
				<div
					className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-200 text-center"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
						<span className="material-symbols-outlined" style={{fontSize: "20px"}}>lock</span>
					</div>
					<span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 mb-2">
						Access Restricted
					</span>
					<h3 className="font-extrabold text-[18px] text-slate-900 tracking-tight">
						Loan Locked (Pending Approval)
					</h3>
					<p className="text-[13px] text-slate-600 mt-2 leading-relaxed">
						Before final approval, this loan facility cannot be accessed by anyone except designated approval authorities.
					</p>

					<div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-[12.5px]">
						<div className="flex justify-between">
							<span className="text-slate-500 font-semibold">Loan ID:</span>
							<span className="font-mono font-bold text-slate-900">{targetLoan.id}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-slate-500 font-semibold">Client Name:</span>
							<span className="font-bold text-slate-900">{targetLoan.primaryBorrower?.name || targetLoan.borrowerName || 'N/A'}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-slate-500 font-semibold">Current Stage:</span>
							<span className="font-bold text-amber-600">
								{isPendingSec ? 'Pending Secondary Approval' : isPendingAdm ? 'Pending Final Admin Approval' : targetLoan.approval_status || 'Under Review'}
							</span>
						</div>
						{isPendingSec && secAccounts.length > 0 && (
							<div className="flex justify-between">
								<span className="text-slate-500 font-semibold">Secondary Account:</span>
								<span className="font-bold text-slate-800">{secAccounts.join(', ')}</span>
							</div>
						)}
						{isPendingSec && approverNames && (
							<div className="flex justify-between">
								<span className="text-slate-500 font-semibold">Required Approver:</span>
								<span className="font-bold text-primary">{approverNames}</span>
							</div>
						)}
					</div>

					<div className="mt-6 flex justify-end">
						<button
							type="button"
							onClick={() => {
								setAccessRestrictedModal({ isOpen: false, loan: null });
								if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
									window.history.replaceState({}, '', '/joint-loan');
								}
							}}
							className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[13px] shadow-sm transition-all cursor-pointer"
						>
							Understood
						</button>
					</div>
				</div>
			</div>
		);
	};

	// Bottom-right toast alert in the style of loan creation alert
	const renderBottomRightAlert = () => {
		if (!createLoanSuccessAlert) return null;
		return (
			<div
				role="alert"
				aria-live="assertive"
				className="fixed bottom-6 right-6 z-[100] max-w-[calc(100vw-3rem)] sm:max-w-lg w-auto flex items-center justify-between gap-3.5 px-5 py-3.5 bg-slate-900/95 text-white text-xs sm:text-[13.5px] font-semibold rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md transition-all duration-300 pointer-events-auto"
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="material-symbols-outlined text-emerald-400 text-[22px] shrink-0">
						check_circle
					</span>
					<span className="leading-snug text-slate-100 font-medium">
						{createLoanSuccessAlert}
					</span>
				</div>
				<button
					type="button"
					onClick={() => {
						if (createLoanAlertTimerRef.current) {
							clearTimeout(createLoanAlertTimerRef.current);
						}
						setCreateLoanSuccessAlert(null);
					}}
					className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-1"
					title="Close"
					aria-label="Close alert"
				>
					<span className="material-symbols-outlined text-[18px]">close</span>
				</button>
			</div>
		);
	};

	// When a loan is selected, render the full Joint Loan Details Page
	if (selectedLoan) {
		return (
			<>
				<JointLoanDetailsPage
					loan={selectedLoan}
					onBack={() => {
						if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
							window.history.pushState({}, '', '/joint-loan');
						}
						setSelectedLoan(null);
					}}
					onUpdateLoan={(updated) => {
						setLoans((prev) => prev.map((l) => (l.id === updated.id || (l.db_id && updated.db_id && l.db_id === updated.db_id) ? updated : l)));
						setSelectedLoan(updated);
					}}
					onSecManagerApprove={(updated) => {
						setLoans((prev) =>
							prev.map((l) =>
								l.id === updated.id || (l.db_id && updated.db_id && l.db_id === updated.db_id)
									? updated
									: l
							)
						);
						if (typeof window !== 'undefined' && window.location.pathname !== '/joint-loan') {
							window.history.pushState({}, '', '/joint-loan');
						}
						setSelectedLoan(null);
						const loanId = updated.loan_ref_id || updated.id;
						showSecApproveSuccessAlert(loanId);
					}}
					onDeleteLoan={(loan) => {
						setLoanToDelete(loan);
					}}
					formatCurrency={formatCurrency}
					formatLoanDate={formatLoanDate}
					getStatusBadge={getStatusBadge}
					getPrimaryTagColor={getPrimaryTagColor}
					availableAccountOptions={availableAccountOptions}
					isSecondaryLoan={isLoanSecondaryForUser(
						selectedLoan,
						userPermissions,
						accountRoleFilter,
						availableAccountObjects
					)}
					currentUser={activeUser || propCurrentUser}
					availableAccountObjects={availableAccountObjects}
					allUsers={allUsers}
				/>
				{renderDeleteModal()}
				{renderAccessRestrictedModal()}
				{renderBottomRightAlert()}
			</>
		);
	}

	return (
		<div className="flex flex-col w-full gap-space-lg font-sans">
			{/* Top Header & Page Title */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<span className="material-symbols-outlined text-[24px]">handshake</span>
						</div>
						<div>
							<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Joint Loan Portfolio
							</h1>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Multi-party facilities, co-borrower liability tracking &amp; syndicate records
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-space-sm flex-wrap">
					{syncFeedback && (
						<span className="text-[12px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl ring-1 ring-emerald-200 flex items-center gap-1 transition-all">
							<span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
							{syncFeedback}
						</span>
					)}

					{/* Role Toggle Button Group: All, Primary, Secondary */}
					<div className="inline-flex items-center p-1 bg-surface-container-low rounded-xl border border-slate-200/80 shadow-2xs">
						<button
							type="button"
							onClick={() => setAccountRoleFilter('all')}
							className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${accountRoleFilter === 'all'
								? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
								: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							title="All assigned primary and secondary account loans"
						>
							<span>All</span>
							<span
								className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${accountRoleFilter === 'all'
									? 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
									: 'bg-slate-200/70 text-slate-600'
									}`}
							>
								{roleCounts.all}
							</span>
						</button>

						<button
							type="button"
							onClick={() => setAccountRoleFilter('primary')}
							className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${accountRoleFilter === 'primary'
								? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-200/70'
								: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							title="User's assigned primary account loans"
						>
							<span className="w-2 h-2 rounded-full bg-emerald-500"></span>
							<span>Primary</span>
							<span
								className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${accountRoleFilter === 'primary'
									? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
									: 'bg-slate-200/70 text-slate-600'
									}`}
							>
								{roleCounts.primary}
							</span>
						</button>

						<button
							type="button"
							onClick={() => setAccountRoleFilter('secondary')}
							className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[12px] transition-all cursor-pointer ${accountRoleFilter === 'secondary'
								? 'bg-white text-purple-700 shadow-xs ring-1 ring-purple-200/70'
								: 'text-slate-600 hover:text-slate-900 hover:bg-surface-container/50'
								}`}
							title="User's assigned secondary account loans"
						>
							<span className="w-2 h-2 rounded-full bg-purple-500"></span>
							<span>Secondary</span>
							<span
								className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${accountRoleFilter === 'secondary'
									? 'bg-purple-100 text-purple-800 ring-1 ring-purple-200'
									: 'bg-slate-200/70 text-slate-600'
									}`}
							>
								{roleCounts.secondary}
							</span>
						</button>
					</div>

					<button
						type="button"
						onClick={handleDbSync}
						disabled={isSyncing}
						className={`flex items-center gap-2 bg-surface-container-low hover:bg-surface-container text-slate-700 hover:text-slate-900 border border-slate-200/80 ${
							lastSyncTime ? 'px-3 py-1.5' : 'px-3 py-2'
						} rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-75 cursor-pointer group`}
						title={lastSyncTime ? `Last synced: ${lastSyncTime} • Click to sync Day Book` : 'Sync with Day Book'}
					>
						<span
							className={`material-symbols-outlined text-[18px] transition-transform ${
								isSyncing ? 'animate-spin text-primary' : 'text-slate-500 group-hover:text-primary'
							}`}
						>
							sync
						</span>
						<div className="flex flex-col text-left leading-tight">
							<span className="font-bold text-[12px] whitespace-nowrap">
								{isSyncing ? 'Syncing...' : syncFeedback || 'DB Sync'}
							</span>
							{lastSyncTime && (
								<span className="text-[9px] text-slate-400 font-medium whitespace-nowrap font-mono tracking-tight">
									{lastSyncTime}
								</span>
							)}
						</div>
					</button>

					<button
						type="button"
						onClick={handleExportLoansList}
						disabled={filteredLoans.length === 0 && userPermittedLoans.length === 0}
						className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-900 text-white border border-slate-200/80 px-3 py-2 rounded-xl font-bold text-[12.5px] shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
						title="Export outstanding report per primary account (.xlsx)"
					>
						<span className="material-symbols-outlined text-[18px] text-white">
							download
						</span>
						<span>Export</span>
					</button>

					<button
						type="button"
						onClick={() => {
							handleCloseCreateModal();
							setIsCreateOpen(true);
						}}
						className="flex items-center gap-1.5 bg-primary-container hover:bg-primary text-on-primary px-3 py-2 rounded-xl font-bold text-[12.5px] shadow-sm transition-all active:scale-95"
					>
						<span className="material-symbols-outlined text-[18px]">add</span>
						<span>New Loan</span>
					</button>
				</div>
			</div>

			{/* KPI Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md">
				{/* KPI 1: Total Joints */}
				<div
					onClick={() => setStatusFilter('ALL')}
					className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 transition-all cursor-pointer ${
						statusFilter === 'ALL'
							? 'ring-1 ring-primary/80 bg-primary/5 shadow-md'
							: 'ring-slate-200/80 hover:ring-primary/40 hover:shadow-md'
					} flex flex-col justify-between`}
					title="Click to view all loans"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span className={statusFilter === 'ALL' ? 'text-primary font-extrabold' : ''}>Total Loans</span>
						<span className="material-symbols-outlined text-primary text-[20px]">
							handshake
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{totalJointsCount}
						</div>
						<div className="flex items-center gap-1 text-[12px] mt-1">
							<span className="font-bold text-primary">{formatCurrency(totalCapital)}</span>
							<span className="text-slate-500">total portfolio</span>
						</div>
					</div>
				</div>

				{/* KPI 2: Active Loans */}
				<div
					onClick={() => setStatusFilter(statusFilter === 'Active' ? 'ALL' : 'Active')}
					className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 transition-all cursor-pointer ${
						statusFilter === 'Active'
							? 'ring-1 ring-emerald-500 bg-emerald-50/30 shadow-md'
							: 'ring-slate-200/80 hover:ring-emerald-300 hover:shadow-md'
					} flex flex-col justify-between`}
					title="Click to filter by Active loans"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span className={statusFilter === 'Active' ? 'text-emerald-700 font-extrabold' : ''}>Active Loans</span>
						<span className="material-symbols-outlined text-emerald-600 text-[20px]">
							hub
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{activeLoansCount}
						</div>
						<div className="flex items-center gap-1 text-[12px] mt-1">
							<span className="font-bold text-emerald-700">{formatCurrency(activeCapital)}</span>
							<span className="text-slate-500">in servicing</span>
						</div>
					</div>
				</div>

				{/* KPI 3: Overdue Loans */}
				<div
					onClick={() => setStatusFilter(statusFilter === 'Overdue' ? 'ALL' : 'Overdue')}
					className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 transition-all cursor-pointer ${
						statusFilter === 'Overdue'
							? 'ring-1 ring-rose-500 bg-rose-50/30 shadow-md'
							: 'ring-slate-200/80 hover:ring-rose-300 hover:shadow-md'
					} flex flex-col justify-between`}
					title="Click to filter by Overdue loans"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span className={statusFilter === 'Overdue' ? 'text-rose-700 font-extrabold' : ''}>Overdue Loans</span>
						<span className="material-symbols-outlined text-rose-600 text-[20px]">
							warning
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{overdueLoansCount}
						</div>
						<div className="flex items-center gap-1 text-[12px] mt-1">
							<span className="font-bold text-rose-700">{formatCurrency(overdueCapital)}</span>
							<span className="text-slate-500">delayed EMIs</span>
						</div>
					</div>
				</div>

				{/* KPI 4: Closed Loans */}
				<div
					onClick={() => setStatusFilter(statusFilter === 'Closed' ? 'ALL' : 'Closed')}
					className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 transition-all cursor-pointer ${
						statusFilter === 'Closed'
							? 'ring-1 ring-slate-600 bg-slate-100 shadow-md'
							: 'ring-slate-200/80 hover:ring-slate-400 hover:shadow-md'
					} flex flex-col justify-between`}
					title="Click to filter by Closed loans"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span className={statusFilter === 'Closed' ? 'text-slate-800 font-extrabold' : ''}>Closed Loans</span>
						<span className="material-symbols-outlined text-slate-500 text-[20px]">
							task_alt
						</span>
					</div>
					<div className="my-2">
						<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
							{closedLoansCount}
						</div>
						<div className="flex items-center gap-1 text-[12px] text-slate-600 font-semibold mt-1">
							<span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
							<span>{formatCurrency(closedCapital)} settled</span>
						</div>
					</div>
				</div>

				{/* KPI 5: Approval Pending */}
				<div
					onClick={() => setStatusFilter(statusFilter === 'Pending' ? 'ALL' : 'Pending')}
					className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-sm ring-1 transition-all cursor-pointer ${
						statusFilter === 'Pending'
							? 'ring-1 ring-amber-500 bg-amber-50/30 shadow-md'
							: 'ring-slate-200/80 hover:ring-amber-300 hover:shadow-md'
					} flex flex-col justify-between`}
					title="Click to filter by Pending Approval loans"
				>
					<div className="flex items-center justify-between text-slate-500 font-bold text-[12px] uppercase tracking-wider">
						<span className={statusFilter === 'Pending' ? 'text-amber-800 font-extrabold' : ''}>Approval Pending</span>
						<span className="material-symbols-outlined text-amber-600 text-[20px]">
							pending_actions
						</span>
					</div>
					<div className="my-2">
						<div className="flex items-baseline justify-between">
							<div className="font-extrabold text-[28px] text-slate-900 leading-tight">
								{pendingApprovalCount}
							</div>
							{pendingApprovalCapital > 0 && (
								<span className="text-[11px] font-semibold text-slate-500">
									{formatCurrency(pendingApprovalCapital)}
								</span>
							)}
						</div>
						<div className="flex items-center flex-wrap gap-1.5 text-[12px] mt-1 text-slate-600 font-semibold">
							<span>
								New Loan: <span className="text-amber-700 font-bold">{pendingNewLoanCount}</span>
							</span>
							<span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
							<span>
								Payout: <span className="text-blue-700 font-bold">{pendingPayoutCount}</span>
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Main Card: Controls, Filters & Table Navigation (Requests.jsx style) */}
			<div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 flex flex-col gap-5">
				{/* Top Controls: Filter Dropdowns on Left, Search Input on Right */}
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
					{/* Filters on Left */}
					<div className="flex items-center flex-wrap gap-2.5">
						{/* Status Filter */}
						<ModernStatusDropdown
							value={statusFilter}
							onChange={setStatusFilter}
							options={statusFilterOptions}
						/>

						{/* Account Name Filter */}
						<ModernAccountDropdown
							value={accountFilter}
							onChange={setAccountFilter}
							options={accountFilterOptions}
						/>

						{/* Date Range Filter */}
						<ModernDateRangeCalendar
							startDate={dateRangeFilter.startDate}
							endDate={dateRangeFilter.endDate}
							onChange={setDateRangeFilter}
							referenceDate={calendarReferenceDate}
						/>

						{/* Active filter indicator & Reset All */}
						{(statusFilter !== 'ALL' || accountFilter !== 'ALL' || dateRangeFilter.startDate || dateRangeFilter.endDate || internalSearchQuery) && (
							<button
								type="button"
								onClick={() => {
									setStatusFilter('ALL');
									setAccountFilter('ALL');
									setDateRangeFilter({ startDate: '', endDate: '' });
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
							placeholder="Search borrower, ID, amount..."
							className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:bg-white placeholder:text-slate-400 font-medium"
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
								<th className="py-3 px-4 text-center w-14">#</th>
								<th className="py-3 px-4 whitespace-nowrap">Loan ID</th>
								<th className="py-3 px-4 whitespace-nowrap">Loan Date</th>
								<th className="py-3 px-4 whitespace-nowrap">Client Name</th>
								<th className="py-3 px-4 whitespace-nowrap">Primary</th>
								<th className="py-3 px-4 whitespace-nowrap">Amount</th>
								<th className="py-3 px-4 whitespace-nowrap">Status</th>
								<th className="py-3 px-4 whitespace-nowrap text-right">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 text-[13px] bg-white">
							{filteredLoans.length === 0 ? (
								<tr>
									<td colSpan="8" className="py-16 text-center">
										<div className="max-w-sm mx-auto">
											<div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
												<span className="material-symbols-outlined text-[28px]">search_off</span>
											</div>
											<h3 className="text-sm font-bold text-slate-800">
												No joint loans found
											</h3>
											<p className="text-xs text-slate-500 mt-1">
												{!userPermissions.isAdmin && userPermittedLoans.length === 0
													? `No joint loans found for your assigned ${accountRoleFilter === 'primary' ? 'primary' : accountRoleFilter === 'secondary' ? 'secondary' : 'primary and secondary'} accounts.`
													: 'No loans match your current filter and search criteria.'}
											</p>
											{(statusFilter !== 'ALL' || accountFilter !== 'ALL' || dateRangeFilter.startDate || dateRangeFilter.endDate || internalSearchQuery) && (
												<button
													type="button"
													onClick={() => {
														setStatusFilter('ALL');
														setAccountFilter('ALL');
														setDateRangeFilter({ startDate: '', endDate: '' });
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
								paginatedLoans.map((loan, idx) => {
									const canAccess = canUserAccessLoan(loan, activeUser, userPermissions, availableAccountObjects, allUsers);
									const hasPayoutPending = isLoanPayoutPending(loan);
									const isPendingSec = !hasPayoutPending && (loan.approval_status === 'PENDING_SECONDARY' || (!loan.approval_status && loan.status === 'Pending'));
									const isPendingAdm = !hasPayoutPending && (loan.approval_status === 'PENDING_ADMIN' || loan.approval_status === 'VERIFIED');
									const isUserSecMgr = checkUserHasPrimaryAccessForLoanSecondary(activeUser, loan, availableAccountObjects);

									return (
										<tr
											key={loan.id}
											onClick={() => {
												if (!canAccess) {
													setAccessRestrictedModal({ isOpen: true, loan });
												} else {
													const targetLoanRef = loan.loan_ref_id || loan.id;
													if (targetLoanRef && typeof window !== 'undefined') {
														const targetPath = `/joint-loan/${encodeURIComponent(targetLoanRef)}`;
														if (window.location.pathname !== targetPath) {
															window.history.pushState({}, '', targetPath);
														}
													}
													setSelectedLoan(loan);
												}
											}}
											className={`cursor-pointer transition-colors group ${!canAccess ? 'bg-slate-50/50 hover:bg-amber-50/40' : 'hover:bg-slate-50'
												}`}
										>
											{/* 1. # */}
											<td className="py-3 px-4 text-center text-xs font-bold text-slate-500">
												{startIndex + idx + 1}
											</td>

											{/* 2. Loan ID */}
											<td className="py-3 px-4 whitespace-nowrap">
												<div className="flex items-center gap-1.5">
													<span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
														{loan.id}
													</span>
												</div>
											</td>

											{/* 3. Loan Date */}
											<td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-600">
												{formatLoanDate(loan.loan_date || loan.appliedDate || loan.loanDate || loan.date || loan.applied_date)}
											</td>

											{/* 4. Client Name */}
											<td className="py-3 px-4 max-w-[200px]">
												<div
													className="font-extrabold text-[13.5px] text-slate-900 group-hover:text-primary transition-colors truncate"
													title={loan.primaryBorrower.name}
												>
													{loan.primaryBorrower.name}
												</div>
											</td>

											{/* 5. Primary */}
											<td className="py-3 px-4 whitespace-nowrap">
												<span
													className={`inline-block font-extrabold text-[10.5px] px-2 py-0.5 rounded-md uppercase tracking-wider ring-1 ${getPrimaryTagColor(
														loan.primary || loan.primaryAccountName || loan.primary_account_name,
														availableAccountObjects
													)}`}
												>
													{loan.primary || getAcronym(loan.primaryAccountName || loan.primary_account_name, availableAccountObjects) || 'PRI'}
												</span>
											</td>

											{/* 6. Amount */}
											<td className="py-3 px-4 whitespace-nowrap">
												<div className="font-extrabold text-[13.5px] text-slate-900">
													{formatCurrency(loan.amount)}
												</div>
											</td>

											{/* 7. Status */}
											<td className="py-3 px-4 whitespace-nowrap">
												{(() => {
													const computedStatus = getComputedLoanStatus(loan);
													const badge = getStatusBadge(computedStatus);

													if (!canAccess) {
														return (
															<span
																className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 bg-slate-100 text-slate-700 ring-slate-200"
																title="Locked: Awaiting authorization before access is released."
															>
																<span className="material-symbols-outlined text-amber-600" style={{ fontSize: "16px" }}>lock</span>
																<span>{isPendingSec ? 'Pending Secondary' : isPendingAdm ? 'Pending Admin' : 'Locked'}</span>
															</span>
														);
													}

													if (isPendingSec && isUserSecMgr && !userPermissions?.isAdmin) {
														return (
															<span
																className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
																title="Action required: You are the primary manager for this secondary account. Click to review and approve."
															>
																<span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
																<span>Action: Your Approval</span>
															</span>
														);
													}

													if (isPendingAdm && userPermissions?.isAdmin) {
														return (
															<span
																className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse"
																title="Action required: Final Administrator approval needed to activate facility."
															>
																<span className="material-symbols-outlined text-[13px] text-emerald-600">shield_person</span>
																<span>Action: Final Approval</span>
															</span>
														);
													}

													if (computedStatus === 'Active') {
														return (
															<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
																<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
																Active
															</span>
														);
													}

													if (computedStatus === 'Closed') {
														return (
															<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
																<span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
																Closed
															</span>
														);
													}

													if (computedStatus === 'Pending') {
														return (
															<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
																<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
																Pending
															</span>
														);
													}

													return (
														<span
															className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.color}`}
														>
															<span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
															<span>{computedStatus}</span>
														</span>
													);
												})()}
											</td>

											{/* 8. Action */}
											<td className="py-3 px-4 text-right whitespace-nowrap">
												<div className="flex items-center justify-end">
													{(() => {
														const isAdminUser = Boolean(userPermissions?.isAdmin);
														const isPrimaryUser = Boolean(
															checkLoanMatchesUserPrimary(
																loan,
																userPermissions?.primary,
																availableAccountObjects
															)
														);
														const canDelete = isAdminUser || isPrimaryUser;

														return (
															<button
																type="button"
																disabled={!canDelete}
																onClick={(e) => {
																	e.stopPropagation();
																	if (canDelete) {
																		setLoanToDelete(loan);
																	}
																}}
																className={`flex items-center justify-center p-1.5 rounded-lg transition-colors ${!canDelete
																	? 'text-slate-300 cursor-not-allowed opacity-40'
																	: 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
																	}`}
																title={
																	canDelete
																		? 'Delete loan'
																		: 'Delete is disabled for secondary account users'
																}
															>
																<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
																	delete
																</span>
															</button>
														);
													})()}
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
								<span className="font-bold text-slate-900">{totalItems}</span> loans
							</span>
							{totalItems !== userPermittedLoans.length && (
								<span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200/70">
									{userPermittedLoans.length} total
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
			</div>



			{/* Modal: New Loan Application Card */}
			{isCreateOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans overscroll-contain">
					<div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl ring-1 ring-slate-200 overflow-hidden">
						{/* Fixed Header */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
							<div>
								<div className="flex items-center gap-2.5">
									<h3 className="font-bold text-[18px] text-slate-900">
										New Loan Application
									</h3>
									{!userPermissions.isAdmin && userPermissions.primary?.length > 0 && (
										<span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md ring-1 ring-emerald-300">
											<span className="material-symbols-outlined text-[13px] text-emerald-600">verified_user</span>
											<span>Assigned: {userPermissions.primary.join(', ')}</span>
										</span>
									)}
								</div>
								<p className="text-[12px] text-slate-500 mt-0.5">
									{isDocumentVerified
										? 'Extracted loan details verified. Allocate secondary accounts below.'
										: !userPermissions.isAdmin && (!userPermissions.primary || userPermissions.primary.length === 0)
											? 'No primary accounts assigned to your profile. You cannot create joint loans.'
											: 'Upload loan PDF document to verify uniqueness and extract loan details'}
								</p>
							</div>
							<button
								onClick={handleCloseCreateModal}
								className="p-1 h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
								title="Close modal"
							>
								<span className="material-symbols-outlined">close</span>
							</button>
						</div>

						<form onSubmit={handleCreateLoan} className="flex flex-col min-h-0 overflow-hidden">
							{/* Scrollable Form Body */}
							<div className="overflow-y-auto px-6 py-4 space-y-4">
								{/* Step 1: Initial Upload Area - Only displayed before verification */}
								{!isDocumentVerified && (
									<div>
										{/* Dropzone (shown when not parsing, no duplicate error, and no unauthorized primary error) */}
										{!pdfParsing && !duplicateLoanError && !unauthorizedPrimaryError && (
											!userPermissions.isAdmin && (!userPermissions.primary || userPermissions.primary.length === 0) ? (
												<div className="p-8 rounded-2xl bg-rose-50 border-2 border-dashed border-rose-300 text-center flex flex-col items-center justify-center gap-3">
													<div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
														<span className="material-symbols-outlined text-[28px]">lock</span>
													</div>
													<div>
														<h4 className="text-[14px] font-bold text-rose-900">
															No Primary Account Assigned
														</h4>
														<p className="text-[12px] text-rose-700 mt-1 max-w-md mx-auto">
															You do not have any assigned primary accounts in your profile. You can only create joint loans for accounts assigned to you as primary.
														</p>
													</div>
												</div>
											) : (
												<div>
													<div className="flex items-center justify-between mb-2">
														<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider">
															Upload Loan Document
														</label>
														{!userPermissions.isAdmin && userPermissions.primary?.length > 0 && (
															<span className="text-[11px] font-bold text-slate-500">
																Allowed Primary: <span className="text-emerald-700 font-extrabold">{userPermissions.primary.join(', ')}</span>
															</span>
														)}
													</div>
													<div
														onClick={() => fileInputRef.current?.click()}
														onDragOver={(e) => {
															e.preventDefault();
															e.stopPropagation();
														}}
														onDrop={(e) => {
															e.preventDefault();
															e.stopPropagation();
															if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
																handleFileSelect({ target: { files: e.dataTransfer.files } });
															}
														}}
														className="border-2 border-dashed border-slate-300 hover:border-primary/80 bg-slate-50/70 hover:bg-slate-50 rounded-2xl p-8 text-center cursor-pointer transition-all group"
													>
														<input
															type="file"
															ref={fileInputRef}
															onChange={handleFileSelect}
															accept=".pdf,.docx,.doc"
															className="hidden"
														/>
														<div className="flex flex-col items-center justify-center gap-2">
															<div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
																<span className="material-symbols-outlined text-[32px]">cloud_upload</span>
															</div>
															<div className="text-[14px] font-bold text-slate-800">
																Click to upload or drag &amp; drop loan document
															</div>
															<div className="text-[12px] text-slate-500">
																Upload loan PDF or Word document (.docx) to check uniqueness and extract facility details
															</div>
															<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-200/70 text-slate-600 mt-1">
																<span className="material-symbols-outlined text-[13px]">description</span>
																PDF or Word (.docx) files (max. 10MB)
															</span>
														</div>
													</div>
												</div>
											)
										)}

										{/* Uploading & Parsing Indicator */}
										{pdfParsing && (
											<div className="p-8 rounded-2xl border-2 border-primary/20 bg-primary/5 text-center flex flex-col items-center justify-center gap-3">
												<div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
													<span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
												</div>
												<div>
													<h4 className="text-[14px] font-bold text-slate-900">
														Verifying &amp; Parsing Document...
													</h4>
													<p className="text-[12px] text-slate-500 mt-0.5">
														Extracting details and checking database to prevent duplicate loans.
													</p>
												</div>
											</div>
										)}

										{/* PDF Parse Error Banner */}
										{pdfError && !pdfParsing && !duplicateLoanError && (
											<div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3 mt-3">
												<span className="material-symbols-outlined text-[20px] text-rose-500 mt-0.5 flex-shrink-0">error</span>
												<div className="flex-1 text-[12px]">
													<strong className="block font-bold mb-0.5">Upload Error</strong>
													<span>{pdfError}</span>
													<div className="mt-2.5">
														<button
															type="button"
															onClick={handleResetUpload}
															className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
														>
															<span className="material-symbols-outlined text-[15px]">refresh</span>
															Try uploading again
														</button>
													</div>
												</div>
											</div>
										)}

										{/* Duplicate Loan ID Error Card */}
										{duplicateLoanError && (
											<div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-rose-50/95 to-red-100/70 border-2 border-rose-400 p-4 sm:p-5 shadow-lg shadow-rose-500/10 mt-1 animate-in fade-in zoom-in-95 duration-200">
												<div className="flex items-start gap-3.5">
													<div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30 ring-4 ring-rose-100">
														<span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
													</div>

													<div className="flex-1 min-w-0 pr-2">
														<h4 className="text-[15px] font-extrabold text-rose-950 leading-snug">
															Duplicate Loan Detected
														</h4>

														<p className="text-[12px] text-rose-800 mt-1 leading-relaxed">
															{duplicateLoanError.message || (
																<>A joint facility record with ID <strong className="text-rose-950 font-bold font-mono">{duplicateLoanError.loanId}</strong> is already registered. Duplicate loans are not permitted.</>
															)}
														</p>

														{/* Existing Record Details Card */}
														{(duplicateLoanError.clientName || duplicateLoanError.amount) && (
															<div className="mt-3 p-3 rounded-xl bg-rose-100 border border-rose-200/90 shadow-xs">
																<div className="text-[10px] font-black uppercase tracking-wider text-rose-700 mb-1.5 flex items-center gap-1">
																	<span className="material-symbols-outlined text-[14px]">database</span>
																	Existing Record Details
																</div>
																<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[12px]">
																	{duplicateLoanError.clientName && (
																		<div>
																			<span className="text-slate-600 block text-[10px] font-semibold">Client Name</span>
																			<span className="font-bold text-slate-800 truncate block">
																				{duplicateLoanError.clientName}
																			</span>
																		</div>
																	)}
																	{duplicateLoanError.amount && (
																		<div>
																			<span className="text-slate-600 block text-[10px] font-semibold">Loan Amount</span>
																			<span className="font-extrabold text-slate-900 block">
																				{formatCurrency(duplicateLoanError.amount)}
																			</span>
																		</div>
																	)}
																	{duplicateLoanError.date && (
																		<div>
																			<span className="text-slate-600 block text-[10px] font-semibold">Loan Date</span>
																			<span className="font-bold text-slate-700 block">
																				{duplicateLoanError.date}
																			</span>
																		</div>
																	)}
																</div>
															</div>
														)}

														{/* Action Guidance */}
														<div className="mt-3 flex flex-wrap justify-end gap-3">
															<button
																type="button"
																onClick={handleResetUpload}
																className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all active:scale-95 cursor-pointer"
															>
																<span className="material-symbols-outlined text-[16px]">upload_file</span>
																Upload New
															</button>
														</div>
													</div>
												</div>
											</div>
										)}

										{/* Unauthorized Primary Account Error Card */}
										{unauthorizedPrimaryError && (
											<div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-amber-50/95 to-orange-100/70 border-2 border-amber-400 p-4 sm:p-5 shadow-lg shadow-amber-500/10 mt-1 animate-in fade-in zoom-in-95 duration-200">
												<div className="flex items-start gap-3.5">
													<div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/30 ring-4 ring-amber-100">
														<span className="material-symbols-outlined text-[24px]">shield_lock</span>
													</div>

													<div className="flex-1 min-w-0 pr-2">
														<h4 className="text-[15px] font-extrabold text-amber-950 leading-snug">
															Primary Account Not Assigned
														</h4>

														<p className="text-[12px] text-amber-900 mt-1 leading-relaxed">
															You can create loans for your assigned primary account(s) only. The primary account detected in this document is not assigned to you as primary.
														</p>

														{/* Account Comparison Box */}
														<div className="mt-3 p-3 rounded-xl bg-amber-100/80 border border-amber-200/90 shadow-xs">
															<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
																<div>
																	<span className="text-amber-800 block text-[10px] font-bold uppercase tracking-wider">
																		Document Primary Account
																	</span>
																	<span className="font-extrabold text-rose-700 text-[13px] truncate block mt-0.5">
																		{unauthorizedPrimaryError.extractedPrimary}
																	</span>
																</div>
																<div>
																	<span className="text-amber-800 block text-[10px] font-bold uppercase tracking-wider">
																		Your Assigned Primary Account(s)
																	</span>
																	<span className="font-extrabold text-emerald-800 text-[13px] truncate block mt-0.5">
																		{unauthorizedPrimaryError.allowedLabels?.length > 0
																			? unauthorizedPrimaryError.allowedLabels.join(', ')
																			: unauthorizedPrimaryError.allowedAccounts?.join(', ') || 'None assigned'}
																	</span>
																</div>
															</div>
														</div>

														{/* Action Guidance */}
														<div className="mt-3 flex flex-wrap justify-end gap-3">
															<button
																type="button"
																onClick={handleResetUpload}
																className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all active:scale-95 cursor-pointer"
															>
																<span className="material-symbols-outlined text-[16px]">upload_file</span>
																<span>Upload Assigned Account Document</span>
															</button>
														</div>
													</div>
												</div>
											</div>
										)}
									</div>
								)}

								{/* Step 2: Display Parsed Data & Secondary Accounts ONLY AFTER document is verified non-duplicate */}
								{isDocumentVerified && (
									<>
										{/* Verified Document Header Bar */}
										<div className="flex items-center justify-between p-3 px-4 rounded-xl bg-emerald-50/90 border border-emerald-200 shadow-2xs">
											<div className="flex items-center gap-3 min-w-0">
												<div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
													<span className="material-symbols-outlined text-[20px]">check_circle</span>
												</div>
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														<span className="text-[13px] font-bold text-emerald-950 truncate max-w-[220px] sm:max-w-xs">
															{selectedPdfFile?.name || uploadedFiles[0]?.name || 'Loan Document.pdf'}
														</span>
														<span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-200/90 text-emerald-900 border border-emerald-300">
															Verified
														</span>
													</div>
													<span className="text-[11px] text-emerald-700 block mt-0.5">
														{selectedPdfFile?.size ? `${(selectedPdfFile.size / 1024).toFixed(1)} KB • ` : ''}
														Unique record confirmed
													</span>
												</div>
											</div>
											<button
												type="button"
												onClick={handleResetUpload}
												className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:bg-white transition-all border border-slate-200/80 shadow-2xs cursor-pointer flex-shrink-0 ml-2"
												title="Change document"
											>
												<span className="material-symbols-outlined text-[15px]">sync</span>
												<span>Change</span>
											</button>
										</div>

										{/* Parsed Loan Data Card */}
										<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
											<div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
												<div className="flex items-center gap-2">
													<span className="material-symbols-outlined text-[20px] text-primary">analytics</span>
													<h4 className="text-[13px] font-bold text-slate-800 uppercase">
														Extracted Loan Details
													</h4>
												</div>
												{pdfParsed.loan_number && (
													<span className="font-mono font-black text-[12px] text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20">
														{pdfParsed.loan_number}
													</span>
												)}
											</div>

											<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Borrower / Client
													</span>
													<span className="font-bold text-slate-900 truncate block">
														{cleanCustomerName(pdfParsed.client_account) || '-'}
													</span>
												</div>

												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Primary Account
													</span>
													<span className="font-bold text-slate-900 truncate block">
														{pdfParsed.primary_account || '-'}
													</span>
												</div>

												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Loan Date
													</span>
													<span className="font-bold text-slate-900 block">
														{formatLoanDate(pdfParsed.loan_date)}
													</span>
												</div>

												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Loan Amount
													</span>
													<span className="font-extrabold text-[14px] text-slate-950 block">
														{formatCurrency(pdfParsed.loan_amount)}
													</span>
												</div>

												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Total Repayment
													</span>
													<span className="font-bold text-slate-900 block">
														{formatCurrency(pdfParsed.total_repayment)}
													</span>
												</div>

												<div>
													<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
														Installments
													</span>
													<span className="font-bold text-slate-900 block">
														{pdfParsed.table?.length ? `${pdfParsed.table.length} EMIs` : (pdfParsed.total_installments ? `${pdfParsed.total_installments} EMIs` : '-')}
													</span>
												</div>
											</div>
										</div>

										{/* Secondary Accounts & Amounts Section */}
										<div className="pt-1">
											<div className="flex items-center justify-between pb-2 mb-2">
												<div>
													<label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider">
														Secondary Accounts &amp; Amounts
													</label>
													<span className="text-[11px] text-slate-400">
														Select secondary account name and set allocated facility amount
													</span>
												</div>
												{(() => {
													const priName = pdfParsed?.primary_account || newPrimaryName || '';
													const selectableOptions = availableAccountOptions.filter(
														(opt) => !isPrimaryAccountMatch(opt, priName)
													);
													const canAddMore = secondaryAccounts.length < selectableOptions.length;
													return (
														<button
															type="button"
															onClick={handleAddSecondaryAccount}
															disabled={!canAddMore}
															className={`inline-flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl transition-all ${!canAddMore
																? 'bg-slate-100 text-slate-400 cursor-not-allowed'
																: 'text-primary hover:text-primary-container bg-primary/10 hover:bg-primary/20 active:scale-95 cursor-pointer'
																}`}
														>
															<span className="material-symbols-outlined text-[16px]">add</span>
															<span>Add New</span>
														</button>
													);
												})()}
											</div>

											<div className="space-y-2.5">
												{secondaryAccounts.map((account, index) => {
													const priName = pdfParsed?.primary_account || newPrimaryName || '';
													const availableOptions = availableAccountOptions
														.filter((opt) => {
															// Exclude primary account from secondary account dropdown list
															if (isPrimaryAccountMatch(opt, priName)) return false;
															if (opt === account.accountName) return true;
															return !secondaryAccounts.some(
																(other) => other.id !== account.id && other.accountName === opt
															);
														})
														.sort((a, b) => (typeof a === 'string' ? a : a?.name || '').localeCompare(typeof b === 'string' ? b : b?.name || '', undefined, { sensitivity: 'base' }));

													return (
														<div
															key={account.id}
															className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80"
														>
															<span className="text-[11px] font-bold text-slate-400 w-5 text-center flex-shrink-0">
																#{index + 1}
															</span>

															{/* Secondary Account Dropdown */}
															<div className="flex-1">
																<label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																	Secondary Account Name
																</label>
																<ModernAccountSelect
																	value={account.accountName}
																	onChange={(val) =>
																		handleUpdateSecondaryAccount(account.id, 'accountName', val)
																	}
																	options={availableOptions}
																	accountObjects={availableAccountObjects}
																/>
															</div>

															{/* Share % Field */}
															<div className="w-24 sm:w-28 flex-shrink-0">
																<label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																	Share (%)
																</label>
																<div className="relative">
																	<input
																		type="text"
																		inputMode="decimal"
																		placeholder="0.00"
																		value={account.sharePercent ?? ''}
																		onKeyDown={(e) => {
																			if (e.key === 'ArrowUp') {
																				e.preventDefault();
																				handleStepSecondaryAccount(account.id, 'sharePercent', 0.01);
																				return;
																			}
																			if (e.key === 'ArrowDown') {
																				e.preventDefault();
																				handleStepSecondaryAccount(account.id, 'sharePercent', -0.01);
																				return;
																			}
																			if (
																				[
																					'Backspace',
																					'Tab',
																					'Delete',
																					'ArrowLeft',
																					'ArrowRight',
																					'Home',
																					'End',
																					'Enter',
																				].includes(e.key) ||
																				e.ctrlKey ||
																				e.metaKey
																			) {
																				return;
																			}
																			if (e.key === '.') {
																				if (String(account.sharePercent || '').includes('.')) {
																					e.preventDefault();
																				}
																				return;
																			}
																			if (!/^[0-9]$/.test(e.key)) {
																				e.preventDefault();
																			}
																		}}
																		onChange={(e) =>
																			handleUpdateSecondaryAccount(
																				account.id,
																				'sharePercent',
																				e.target.value
																			)
																		}
																		className="w-full h-10 pl-3 pr-7 py-2 rounded-xl text-[13px] bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-slate-800 shadow-xs"
																	/>
																	<span className="absolute right-3 top-2.5 text-[13px] font-bold text-slate-400 pointer-events-none">
																		%
																	</span>
																</div>
															</div>

															{/* Amount Field */}
															<div className="w-36 sm:w-44 flex-shrink-0">
																<label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
																	Amount (₹)
																</label>
																<div className="relative">
																	<span className="absolute left-3 top-2.5 text-[13px] font-bold text-slate-400 pointer-events-none">
																		₹
																	</span>
																	<input
																		type="text"
																		inputMode="decimal"
																		required
																		placeholder="5,00,000"
																		value={account.amount}
																		onKeyDown={(e) => {
																			if (e.key === 'ArrowUp') {
																				e.preventDefault();
																				handleStepSecondaryAccount(account.id, 'amount', 0.01);
																				return;
																			}
																			if (e.key === 'ArrowDown') {
																				e.preventDefault();
																				handleStepSecondaryAccount(account.id, 'amount', -0.01);
																				return;
																			}
																			if (
																				e.key === 'Backspace' &&
																				e.target.selectionStart === e.target.selectionEnd
																			) {
																				const pos = e.target.selectionStart;
																				const val = e.target.value;
																				if (pos > 0 && val[pos - 1] === ',') {
																					e.preventDefault();
																					const newVal = val.slice(0, pos - 2) + val.slice(pos);
																					handleUpdateSecondaryAccount(account.id, 'amount', newVal);
																					return;
																				}
																			}
																			if (
																				[
																					'Backspace',
																					'Tab',
																					'Delete',
																					'ArrowLeft',
																					'ArrowRight',
																					'Home',
																					'End',
																					'Enter',
																				].includes(e.key) ||
																				e.ctrlKey ||
																				e.metaKey
																			) {
																				return;
																			}
																			if (e.key === '.') {
																				if (String(account.amount || '').includes('.')) {
																					e.preventDefault();
																				}
																				return;
																			}
																			if (!/^[0-9]$/.test(e.key)) {
																				e.preventDefault();
																			}
																		}}
																		onChange={(e) =>
																			handleUpdateSecondaryAccount(
																				account.id,
																				'amount',
																				e.target.value
																			)
																		}
																		className="w-full h-10 pl-7 pr-3 py-2 rounded-xl text-[13px] bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-slate-800 shadow-xs"
																	/>
																</div>
															</div>

															{/* Delete button (if more than 1) */}
															{secondaryAccounts.length > 1 && (
																<button
																	type="button"
																	onClick={() => handleRemoveSecondaryAccount(account.id)}
																	className="h-10 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors self-end cursor-pointer flex-shrink-0"
																	title="Remove secondary account"
																>
																	<span className="material-symbols-outlined text-[18px]">delete</span>
																</button>
															)}
														</div>
													);
												})}
											</div>

											{/* Total Secondary Amount & Share Indicator */}
											{totalSecondaryAmount > 0 && (() => {
												const baseLoanAmount =
													Number(pdfParsed?.loan_amount) ||
													Number(String(newAmount || '').replace(/[^0-9.-]+/g, '')) ||
													0;
												return (
													<div className="flex flex-wrap justify-between items-center gap-2 mt-2.5 text-[12px] font-semibold text-slate-600">
														{baseLoanAmount > 0 && (
															<div className="text-[11.5px]">
																{totalSecondaryAmount >= baseLoanAmount ? (
																	<span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md ring-1 ring-emerald-200 font-bold">
																		<span className="material-symbols-outlined text-[14px]">check_circle</span>
																		100% Allocated (Max Limit Reached)
																	</span>
																) : (
																	<span className="text-slate-500">
																		Primary Amount: <span className="font-bold text-slate-700">{formatCurrency(baseLoanAmount - totalSecondaryAmount)}</span>
																	</span>
																)}
															</div>
														)}
														<div className="flex items-center gap-2 ml-auto">
															<div className="flex items-center gap-1.5">
																<span>Total Secondary Share:</span>
																<span className="font-extrabold text-[12.5px] text-primary bg-primary/10 px-2 py-0.5 rounded-md ring-1 ring-primary/20">
																	{totalSecondaryShare}%
																</span>
															</div>
															<span className="text-slate-300">•</span>
															<div className="flex items-center gap-1.5">
																<span>Total Secondary Amount:</span>
																<span className="font-extrabold text-[13px] text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md ring-1 ring-slate-200">
																	{formatCurrency(totalSecondaryAmount)}
																</span>
															</div>
														</div>
													</div>
												);
											})()}
										</div>

										{/* Submission Error Banner in Step 2 */}
										{pdfError && (
											<div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3 mt-3 animate-in fade-in">
												<span className="material-symbols-outlined text-[20px] text-rose-500 mt-0.5 flex-shrink-0">error</span>
												<div className="flex-1 text-[12.5px]">
													<strong className="block font-bold mb-0.5 text-rose-900">Submission Error</strong>
													<span>{pdfError}</span>
												</div>
											</div>
										)}
									</>
								)}
							</div>

							{/* Fixed Footer */}
							<div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
								<button
									type="button"
									onClick={handleCloseCreateModal}
									className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
								>
									Cancel
								</button>
								{isDocumentVerified && (
									<button
										type="submit"
										disabled={isSubmittingLoan}
										className={`px-5 py-2 rounded-xl text-[13px] font-bold shadow-sm transition-all ${isSubmittingLoan
											? 'bg-primary/70 text-on-primary cursor-wait'
											: 'bg-primary-container hover:bg-primary text-on-primary active:scale-95 cursor-pointer'
											}`}
									>
										{isSubmittingLoan ? (
											<span className="inline-flex items-center gap-1.5">
												<span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
												<span>Saving...</span>
											</span>
										) : (
											'Submit Loan'
										)}
									</button>
								)}
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Delete Loan Confirmation Card Modal */}
			{renderDeleteModal()}
			{/* Access Restricted Notification Modal */}
			{renderAccessRestrictedModal()}

			{/* Bottom Right Success Notification Alert */}
			{renderBottomRightAlert()}

			{/* Export Download Success Notification */}
			{listExportNotification && (
				<div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
					<div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl shadow-xl ring-1 ring-emerald-300/50">
						<span className="material-symbols-outlined text-emerald-600 text-[22px]">
							task_alt
						</span>
						<div className="flex flex-col">
							<span className="text-[12.5px] font-extrabold">Outstanding Report Exported Successfully</span>
							<span className="text-[11px] text-emerald-700 font-medium">
								Downloaded <span className="font-bold underline">{listExportNotification}</span>
							</span>
						</div>
						<button
							type="button"
							onClick={() => setListExportNotification(null)}
							className="w-6 h-6 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">close</span>
						</button>
					</div>
				</div>
			)}

			{/* Export Download Error Notification (e.g. No outstanding loans) */}
			{listExportError && (
				<div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
					<div className="flex items-center gap-3 px-4 py-3 bg-rose-50 text-rose-900 border border-rose-200 rounded-2xl shadow-xl ring-1 ring-rose-300/50">
						<span className="material-symbols-outlined text-rose-600 text-[22px]">
							error
						</span>
						<div className="flex flex-col">
							<span className="text-[12.5px] font-extrabold">Cannot Export Report</span>
							<span className="text-[11.5px] text-rose-700 font-medium">
								{listExportError}
							</span>
						</div>
						<button
							type="button"
							onClick={() => setListExportError(null)}
							className="w-6 h-6 flex items-center justify-center rounded-lg text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">close</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
