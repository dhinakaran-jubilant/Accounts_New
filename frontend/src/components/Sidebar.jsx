/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Navigation sidebar component providing navigation links, collapse toggling, and view routing.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { isUserPendingLoan, isUserPayoutPendingLoan, getLoanPendingPayoutItems } from './Requests';

export const navSections = [
	{
		title: 'Main Navigation',
		items: [
			{ id: 'dashboard', label: 'Dashboard', path: '#dashboard', icon: 'widgets' },
			{ id: 'joint-loan', label: 'Joint Loan', path: '#joint-loan', icon: 'handshake' },
			{ id: 'short-loan', label: 'Short Loan', path: '#short-loan', icon: 'payments' },
			{ id: 'matchup', label: 'Matchup', path: '#matchup', icon: 'compare_arrows' },
			{ id: 'sync', label: 'Sync', path: '#sync', icon: 'cloud_sync' },
			{ id: 'requests', label: 'Requests', path: '#requests', icon: 'pending_actions' },
			{ id: 'users', label: 'Users', path: '#users', icon: 'group' },
			{ id: 'settings', label: 'Settings', path: '#settings', icon: 'settings' },
		],
	},
];

export default function Sidebar({
	isOpen = false,
	onClose,
	activeItem: controlledActiveItem,
	onSelectMenuItem,
	onLogout,
	currentUser,
	allowedMenus: propAllowedMenus,
}) {
	const [internalActiveItem, setInternalActiveItem] = useState('dashboard');
	const [showLogoutModal, setShowLogoutModal] = useState(false);
	const [pendingRequestCount, setPendingRequestCount] = useState(0);
	const activeItem = controlledActiveItem ?? internalActiveItem;

	// Periodically check count of approval requests requiring this user's action (both loan approvals and payout approvals)
	useEffect(() => {
		let isMounted = true;
		const checkPending = async () => {
			const userToUse =
				currentUser ||
				(() => {
					try {
						const saved =
							localStorage.getItem('loanDesk_user') ||
							sessionStorage.getItem('loanDesk_user');
						return saved ? JSON.parse(saved) : null;
					} catch (e) {
						return null;
					}
				})();
			if (!userToUse) return;
			try {
				const [loansRes, accsRes] = await Promise.allSettled([
					api.getJointLoans(),
					api.getAccountNames(),
				]);
				if (!isMounted) return;
				const loans =
					loansRes.status === 'fulfilled' && Array.isArray(loansRes.value)
						? loansRes.value
						: [];
				const accs =
					accsRes.status === 'fulfilled' && Array.isArray(accsRes.value)
						? accsRes.value
						: [];

				let count = 0;
				loans.forEach((loan) => {
					if (isUserPendingLoan(loan, userToUse, accs)) {
						count += 1;
					}
					if (isUserPayoutPendingLoan(loan, userToUse, accs)) {
						const items = getLoanPendingPayoutItems(loan, userToUse, accs);
						count += items.length;
					}
				});
				setPendingRequestCount(count);
			} catch (e) {
				// ignore
			}
		};

		checkPending();
		const handleRefresh = () => checkPending();
		window.addEventListener('loanDesk_notifications_updated', handleRefresh);
		window.addEventListener('loanDesk_loans_updated', handleRefresh);
		window.addEventListener('loan_updated', handleRefresh);
		window.addEventListener('loan_approved', handleRefresh);
		const interval = setInterval(checkPending, 20000);
		return () => {
			isMounted = false;
			window.removeEventListener('loanDesk_notifications_updated', handleRefresh);
			window.removeEventListener('loanDesk_loans_updated', handleRefresh);
			window.removeEventListener('loan_updated', handleRefresh);
			window.removeEventListener('loan_approved', handleRefresh);
			clearInterval(interval);
		};
	}, [currentUser]);

	// Prevent background page scrolling when the logout confirmation modal is open
	useEffect(() => {
		if (showLogoutModal) {
			const originalOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = originalOverflow;
			};
		}
	}, [showLogoutModal]);

	// Resolve allowed menus for the current user
	const effectiveAllowedMenus = useMemo(() => {
		const isSuperOrAdmin = ['admin', 'super admin'].includes((currentUser?.role || '').toLowerCase());
		if (isSuperOrAdmin) {
			return ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'sync', 'requests', 'users', 'settings'];
		}
		if (Array.isArray(propAllowedMenus) && propAllowedMenus.length > 0) {
			if (propAllowedMenus.includes('joint-loan') && !propAllowedMenus.includes('sync')) {
				return [...propAllowedMenus, 'sync'];
			}
			return propAllowedMenus;
		}
		if (currentUser) {
			let menus = currentUser.allowed_menus;
			if (typeof menus === 'string') {
				try {
					menus = JSON.parse(menus);
				} catch (e) {
					menus = [];
				}
			}
			if (Array.isArray(menus) && menus.length > 0) {
				if (menus.includes('joint-loan') && !menus.includes('sync')) {
					return [...menus, 'sync'];
				}
				return menus;
			}
			return ['dashboard', 'joint-loan', 'sync'];
		}
		return null;
	}, [currentUser, propAllowedMenus]);

	const handleItemClick = (id) => {
		if (onSelectMenuItem) {
			onSelectMenuItem(id);
		} else {
			setInternalActiveItem(id);
		}
	};

	const handleConfirmLogout = () => {
		document.body.style.overflow = '';
		setShowLogoutModal(false);
		if (onLogout) {
			onLogout();
		} else {
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch (e) {
				// ignore
			}
			window.location.reload();
		}
	};

	return (
		<>
			{/* Mobile Backdrop */}
			{isOpen && (
				<div
					onClick={onClose}
					className="fixed inset-0 bg-slate-900/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
				/>
			)}

			<aside
				className={`fixed left-0 top-0 bottom-0 bg-white border-r border-slate-200/80 z-40 flex flex-col justify-between shadow-xs font-sans transition-all duration-300
					w-[16rem] max-w-[85vw] sm:w-[16rem] md:w-[15rem] lg:w-[16rem] xl:w-[16rem] 2xl:w-[16rem]
					${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
			>
				<div className="flex flex-col flex-1 overflow-y-auto">
					{/* Brand Header */}
					<div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200/80 flex-shrink-0 bg-white">
						<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-950/20 ring-1 ring-primary/20">
							<span className="material-symbols-outlined text-[22px]">linked_services</span>
						</div>
						<span className="font-extrabold text-[24px] tracking-tight text-slate-900">
							LoanDesk
						</span>
						{/* Close button on mobile */}
						<button
							onClick={onClose}
							type="button"
							aria-label="Close sidebar"
							className="md:hidden ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
						>
							<span className="material-symbols-outlined text-[20px]">close</span>
						</button>
					</div>

					{/* Navigation Sections filtered by allowed menus */}
					{navSections.map((section, idx) => {
						const visibleItems = effectiveAllowedMenus
							? section.items.filter((item) => effectiveAllowedMenus.includes(item.id))
							: section.items;

						if (visibleItems.length === 0) return null;

						return (
							<div key={section.title} className={`px-3 py-2 ${idx > 0 ? 'mt-2' : ''}`}>
								<nav className="flex flex-col gap-1">
									{visibleItems.map((item) => {
										const isActive = activeItem === item.id;

										return (
											<button
												key={item.id}
												onClick={() => handleItemClick(item.id)}
												className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-[14px] transition-all text-left ${isActive
													? 'bg-primary-container text-white font-bold shadow-sm shadow-orange-500/25 ring-1 ring-orange-400/30'
													: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
													}`}
											>
												<span
													className={`material-symbols-outlined text-[20px] flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400'
														}`}
												>
													{item.icon}
												</span>
												<span className="truncate">{item.label}</span>
												{item.id === 'requests' && pendingRequestCount > 0 && (
													<span
														className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${isActive
																? 'bg-white text-primary shadow-xs'
																: 'bg-amber-500 text-white animate-pulse'
															}`}
													>
														{pendingRequestCount}
													</span>
												)}
											</button>
										);
									})}
								</nav>
							</div>
						);
					})}
				</div>

				{/* Bottom of Sidebar: Logout Button */}
				<div className="p-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-col flex-shrink-0">
					<button
						type="button"
						onClick={() => setShowLogoutModal(true)}
						className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-[14px] text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors text-left cursor-pointer group"
					>
						<span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-rose-500 transition-colors flex-shrink-0">
							logout
						</span>
						<span>Logout</span>
					</button>
				</div>
			</aside>

			{/* Logout Confirmation Modal */}
			{showLogoutModal &&
				createPortal(
					<div
						className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150 overscroll-contain"
						onClick={() => setShowLogoutModal(false)}
						onWheel={(e) => e.stopPropagation()}
						onTouchMove={(e) => e.stopPropagation()}
					>
						<div
							className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 duration-150 flex flex-col"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-start gap-3.5 mb-3">
								<div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
									<span className="material-symbols-outlined text-[22px]">logout</span>
								</div>
								<div className="flex-1 min-w-0">
									<h3 className="font-extrabold text-[16px] text-slate-900">Sign Out</h3>
									<p className="text-[12.5px] text-slate-500 mt-0.5 leading-relaxed">
										Are you sure you want to log out of your session?
									</p>
								</div>
							</div>
							<div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-slate-100">
								<button
									type="button"
									onClick={() => setShowLogoutModal(false)}
									className="px-4 py-2 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleConfirmLogout}
									className="px-4 py-2 rounded-xl text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
								>
									<span className="material-symbols-outlined text-[16px]">logout</span>
									<span>Logout</span>
								</button>
							</div>
						</div>
					</div>,
					document.body
				)}
		</>
	);
}
