/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Password recovery modal dialog component handling reset requests, verification codes, and password updates.
*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';

export default function ForgotPasswordModal({
	isOpen,
	onClose,
	initialEmployeeCode = '',
	onSuccess,
}) {
	// 3-Step Wizard:
	// 1: User enters emp code -> click next
	// 2: Display user selected security question with answer field -> backend verify answer
	// 3: User enter new password -> reset -> login page
	const [step, setStep] = useState(1);

	// Form values
	const [employeeCode, setEmployeeCode] = useState('');
	const [userName, setUserName] = useState('');
	const [securityQuestion, setSecurityQuestion] = useState('');
	const [securityAnswer, setSecurityAnswer] = useState('');
	const [showAnswer, setShowAnswer] = useState(false);
	const [resetToken, setResetToken] = useState('');

	// Step 3: Password values
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showNewPassword, setShowNewPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	// Status states
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');

	// Reset state whenever modal is opened
	useEffect(() => {
		if (isOpen) {
			setStep(1);
			setEmployeeCode((initialEmployeeCode || '').trim().toUpperCase());
			setUserName('');
			setSecurityQuestion('');
			setSecurityAnswer('');
			setShowAnswer(false);
			setResetToken('');
			setNewPassword('');
			setConfirmPassword('');
			setShowNewPassword(false);
			setShowConfirmPassword(false);
			setErrorMessage('');
			setIsLoading(false);
		}
	}, [isOpen, initialEmployeeCode]);

	// Listen for Escape key to close
	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape' && isOpen && !isLoading) {
				onClose();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, isLoading, onClose]);

	// Simple password validation for Step 3: min 6 chars and newPassword === confirmPassword
	const isPasswordLengthValid = newPassword.length >= 6;
	const isPasswordMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
	const isPasswordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
	const isFormValid = isPasswordLengthValid && isPasswordMatch;


	// =========================================================================
	// STEP 1 HANDLER: Enter employee code -> click Next
	// =========================================================================
	const handleStep1Next = async (e) => {
		e.preventDefault();
		const trimmed = employeeCode.trim().toUpperCase();
		if (!trimmed) {
			setErrorMessage('Please enter your Employee Code or Login ID.');
			return;
		}

		setIsLoading(true);
		setErrorMessage('');

		try {
			const res = await api.forgotPasswordGetQuestion(trimmed);
			if (res && res.success && res.security_question) {
				setSecurityQuestion(res.security_question);
				setUserName(res.name || trimmed);
				setErrorMessage('');
				// Advance to Step 2: Display security question & answer field
				setStep(2);
			} else {
				setErrorMessage(res.error || 'Failed to find security question for this employee.');
			}
		} catch (err) {
			setErrorMessage(err.message || 'Unable to find employee. Please check your code and try again.');
		} finally {
			setIsLoading(false);
		}
	};

	// =========================================================================
	// STEP 2 HANDLER: Verify security question answer -> Move to reset page
	// =========================================================================
	const handleStep2Verify = async (e) => {
		e.preventDefault();
		const trimmedAnswer = securityAnswer.trim();
		if (!trimmedAnswer) {
			setErrorMessage('Please enter your security answer.');
			return;
		}

		setIsLoading(true);
		setErrorMessage('');

		try {
			const res = await api.forgotPasswordVerify({
				employee_code: employeeCode.trim().toUpperCase(),
				security_question: securityQuestion,
				security_answer: trimmedAnswer,
			});

			if (res && res.success) {
				setResetToken(res.reset_token || '');
				setErrorMessage('');
				// Answer matched! Move to Step 3: Password Reset page
				setStep(3);
			} else {
				setErrorMessage(res.error || 'Incorrect security answer. Please check and try again.');
			}
		} catch (err) {
			setErrorMessage(err.message || 'Incorrect security answer. Please check and try again.');
		} finally {
			setIsLoading(false);
		}
	};

	// =========================================================================
	// STEP 3 HANDLER: Enter new password -> Reset -> Move to login page
	// =========================================================================
	const handleStep3Reset = async (e) => {
		e.preventDefault();

		if (newPassword.length < 6) {
			setErrorMessage('Password must be at least 6 characters long.');
			return;
		}

		if (newPassword !== confirmPassword) {
			setErrorMessage('Passwords do not match. Please re-enter.');
			return;
		}


		setIsLoading(true);
		setErrorMessage('');

		try {
			const res = await api.forgotPasswordReset({
				employee_code: employeeCode.trim().toUpperCase(),
				reset_token: resetToken,
				security_answer: securityAnswer.trim(),
				new_password: newPassword,
			});

			if (res && res.success) {
				// Password reset completed! Redirect directly to login page
				if (onSuccess) {
					onSuccess(employeeCode.trim().toUpperCase());
				} else {
					onClose();
				}
			} else {
				setErrorMessage(res.error || 'Failed to reset password. Please try again.');
			}
		} catch (err) {
			setErrorMessage(err.message || 'Password reset request failed. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm font-sans animate-in fade-in duration-150 overflow-y-auto"
			onClick={() => !isLoading && onClose()}
		>
			<div
				className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col relative my-auto overflow-hidden text-slate-800"
				onClick={(e) => e.stopPropagation()}
			>

				{/* Close Button */}
				<button
					type="button"
					onClick={onClose}
					disabled={isLoading}
					className="absolute top-5 right-5 w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
					title="Close"
				>
					<span className="material-symbols-outlined text-[18px]">close</span>
				</button>

				{/* Header Section */}
				<div className="flex items-start gap-3.5 mb-5 pr-8">
					<div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
						<span className="material-symbols-outlined text-[26px]">
							{step === 1 ? 'badge' : step === 2 ? 'quiz' : 'lock_reset'}
						</span>
					</div>
					<div>
						<h2 className="text-[20px] font-extrabold text-slate-900 tracking-tight leading-tight">
							{step === 1 && 'Account Recovery'}
							{step === 2 && 'Security Verification'}
							{step === 3 && 'Create New Password'}
						</h2>
						<p className="text-[12.5px] text-slate-500 mt-0.5 leading-snug">
							{step === 1 && 'Enter your Employee Code / Login ID to begin.'}
							{step === 2 && `Answer your registered security question for ${employeeCode}.`}
							{step === 3 && `Set up a secure new password for employee ${employeeCode}.`}
						</p>
					</div>
				</div>

				{/* 3-Step Breadcrumb Progress Bar */}
				<div className="grid grid-cols-3 gap-2 mb-2">
					<div
						className={`h-1.5 rounded-full transition-all duration-300 ${
							step >= 1 ? 'bg-orange-500' : 'bg-slate-200'
						}`}
					/>
					<div
						className={`h-1.5 rounded-full transition-all duration-300 ${
							step >= 2 ? 'bg-orange-500' : 'bg-slate-200'
						}`}
					/>
					<div
						className={`h-1.5 rounded-full transition-all duration-300 ${
							step >= 3 ? 'bg-orange-500' : 'bg-slate-200'
						}`}
					/>
				</div>

				{/* Step Labels */}
				<div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-5 px-0.5">
					<span className={step === 1 ? 'text-orange-600 font-extrabold' : step > 1 ? 'text-emerald-600' : ''}>
						1. Employee Code
					</span>
					<span className={step === 2 ? 'text-orange-600 font-extrabold' : step > 2 ? 'text-emerald-600' : ''}>
						2. Security Question
					</span>
					<span className={step === 3 ? 'text-orange-600 font-extrabold' : ''}>
						3. Reset Password
					</span>
				</div>

				{/* Error Alert Box */}
				{errorMessage && (
					<div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-semibold flex items-start gap-2.5 animate-in fade-in duration-150">
						<span className="material-symbols-outlined text-[18px] text-rose-500 flex-shrink-0 mt-0.5">
							error
						</span>
						<span className="flex-1 leading-snug">{errorMessage}</span>
					</div>
				)}

				{/* ================================================================= */}
				{/* STEP 1: USER ENTER EMP CODE -> CLICK NEXT                          */}
				{/* ================================================================= */}
				{step === 1 && (
					<form onSubmit={handleStep1Next} className="space-y-4">
						<div>
							<label className="block text-[12px] font-bold text-slate-700 mb-1.5">
								Employee Code / Login ID <span className="text-rose-500">*</span>
							</label>
							<div className="relative">
								<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">
									badge
								</span>
								<input
									type="text"
									value={employeeCode}
									onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
									placeholder="e.g. JC0001 or ADMIN"
									className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13.5px] font-bold font-mono tracking-wide bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
									required
									autoFocus
								/>
							</div>
							<p className="text-[11.5px] text-slate-500 mt-1.5">
								We will look up your registered security credentials for this employee account.
							</p>
						</div>

						{/* Action Buttons: 50% Back to Login & 50% Next */}
						<div className="pt-2 grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={onClose}
								disabled={isLoading}
								className="w-full py-3 px-4 rounded-xl text-[14px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[20px]">arrow_back</span>
								<span>Back to Login</span>
							</button>

							<button
								type="submit"
								disabled={isLoading || !employeeCode.trim()}
								className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 text-white font-bold text-[14px] shadow-md shadow-orange-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? (
									<>
										<span className="material-symbols-outlined text-[20px] animate-spin">
											progress_activity
										</span>
										<span>Checking...</span>
									</>
								) : (
									<>
										<span>Next</span>
										<span className="material-symbols-outlined text-[20px]">arrow_forward</span>
									</>
								)}
							</button>
						</div>
					</form>
				)}

				{/* ================================================================= */}
				{/* STEP 2: DISPLAY SECURITY QUESTION WITH ANSWER FIELD               */}
				{/* ================================================================= */}
				{step === 2 && (
					<form onSubmit={handleStep2Verify} className="space-y-4">
						{/* Employee Info Pill */}
						<div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[12px]">
							<div className="flex items-center gap-2 text-slate-700 font-medium">
								<span className="material-symbols-outlined text-orange-500 text-[18px]">badge</span>
								<span>
									Employee: <span className="font-bold text-slate-900 font-mono">{employeeCode}</span>
									{userName && userName !== employeeCode && (
										<span className="text-slate-500 ml-1.5">({userName})</span>
									)}
								</span>
							</div>
							<span className="text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
								Step 2 of 3
							</span>
						</div>

						{/* Registered Security Question Display Card */}
						<div className="p-3.5 rounded-2xl bg-gradient-to-br from-orange-50/70 to-amber-50/50 border border-orange-200/80 shadow-xs">
							<div className="flex items-start gap-3">
								<div className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center flex-shrink-0 mt-0.5">
									<span className="material-symbols-outlined text-[19px]">quiz</span>
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-[11px] font-bold uppercase tracking-wider text-orange-800">
										Your Registered Security Question
									</div>
									<div className="text-[14px] text-slate-900 font-bold mt-1 leading-snug">
										{securityQuestion}
									</div>
								</div>
							</div>
						</div>

						{/* Security Answer Input */}
						<div>
							<div className="flex items-center justify-between mb-1.5">
								<label className="block text-[12px] font-bold text-slate-700">
									Security Answer <span className="text-rose-500">*</span>
								</label>
								<button
									type="button"
									onClick={() => setShowAnswer((p) => !p)}
									className="text-[11.5px] font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
								>
									{showAnswer ? 'Hide answer' : 'Show answer'}
								</button>
							</div>
							<div className="relative">
								<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px] pointer-events-none">
									key
								</span>
								<input
									type={showAnswer ? 'text' : 'password'}
									value={securityAnswer}
									onChange={(e) => setSecurityAnswer(e.target.value)}
									placeholder="Enter your confidential answer"
									className="w-full pl-10 pr-10 py-2.5 rounded-xl text-[13px] font-medium bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
									required
									autoFocus
								/>
							</div>
							<p className="text-[11px] text-slate-500 mt-1">
								Answers are verified case-insensitively.
							</p>
						</div>

						{/* Action Buttons: 50% Back to Step 1 & 50% Verify Answer */}
						<div className="pt-2 grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => {
									setStep(1);
									setErrorMessage('');
								}}
								disabled={isLoading}
								className="w-full py-3 px-4 rounded-xl text-[14px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[20px]">arrow_back</span>
								<span>Back</span>
							</button>

							<button
								type="submit"
								disabled={isLoading || !securityAnswer.trim()}
								className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 text-white font-bold text-[14px] shadow-md shadow-orange-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? (
									<>
										<span className="material-symbols-outlined text-[20px] animate-spin">
											progress_activity
										</span>
										<span>Verifying...</span>
									</>
								) : (
									<>
										<span>Verify Answer</span>
										<span className="material-symbols-outlined text-[20px]">arrow_forward</span>
									</>
								)}
							</button>
						</div>
					</form>
				)}

				{/* ================================================================= */}
				{/* STEP 3: USER ENTER NEW PASSWORD -> RESET -> LOGIN PAGE            */}
				{/* ================================================================= */}
				{step === 3 && (
					<form onSubmit={handleStep3Reset} className="space-y-4">
						{/* Verified User Banner */}
						<div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[12px]">
							<div className="flex items-center gap-2 text-emerald-800 font-semibold">
								<span className="material-symbols-outlined text-emerald-600 text-[18px]">
									verified
								</span>
								<span>
									Identity Verified: <span className="font-bold text-slate-900 font-mono">{employeeCode}</span>
								</span>
							</div>
							<span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">Step 3 of 3</span>
						</div>

						{/* New Password Input */}
						<div>
							<label className="block text-[12px] font-bold text-slate-700 mb-1.5">
								New Password <span className="text-rose-500">*</span>
							</label>
							<div className="relative">
								<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px] pointer-events-none">
									lock
								</span>
								<input
									type={showNewPassword ? 'text' : 'password'}
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									placeholder="Enter strong new password"
									className="w-full pl-10 pr-10 py-2.5 rounded-xl text-[13px] font-medium bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
									required
									autoFocus
								/>
								<button
									type="button"
									onClick={() => setShowNewPassword((p) => !p)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
									tabIndex={-1}
								>
									<span className="material-symbols-outlined text-[19px]">
										{showNewPassword ? 'visibility_off' : 'visibility'}
									</span>
								</button>
							</div>
							<p className="text-[11px] text-slate-500 mt-1">
								Must be at least 6 characters long.
							</p>
						</div>

						{/* Confirm New Password Input */}
						<div>
							<label className="block text-[12px] font-bold text-slate-700 mb-1.5">
								Confirm New Password <span className="text-rose-500">*</span>
							</label>
							<div className="relative">
								<span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px] pointer-events-none">
									lock_reset
								</span>
								<input
									type={showConfirmPassword ? 'text' : 'password'}
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="Confirm new password"
									className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-[13px] font-medium bg-slate-50 border text-slate-900 placeholder:text-slate-400 focus:bg-white outline-none transition-all ${
										isPasswordMismatch
											? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
											: isPasswordMatch && isPasswordLengthValid
											? 'border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
											: 'border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
									}`}
									required
								/>
								<button
									type="button"
									onClick={() => setShowConfirmPassword((p) => !p)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
									tabIndex={-1}
								>
									<span className="material-symbols-outlined text-[19px]">
										{showConfirmPassword ? 'visibility_off' : 'visibility'}
									</span>
								</button>
							</div>
							{confirmPassword.length > 0 && (
								<p
									className={`text-[11px] mt-1 font-medium ${
										isPasswordMatch
											? 'text-emerald-600'
											: 'text-rose-600'
									}`}
								>
									{isPasswordMatch
										? 'Passwords match'
										: 'Passwords do not match'}
								</p>
							)}
						</div>

						{/* Action Buttons: 50% Back to Step 2 & 50% Reset Password */}
						<div className="pt-2 grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => {
									setStep(2);
									setErrorMessage('');
								}}
								disabled={isLoading}
								className="w-full py-3 px-4 rounded-xl text-[14px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[20px]">arrow_back</span>
								<span>Back</span>
							</button>

							<button
								type="submit"
								disabled={isLoading || !isFormValid}
								className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 text-white font-bold text-[14px] shadow-md shadow-orange-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? (
									<>
										<span className="material-symbols-outlined text-[20px] animate-spin">
											progress_activity
										</span>
										<span>Resetting...</span>
									</>
								) : (
									<>
										<span className="material-symbols-outlined text-[20px]">lock_reset</span>
										<span>Reset Password</span>
									</>
								)}
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
