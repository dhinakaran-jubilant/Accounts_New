/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Top navigation header bar with global search, notification indicators, and user profile menu.
*/

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../services/api';
import { isUserPendingLoan } from './Requests';
import {
	checkUserHasPrimaryAccessForLoanPrimary,
	checkUserHasPrimaryAccessForLoanSecondary,
} from './JointLoan';

export default function Header({
	searchQuery,
	onSearchChange,
	onNewLoanClick,
	onMenuToggle,
	currentUser,
	onSelectMenuItem,
	onNavigateToLoanDetails,
}) {
	const [isCardOpen, setIsCardOpen] = useState(false);
	const [accountMap, setAccountMap] = useState({});
	const [rawAccounts, setRawAccounts] = useState([]);
	const closeTimeoutRef = useRef(null);
	const profileContainerRef = useRef(null);

	// Notification State
	const [isNotifOpen, setIsNotifOpen] = useState(false);
	const [loans, setLoans] = useState([]);
	const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
	const notifContainerRef = useRef(null);

	// Load DB account names to resolve acronyms/tags into full descriptive names
	useEffect(() => {
		let isMounted = true;
		api.getAccountNames()
			.then((accs) => {
				if (isMounted && Array.isArray(accs)) {
					setRawAccounts(accs);
					const map = {};
					accs.forEach((a) => {
						const tag = (a.acronym || a.name || '').toUpperCase().trim();
						if (tag) {
							map[tag] = a.name || a.acronym;
						}
						if (a.name) {
							map[a.name.toUpperCase().trim()] = a.name;
						}
					});
					setAccountMap(map);
				}
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, []);

	// Close cards when clicking outside or pressing Escape
	useEffect(() => {
		const handleOutsideClick = (e) => {
			if (profileContainerRef.current && !profileContainerRef.current.contains(e.target)) {
				setIsCardOpen(false);
			}
			if (notifContainerRef.current && !notifContainerRef.current.contains(e.target)) {
				setIsNotifOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsCardOpen(false);
				setIsNotifOpen(false);
			}
		};
		document.addEventListener('mousedown', handleOutsideClick);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, []);

	// Hover handlers with debounce/grace period
	const handleMouseEnter = () => {
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
			closeTimeoutRef.current = null;
		}
		setIsCardOpen(true);
	};

	const handleMouseLeave = () => {
		closeTimeoutRef.current = setTimeout(() => {
			setIsCardOpen(false);
		}, 200);
	};

	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		};
	}, []);

	// Resolve active logged-in user
	const user = useMemo(() => {
		if (currentUser) return currentUser;
		try {
			const saved = localStorage.getItem('loanDesk_user') || sessionStorage.getItem('loanDesk_user');
			return saved ? JSON.parse(saved) : null;
		} catch (e) {
			return null;
		}
	}, [currentUser]);

	// Extract display properties
	const username = user?.name || user?.username || 'Dhinakaran Sekar';
	const empCode = user?.employee_code || user?.emp_code || user?.code || 'ADMIN';
	const email = user?.email || (user?.employee_code ? `${user.employee_code.toLowerCase()}@loandesk.internal` : 'admin@loandesk.internal');
	const phoneNumber = user?.mobile || user?.phone || user?.phone_number || user?.contact || 'Not Provided';
	const role = user?.role || 'admin';
	const isAdmin = ['admin', 'super admin'].includes((role || '').toLowerCase());

	// Compute user initials
	const initials = useMemo(() => {
		if (username) {
			const parts = username.trim().split(/\s+/);
			if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
			return username.slice(0, 2).toUpperCase();
		}
		if (empCode) return empCode.slice(0, 2).toUpperCase();
		return 'AD';
	}, [username, empCode]);

	// Parse permissions (primary / secondary accounts)
	const { primaryAccounts, secondaryAccounts, isFullAdminAccess } = useMemo(() => {
		let perms = user?.permissions;
		if (typeof perms === 'string') {
			try {
				perms = JSON.parse(perms);
			} catch (e) {
				perms = {};
			}
		}

		let pri = [];
		let sec = [];

		if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
			pri = Array.isArray(perms.primary) ? perms.primary : [];
			sec = Array.isArray(perms.secondary) ? perms.secondary : [];
		} else if (Array.isArray(perms)) {
			pri = perms;
		}

		const hasSpecific = pri.length > 0 || sec.length > 0;
		const fullAdmin = isAdmin && !hasSpecific;

		return {
			primaryAccounts: pri,
			secondaryAccounts: sec,
			isFullAdminAccess: fullAdmin,
		};
	}, [user, isAdmin]);

	const getAccountDisplayName = (acc) => {
		if (!acc) return '';
		const key = String(acc).toUpperCase().trim();
		return accountMap[key] || acc;
	};

	// Fetch loans data for notifications
	const fetchNotificationData = useCallback(async () => {
		setIsLoadingNotifs(true);
		try {
			const loansRes = await api.getJointLoans();
			if (Array.isArray(loansRes)) {
				setLoans(loansRes);
			}
		} catch (err) {
			console.warn('Error fetching notification loans data:', err);
		} finally {
			setIsLoadingNotifs(false);
		}
	}, []);

	// Auto-fetch on mount & listen to app-wide update events
	useEffect(() => {
		fetchNotificationData();
		const handleRefresh = () => fetchNotificationData();
		window.addEventListener('loanDesk_notifications_updated', handleRefresh);
		window.addEventListener('loanDesk_loans_updated', handleRefresh);
		window.addEventListener('loan_updated', handleRefresh);
		window.addEventListener('loan_approved', handleRefresh);
		const intervalId = setInterval(fetchNotificationData, 30000);
		return () => {
			window.removeEventListener('loanDesk_notifications_updated', handleRefresh);
			window.removeEventListener('loanDesk_loans_updated', handleRefresh);
			window.removeEventListener('loan_updated', handleRefresh);
			window.removeEventListener('loan_approved', handleRefresh);
			clearInterval(intervalId);
		};
	}, [fetchNotificationData]);

	// Pending joint loan approval requests requiring action from the logged-in user:
	// - For Sec. Manager: New joint loan created by someone awaiting secondary verification
	// - For Admin: Joint loan verified by Sec. Manager awaiting admin final authorization
	const pendingRequests = useMemo(() => {
		if (!user || !Array.isArray(loans)) return [];
		return loans.filter((loan) => isUserPendingLoan(loan, user, rawAccounts));
	}, [loans, user, rawAccounts]);

	// Payout date approval notifications (pending requests requiring user action only)
	const pendingPayoutNotifs = useMemo(() => {
		if (!user || !Array.isArray(loans) || loans.length === 0) {
			return [];
		}

		const pending = [];
		const seenPendingKeys = new Set();

		loans.forEach((loan) => {
			if (!loan || loan.is_deleted) return;

			const loanRef = loan.loan_ref_id || loan.id || 'N/A';
			const clientName = loan.client_name || loan.clientAccountName || loan.client_account_name || 'Joint Loan Facility';
			const priName = loan.primary_account_name || loan.primaryAccountName || 'Primary Partner';
			const secAccs = Array.isArray(loan.remaining_accounts) && loan.remaining_accounts.length > 0
				? loan.remaining_accounts.map((a) => a.account_name).join(', ')
				: (loan.secondary_account_name || 'Secondary Partner');

			const isUserPri = checkUserHasPrimaryAccessForLoanPrimary(user, loan, rawAccounts);
			const isUserSec = checkUserHasPrimaryAccessForLoanSecondary(user, loan, rawAccounts);

			// Scan installments in repayment schedule for pending approvals
			const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
			if (Array.isArray(schedule)) {
				schedule.forEach((inst, idx) => {
					if (!inst) return;
					const sNo = inst.sNo || inst.installmentNumber || idx + 1;
					const pStatus = (inst.payout_approval_status || inst.payoutApprovalStatus || '').toUpperCase();
					const targetRole = (inst.payout_approval_target || inst.payoutApprovalTarget || (inst.payout_requested_role === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY')).toUpperCase();

					const paymentDate = inst.payment_date || inst.paymentDate || '';
					const dueDate = inst.date || '';
					const amount = inst.amount || 0;

					// PENDING: Needs action from user
					if (pStatus === 'PENDING') {
						const needsAction =
							(targetRole === 'PRIMARY' && isUserPri) ||
							(targetRole === 'SECONDARY' && isUserSec) ||
							(isAdmin && !isUserPri && !isUserSec);

						const pKey = `${loan.db_id || loan.id}_${sNo}`;
						if (needsAction && !seenPendingKeys.has(pKey)) {
							seenPendingKeys.add(pKey);
							pending.push({
								id: `payout_pending_${loan.db_id || loan.id}_${sNo}`,
								category: 'payout_pending',
								loan,
								loanRef,
								clientName,
								priName,
								secAccs,
								sNo,
								amount,
								dueDate,
								paymentDate,
								targetRole,
								requestedBy: inst.payout_requested_by || inst.payoutRequestedBy || 'Partner Manager',
								requestedAt: inst.payout_requested_at || inst.payoutRequestedAt || '',
								notes: inst.payout_notes || '',
							});
						}
					}
				});
			}
		});

		return pending;
	}, [loans, user, rawAccounts, isAdmin]);

	const actionNeededCount = pendingRequests.length + pendingPayoutNotifs.length;

	const displayedItems = useMemo(() => {
		const loanItems = pendingRequests.map((loan) => ({
			category: 'loan_pending',
			id: `req_${loan.db_id || loan.id}`,
			loan,
		}));

		return [...loanItems, ...pendingPayoutNotifs];
	}, [pendingRequests, pendingPayoutNotifs]);

	const formatCurrency = (val) => {
		if (val === null || val === undefined || val === '') return '₹0';
		const num = Number(val);
		if (isNaN(num)) return `₹${val}`;
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR',
			maximumFractionDigits: 0,
		}).format(num);
	};

	// Helper to extract who approved the joint loan (sec.manager)
	const getSecManagerApprovalDetails = (loan) => {
		if (!loan) return null;
		let historyList = loan.history;
		if (typeof historyList === 'string') {
			try {
				historyList = JSON.parse(historyList);
			} catch (e) {
				historyList = [];
			}
		}
		if (Array.isArray(historyList) && historyList.length > 0) {
			const secEntry = historyList.find(
				(h) =>
					h &&
					(h.type === 'sec_manager_approval' ||
						h.type === 'verified' ||
						(h.title && String(h.title).toLowerCase().includes('secondary')))
			);
			if (secEntry) {
				const name =
					secEntry.userName ||
					secEntry.user_name ||
					(secEntry.userEmployeeCode ? `Manager (${secEntry.userEmployeeCode})` : null);
				return {
					name: name || loan.verified_by || loan.verifiedBy || 'Secondary Manager',
					code: secEntry.userEmployeeCode || secEntry.employee_code || '',
					timestamp: secEntry.timestamp || secEntry.isoDate || loan.verified_at || '',
					accountName: secEntry.accountName || '',
					description: secEntry.description || '',
				};
			}
		}
		if (loan.verified_by || loan.verifiedBy) {
			const label = loan.verified_by || loan.verifiedBy;
			return {
				name: label,
				code: '',
				timestamp: loan.verified_at || loan.updated_at || '',
				accountName: '',
				description: '',
			};
		}
		return null;
	};

	// Helper to extract who created the joint loan
	const getLoanCreatorDetails = (loan) => {
		if (!loan) return { name: 'Staff Officer', code: '', timestamp: '' };
		let historyList = loan.history;
		if (typeof historyList === 'string') {
			try {
				historyList = JSON.parse(historyList);
			} catch (e) {
				historyList = [];
			}
		}
		if (Array.isArray(historyList) && historyList.length > 0) {
			const createEntry = historyList.find(
				(h) => h && (h.type === 'loan_created' || h.type === 'created')
			);
			if (createEntry) {
				return {
					name:
						createEntry.userName ||
						createEntry.user_name ||
						loan.requester_name ||
						loan.requesterName ||
						loan.created_by ||
						'Staff Officer',
					code: createEntry.userEmployeeCode || createEntry.employee_code || '',
					timestamp:
						createEntry.timestamp ||
						createEntry.isoDate ||
						loan.requested_at ||
						loan.loan_date ||
						'',
				};
			}
		}
		return {
			name:
				loan.requester_name ||
				loan.requesterName ||
				loan.created_by ||
				loan.createdBy ||
				loan.creator_name ||
				'Staff Officer',
			code: loan.requester_code || loan.requesterCode || '',
			timestamp: loan.requested_at || loan.loan_date || loan.created_at || '',
		};
	};

	const handleOpenLoan = (loan, targetTab = 'requests') => {
		setIsNotifOpen(false);
		if (targetTab === 'requests') {
			if (onSelectMenuItem) {
				onSelectMenuItem('requests');
			} else {
				window.location.href = '/requests';
			}
		} else if (onNavigateToLoanDetails) {
			onNavigateToLoanDetails(loan);
		} else if (onSelectMenuItem) {
			onSelectMenuItem('joint-loan');
		} else {
			const ref = loan?.loan_ref_id || loan?.id;
			window.location.href = ref ? `/joint-loan/${encodeURIComponent(ref)}` : '/joint-loan';
		}
	};

	const handleOpenRequestsHub = () => {
		setIsNotifOpen(false);
		if (onSelectMenuItem) {
			onSelectMenuItem('requests');
		} else {
			window.location.href = '/requests';
		}
	};

	return (
		<header className="fixed top-0 left-0 md:left-[15rem] lg:left-[16rem] xl:left-[16rem] 2xl:left-[16rem] right-0 h-16 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-30 px-space-md lg:px-space-xl flex items-center justify-between font-sans border-b border-slate-200/60 transition-all duration-300">
			{/* Left Search & Breadcrumb */}
			<div className="flex items-center gap-space-md flex-1 max-w-xl">
				{/* Search Input */}
				<div className="relative flex items-center flex-1">
					<svg
						className="absolute left-space-md w-4 h-4 text-slate-500 pointer-events-none"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						viewBox="0 0 24 24"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" x2="16.65" y1="21" y2="16.65" />
					</svg>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search Loan ID, Client Name..."
						className="w-full pl-10 pr-10 py-2 bg-surface-container-lowest rounded-xl font-regular text-[13px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-container/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)] ring-1 ring-slate-200/80"
					/>
				</div>
			</div>

			{/* Right Actions */}
			<div className="flex items-center gap-space-md">
				{/* Notification Icon & Dropdown Popover */}
				<div ref={notifContainerRef} className="relative flex items-center">
					<button
						aria-label="Notifications"
						type="button"
						onClick={() => setIsNotifOpen((prev) => !prev)}
						className={`p-2 rounded-xl transition-all relative select-none ${
							isNotifOpen
								? 'bg-primary-container/15 text-primary ring-1 ring-primary/20 shadow-xs'
								: 'hover:bg-surface-container-low text-slate-600 hover:text-slate-900'
						}`}
						title="Notifications & Approval Requests"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
							<path d="M13.73 21a2 2 0 0 1-3.46 0" />
						</svg>
						{actionNeededCount > 0 ? (
							<span className="absolute top-0 right-0 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white font-extrabold text-[8px] flex items-center justify-center ring-2 ring-white shadow-xs animate-in zoom-in-75 duration-200">
								{actionNeededCount > 99 ? '99+' : actionNeededCount}
							</span>
						) : (
							<span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface"></span>
						)}
					</button>

					{/* Notification Card Popover */}
					{isNotifOpen && (
						<div
							className="absolute top-full right-0 mt-2 w-[390px] sm:w-[470px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-4 text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-black/5 font-sans"
						>
							{/* Card Header */}
							<div className="flex items-center justify-between pb-3 border-b border-slate-100">
								<div className="flex items-center gap-2.5">
									<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center ring-2 ring-white select-none">
										<span className="material-symbols-outlined text-[20px]">notifications_active</span>
									</div>
									<div>
										<div className="flex items-center gap-2">
											<h4 className="font-extrabold text-[15px] text-slate-900 leading-snug">
												Notifications
											</h4>
											{actionNeededCount > 0 && (
												<span className="text-[9px] font-bold uppercase tracking-wider px-2 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
													{actionNeededCount} Action Needed
												</span>
											)}
										</div>
										<p className="text-[11px] text-slate-500 font-medium">
											{actionNeededCount > 0
												? `${actionNeededCount} pending approval${actionNeededCount > 1 ? 's' : ''} require your action`
												: 'Joint loan & payout approval notifications'}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => setIsNotifOpen(false)}
										className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
										title="Close"
									>
										<span className="material-symbols-outlined text-[18px]">close</span>
									</button>
								</div>
							</div>

							{/* Notification Content List */}
							<div className="max-h-[390px] overflow-y-auto space-y-3 pr-0.5 my-3">
								{displayedItems.length > 0 ? (
									<div className="space-y-2.5">
										{displayedItems.map((item) => {
											// 1. Pending joint loan creation approval request
											if (item.category === 'loan_pending') {
												const loan = item.loan;
												const status = (loan.approval_status || loan.approvalStatus || 'PENDING').toUpperCase();
												const isAwaitingAdmin = status === 'VERIFIED' || status === 'PENDING_ADMIN';
												const loanRef = loan.loan_ref_id || loan.id || 'N/A';
												const clientName = loan.client_name || loan.clientAccountName || loan.client_account_name || 'Joint Loan Facility';
												const amount = formatCurrency(loan.loan_amount || loan.loanAmount);
												const priName = loan.primary_account_name || loan.primaryAccountName || 'Primary Partner';
												const secAccs = Array.isArray(loan.remaining_accounts) && loan.remaining_accounts.length > 0
													? loan.remaining_accounts.map((a) => a.account_name).join(', ')
													: (loan.secondary_account_name || 'Secondary Partner');

												const creator = getLoanCreatorDetails(loan);
												const secApproval = getSecManagerApprovalDetails(loan);

												return (
													<div
														key={item.id}
														className={`border rounded-xl p-3 shadow-xs hover:shadow-md transition-all ${
															isAwaitingAdmin
																? 'bg-gradient-to-br from-orange-50/60 via-white to-orange-50/20 border-orange-200/90 hover:border-orange-400'
																: 'bg-gradient-to-br from-amber-50/60 via-white to-amber-50/20 border-amber-200/90 hover:border-amber-400'
														}`}
													>
														{/* Card Header: Loan ID & Status Badge */}
														<div className="flex items-center justify-between gap-2 mb-2">
															<span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-md ring-1 ${
																isAwaitingAdmin
																	? 'text-orange-950 bg-orange-100/80 ring-orange-200'
																	: 'text-amber-950 bg-amber-100/80 ring-amber-200'
															}`}>
																#{loanRef}
															</span>
															<span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ring-1 flex items-center gap-1 ${
																isAwaitingAdmin
																	? 'bg-orange-100 text-orange-800 ring-orange-200'
																	: 'bg-amber-100 text-amber-800 ring-amber-200'
															}`}>
																<span className="material-symbols-outlined text-[12px]">
																	{isAwaitingAdmin ? 'admin_panel_settings' : 'hourglass_top'}
																</span>
																<span>
																	{isAwaitingAdmin ? 'Admin Approval Required' : 'Sec. Verification Needed'}
																</span>
															</span>
														</div>

														{/* Client Name & Facility Amount */}
														<div className="flex items-start justify-between gap-2 mb-2">
															<div className="min-w-0 flex-1">
																<h5 className="font-extrabold text-[13.5px] text-slate-900 truncate" title={clientName}>
																	{clientName}
																</h5>
																<div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
																	<span>{priName}</span>
																	<span className="mx-1">•</span>
																	<span>{secAccs}</span>
																</div>
															</div>
															<div className="text-right shrink-0">
																<div className="font-mono font-extrabold text-[13px] text-slate-900">
																	{amount}
																</div>
																<span className="text-[10px] text-slate-400 font-medium">Facility</span>
															</div>
														</div>

														{/* Workflow Details Banner */}
														{isAwaitingAdmin ? (
															// ADMIN VIEW: Displays who approved the joint loan (sec.manager)
															<div className="bg-emerald-50/90 border border-emerald-200/90 rounded-lg p-2.5 mb-2.5 space-y-1">
																<div className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-950">
																	<span className="material-symbols-outlined text-[15px] text-emerald-600 shrink-0">
																		verified
																	</span>
																	<span className="truncate">
																		Approved by Sec. Manager: <span className="underline decoration-emerald-400 underline-offset-2">{secApproval?.name || loan.verified_by || 'Secondary Manager'}</span>
																	</span>
																</div>
																<div className="text-[10.5px] text-emerald-700 pl-5 flex items-center justify-between">
																	<span>Secondary share verified &amp; approved</span>
																	{secApproval?.timestamp && (
																		<span className="font-mono text-emerald-800">{secApproval.timestamp}</span>
																	)}
																</div>
																<div className="text-[10.5px] text-slate-500 pl-5 pt-0.5 border-t border-emerald-100 flex items-center gap-1">
																	<span>Created by {creator.name}</span>
																	{creator.timestamp && <span>• {creator.timestamp}</span>}
																</div>
															</div>
														) : (
															// SECONDARY MANAGER VIEW: Displays new joint loan created by someone awaiting verification
															<div className="bg-amber-50/90 border border-amber-200/90 rounded-lg p-2.5 mb-2.5 space-y-1">
																<div className="flex items-center gap-1.5 text-[11.5px] font-bold text-amber-950">
																	<span className="material-symbols-outlined text-[15px] text-amber-600 shrink-0">
																		person_add
																	</span>
																	<span className="truncate">
																		Created by: <span className="underline decoration-amber-400 underline-offset-2">{creator.name}</span>
																	</span>
																	{creator.timestamp && (
																		<span className="text-[10px] font-normal text-amber-700 ml-auto shrink-0 font-mono">
																			{creator.timestamp}
																		</span>
																	)}
																</div>
																<div className="text-[10.5px] text-amber-800 pl-5 leading-snug">
																	Awaiting your secondary partner verification before forwarding to Admin.
																</div>
															</div>
														)}

														{/* Action Button */}
														<button
															type="button"
															onClick={() => handleOpenLoan(loan, 'requests')}
															className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-white text-[11.5px] font-bold shadow-xs active:scale-[0.99] transition-all cursor-pointer ${
																isAwaitingAdmin
																	? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-105'
																	: 'bg-gradient-to-r from-amber-600 to-primary hover:brightness-105'
															}`}
														>
															<span>{isAwaitingAdmin ? 'Review & Final Authorize' : 'Review & Verify Request'}</span>
															<span className="material-symbols-outlined text-[14px]">arrow_forward</span>
														</button>
													</div>
												);
											}

											// 2. Pending Payout Date Approval (Simplified Message)
											if (item.category === 'payout_pending') {
												return (
													<div
														key={item.id}
														onClick={() => handleOpenLoan(item.loan, 'joint-loan')}
														className="border border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-amber-50/20 rounded-xl p-3 shadow-xs hover:shadow-md transition-all cursor-pointer group hover:border-amber-400"
													>
														<div className="flex items-start gap-2.5">
															<div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-amber-200/80">
																<span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
																	schedule_send
																</span>
															</div>
															<div className="min-w-0 flex-1">
																<div className="flex items-center justify-between gap-2 mb-1">
																	<span className="font-mono text-[9px] font-bold px-2 rounded-md ring-1 text-amber-950 bg-amber-100/80 ring-amber-200">
																		#{item.loanRef}
																	</span>
																	<span className="text-[9px] font-extrabold px-2 rounded-full ring-1 flex items-center gap-1 bg-amber-100 text-amber-800 ring-amber-200 shrink-0">
																		<span className="material-symbols-outlined" style={{ fontSize: '12px' }}>hourglass_top</span>
																		<span>Payout Approval Request</span>
																	</span>
																</div>
																<p className="text-[12px] text-slate-800 font-medium leading-snug">
																	Payout date approval request from <span className="font-bold text-slate-900">{item.requestedBy || 'User'}</span> for <span className="font-bold text-slate-900">{item.clientName}</span> with <span className="font-bold text-amber-950">EMI #{item.sNo}</span>
																</p>
															</div>
														</div>
													</div>
												);
											}

											return null;
										})}
									</div>
								) : (
									<div className="py-8 px-4 text-center">
										<div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5 ring-1 ring-emerald-100">
											<span className="material-symbols-outlined text-[26px]">task_alt</span>
										</div>
										<h5 className="font-extrabold text-[14px] text-slate-900">
											All Caught Up!
										</h5>
										<p className="text-[11.5px] text-slate-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
											No pending joint loans or payout approvals requiring your action at this time.
										</p>
									</div>
								)}
							</div>

							{/* Card Footer */}
							<div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
								<span className="text-[11px] text-slate-400 font-medium">
									Joint Loan &amp; Payout Approval Workflow
								</span>
								<button
									type="button"
									onClick={handleOpenRequestsHub}
									className="text-[11.5px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors group cursor-pointer"
								>
									<span>Open Requests Hub</span>
									<span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">
										chevron_right
									</span>
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Divider */}
				<div className="h-8 w-px bg-surface-container-highest mx-space-xs"></div>

				{/* Profile with Hover User Info Card */}
				<div
					ref={profileContainerRef}
					className="relative flex items-center"
					onMouseEnter={handleMouseEnter}
					onMouseLeave={handleMouseLeave}
				>
					<div
						onClick={() => setIsCardOpen((prev) => !prev)}
						className="flex items-center gap-space-sm cursor-pointer py-1.5 px-2 rounded-xl hover:bg-surface-container-low transition-all group select-none"
						title="Hover or click to view employee details & accessed accounts"
					>
						<div className="flex flex-col text-right">
							<span className="font-bold text-[14px] text-slate-900 leading-tight group-hover:text-primary transition-colors">
								{username}
							</span>
							<span className="font-medium text-[11px] text-slate-500 leading-tight capitalize">
								{isAdmin ? 'Super Admin' : role}
							</span>
						</div>
						<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-orange-500 text-white font-extrabold text-[12px] flex items-center justify-center shadow-2xs ring-2 ring-white select-none">
							{initials}
						</div>
					</div>

					{/* User Info Card Popover */}
					{isCardOpen && (
						<div
							className="absolute top-full right-0 mt-2 w-[340px] sm:w-[380px] bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-4 text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-black/5 font-sans"
							onMouseEnter={handleMouseEnter}
							onMouseLeave={handleMouseLeave}
						>
							{/* Card Header: Avatar, Name, Role & Status */}
							<div className="flex items-start gap-3 pb-3 border-b border-slate-100">
								<div className="relative">
									<div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white font-extrabold text-[15px] flex items-center justify-center shadow-md shadow-orange-950/20 ring-2 ring-white select-none">
										{initials}
									</div>
									<span
										className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white"
										title="Active"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1">
										<h4 className="font-extrabold text-[15px] text-slate-900 truncate leading-snug">
											{username}
										</h4>
										<span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200/80">
											{isAdmin ? 'Super Admin' : role}
										</span>
									</div>
									<div className="flex items-center gap-1.5 mt-1">
										<span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md ring-1 ring-slate-200/70">
											#{empCode}
										</span>
										<span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
											Active
										</span>
									</div>
								</div>
							</div>

							{/* User Contact & Identifiers */}
							<div className="py-2.5 border-b border-slate-100 space-y-2">
								{/* Username */}
								<div className="flex items-center gap-2.5 text-[12px]">
									<div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
										<span className="material-symbols-outlined" style={{fontSize: "16px"}}>person</span>
									</div>
									<div className="flex items-center justify-between flex-1 min-w-0">
										<span className="text-slate-400 font-medium">Username:</span>
										<span className="font-bold text-slate-800 truncate max-w-[200px]" title={username}>
											{username}
										</span>
									</div>
								</div>

								{/* Employee Code */}
								<div className="flex items-center gap-2.5 text-[12px]">
									<div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
										<span className="material-symbols-outlined" style={{fontSize: "16px"}}>badge</span>
									</div>
									<div className="flex items-center justify-between flex-1 min-w-0">
										<span className="text-slate-400 font-medium">Emp Code:</span>
										<span className="font-mono font-bold text-slate-900 bg-slate-100/90 px-1.5 py-0.5 rounded text-[11.5px]">
											{empCode}
										</span>
									</div>
								</div>

								{/* Email */}
								<div className="flex items-center gap-2.5 text-[12px]">
									<div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
										<span className="material-symbols-outlined" style={{fontSize: "16px"}}>mail</span>
									</div>
									<div className="flex items-center justify-between flex-1 min-w-0">
										<span className="text-slate-400 font-medium">Email:</span>
										<span className="font-semibold text-slate-800 truncate max-w-[200px]" title={email}>
											{email}
										</span>
									</div>
								</div>

								{/* Phone Number */}
								<div className="flex items-center gap-2.5 text-[12px]">
									<div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
										<span className="material-symbols-outlined" style={{fontSize: "16px"}}>call</span>
									</div>
									<div className="flex items-center justify-between flex-1 min-w-0">
										<span className="text-slate-400 font-medium">Phone:</span>
										<span className="font-mono font-semibold text-slate-800">
											{phoneNumber}
										</span>
									</div>
								</div>
							</div>

							{/* Accessed Account Names (Primary / Secondary) */}
							<div className="pt-2.5 space-y-2.5">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
										<span className="material-symbols-outlined text-[15px] text-primary">account_tree</span>
										<span>Accessed Account Names</span>
									</div>
									<span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
										{isFullAdminAccess ? 'Full Access' : `${primaryAccounts.length + secondaryAccounts.length} Assigned`}
									</span>
								</div>

								{/* Primary Accounts */}
								<div className="bg-blue-50/50 rounded-xl p-2.5 border border-blue-200">
									<div className="flex items-center justify-between mb-1.5">
										<span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
											<span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
											Primary Accounts
										</span>
										<span className="text-[9.5px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
											{isFullAdminAccess ? 'All' : primaryAccounts.length}
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
										{isFullAdminAccess ? (
											<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-300 shadow-xs">
												<span className="material-symbols-outlined text-[14px] text-blue-600">verified</span>
												<span>All Accounts (*)</span>
											</div>
										) : primaryAccounts.length > 0 ? (
											primaryAccounts.map((acc) => (
												<div
													key={acc}
													className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-white text-blue-900 border border-blue-300 shadow-xs"
													title={getAccountDisplayName(acc)}
												>
													<span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
													<span>{acc}</span>
													{getAccountDisplayName(acc) !== acc && (
														<span className="text-[10px] font-medium text-blue-700/80 truncate max-w-[120px]">
															• {getAccountDisplayName(acc)}
														</span>
													)}
												</div>
											))
										) : (
											<span className="text-[11px] text-slate-400 italic">No primary accounts assigned</span>
										)}
									</div>
								</div>

								{/* Secondary Accounts */}
								<div className="bg-purple-50/50 rounded-xl p-2.5 border border-purple-200">
									<div className="flex items-center justify-between mb-1.5">
										<span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
											<span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
											Secondary Accounts
										</span>
										<span className="text-[9.5px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
											{isFullAdminAccess ? 'All' : secondaryAccounts.length}
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
										{isFullAdminAccess ? (
											<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-300 shadow-xs">
												<span className="material-symbols-outlined text-[14px] text-purple-600">verified</span>
												<span>All Accounts (*)</span>
											</div>
										) : secondaryAccounts.length > 0 ? (
											secondaryAccounts.map((acc) => (
												<div
													key={acc}
													className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-white text-purple-900 border border-purple-300 shadow-xs"
													title={getAccountDisplayName(acc)}
												>
													<span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
													<span>{acc}</span>
													{getAccountDisplayName(acc) !== acc && (
														<span className="text-[10px] font-medium text-purple-700/80 truncate max-w-[120px]">
															• {getAccountDisplayName(acc)}
														</span>
													)}
												</div>
											))
										) : (
											<span className="text-[11px] text-slate-400 italic">No secondary accounts assigned</span>
										)}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
