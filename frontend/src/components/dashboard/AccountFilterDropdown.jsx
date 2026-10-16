/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Modern role-aware account filter dropdown matching Settings.jsx style for unified co-lending partner filtering across the application.
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { COLOR_OPTIONS, getColorToken } from '../Settings';

export default function AccountFilterDropdown({
	selectedAccount = 'ALL',
	onSelectAccount,
	accounts = [], // Array of { key, name, color, count, isPrimary, isSecondary }
	isAdmin = false,
	totalLoans = 0,
	roleFilter = 'primary',
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const dropdownRef = useRef(null);
	const searchInputRef = useRef(null);

	const isFiltered = selectedAccount !== 'ALL';

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

	// Auto focus search when popover opens
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// Filter accounts by search term
	const filteredAccounts = useMemo(() => {
		if (!searchTerm.trim()) return accounts;
		const q = searchTerm.toLowerCase();
		return accounts.filter((acc) => {
			const nameMatch = acc.name && acc.name.toLowerCase().includes(q);
			const keyMatch = acc.key && acc.key.toLowerCase().includes(q);
			const acronymMatch = acc.acronym && acc.acronym.toLowerCase().includes(q);
			return nameMatch || keyMatch || acronymMatch;
		});
	}, [accounts, searchTerm]);

	// Resolve selected account entity and display attributes
	const activeAccountObj = useMemo(() => {
		if (!isFiltered) return null;
		return (
			accounts.find(
				(a) =>
					a.key === selectedAccount ||
					a.name === selectedAccount ||
					(a.acronym && a.acronym.toUpperCase() === selectedAccount.toUpperCase())
			) || null
		);
	}, [isFiltered, selectedAccount, accounts]);

	const activeLabel = useMemo(() => {
		if (!isFiltered) {
			return 'All Accounts';
		}
		if (activeAccountObj) {
			return activeAccountObj.name || activeAccountObj.key;
		}
		return selectedAccount;
	}, [isFiltered, roleFilter, activeAccountObj, selectedAccount]);

	const activeCount = useMemo(() => {
		if (!isFiltered) return totalLoans;
		return activeAccountObj?.count ?? 0;
	}, [isFiltered, totalLoans, activeAccountObj]);

	const activeDot = useMemo(() => {
		if (!activeAccountObj?.color) return null;
		return getColorToken(activeAccountObj.color)?.dot || null;
	}, [activeAccountObj]);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
		if (isOpen) setSearchTerm('');
	};

	const handleSelect = (key) => {
		if (onSelectAccount) {
			onSelectAccount(key);
		}
		setIsOpen(false);
		setSearchTerm('');
	};

	return (
		<div ref={dropdownRef} className="relative inline-block text-left font-sans">
			{/* Trigger Button - exactly matching Settings.jsx ModernAccountDropdown */}
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
				title="Filter joint loan portfolio by partner account"
			>
				{activeDot ? (
					<span className={`w-2 h-2 rounded-full shrink-0 ${activeDot}`} />
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
					{activeLabel}
				</span>

				{activeCount !== undefined && (
					<span
						className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
							isFiltered
								? 'bg-primary text-white'
								: 'bg-slate-200/90 text-slate-700'
						}`}
					>
						{activeCount}
					</span>
				)}

				{isFiltered && (
					<span
						role="button"
						tabIndex={0}
						onClick={(e) => {
							e.stopPropagation();
							handleSelect('ALL');
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

			{/* Dropdown Menu Popover - exactly matching Settings.jsx */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute right-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100 font-sans"
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

					{/* Search input if accounts > 4 */}
					{accounts.length > 4 && (
						<div className="relative px-1 pt-0.5">
							<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-slate-400">
								search
							</span>
							<input
								ref={searchInputRef}
								type="text"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								placeholder="Search accounts..."
								className="w-full pl-7 pr-3 py-1 bg-slate-50 rounded-xl text-xs border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white"
							/>
						</div>
					)}

					{/* Options List */}
					<div className="overflow-y-auto flex flex-col gap-0.5 p-0.5 max-h-56">
						{/* "All Accounts" Option */}
						<button
							type="button"
							role="option"
							aria-selected={!isFiltered}
							onClick={() => handleSelect('ALL')}
							className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group text-left ${
								!isFiltered
									? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
									: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
							}`}
						>
							<div className="flex items-center gap-2 min-w-0 pr-2">
								<span className="truncate">
									{roleFilter === 'secondary' ? 'All Secondary Accounts' : 'All Accounts'}
								</span>
							</div>

							<div className="flex items-center gap-1.5 shrink-0">
								{totalLoans !== undefined && (
									<span
										className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
											!isFiltered
												? 'bg-primary text-white'
												: 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
										}`}
									>
										{totalLoans}
									</span>
								)}
								{!isFiltered && (
									<span className="material-symbols-outlined text-[16px] text-primary">
										check
									</span>
								)}
							</div>
						</button>

						{/* Individual Account Options */}
						{filteredAccounts.length > 0 ? (
							filteredAccounts.map((acc) => {
								const isSelected =
									acc.key === selectedAccount ||
									acc.name === selectedAccount ||
									(acc.acronym && acc.acronym.toUpperCase() === selectedAccount.toUpperCase());
								const dot = acc.color ? getColorToken(acc.color)?.dot : null;

								return (
									<button
										key={acc.key}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => handleSelect(acc.key)}
										className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group text-left ${
											isSelected
												? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
												: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
										}`}
									>
										<div className="flex items-center gap-2 min-w-0 pr-2">
											{dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
											<span className="truncate">{acc.name || acc.key}</span>
											{acc.acronym && acc.name && acc.acronym.toLowerCase() !== acc.name.toLowerCase() && (
												<span className="text-[10px] font-bold text-slate-400 shrink-0">
													({acc.acronym})
												</span>
											)}
										</div>

										<div className="flex items-center gap-1.5 shrink-0">
											{acc.count !== undefined && (
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
														isSelected
															? 'bg-primary text-white'
															: acc.count > 0
															? 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
															: 'bg-slate-50 text-slate-400'
													}`}
												>
													{acc.count}
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
