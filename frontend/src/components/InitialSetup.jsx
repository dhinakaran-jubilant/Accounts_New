/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Onboarding wizard component for initial database configuration and administrator setup.
*/

import React, { useState, useMemo, useRef, useEffect } from 'react';
import api from '../services/api';

export const SECURITY_QUESTIONS = [
	"What is your mother's maiden name?",
	"What was the name of your first pet?",
	"What city were you born in?",
	"What was the name of your elementary school?",
];

export default function InitialSetup({ currentUser, onSetupComplete, onLogout }) {
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showNewPassword, setShowNewPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [securityAnswer, setSecurityAnswer] = useState('');
	const [showAnswer, setShowAnswer] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [successMessage, setSuccessMessage] = useState('');

	const dropdownRef = useRef(null);

	// Close security question dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsDropdownOpen(false);
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, []);

	// Real-time password strength and criteria analysis
	const passwordChecks = useMemo(() => {
		const length = newPassword.length >= 6;
		const hasNumber = /\d/.test(newPassword);
		const hasMixed = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
		const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

		// Calculate 4-level strength score
		let score = 0;
		if (newPassword.length >= 6) score += 1;
		if (newPassword.length >= 8) score += 1;
		if (hasNumber) score += 1;
		if (hasMixed || hasSpecial) score += 1;

		let label = 'Too Short';
		let color = 'bg-rose-500';
		let textColor = 'text-rose-600';

		if (newPassword.length === 0) {
			label = '';
			color = 'bg-slate-200';
			textColor = 'text-slate-400';
		} else if (score <= 1) {
			label = 'Weak';
			color = 'bg-rose-500';
			textColor = 'text-rose-600';
		} else if (score === 2) {
			label = 'Fair';
			color = 'bg-amber-500';
			textColor = 'text-amber-600';
		} else if (score === 3) {
			label = 'Good';
			color = 'bg-sky-500';
			textColor = 'text-sky-600';
		} else if (score >= 4) {
			label = 'Strong';
			color = 'bg-emerald-500';
			textColor = 'text-emerald-600';
		}

		const match = confirmPassword.length > 0 && newPassword === confirmPassword;
		const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

		return {
			length,
			hasNumber,
			hasMixed,
			hasSpecial,
			score,
			label,
			color,
			textColor,
			match,
			mismatch,
		};
	}, [newPassword, confirmPassword]);

	const isAnswerValid = securityAnswer.trim().length >= 2;
	const isFormReady = passwordChecks.length && passwordChecks.match && isAnswerValid && !!securityQuestion;

	const handleSubmit = async (e) => {
		e.preventDefault();
		setErrorMessage('');
		setSuccessMessage('');

		if (!passwordChecks.length) {
			setErrorMessage('New password must be at least 6 characters long.');
			return;
		}

		if (!passwordChecks.match) {
			setErrorMessage('Passwords do not match. Please re-enter your new password.');
			return;
		}

		if (!securityQuestion || !SECURITY_QUESTIONS.includes(securityQuestion)) {
			setErrorMessage('Please select a valid security question from the list.');
			return;
		}

		if (!isAnswerValid) {
			setErrorMessage('Please enter an answer to your security question (minimum 2 characters).');
			return;
		}

		setIsLoading(true);

		try {
			const payload = {
				user_id: currentUser?.id,
				employee_code: currentUser?.employee_code,
				new_password: newPassword.trim(),
				security_question: securityQuestion.trim(),
				security_answer: securityAnswer.trim(),
			};

			const res = await api.initialSetup(payload);

			if (res && res.success && res.user) {
				setSuccessMessage('Setup completed successfully! Redirecting to Dashboard...');
				const storage = localStorage.getItem('loanDesk_user') ? localStorage : sessionStorage;
				storage.setItem('loanDesk_user', JSON.stringify(res.user));
				if (res.token) {
					storage.setItem('loanDesk_token', res.token);
				}

				setTimeout(() => {
					if (onSetupComplete) {
						onSetupComplete(res.user);
					} else {
						window.location.reload();
					}
				}, 700);
			} else {
				setErrorMessage(res.error || 'Failed to complete initial setup. Please try again.');
			}
		} catch (err) {
			setErrorMessage(err.message || 'Server error while saving setup. Please check your network connection.');
		} finally {
			setIsLoading(false);
		}
	};

	const handleBack = () => {
		if (onLogout) {
			onLogout();
		} else {
			try {
				localStorage.removeItem('loanDesk_user');
				localStorage.removeItem('loanDesk_token');
				localStorage.removeItem('loanDesk_expires_at');
				sessionStorage.removeItem('loanDesk_user');
				sessionStorage.removeItem('loanDesk_token');
			} catch (e) {
				// ignore
			}
			window.location.href = '/login';
		}
	};

	return (
		<div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-stone-50 to-orange-50/40 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white relative overflow-hidden text-slate-900">
			{/* Ambient Background Glows matching Login theme */}
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

			{/* Main Form Centerpiece */}
			<main className="flex-1 flex items-center justify-center relative z-10 p-4 sm:p-6 my-auto">
				<div className="w-full max-w-xl relative">
					{/* Ambient Backlight Glow behind Card */}
					<div className="absolute -inset-1.5 bg-gradient-to-tr from-orange-400/20 via-primary/10 to-amber-300/15 rounded-[32px] blur-2xl opacity-70 pointer-events-none -z-10" />

					{/* Glass Card matching Login page */}
					<div className="relative rounded-3xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl p-6 sm:p-9 xl:p-10 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
						{/* Top Specular Highlight Border */}
						<div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent pointer-events-none" />
						{/* Ambient Soft Corner Glow */}
						<div className="absolute -top-20 -right-20 w-44 h-44 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />

						{/* Top Brand & Status Badges */}
						<div className="flex items-center justify-between gap-2 mb-5">
							<div className="flex items-center gap-2.5">
								<div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 ring-1 ring-orange-400/30 shrink-0">
									<span className="material-symbols-outlined text-[22px]">linked_services</span>
								</div>
								<div>
									<span className="font-extrabold text-[18px] tracking-tight text-slate-900 block leading-tight">
										LoanDesk
									</span>
									<span className="text-[10.5px] font-semibold tracking-wider uppercase text-slate-500">
										Account Onboarding
									</span>
								</div>
							</div>
							<div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
								<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
								<span>Required Setup</span>
							</div>
						</div>

						{/* Header Title */}
						<div className="mb-6">
							<h1 className="text-[24px] sm:text-[28px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Set Up Your Password
							</h1>
							<p className="text-[13px] text-slate-500 mt-1 font-medium leading-relaxed">
								Welcome to LoanDesk! Complete your security profile and set a permanent password to access the portal.
							</p>
						</div>

						{/* Alert Messages */}
						{errorMessage && (
							<div className="mb-5 px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
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

						{successMessage && (
							<div className="mb-5 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
								<div className="flex items-center gap-2.5 min-w-0">
									<span className="material-symbols-outlined text-[20px] text-emerald-600 shrink-0">
										check_circle
									</span>
									<span className="truncate">{successMessage}</span>
								</div>
							</div>
						)}

						<form onSubmit={handleSubmit} className="space-y-5">
							{/* SECTION 1: PASSWORD CREATION */}
							<div className="space-y-3.5 pt-1">
								<div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
									<span className="w-5 h-5 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center text-[11px] font-black">
										1
									</span>
									<span>Create New Password</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
									{/* New Password Input */}
									<div className="space-y-1.5">
										<label className="block text-xs font-bold text-slate-700">
											New Password <span className="text-rose-500">*</span>
										</label>
										<div className="relative group">
											<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 text-[19px] pointer-events-none transition-colors">
												lock
											</span>
											<input
												type={showNewPassword ? 'text' : 'password'}
												value={newPassword}
												onChange={(e) => setNewPassword(e.target.value)}
												placeholder="Min 6 characters"
												className={`w-full h-11 pl-11 pr-10 rounded-xl text-xs font-semibold bg-slate-50 border text-slate-900 placeholder:text-slate-400 focus:bg-white outline-none transition-all shadow-2xs ${
													newPassword.length > 0 && passwordChecks.length
														? 'border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
														: 'border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
												}`}
												required
												autoFocus
											/>
											<button
												type="button"
												onClick={() => setShowNewPassword((p) => !p)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
												tabIndex={-1}
												title={showNewPassword ? 'Hide password' : 'Show password'}
											>
												<span className="material-symbols-outlined text-[19px]">
													{showNewPassword ? 'visibility_off' : 'visibility'}
												</span>
											</button>
										</div>
									</div>

									{/* Confirm New Password Input */}
									<div className="space-y-1.5">
										<label className="block text-xs font-bold text-slate-700">
											Confirm New Password <span className="text-rose-500">*</span>
										</label>
										<div className="relative group">
											<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 text-[19px] pointer-events-none transition-colors">
												lock_reset
											</span>
											<input
												type={showConfirmPassword ? 'text' : 'password'}
												value={confirmPassword}
												onChange={(e) => setConfirmPassword(e.target.value)}
												placeholder="Re-enter password"
												className={`w-full h-11 pl-11 pr-10 rounded-xl text-xs font-semibold bg-slate-50 border text-slate-900 placeholder:text-slate-400 focus:bg-white outline-none transition-all shadow-2xs ${
													confirmPassword.length > 0
														? passwordChecks.match
															? 'border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
															: 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
														: 'border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
												}`}
												required
											/>
											<button
												type="button"
												onClick={() => setShowConfirmPassword((p) => !p)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
												tabIndex={-1}
												title={showConfirmPassword ? 'Hide password' : 'Show password'}
											>
												<span className="material-symbols-outlined text-[19px]">
													{showConfirmPassword ? 'visibility_off' : 'visibility'}
												</span>
											</button>
										</div>
									</div>
								</div>

								{/* Password Match / Mismatch Note */}
								{confirmPassword.length > 0 && (
									<p
										className={`text-[11px] font-medium ${
											passwordChecks.match
												? 'text-emerald-600'
												: 'text-rose-600'
										}`}
									>
										{passwordChecks.match
											? 'Passwords match'
											: 'Passwords do not match'}
									</p>
								)}
							</div>

							{/* SECTION 2: SECURITY QUESTION SETUP */}
							<div className="space-y-3.5 pt-2">
								<div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
									<span className="w-5 h-5 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center text-[11px] font-black">
										2
									</span>
									<span>Setup Security Recovery Question</span>
								</div>

								{/* Modern Custom Dropdown for Security Question */}
								<div className="space-y-1.5 relative" ref={dropdownRef}>
									<label className="block text-xs font-bold text-slate-700">
										Security Question <span className="text-rose-500">*</span>
									</label>

									<button
										type="button"
										onClick={() => setIsDropdownOpen((prev) => !prev)}
										className={`relative w-full h-11 pl-11 pr-3 rounded-xl text-xs font-semibold text-left flex items-center justify-between transition-all bg-slate-50 border ${
											isDropdownOpen
												? 'border-orange-500 ring-2 ring-orange-500/20 bg-white text-slate-900'
												: 'border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-white'
										} cursor-pointer group shadow-2xs`}
									>
										<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-500 text-[19px] pointer-events-none">
											help_outline
										</span>

										<span className="truncate pr-2 font-semibold text-xs">
											{securityQuestion}
										</span>

										<span
											className={`material-symbols-outlined text-[19px] transition-transform duration-200 flex-shrink-0 ${
												isDropdownOpen ? 'rotate-180 text-orange-500' : 'text-slate-400 group-hover:text-slate-600'
											}`}
										>
											expand_more
										</span>
									</button>

									{/* Animated Floating Options Menu */}
									{isDropdownOpen && (
										<div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
											<div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
												Choose a Recovery Question
											</div>
											{SECURITY_QUESTIONS.map((q) => {
												const isSelected = securityQuestion === q;
												return (
													<button
														key={q}
														type="button"
														onClick={() => {
															setSecurityQuestion(q);
															setIsDropdownOpen(false);
														}}
														className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-3 cursor-pointer ${
															isSelected
																? 'bg-orange-50 text-orange-700 font-bold border border-orange-200/80'
																: 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
														}`}
													>
														<span className="flex items-center gap-2.5 min-w-0">
															<span
																className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
																	isSelected ? 'bg-orange-500' : 'bg-slate-300'
																}`}
															/>
															<span className="truncate">{q}</span>
														</span>
														{isSelected && (
															<span className="material-symbols-outlined text-orange-600 text-[18px] flex-shrink-0">
																check
															</span>
														)}
													</button>
												);
											})}
										</div>
									)}
								</div>

								{/* Security Answer */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between">
										<label className="block text-xs font-bold text-slate-700">
											Security Answer <span className="text-rose-500">*</span>
										</label>
										<button
											type="button"
											onClick={() => setShowAnswer((p) => !p)}
											className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
										>
											{showAnswer ? 'Hide answer' : 'Show answer'}
										</button>
									</div>
									<div className="relative group">
										<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 text-[19px] pointer-events-none transition-colors">
											key
										</span>
										<input
											type={showAnswer ? 'text' : 'password'}
											value={securityAnswer}
											onChange={(e) => setSecurityAnswer(e.target.value)}
											placeholder="Enter your confidential answer"
											className="w-full h-11 pl-11 pr-10 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all shadow-2xs"
											required
										/>
									</div>
									<p className="text-[11px] text-slate-500 mt-1">
										Save this answer for identity verification when resetting your credentials.
									</p>
								</div>
							</div>

							{/* ACTION BUTTONS: BACK & COMPLETE SETUP (50% each) */}
							<div className="pt-2 grid grid-cols-2 gap-3">
								<button
									type="button"
									onClick={handleBack}
									disabled={isLoading}
									className="w-full h-12 rounded-xl text-xs sm:text-[13.5px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<span className="material-symbols-outlined text-[19px]">arrow_back</span>
									<span>Back to Login</span>
								</button>

								<button
									type="submit"
									disabled={isLoading || !isFormReady}
									className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 text-white font-extrabold text-xs sm:text-[13.5px] tracking-wide shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
								>
									{/* Shimmer sweep effect */}
									<div className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform ease-out pointer-events-none" />

									{isLoading ? (
										<>
											<span className="material-symbols-outlined text-[20px] animate-spin">
												progress_activity
											</span>
											<span>Saving...</span>
										</>
									) : (
										<>
											<span className="material-symbols-outlined text-[19px]">verified_user</span>
											<span>Complete Setup</span>
										</>
									)}
								</button>
							</div>
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
			</main>

			{/* Full Page Bottom Trust Badge */}
			<div className="relative z-10 px-6 sm:px-12 py-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[12px] text-slate-500">
				<div className="flex items-center gap-2">
					<span className="material-symbols-outlined text-emerald-600 text-[18px]">lock</span>
					<span>256-Bit Bank-Grade Encryption</span>
				</div>
				<span className="font-medium text-slate-400">LoanDesk V2.0</span>
			</div>
		</div>
	);
}
