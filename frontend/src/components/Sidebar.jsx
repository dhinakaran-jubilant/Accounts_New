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
import { isUserPendingLoan } from './Requests';

export const navSections = [
	{
		title: 'Main Navigation',
		items: [
			{ id: 'dashboard', label: 'Dashboard', path: '#dashboard', icon: 'widgets' },
			{ id: 'joint-loan', label: 'Joint Loan', path: '#joint-loan', icon: 'handshake' },
			{ id: 'short-loan', label: 'Short Loan', path: '#short-loan', icon: 'payments' },
			{ id: 'matchup', label: 'Matchup', path: '#matchup', icon: 'compare_arrows' },
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

	// Periodically check count of approval requests requiring this user's action
	useEffect(() => {
		let isMounted = true;
		const checkPending = async () => {
			if (!currentUser) return;
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
					if (isUserPendingLoan(loan, currentUser, accs)) {
						count += 1;
					}
				});
				setPendingRequestCount(count);
			} catch (e) {
				// ignore
			}
		};

		checkPending();
		const interval = setInterval(checkPending, 20000);
		return () => {
			isMounted = false;
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
		if (Array.isArray(propAllowedMenus) && propAllowedMenus.length > 0) {
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
				return menus;
			}
			if (['admin', 'super admin'].includes((currentUser.role || '').toLowerCase())) {
				return ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings'];
			}
			return ['dashboard', 'joint-loan'];
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
					className="fixed inset-0 bg-slate-900/50 z-30 md:hidden backdrop-blur-xs transition-opacity"
				/>
			)}

			<aside
				className={`fixed left-0 top-0 bottom-0 bg-surface-container-lowest z-40 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)] font-sans transition-all duration-300
					w-[16rem] max-w-[85vw] sm:w-[16rem] md:w-[15rem] lg:w-[16rem] xl:w-[16rem] 2xl:w-[16rem]
					${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
			>
				<div className="flex flex-col flex-1 overflow-y-auto">
					{/* Brand Header */}
					<div className="h-16 px-space-lg flex items-center gap-space-sm border-b border-surface-container-low/50 flex-shrink-0">
						<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-950/50 ring-1 ring-primary/20">
							<span className="material-symbols-outlined text-[22px]">linked_services</span>
						</div>
						<span className="font-extrabold text-[26px] tracking-tight text-on-surface">
							LoanDesk
						</span>
						{/* Close button on mobile */}
						<button
							onClick={onClose}
							type="button"
							aria-label="Close sidebar"
							className="md:hidden ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-surface-container-low transition-colors"
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
							<div key={section.title} className={`px-space-md py-space-xs ${idx > 0 ? 'mt-space-sm' : ''}`}>
								<nav className="flex flex-col gap-1">
									{visibleItems.map((item) => {
										const isActive = activeItem === item.id;

										return (
											<button
												key={item.id}
												onClick={() => handleItemClick(item.id)}
												className={`w-full flex items-center gap-space-sm px-space-md py-space-sm rounded-xl font-semibold text-[14px] transition-colors text-left ${isActive
													? 'bg-primary-container text-on-primary font-bold shadow-sm'
													: 'text-slate-700 hover:bg-surface-container-low hover:text-slate-900'
													}`}
											>
												<span
													className={`material-symbols-outlined text-[20px] flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-500'
														}`}
												>
													{item.icon}
												</span>
												<span>{item.label}</span>
												{item.id === 'requests' && pendingRequestCount > 0 && (
													<span
														className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
															isActive
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
				<div className="p-space-md border-t border-slate-200/70 bg-primary-container-lowest flex flex-col flex-shrink-0">
					<button
						type="button"
						onClick={() => setShowLogoutModal(true)}
						className="w-full flex items-center gap-space-sm px-space-md py-space-sm rounded-xl font-semibold text-[14px] text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors text-left cursor-pointer group"
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
