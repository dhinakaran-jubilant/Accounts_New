/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: User authentication form component handling credentials input, password toggling, and login submissions.
*/

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ForgotPasswordModal from './forgotpasswordmodel';

export default function Login({ onLoginSuccess }) {
	const [employeeCode, setEmployeeCode] = useState(() => {
		try {
			return localStorage.getItem('loanDesk_remembered_code') || '';
		} catch (e) {
			return '';
		}
	});
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(() => {
		try {
			return localStorage.getItem('loanDesk_remember_me') !== 'false';
		} catch (e) {
			return true;
		}
	});
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [successNotice, setSuccessNotice] = useState('');
	const [showForgotModal, setShowForgotModal] = useState(false);

	// Automatically dismiss Error Alert Box after 3 seconds
	useEffect(() => {
		if (!errorMessage) return;
		const timer = setTimeout(() => {
			setErrorMessage('');
		}, 3000);
		return () => clearTimeout(timer);
	}, [errorMessage]);

	// Automatically dismiss Success Alert Box after 3 seconds
	useEffect(() => {
		if (!successNotice) return;
		const timer = setTimeout(() => {
			setSuccessNotice('');
		}, 3000);
		return () => clearTimeout(timer);
	}, [successNotice]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		const trimmedCode = employeeCode.trim();
		if (!trimmedCode) {
			setErrorMessage('Please enter your Employee Code or Login ID.');
			return;
		}
		if (!password) {
			setErrorMessage('Please enter your password.');
			return;
		}

		setIsLoading(true);
		setErrorMessage('');
		setSuccessNotice('');

		try {
			const res = await api.login({
				employee_code: trimmedCode,
				password: password,
			});

			if (res && res.success && res.user) {
				// Store active session for current browser tab/window
				sessionStorage.setItem('loanDesk_user', JSON.stringify(res.user));
				if (res.token) {
					sessionStorage.setItem('loanDesk_token', res.token);
				}

				// Remember employee code on login screen if Remember Me is checked
				if (rememberMe) {
					localStorage.setItem('loanDesk_remembered_code', trimmedCode);
					localStorage.setItem('loanDesk_remember_me', 'true');
				} else {
					localStorage.removeItem('loanDesk_remembered_code');
					localStorage.setItem('loanDesk_remember_me', 'false');
				}

				// Always clear persistent auth from localStorage so http://localhost:1111/ defaults to login page
				localStorage.removeItem('loanDesk_user');
				localStorage.removeItem('loanDesk_token');
				localStorage.removeItem('loanDesk_expires_at');

				if (onLoginSuccess) {
					onLoginSuccess(res.user);
				} else {
					window.location.reload();
				}
			} else {
				setErrorMessage(res.error || 'Invalid credentials. Please try again.');
			}
		} catch (err) {
			setErrorMessage(err.message || 'Login failed. Please check your credentials and server connection.');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-stone-50 to-orange-50/40 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white relative overflow-hidden text-slate-900">
			{/* Ambient Background Glows */}
			<div className="absolute top-0 right-0 w-[550px] h-[550px] bg-gradient-to-br from-orange-400/20 to-amber-200/20 rounded-full blur-[140px] pointer-events-none -mr-48 -mt-48" />
			<div className="absolute bottom-0 left-0 w-[550px] h-[550px] bg-gradient-to-tr from-orange-400/15 to-primary/10 rounded-full blur-[140px] pointer-events-none -ml-48 -mb-48" />

			{/* Subtle Background Pattern Grid */}
			<div
				className="absolute inset-0 opacity-[0.4] pointer-events-none"
				style={{
					backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
					backgroundSize: '24px 24px',
				}}
			/>

			{/* Main Split Content: Left Brand Showcase & Right Sign In Form */}
			<div className="flex-1 flex flex-col lg:flex-row relative z-10 w-full px-4 sm:px-6 lg:px-16 py-4 lg:py-6 gap-6 lg:gap-10 items-stretch">
				{/* Left Column: Visual Brand & Feature Showcase (Desktop lg+) */}
				<div className="hidden lg:flex lg:w-1/2 xl:w-7/12 flex-col justify-between py-6">
					{/* Top Branding */}
					<div className="flex items-center gap-3">
						<div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 ring-1 ring-orange-400/30">
							<span className="material-symbols-outlined text-[24px]">linked_services</span>
						</div>
						<div>
							<span className="font-extrabold text-[24px] tracking-tight text-slate-900 leading-tight block">
								LoanDesk
							</span>
							<span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
								Enterprise Co-Lending Platform
							</span>
						</div>
					</div>

					{/* Center Content: Headline & Micro-Cards */}
					<div className="my-auto py-8 max-w-2xl">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/80 text-orange-700 text-[12px] font-bold mb-6 backdrop-blur-md shadow-2xs">
							<span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
							<span>Syndicated Co-Lending &amp; Joint Loan Operating System</span>
						</div>

						<h1 className="text-[38px] xl:text-[44px] font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-5">
							Unified Loan Accounting &amp; Joint Loan Permissions.
						</h1>
						<p className="text-[14px] text-slate-600 font-normal leading-relaxed mb-8">
							Manage multi-entity loan origination, automated interest splits, TDS deductions, and granular access controls in one seamless workspace.
						</p>

						{/* Live Feature Preview Cards */}
						<div className="space-y-3.5">
							{/* Card 1: Multi-Entity Split */}
							<div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 backdrop-blur-md flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 text-orange-600 flex items-center justify-center flex-shrink-0">
										<span className="material-symbols-outlined text-[22px]">handshake</span>
									</div>
									<div>
										<div className="text-[13px] font-bold text-slate-900">Dual-Entity Allocation</div>
										<div className="text-[11.5px] text-slate-500">Primary vs Secondary split engine</div>
									</div>
								</div>
							</div>

							{/* Card 2: Real-Time Audit & Ledger */}
							<div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 backdrop-blur-md flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/70 text-purple-600 flex items-center justify-center flex-shrink-0">
										<span className="material-symbols-outlined text-[22px]">verified_user</span>
									</div>
									<div>
										<div className="text-[13px] font-bold text-slate-900">Granular Permission Matrix</div>
										<div className="text-[11.5px] text-slate-500">Restricted view, edit &amp; payout rights</div>
									</div>
								</div>
								<span className="text-[11.5px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
									Enforced
								</span>
							</div>
						</div>
					</div>
				</div>

				{/* Right Column: Sign In Form Panel */}
				<div className="w-full lg:w-1/2 xl:w-5/12 flex flex-col justify-center my-auto relative">
					{/* Ambient Backlight Glow */}
					<div className="absolute -inset-1.5 bg-gradient-to-tr from-orange-400/20 via-primary/10 to-amber-300/15 rounded-[32px] blur-2xl opacity-70 pointer-events-none -z-10" />

					{/* Main Form Glass Card */}
					<div className="relative rounded-3xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl p-6 sm:p-9 xl:p-11 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5 overflow-hidden">
						{/* Top Specular Highlight Border */}
						<div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent pointer-events-none" />
						{/* Ambient Soft Corner Glow */}
						<div className="absolute -top-20 -right-20 w-44 h-44 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />

						{/* Mobile Header (Hidden on Desktop) */}
						<div className="lg:hidden flex items-center gap-3 mb-6 pb-5 border-b border-slate-200">
							<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 ring-1 ring-orange-400/30">
								<span className="material-symbols-outlined text-[22px]">linked_services</span>
							</div>
							<div>
								<span className="font-extrabold text-[20px] tracking-tight text-slate-900 block leading-tight">
									LoanDesk
								</span>
								<span className="text-[10.5px] font-semibold tracking-wider uppercase text-slate-500">
									Enterprise Co-Lending Platform
								</span>
							</div>
						</div>

						{/* Card Header & Security Badge */}
						<div className="mb-6">
							<div className="flex items-center justify-between gap-2 mb-3">
								<div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200/80 text-orange-700 text-xs font-bold tracking-wide">
									<span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
									<span>Portal Authentication</span>
								</div>
								<div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
									<span>System Online</span>
								</div>
							</div>

							<h2 className="text-[26px] sm:text-[30px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Sign In
							</h2>
							<p className="text-[13px] text-slate-500 mt-1 font-medium leading-relaxed">
								Welcome back! Enter your verified employee credentials to access your workspaces.
							</p>
						</div>

						{/* Success Alert Box */}
						{successNotice && (
							<div className="mb-5 px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
								<div className="flex items-center gap-2.5 min-w-0">
									<span className="material-symbols-outlined text-[20px] text-emerald-600 shrink-0">
										check_circle
									</span>
									<span className="truncate">{successNotice}</span>
								</div>
								<button
									type="button"
									onClick={() => setSuccessNotice('')}
									className="text-emerald-600 hover:text-emerald-800 p-0.5 transition-colors cursor-pointer shrink-0"
								>
									<span className="material-symbols-outlined text-[16px]">close</span>
								</button>
							</div>
						)}

						{/* Error Alert Box */}
						{errorMessage && (
							<div className="mb-5 px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
								<div className="flex items-center gap-2.5 min-w-0">
									<span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0">
										error
									</span>
									<span className="break-words text-xs">{errorMessage}</span>
								</div>
								<button
									type="button"
									onClick={() => setErrorMessage('')}
									className="text-rose-600 hover:text-rose-800 p-0.5 transition-colors cursor-pointer shrink-0"
								>
									<span className="material-symbols-outlined text-[16px]">close</span>
								</button>
							</div>
						)}

						<form onSubmit={handleSubmit} className="space-y-4">
							{/* Employee Code Input */}
							<div className="space-y-1.5">
								<label className="flex items-center justify-between text-xs font-bold text-slate-700">
									<span>Employee Code / Login ID <span className="text-rose-500">*</span></span>
								</label>
								<div className="relative group">
									<div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 group-focus-within:text-orange-500 transition-colors pointer-events-none">
										<span className="material-symbols-outlined text-[20px]">badge</span>
									</div>
									<input
										type="text"
										value={employeeCode}
										onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
										placeholder="e.g. ADMIN or JC0001"
										className="w-full h-11 pl-11 pr-10 rounded-xl text-xs font-bold font-mono tracking-wider bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all shadow-2xs"
										required
										autoFocus
									/>
									{employeeCode && (
										<button
											type="button"
											onClick={() => setEmployeeCode('')}
											className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors cursor-pointer"
											title="Clear"
										>
											<span className="material-symbols-outlined text-[16px]">close</span>
										</button>
									)}
								</div>
							</div>

							{/* Password Input */}
							<div className="space-y-1.5">
								<div className="flex items-center justify-between">
									<label className="text-xs font-bold text-slate-700">
										Password <span className="text-rose-500">*</span>
									</label>
									<button
										type="button"
										onClick={() => setShowForgotModal(true)}
										className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer flex items-center gap-1 hover:underline"
									>
										<span>Forgot password?</span>
									</button>
								</div>
								<div className="relative group">
									<div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 group-focus-within:text-orange-500 transition-colors pointer-events-none">
										<span className="material-symbols-outlined text-[20px]">lock</span>
									</div>
									<input
										type={showPassword ? 'text' : 'password'}
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder="Enter your security password..."
										className="w-full h-11 pl-11 pr-11 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all shadow-2xs"
										required
									/>
									<button
										type="button"
										onClick={() => setShowPassword((prev) => !prev)}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition-colors"
										tabIndex={-1}
										title={showPassword ? 'Hide password' : 'Show password'}
									>
										<span className="material-symbols-outlined text-[19px]">
											{showPassword ? 'visibility_off' : 'visibility'}
										</span>
									</button>
								</div>
							</div>

							{/* Remember Me Checkbox */}
							<div className="flex items-center justify-between pt-0.5">
								<label className="flex items-center gap-2.5 cursor-pointer select-none group">
									<div className="relative flex items-center justify-center">
										<input
											type="checkbox"
											checked={rememberMe}
											onChange={(e) => setRememberMe(e.target.checked)}
											className="sr-only"
										/>
										<div
											className={`w-4 h-4 rounded-md border transition-all flex items-center justify-center shadow-2xs ${
												rememberMe
													? 'border-orange-500 bg-orange-500 shadow-orange-500/20'
													: 'border-slate-300 bg-white group-hover:border-slate-400'
											}`}
										>
											{rememberMe && (
												<svg
													className="w-2.5 h-2.5 text-white"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="3.5"
													strokeLinecap="round"
													strokeLinejoin="round"
												>
													<polyline points="20 6 9 17 4 12" />
												</svg>
											)}
										</div>
									</div>
									<span className={`text-xs font-medium transition-colors ${rememberMe ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>
										Remember session for 30 days
									</span>
								</label>
							</div>

							{/* Submit Button */}
							<button
								type="submit"
								disabled={isLoading}
								className="w-full mt-2 h-12 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 text-white font-extrabold text-xs sm:text-[13.5px] tracking-wide shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group relative overflow-hidden"
							>
								{/* Shimmer sweep effect */}
								<div className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform ease-out pointer-events-none" />

								{isLoading ? (
									<>
										<span className="material-symbols-outlined text-[20px] animate-spin">
											progress_activity
										</span>
										<span>Authenticating credentials...</span>
									</>
								) : (
									<>
										<span>Sign In to Dashboard</span>
										<span className="material-symbols-outlined text-[19px] group-hover:translate-x-0.5 transition-transform">
											arrow_forward
										</span>
									</>
								)}
							</button>
						</form>

						{/* Trust Micro-strip */}
						<div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
							<div className="flex items-center gap-1.5">
								<span className="material-symbols-outlined text-[15px] text-emerald-600">verified_user</span>
								<span>RBAC Permission Matrix</span>
							</div>
							<span className="font-mono text-slate-400">TLS 1.3 Protected</span>
						</div>
					</div>
				</div>
			</div>

			{/* Full Page Bottom Trust Badge */}
			<div className="relative z-10 px-6 sm:px-12 py-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[12px] text-slate-500">
				<div className="flex items-center gap-2">
					<span className="material-symbols-outlined text-emerald-600 text-[18px]">lock</span>
					<span>256-Bit Bank-Grade Encryption</span>
				</div>
				<span className="font-medium text-slate-400">LoanDesk V2.0</span>
			</div>

			{/* Forgot Password Modal */}
			<ForgotPasswordModal
				isOpen={showForgotModal}
				onClose={() => setShowForgotModal(false)}
				initialEmployeeCode={employeeCode}
				onSuccess={(code) => {
					if (code) {
						setEmployeeCode(code);
					}
					setPassword('');
					setErrorMessage('');
					setSuccessNotice('Password reset successfully! Please log in with your new password.');
					setShowForgotModal(false);
				}}
			/>

		</div>
	);
}
