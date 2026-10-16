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
		let textColor = 'text-rose-400';

		if (newPassword.length === 0) {
			label = '';
			color = 'bg-slate-800';
			textColor = 'text-slate-500';
		} else if (score <= 1) {
			label = 'Weak';
			color = 'bg-rose-500';
			textColor = 'text-rose-400';
		} else if (score === 2) {
			label = 'Fair';
			color = 'bg-amber-500';
			textColor = 'text-amber-400';
		} else if (score === 3) {
			label = 'Good';
			color = 'bg-sky-500';
			textColor = 'text-sky-400';
		} else if (score >= 4) {
			label = 'Strong';
			color = 'bg-emerald-500';
			textColor = 'text-emerald-400';
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
		<div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-stone-900 flex flex-col font-sans antialiased selection:bg-primary-container selection:text-white relative overflow-hidden">
			{/* Ambient Background Glows matching Login theme */}
			<div className="absolute top-0 right-0 w-[550px] h-[550px] bg-primary/20 rounded-full blur-[140px] pointer-events-none -mr-48 -mt-48" />
			<div className="absolute bottom-0 left-0 w-[550px] h-[550px] bg-orange-600/15 rounded-full blur-[140px] pointer-events-none -ml-48 -mb-48" />

			{/* Subtle Background Pattern Grid */}
			<div
				className="absolute inset-0 opacity-[0.03] pointer-events-none"
				style={{
					backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
					backgroundSize: '24px 24px',
				}}
			/>

			{/* Main Form Centerpiece */}
			<main className="flex-1 flex items-center justify-center relative z-10 p-4 sm:p-6">
				<div className="w-full max-w-xl border border-slate-800/80 rounded-3xl bg-slate-900/60 backdrop-blur-sm shadow-2xl p-6 sm:p-10 my-auto animate-in fade-in zoom-in-95 duration-200">
					{/* Header Title */}
					<div className="mb-6">
						<h1 className="text-[24px] sm:text-[28px] font-extrabold text-white tracking-tight leading-tight">
							Set Up Your Password
						</h1>
					</div>

					{/* Alert Messages */}
					{errorMessage && (
						<div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[13px] font-semibold flex items-start gap-2.5 animate-in fade-in duration-150">
							<span className="material-symbols-outlined text-[20px] text-rose-400 flex-shrink-0 mt-0.5">
								error
							</span>
							<span className="flex-1">{errorMessage}</span>
						</div>
					)}

					{successMessage && (
						<div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[13px] font-semibold flex items-start gap-2.5 animate-in fade-in duration-150">
							<span className="material-symbols-outlined text-[20px] text-emerald-400 flex-shrink-0 mt-0.5">
								check_circle
							</span>
							<span className="flex-1">{successMessage}</span>
						</div>
					)}

					<form onSubmit={handleSubmit} className="space-y-6">
						{/* SECTION 1: PASSWORD CREATION */}
						<div className="space-y-4 pt-1">
							<div className="flex items-center gap-2 text-[13px] font-bold text-slate-200 border-b border-slate-800 pb-2">
								<span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center text-[12px] font-extrabold">
									1
								</span>
								<span>Create New Password</span>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
								{/* New Password Input */}
								<div>
									<label className="block text-[12px] font-bold text-slate-300 mb-1.5">
										New Password <span className="text-rose-400">*</span>
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
											lock
										</span>
										<input
											type={showNewPassword ? 'text' : 'password'}
											value={newPassword}
											onChange={(e) => setNewPassword(e.target.value)}
											placeholder="Min 6 characters"
											className={`w-full pl-9 pr-10 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-800/70 border text-white placeholder:text-slate-500 focus:bg-slate-800 outline-none transition-all ${
												newPassword.length > 0 && passwordChecks.length
													? 'border-emerald-500/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
													: 'border-slate-700/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
											}`}
											required
											autoFocus
										/>
										<button
											type="button"
											onClick={() => setShowNewPassword((p) => !p)}
											className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
											tabIndex={-1}
											title={showNewPassword ? 'Hide password' : 'Show password'}
										>
											<span className="material-symbols-outlined text-[18px]">
												{showNewPassword ? 'visibility_off' : 'visibility'}
											</span>
										</button>
									</div>
								</div>

								{/* Confirm New Password Input */}
								<div>
									<label className="block text-[12px] font-bold text-slate-300 mb-1.5">
										Confirm New Password <span className="text-rose-400">*</span>
									</label>
									<div className="relative">
										<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
											lock_reset
										</span>
										<input
											type={showConfirmPassword ? 'text' : 'password'}
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
											placeholder="Re-enter password"
											className={`w-full pl-9 pr-10 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-800/70 border text-white placeholder:text-slate-500 focus:bg-slate-800 outline-none transition-all ${
												confirmPassword.length > 0
													? passwordChecks.match
														? 'border-emerald-500/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
														: 'border-rose-500/60 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
													: 'border-slate-700/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
											}`}
											required
										/>
										<button
											type="button"
											onClick={() => setShowConfirmPassword((p) => !p)}
											className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
											tabIndex={-1}
											title={showConfirmPassword ? 'Hide password' : 'Show password'}
										>
											<span className="material-symbols-outlined text-[18px]">
												{showConfirmPassword ? 'visibility_off' : 'visibility'}
											</span>
										</button>
									</div>
								</div>
							</div>
						</div>

						{/* SECTION 2: SECURITY QUESTION SETUP */}
						<div className="space-y-4 pt-2">
							<div className="flex items-center gap-2 text-[13px] font-bold text-slate-200 border-b border-slate-800 pb-2">
								<span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center text-[12px] font-extrabold">
									2
								</span>
								<span>Setup Security Recovery Question</span>
							</div>

							{/* Modern Custom Dropdown for Security Question */}
							<div className="relative" ref={dropdownRef}>
								<label className="block text-[12px] font-bold text-slate-300 mb-1.5">
									Security Question <span className="text-rose-400">*</span>
								</label>

								<button
									type="button"
									onClick={() => setIsDropdownOpen((prev) => !prev)}
									className={`relative w-full pl-9 pr-1 py-2.5 rounded-xl text-[13px] font-medium text-left flex items-center justify-between transition-all bg-slate-800/70 border ${
										isDropdownOpen
											? 'border-orange-500 ring-2 ring-orange-500/20 bg-slate-800 text-white'
											: 'border-slate-700/80 hover:border-slate-600 text-slate-100 hover:bg-slate-800/90'
									} cursor-pointer group shadow-sm`}
								>
									<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 text-[18px] pointer-events-none">
										help_outline
									</span>

									<span className="truncate pr-2 font-semibold text-[13px]">
										{securityQuestion}
									</span>

									<span
										className={`material-symbols-outlined text-[19px] transition-transform duration-200 flex-shrink-0 ${
											isDropdownOpen ? 'rotate-180 text-orange-400' : 'text-slate-400 group-hover:text-slate-200'
										}`}
									>
										expand_more
									</span>
								</button>

								{/* Animated Floating Options Menu */}
								{isDropdownOpen && (
									<div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
										<div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
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
													className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] transition-all flex items-center justify-between gap-3 cursor-pointer ${
														isSelected
															? 'bg-orange-500/15 text-orange-300 font-bold border border-orange-500/30'
															: 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
													}`}
												>
													<span className="flex items-center gap-2.5 min-w-0">
														<span
															className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
																isSelected ? 'bg-orange-400' : 'bg-slate-600'
															}`}
														/>
														<span className="truncate">{q}</span>
													</span>
													{isSelected && (
														<span className="material-symbols-outlined text-orange-400 text-[18px] flex-shrink-0">
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
							<div>
								<div className="flex items-center justify-between mb-1.5">
									<label className="block text-[12px] font-bold text-slate-300">
										Security Answer <span className="text-rose-400">*</span>
									</label>
									<button
										type="button"
										onClick={() => setShowAnswer((p) => !p)}
										className="text-[11.5px] font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
									>
										{showAnswer ? 'Hide answer' : 'Show answer'}
									</button>
								</div>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
										key
									</span>
									<input
										type={showAnswer ? 'text' : 'password'}
										value={securityAnswer}
										onChange={(e) => setSecurityAnswer(e.target.value)}
										placeholder="Enter your confidential answer"
										className="w-full pl-9 pr-10 py-2.5 rounded-xl text-[13px] font-medium bg-slate-800/70 border border-slate-700/80 text-white placeholder:text-slate-500 focus:bg-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
										required
									/>
								</div>
								<p className="text-[11px] text-slate-400 mt-1.5">
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
								className="w-full py-3 px-4 rounded-xl text-[14px] font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<span className="material-symbols-outlined text-[20px]">arrow_back</span>
								<span>Back</span>
							</button>

							<button
								type="submit"
								disabled={isLoading || !isFormReady}
								className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary-container to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-[14px] shadow-lg shadow-orange-950/50 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? (
									<>
										<span className="material-symbols-outlined text-[20px] animate-spin">
											progress_activity
										</span>
										<span>Saving...</span>
									</>
								) : (
									<>
										<span className="material-symbols-outlined text-[20px]">verified_user</span>
										<span>Complete Setup</span>
									</>
								)}
							</button>
						</div>
					</form>
				</div>
			</main>
		</div>
	);
}
