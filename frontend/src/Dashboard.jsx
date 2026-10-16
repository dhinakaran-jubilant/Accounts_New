/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Main dashboard view orchestrating sidebar navigation, active tab views, and global filter controls.
*/

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JointLoanTopControls from './components/dashboard/JointLoanTopControls';
import JointLoanMetrics from './components/dashboard/JointLoanMetrics';
import JointLoanCreatedPeriodChart from './components/dashboard/JointLoanCreatedPeriodChart';
import JointLoanBarChart from './components/dashboard/JointLoanBarChart';
import JointLoanPieChart from './components/dashboard/JointLoanPieChart';
import AccountSummaryBreakdown from './components/dashboard/AccountSummaryBreakdown';
import ThisWeekEmis from './components/dashboard/ThisWeekEmis';
import RecentJointLoans from './components/dashboard/RecentJointLoans';
import JointLoanDetailsModal from './components/dashboard/JointLoanDetailsModal';
import PendingFromPrimaryBreakdown from './components/dashboard/PendingFromPrimaryBreakdown';
import JointLoan from './components/JointLoan';
import Settings from './components/Settings';
import Users from './components/Users';
import Matchup from './components/Matchup';
import Requests from './components/Requests';
import {
	calculateJointLoanMetrics,
	filterLoansByAccount,
	doesLoanMatchAccount,
	doesLoanMatchPrimaryAccount,
	doesLoanMatchUserPrimary,
	doesLoanMatchSecondaryAccount,
	doesLoanMatchUserSecondary,
	cleanAccountKey,
	resolveCanonicalAccount,
	getAccountAliases,
} from './utils/jointLoanUtils';
import api from './services/api';

export default function Dashboard({ currentUser, onLogout }) {
	// Resolve allowed menus for current logged-in user
	const allowedMenus = useMemo(() => {
		if (!currentUser) return ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings'];
		let menus = currentUser.allowed_menus;
		if (typeof menus === 'string') {
			try {
				menus = JSON.parse(menus);
			} catch (e) {
				menus = [];
			}
		}
		if (Array.isArray(menus) && menus.length > 0) {
			return menus;
		}
		if (['admin', 'super admin'].includes((currentUser.role || '').toLowerCase())) {
			return ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings'];
		}
		return ['dashboard', 'joint-loan'];
	}, [currentUser]);

	// Helper to extract clean route id from path (e.g. '/joint-loan' or '/joint-loan/JLSS000040' -> 'joint-loan')
	const getNavFromPath = (path) => {
		const clean = (path || '').replace(/^\/+|\/+$/g, '').toLowerCase();
		if (!clean) return 'dashboard';
		const first = clean.split('/')[0];
		if (first === 'joint-loan' || first === 'joint-loans') {
			return 'joint-loan';
		}
		return first;
	};

	// Initialize activeNav to current URL path (e.g. /joint-loan -> 'joint-loan') if allowed
	const [activeNav, setActiveNav] = useState(() => {
		const pathNav = getNavFromPath(window.location.pathname);
		if (pathNav && allowedMenus.includes(pathNav)) {
			return pathNav;
		}
		if (allowedMenus.includes('dashboard')) {
			return 'dashboard';
		}
		return allowedMenus[0] || 'dashboard';
	});

	// Synchronize activeNav if allowedMenus change or current activeNav is forbidden
	useEffect(() => {
		if (allowedMenus && allowedMenus.length > 0 && !allowedMenus.includes(activeNav)) {
			const pathNav = getNavFromPath(window.location.pathname);
			const fallback = allowedMenus.includes(pathNav) ? pathNav : allowedMenus[0];
			setActiveNav(fallback);
			const targetPath = fallback === 'dashboard' ? '/' : `/${fallback}`;
			if (window.location.pathname !== targetPath) {
				window.history.replaceState({}, '', targetPath);
			}
		}
	}, [allowedMenus, activeNav]);

	// Synchronize activeNav when user uses browser back / forward buttons (popstate)
	useEffect(() => {
		const handlePopState = () => {
			const pathNav = getNavFromPath(window.location.pathname);
			if (pathNav && allowedMenus.includes(pathNav)) {
				setActiveNav(pathNav);
			}
		};
		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, [allowedMenus]);

	const [jointLoanNavKey, setJointLoanNavKey] = useState(0);

	// Update browser URL and activeNav when menu item is selected
	const handleSelectMenuItem = (id) => {
		document.body.style.overflow = '';
		if (id === 'joint-loan') {
			setJointLoanNavKey((k) => k + 1);
			window.dispatchEvent(new CustomEvent('reset-joint-loan-view'));
		}
		setActiveNav(id);
		setIsSidebarOpen(false);
		const targetPath = id === 'dashboard' ? '/' : `/${id}`;
		if (window.location.pathname !== targetPath) {
			window.history.pushState({}, '', targetPath);
		}
	};

	// Direct navigation to a specific joint loan details page URL (e.g. /joint-loan/JLSS000040)
	const handleNavigateToLoanDetails = (loan) => {
		document.body.style.overflow = '';
		setActiveNav('joint-loan');
		setIsSidebarOpen(false);
		const loanRef = loan?.loan_ref_id || loan?.id;
		const targetPath = loanRef ? `/joint-loan/${encodeURIComponent(loanRef)}` : '/joint-loan';
		if (window.location.pathname !== targetPath) {
			window.history.pushState({}, '', targetPath);
		}
	};

	// UI & Search State
	const [searchQuery, setSearchQuery] = useState('');
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [selectedJointLoan, setSelectedJointLoan] = useState(null);

	// Joint Loan Data State (strictly live database records)
	const [jointLoans, setJointLoans] = useState([]);
	const [isSyncing, setIsSyncing] = useState(false);
	const [dashboardTab, setDashboardTab] = useState('all'); // 'all' | 'overdue'
	const [statusFilter, setStatusFilter] = useState('ALL');

	// Primary / Secondary Role Filter State (Default: 'primary')
	const [accountRoleFilter, setAccountRoleFilter] = useState('primary'); // 'primary' | 'secondary'

	// Modern Account Filter State
	const [selectedAccountFilter, setSelectedAccountFilter] = useState('ALL');
	const [rawAccounts, setRawAccounts] = useState([]);

	// Fetch DB account names
	useEffect(() => {
		let isMounted = true;
		api.getAccountNames()
			.then((accs) => {
				if (isMounted && Array.isArray(accs)) {
					setRawAccounts(accs);
				}
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, []);

	const isAdmin = ['admin', 'super admin'].includes((currentUser?.role || '').toLowerCase());

	// Parse user's assigned primary and secondary accounts from permissions
	const { primaryAccountKeys, secondaryAccountKeys } = useMemo(() => {
		let perms = currentUser?.permissions;
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

		const primaryKeys = Array.from(new Set(pri))
			.filter(Boolean)
			.map((k) => String(k).trim());
		const secondaryKeys = Array.from(new Set(sec))
			.filter(Boolean)
			.map((k) => String(k).trim());
		return { primaryAccountKeys: primaryKeys, secondaryAccountKeys: secondaryKeys };
	}, [currentUser]);

	// Effective secondary account keys: Primary account access automatically includes Secondary view rights
	const effectiveSecondaryAccountKeys = useMemo(() => {
		return Array.from(new Set([...secondaryAccountKeys, ...primaryAccountKeys]));
	}, [secondaryAccountKeys, primaryAccountKeys]);

	// Handle switching between Primary and Secondary role views
	const handleRoleFilterChange = (role) => {
		if (role === accountRoleFilter) return;
		setAccountRoleFilter(role);
		setSelectedAccountFilter('ALL');
	};

	// Load Joint Loans strictly from backend DB API
	const loadJointLoans = useCallback(async () => {
		setIsSyncing(true);
		try {
			const remoteLoans = await api.getJointLoans();
			if (Array.isArray(remoteLoans)) {
				setJointLoans(remoteLoans);
			} else {
				setJointLoans([]);
			}
		} catch (err) {
			console.error('Failed to load joint loans from backend API:', err);
			setJointLoans([]);
		} finally {
			setIsSyncing(false);
		}
	}, []);

	// Auto-fetch on mount and synchronize on global loan events
	useEffect(() => {
		loadJointLoans();
		const handleRefresh = () => loadJointLoans();
		window.addEventListener('loanDesk_loans_updated', handleRefresh);
		window.addEventListener('loanDesk_notifications_updated', handleRefresh);
		window.addEventListener('loan_updated', handleRefresh);
		window.addEventListener('loan_approved', handleRefresh);
		return () => {
			window.removeEventListener('loanDesk_loans_updated', handleRefresh);
			window.removeEventListener('loanDesk_notifications_updated', handleRefresh);
			window.removeEventListener('loan_updated', handleRefresh);
			window.removeEventListener('loan_approved', handleRefresh);
		};
	}, [loadJointLoans]);

	// If a non-admin user has selected an account not in their assigned accounts, reset to 'ALL'
	useEffect(() => {
		if (!isAdmin && selectedAccountFilter !== 'ALL') {
			const targetKeys = accountRoleFilter === 'secondary' ? effectiveSecondaryAccountKeys : primaryAccountKeys;
			const isAllowed = targetKeys.some((k) => {
				const ck = cleanAccountKey(k);
				const selClean = cleanAccountKey(selectedAccountFilter);
				if (ck === selClean) return true;
				return getAccountAliases(selectedAccountFilter, rawAccounts).some(
					(al) => cleanAccountKey(al) === ck
				);
			});
			if (!isAllowed) {
				setSelectedAccountFilter('ALL');
			}
		}
	}, [isAdmin, selectedAccountFilter, accountRoleFilter, primaryAccountKeys, effectiveSecondaryAccountKeys, rawAccounts]);

	// Build deduplicated list of accounts for the modern account filter dropdown
	const accountsForFilter = useMemo(() => {
		const isSecondary = accountRoleFilter === 'secondary';

		// Non-admin users: display assigned accounts list for active role
		// For secondary view, includes both assigned secondary accounts and primary accounts acting as secondary
		if (!isAdmin) {
			const targetKeys = isSecondary ? effectiveSecondaryAccountKeys : primaryAccountKeys;
			if (targetKeys.length === 0) {
				return [];
			}

			const userAccounts = [];
			const seenKeys = new Set();
			const cleanTargetKeys = targetKeys.map(cleanAccountKey);

			// Match from master DB accounts (Settings / accounts_name table)
			rawAccounts.forEach((a) => {
				const nKey = cleanAccountKey(a.name);
				const acrKey = cleanAccountKey(a.acronym);
				const isMatch = cleanTargetKeys.some((k) => {
					if (k === nKey || k === acrKey) return true;
					return getAccountAliases(k, rawAccounts).some((al) => {
						const cal = cleanAccountKey(al);
						return cal === nKey || cal === acrKey;
					});
				});

				if (isMatch) {
					const normKey = nKey || acrKey;
					if (normKey && !seenKeys.has(normKey)) {
						seenKeys.add(normKey);
						// Count loans where this account acts in the selected role
						const count = jointLoans.filter((l) =>
							isSecondary
								? doesLoanMatchSecondaryAccount(l, a.name, rawAccounts)
								: doesLoanMatchPrimaryAccount(l, a.name, rawAccounts)
						).length;

						userAccounts.push({
							key: a.name,
							name: a.name,
							acronym: a.acronym || '',
							color: a.color || 'blue',
							isPrimary: !isSecondary,
							isSecondary: isSecondary,
							count,
						});
					}
				}
			});

			// Safely include any assigned key from permissions that isn't yet in rawAccounts
			targetKeys.forEach((pk) => {
				const cleanPk = cleanAccountKey(pk);
				if (!cleanPk) return;
				const canon = resolveCanonicalAccount(pk, rawAccounts);
				const canonName = canon ? canon.name : pk;
				const normKey = cleanAccountKey(canonName);
				if (normKey && !seenKeys.has(normKey)) {
					seenKeys.add(normKey);
					const count = jointLoans.filter((l) =>
						isSecondary
							? doesLoanMatchSecondaryAccount(l, canonName, rawAccounts)
							: doesLoanMatchPrimaryAccount(l, canonName, rawAccounts)
					).length;

					userAccounts.push({
						key: canonName,
						name: canonName,
						acronym: canon?.acronym || '',
						color: canon?.color || 'blue',
						isPrimary: !isSecondary,
						isSecondary: isSecondary,
						count,
					});
				}
			});

			return userAccounts.sort(
				(a, b) => (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name)
			);
		}

		// Admin user: full access to all accounts across database and loans
		const accList = [];
		const seenKeys = new Set();

		// 1. Primary canonical list from rawAccounts (Settings / database master list)
		rawAccounts.forEach((a) => {
			const canonicalName = (a.name || a.acronym || '').trim();
			if (!canonicalName) return;

			const cleanN = cleanAccountKey(a.name);
			const cleanA = cleanAccountKey(a.acronym);
			if (cleanN) seenKeys.add(cleanN);
			if (cleanA) seenKeys.add(cleanA);

			// Count loans matching this account in the active role
			const count = jointLoans.filter((l) =>
				isSecondary
					? doesLoanMatchSecondaryAccount(l, a.name, rawAccounts)
					: doesLoanMatchPrimaryAccount(l, a.name, rawAccounts)
			).length;

			accList.push({
				key: a.name,
				name: a.name,
				acronym: a.acronym || '',
				color: a.color || 'blue',
				isPrimary: !isSecondary,
				isSecondary: isSecondary,
				count,
			});
		});

		// 2. Safely capture any residual loan account not in rawAccounts
		jointLoans.forEach((l) => {
			if (isSecondary) {
				const secList = l.remaining_accounts || l.secondaryAccounts || l.accountDetails || [];
				if (Array.isArray(secList)) {
					secList.forEach((s) => {
						if (s && !s.isPrimary) {
							const sName = (s.account_name || s.accountName || s.accountTag || '').trim();
							const cleanSec = cleanAccountKey(sName);
							if (sName && cleanSec && !seenKeys.has(cleanSec)) {
								const canon = resolveCanonicalAccount(sName, rawAccounts);
								if (!canon) {
									seenKeys.add(cleanSec);
									const count = jointLoans.filter((x) =>
										doesLoanMatchSecondaryAccount(x, sName, rawAccounts)
									).length;
									accList.push({
										key: sName,
										name: sName,
										acronym: '',
										color: 'slate',
										isPrimary: false,
										isSecondary: true,
										count,
									});
								}
							}
						}
					});
				}
			} else {
				const priName = (l.primaryAccountName || l.primary_account_name || l.primary || '').trim();
				const cleanPri = cleanAccountKey(priName);
				if (priName && cleanPri && !seenKeys.has(cleanPri)) {
					const canon = resolveCanonicalAccount(priName, rawAccounts);
					if (!canon) {
						seenKeys.add(cleanPri);
						const count = jointLoans.filter((x) =>
							doesLoanMatchPrimaryAccount(x, priName, rawAccounts)
						).length;
						accList.push({
							key: priName,
							name: priName,
							acronym: '',
							color: 'slate',
							isPrimary: true,
							isSecondary: false,
							count,
						});
					}
				}
			}
		});

		// For secondary view, display accounts that participate as secondary
		const finalAccList = isSecondary ? accList.filter((a) => (a.count || 0) > 0) : accList;

		// Sort by loan count descending, then alphabetically by name
		return finalAccList.sort((a, b) => (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name));
	}, [rawAccounts, jointLoans, isAdmin, primaryAccountKeys, effectiveSecondaryAccountKeys, accountRoleFilter]);

	// Filter joint loans based on account selection, role toggle & user permissions
	const filteredJointLoans = useMemo(() => {
		const isSecondary = accountRoleFilter === 'secondary';

		if (isAdmin) {
			if (isSecondary) {
				if (selectedAccountFilter !== 'ALL') {
					return jointLoans.filter((l) =>
						doesLoanMatchSecondaryAccount(l, selectedAccountFilter, rawAccounts)
					);
				}
				return jointLoans.filter((l) => doesLoanMatchSecondaryAccount(l, 'ALL', rawAccounts));
			}

			// Primary view for admin
			if (selectedAccountFilter !== 'ALL') {
				return jointLoans.filter((l) =>
					doesLoanMatchPrimaryAccount(l, selectedAccountFilter, rawAccounts)
				);
			}
			return jointLoans;
		}

		// Non-admin user:
		if (isSecondary) {
			if (effectiveSecondaryAccountKeys.length === 0) {
				return [];
			}
			const userSecLoans = jointLoans.filter((loan) =>
				doesLoanMatchUserSecondary(loan, effectiveSecondaryAccountKeys, rawAccounts)
			);
			if (selectedAccountFilter !== 'ALL') {
				const isAllowed = effectiveSecondaryAccountKeys.some((k) => {
					const ck = cleanAccountKey(k);
					const selClean = cleanAccountKey(selectedAccountFilter);
					return (
						ck === selClean ||
						getAccountAliases(selectedAccountFilter, rawAccounts).some(
							(al) => cleanAccountKey(al) === ck
						)
					);
				});
				if (isAllowed) {
					return userSecLoans.filter((loan) =>
						doesLoanMatchSecondaryAccount(loan, selectedAccountFilter, rawAccounts)
					);
				}
			}
			return userSecLoans;
		}

		// Primary view for non-admin
		if (primaryAccountKeys.length === 0) {
			return [];
		}

		const userPrimaryLoans = jointLoans.filter((loan) =>
			doesLoanMatchUserPrimary(loan, primaryAccountKeys, rawAccounts)
		);

		if (selectedAccountFilter !== 'ALL') {
			const isAllowed = primaryAccountKeys.some((k) => {
				const ck = cleanAccountKey(k);
				const selClean = cleanAccountKey(selectedAccountFilter);
				return (
					ck === selClean ||
					getAccountAliases(selectedAccountFilter, rawAccounts).some(
						(al) => cleanAccountKey(al) === ck
					)
				);
			});
			if (isAllowed) {
				return userPrimaryLoans.filter((loan) =>
					doesLoanMatchPrimaryAccount(loan, selectedAccountFilter, rawAccounts)
				);
			}
		}

		return userPrimaryLoans;
	}, [jointLoans, selectedAccountFilter, accountRoleFilter, isAdmin, primaryAccountKeys, effectiveSecondaryAccountKeys, rawAccounts]);

	// Calculate live dashboard metrics from filtered joint loans
	const metrics = useMemo(() => {
		return calculateJointLoanMetrics(filteredJointLoans, selectedAccountFilter, accountRoleFilter, rawAccounts);
	}, [filteredJointLoans, selectedAccountFilter, accountRoleFilter, rawAccounts]);

	// Overdue alert banner data
	const overdueLoans = useMemo(() => {
		return filteredJointLoans.filter(
			(l) => (l.status || '').toLowerCase() === 'overdue' || (l.status || '').toLowerCase() === 'date overdue'
		);
	}, [filteredJointLoans]);


	// Export Joint Loan Portfolio Report
	const handleExport = () => {
		const report = {
			exportedAt: new Date().toISOString(),
			totalFacilities: jointLoans.length,
			totalVolume: metrics.totalVolume,
			activeVolume: metrics.activeVolume,
			overdueAmount: metrics.overdueAmount,
			recoveryRate: `${metrics.recoveryRate}%`,
			facilities: jointLoans.map((l) => ({
				id: l.id,
				client: l.client_account_name,
				amount: l.amount,
				status: l.status,
				primaryPartner: l.primaryAccountName,
				primaryShare: `${l.primaryShare}%`,
				date: l.loan_date || l.appliedDate,
			})),
		};

		const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
		const downloadAnchor = document.createElement('a');
		downloadAnchor.setAttribute('href', dataStr);
		downloadAnchor.setAttribute('download', `joint_loan_portfolio_${new Date().toISOString().slice(0, 10)}.json`);
		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
	};

	// Quick filter from metrics card or pie slice click
	const handleFilterByStatus = (status) => {
		setStatusFilter(status);
		// Smooth scroll down to recent loans table
		const el = document.getElementById('recent-loans-section');
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
		}
	};

	return (
		<div className="bg-surface font-sans text-body-md text-on-surface antialiased min-h-screen">
			{/* Fixed Left Sidebar (filtered to only allowed menus for current user) */}
			<Sidebar
				isOpen={isSidebarOpen}
				onClose={() => setIsSidebarOpen(false)}
				activeItem={activeNav}
				onSelectMenuItem={handleSelectMenuItem}
				onLogout={onLogout}
				currentUser={currentUser}
				allowedMenus={allowedMenus}
			/>

			{/* Main Content Area */}
			<div className="pl-0 md:pl-[15rem] lg:pl-[16rem] xl:pl-[16rem] 2xl:pl-[16rem] transition-all duration-300">
				{/* Fixed Top Header */}
				<Header
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					onNewLoanClick={() => handleSelectMenuItem('joint-loan')}
					onMenuToggle={() => setIsSidebarOpen((prev) => !prev)}
					currentUser={currentUser}
					onSelectMenuItem={handleSelectMenuItem}
					onNavigateToLoanDetails={handleNavigateToLoanDetails}
				/>

				{/* Main Container */}
				<main className="w-full pt-[6rem] bg-surface min-h-screen px-space-xl py-space-xl">
					{!allowedMenus.includes(activeNav) ? (
						<div className="bg-white rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm border border-slate-200 mt-12">
							<div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
								<span className="material-symbols-outlined text-[30px]">lock</span>
							</div>
							<h3 className="text-[18px] font-extrabold text-slate-900">Access Restricted</h3>
							<p className="text-[13px] text-slate-500 mt-2">
								You do not have permission to access this section. Please contact your system administrator.
							</p>
						</div>
					) : activeNav === 'joint-loan' ? (
						<JointLoan
							searchQuery={searchQuery}
							currentUser={currentUser}
							resetViewTrigger={jointLoanNavKey}
						/>
					) : activeNav === 'settings' ? (
						<Settings searchQuery={searchQuery} />
					) : activeNav === 'users' ? (
						<Users searchQuery={searchQuery} />
					) : activeNav === 'matchup' ? (
						<Matchup searchQuery={searchQuery} />
					) : activeNav === 'requests' ? (
						<Requests
							searchQuery={searchQuery}
							currentUser={currentUser}
							onNavigateToJointLoan={(loan) => handleNavigateToLoanDetails(loan)}
						/>
					) : activeNav === 'dashboard' ? (
						<div className="flex flex-col w-full gap-space-lg font-sans">
							{/* Top Header Strip matching Matchup styling */}
							<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
								<div>
									<div className="flex items-center gap-3">
										<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs shrink-0">
											<span className="material-symbols-outlined text-[24px]">widgets</span>
										</div>
										<div>
											<div className="flex flex-wrap items-center gap-2.5">
												<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
													Joint Loan Portfolio &amp; Servicing
												</h1>
											</div>
											<p className="text-[12px] text-slate-500 mt-0.5">
												Comprehensive co-lending analytics, repayment tracking, and partner capital distributions
											</p>
										</div>
									</div>
								</div>

								{/* Top Right Actions, Account Filter & Quick Filter Tabs */}
								<JointLoanTopControls
									activeTab={dashboardTab}
									onTabChange={(tab) => {
										setDashboardTab(tab);
										if (tab === 'overdue') {
											setStatusFilter('Overdue');
										} else {
											setStatusFilter('ALL');
										}
									}}
									onRefresh={loadJointLoans}
									isRefreshing={isSyncing}
									onExport={handleExport}
									onNewLoan={() => handleSelectMenuItem('joint-loan')}
									totalLoans={filteredJointLoans.length}
									selectedAccount={selectedAccountFilter}
									onSelectAccount={setSelectedAccountFilter}
									accounts={accountsForFilter}
									isAdmin={isAdmin}
									roleFilter={accountRoleFilter}
									onRoleFilterChange={handleRoleFilterChange}
								/>
							</div>

							{/* Joint Loan Portfolio Metrics Row (5 Cards for Primary, 4 Cards for Secondary) */}
							<JointLoanMetrics
								metrics={metrics}
								roleFilter={accountRoleFilter}
								onFilterByStatus={handleFilterByStatus}
								onNavigateToRequests={() => handleSelectMenuItem('requests')}
							/>

							{/* Secondary Perspective: Breakdown of Pending Settlements from Primary Accounts */}
							{accountRoleFilter === 'secondary' && (
								<PendingFromPrimaryBreakdown
									metrics={metrics}
									totalLoans={filteredJointLoans.length}
									onSelectLoan={(loan) => setSelectedJointLoan(loan)}
									onOpenLoanDetails={(loan) => handleNavigateToLoanDetails(loan)}
									allLoans={jointLoans}
								/>
							)}

							{/* Primary Perspective: Settlement Pending Warning (Primary received from client, not sent to secondary) */}
							{accountRoleFilter === 'primary' && metrics.settlementPendingAmount > 0 && (
								<div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
											<span className="material-symbols-outlined text-[20px]">sync_problem</span>
										</div>
										<div>
											<h4 className="font-extrabold text-[14px] text-amber-950">
												Settlement Pending: ₹{(metrics.settlementPendingAmount / 100000).toFixed(1)} Lakhs Due to Secondary Partners
											</h4>
											<p className="text-[12px] text-amber-800 mt-0.5">
												Primary accounts received {metrics.settlementPendingCount} client {metrics.settlementPendingCount === 1 ? 'installment where secondary payout date is not filled yet.' : 'installments where secondary payout date is not filled yet.'}
											</p>
										</div>
									</div>
									{Array.isArray(metrics.settlementPendingPartners) && metrics.settlementPendingPartners.length > 0 && (
										<div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 flex-wrap">
											{metrics.settlementPendingPartners.slice(0, 3).map((p) => (
												<span
													key={p.secondaryName}
													className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white border border-amber-200 text-amber-900 shadow-2xs"
												>
													{p.secondaryTag || p.secondaryName}: ₹{(p.pendingAmount / 100000).toFixed(1)}L
												</span>
											))}
										</div>
									)}
								</div>
							)}

							{/* Overdue Warning Alert Strip if applicable */}
							{overdueLoans.length > 0 && dashboardTab !== 'overdue' && (
								<div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-2xl p-4 border border-rose-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
											<span className="material-symbols-outlined text-[20px]">priority_high</span>
										</div>
										<div>
											<h4 className="font-extrabold text-[14px] text-rose-950">
												{overdueLoans.length} Joint {overdueLoans.length === 1 ? 'Loan Facility has' : 'Loan Facilities have'} Overdue Repayment Installments
											</h4>
											<p className="text-[12px] text-rose-700 mt-0.5">
												Total overdue exposure across portfolio: <strong>₹{(metrics.overdueAmount / 100000).toFixed(1)} Lakhs</strong>. Click to inspect servicing flags.
											</p>
										</div>
									</div>
									<button
										type="button"
										onClick={() => {
											setDashboardTab('overdue');
											setStatusFilter('Overdue');
											handleFilterByStatus('Overdue');
										}}
										className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-bold rounded-xl shadow-xs transition-transform active:scale-95 shrink-0 self-start sm:self-auto cursor-pointer"
									>
										Review Overdue ({overdueLoans.length})
									</button>
								</div>
							)}

							{/* Row 1 Visual Analytics: Bar Chart with Graph (Period) & Status-Wise Donut Pie Chart */}
							<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
								{/* Chart 1: Bar Chart with Graph - Loan Created Period (7 cols) */}
								<div className="lg:col-span-7">
									<JointLoanCreatedPeriodChart loans={filteredJointLoans} />
								</div>

								{/* Chart 2: Donut Pie Chart - Status-Wise Loan Count (5 cols) */}
								<div className="lg:col-span-5">
									<JointLoanPieChart
										loans={filteredJointLoans}
										onSelectFilter={handleFilterByStatus}
									/>
								</div>
							</div>

							{/* Row 2 Visual Analytics: Loan Count & Volume Based on Account Bar Chart */}
							<div>
								<JointLoanBarChart
									loans={filteredJointLoans}
									rawAccounts={rawAccounts}
									isAdmin={isAdmin}
									allowedPrimaryKeys={accountRoleFilter === 'secondary' ? effectiveSecondaryAccountKeys : primaryAccountKeys}
								/>
							</div>

							{/* Row 3: This Week's EMIs Section: Scheduled Client Due Amounts */}
							<ThisWeekEmis
								loans={filteredJointLoans}
								onSelectLoan={(loan) => setSelectedJointLoan(loan)}
								onOpenInServicing={(loan) => {
									setSelectedJointLoan(null);
									handleNavigateToLoanDetails(loan);
								}}
							/>

							{/* Row 4: Per-Account Financial Summary Table */}
							<AccountSummaryBreakdown
								loans={filteredJointLoans}
								rawAccounts={rawAccounts}
								selectedAccount={selectedAccountFilter}
								onSelectAccount={setSelectedAccountFilter}
								isAdmin={isAdmin}
								allowedPrimaryKeys={accountRoleFilter === 'secondary' ? effectiveSecondaryAccountKeys : primaryAccountKeys}
								roleFilter={accountRoleFilter}
							/>

							{/* Row 5: Recent Joint Loans Table Section */}
							<div id="recent-loans-section">
								<RecentJointLoans
									loans={filteredJointLoans}
									onSelectLoan={(loan) => setSelectedJointLoan(loan)}
									onNavigateToJointLoans={(loan) => {
										if (loan && (loan.id || loan.loan_ref_id)) {
											handleNavigateToLoanDetails(loan);
										} else {
											handleSelectMenuItem('joint-loan');
										}
									}}
									activeStatusFilter={statusFilter}
									onStatusFilterChange={setStatusFilter}
									searchQuery={searchQuery}
								/>
							</div>

						</div>
					) : (
						<div className="bg-white rounded-2xl p-12 text-center max-w-md mx-auto shadow-sm border border-slate-200 mt-12">
							<div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
								<span className="material-symbols-outlined text-[24px]">construction</span>
							</div>
							<h3 className="text-[16px] font-bold text-slate-900 capitalize">{activeNav.replace('-', ' ')}</h3>
							<p className="text-[13px] text-slate-500 mt-1">
								This module is currently active in your permissions and ready for servicing.
							</p>
						</div>
					)}
				</main>
			</div>


			<JointLoanDetailsModal
				loan={selectedJointLoan}
				onClose={() => setSelectedJointLoan(null)}
				onOpenInServicing={(loan) => {
					setSelectedJointLoan(null);
					handleNavigateToLoanDetails(loan);
				}}
			/>
		</div>
	);
}
