/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Bank ledger reconciliation component for file upload, column mapping, and discrepancy analysis.
*/

import React, { useState, useRef } from 'react';
import api from '../services/api';

export default function Matchup({ searchQuery = '' }) {
	const [uploadedFiles, setUploadedFiles] = useState([]); // Array of up to 2 files
	const file1 = uploadedFiles[0] || null;
	const file2 = uploadedFiles[1] || null;

	const [matchKey, setMatchKey] = useState('');
	const [tolerance, setTolerance] = useState('0.01');

	const [paymentNoStart, setPaymentNoStart] = useState('1');
	const [receiptNoStart, setReceiptNoStart] = useState('1');

	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState(null);
	const [successFeedback, setSuccessFeedback] = useState(null);


	const fileInputRef = useRef(null);
	const [isDragOver, setIsDragOver] = useState(false);

	// Format file size
	const formatFileSize = (bytes) => {
		if (!bytes) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	};


	// Handle adding files (supports 1 or 2 files at a time)
	const handleFilesAdded = (newFileList) => {
		setErrorMessage(null);
		setSuccessFeedback(null);
		if (!newFileList || newFileList.length === 0) return;

		const validExtensions = ['.xlsx', '.xls', '.csv', '.tsv', '.txt'];
		const validAdded = [];

		for (let i = 0; i < newFileList.length; i++) {
			const f = newFileList[i];
			const name = f.name.toLowerCase();
			const isValid = validExtensions.some((ext) => name.endsWith(ext));
			if (!isValid) {
				setErrorMessage(`Invalid format for "${f.name}". Please upload Excel (.xlsx, .xls) or CSV files.`);
				return;
			}
			validAdded.push(f);
		}

		setUploadedFiles((prev) => {
			const combined = [...prev, ...validAdded].slice(0, 2);
			return combined;
		});

		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	// Remove single file
	const handleRemoveFile = (indexToRemove) => {
		setUploadedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
		setErrorMessage(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	// Clear all files
	const handleClearAllFiles = () => {
		setUploadedFiles([]);
		setPaymentNoStart('1');
		setReceiptNoStart('1');
		setErrorMessage(null);
		setSuccessFeedback(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	// Helper to check if filename corresponds to All Cloud File (Day Book report)
	const isCloudFileName = (name) => {
		if (!name) return false;
		const norm = name.toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
		return norm.includes('day book report') || norm.includes('daybook report') || norm.includes('day book');
	};

	// Determine file roles
	const getFileRole = (file, allFiles) => {
		if (!file) return { label: 'File', isCloud: false, isBank: false };
		if (isCloudFileName(file.name)) {
			return {
				label: 'All Cloud File',
				sublabel: "Identified from 'Day Book Report' in filename",
				isCloud: true,
				isBank: false
			};
		}
		if (allFiles.length === 2) {
			const other = allFiles.find((f) => f !== file);
			if (other && isCloudFileName(other.name)) {
				return {
					label: 'Bank Statement',
					sublabel: 'Auto-cleaned: Header (Sl.No) & Footer (Closing Balance)',
					isCloud: false,
					isBank: true
				};
			}
		}
		return {
			label: `File ${allFiles.indexOf(file) + 1}`,
			sublabel: 'Auto-classified before reconciliation',
			isCloud: false,
			isBank: false
		};
	};

	// Trigger reconciliation & Download Excel
	const handleCompareAndDownload = async () => {
		if (uploadedFiles.length < 2) {
			setErrorMessage('Please upload 2 files (Bank Statement and All Cloud File) before comparing.');
			return;
		}

		if (!paymentNoStart.trim()) {
			setErrorMessage('Please specify what Payment No starts with (e.g. 1).');
			return;
		}

		if (!receiptNoStart.trim()) {
			setErrorMessage('Please specify what Receipt No starts with (e.g. 1).');
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);
		setSuccessFeedback(null);

		try {
			// Decide Bank Statement vs All Cloud File:
			// If filename contains 'day book report', it's All Cloud File and the other is Bank Statement
			let bankFile = uploadedFiles[0];
			let cloudFile = uploadedFiles[1];

			if (isCloudFileName(uploadedFiles[0].name) && !isCloudFileName(uploadedFiles[1].name)) {
				cloudFile = uploadedFiles[0];
				bankFile = uploadedFiles[1];
			} else if (isCloudFileName(uploadedFiles[1].name) && !isCloudFileName(uploadedFiles[0].name)) {
				cloudFile = uploadedFiles[1];
				bankFile = uploadedFiles[0];
			}

			const formData = new FormData();
			formData.append('files', bankFile);
			formData.append('files', cloudFile);
			formData.append('file1', bankFile);
			formData.append('file2', cloudFile);
			formData.append('bank_file', bankFile);
			formData.append('cloud_file', cloudFile);
			formData.append('payment_no_start', paymentNoStart.trim());
			formData.append('receipt_no_start', receiptNoStart.trim());
			if (matchKey.trim()) {
				formData.append('match_key', matchKey.trim());
			}
			formData.append('tolerance', tolerance);

			// Call backend to compare files and download the generated Excel workbook
			const { blob } = await api.compareMatchup(formData);

			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = downloadUrl;
			link.download = 'Matched_Cheques.xlsx';
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(downloadUrl);

			setSuccessFeedback('Comparison completed! Downloaded Matched_Cheques.xlsx (Payment & Receipt sheets) successfully.');

			// Refresh page after download
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		} catch (err) {
			setErrorMessage(err.message || 'An error occurred during comparison. Please verify your file formats.');
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="flex flex-col gap-6 font-sans">
			{/* Header Strip */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<span className="material-symbols-outlined text-[24px]">compare_arrows</span>
						</div>
						<div>
							<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
								Matchup
							</h1>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Upload statement and all cloud file to automatically identify matches, variances, and export an Excel report
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Error / Success Notifications */}
			{errorMessage && (
				<div className="bg-rose-50 text-rose-800 p-3 rounded-2xl border border-rose-200/80 flex items-center justify-between gap-3 text-xs font-semibold animate-fadeIn">
					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-[20px] text-rose-600">error</span>
						<span>{errorMessage}</span>
					</div>
					<button
						type="button"
						onClick={() => setErrorMessage(null)}
						className="w-8 h-8 flex items-center justify-center hover:bg-rose-100 rounded-lg text-rose-600"
					>
						<span className="material-symbols-outlined text-[16px]">close</span>
					</button>
				</div>
			)}

			{successFeedback && (
				<div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-200/80 flex items-center justify-between gap-3 text-xs font-semibold animate-fadeIn">
					<div className="flex items-center gap-2">
						<span className="material-symbols-outlined text-[20px] text-emerald-600">check_circle</span>
						<span>{successFeedback}</span>
					</div>
					<button
						type="button"
						onClick={() => setSuccessFeedback(null)}
						className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-600"
					>
						<span className="material-symbols-outlined text-[16px]">close</span>
					</button>
				</div>
			)}

			{/* Main Upload Card (Single Upload Area) */}
			<div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm ring-1 ring-slate-200/80">
				{/* Unified Dropzone */}
				<div className="flex flex-col">
					<div className="flex items-center justify-between mb-3">
						<label className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
							<span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
							<span>Upload Files (Select 2 Files)</span>
							<span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
								{uploadedFiles.length} of 2 uploaded
							</span>
						</label>
						<span className="text-[11px] font-semibold text-slate-400">
							.xlsx, .xls, .csv
						</span>
					</div>

					{/* Hidden Unified File Input */}
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept=".xlsx,.xls,.csv,.tsv,.txt"
						className="hidden"
						onChange={(e) => {
							if (e.target.files && e.target.files.length > 0) {
								handleFilesAdded(e.target.files);
							}
						}}
					/>

					{/* Single Dropzone Box */}
					{uploadedFiles.length < 2 && (
						<div
							onDragOver={(e) => {
								e.preventDefault();
								setIsDragOver(true);
							}}
							onDragLeave={() => setIsDragOver(false)}
							onDrop={(e) => {
								e.preventDefault();
								setIsDragOver(false);
								if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
									handleFilesAdded(e.dataTransfer.files);
								}
							}}
							onClick={() => fileInputRef.current?.click()}
							className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 min-h-[190px] ${
								isDragOver
									? 'bg-orange-50/70 border-primary shadow-inner scale-[0.99]'
									: 'bg-slate-50/70 border-slate-200 hover:border-primary/50 hover:bg-orange-50/20'
							}`}
						>
							<div className="w-14 h-14 rounded-2xl bg-white text-primary border border-slate-200 flex items-center justify-center mb-3 shadow-xs transition-transform group-hover:scale-105">
								<span className="material-symbols-outlined text-[32px]">upload_file</span>
							</div>

							{uploadedFiles.length === 0 ? (
								<>
									<div className="font-extrabold text-[15px] text-slate-800 text-center">
										Drag &amp; drop both files here, or <span className="text-primary underline">browse</span>
									</div>
									<p className="text-[12px] text-slate-500 mt-1 max-w-[440px] text-center">
										Upload your Bank Statement and All Cloud File (.xlsx, .xls, .csv).
									</p>
								</>
							) : (
								<>
									<div className="font-extrabold text-[15px] text-slate-800 text-center">
										1 file added! Now drop or <span className="text-primary underline">browse</span> your 2nd file
									</div>
									<p className="text-[12px] text-slate-500 mt-1 text-center">
										Add the remaining file to unlock matchup comparison.
									</p>
								</>
							)}

							<div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
								<span className="material-symbols-outlined text-[14px]">auto_awesome</span>
								<span>Automatic Bank Statement vs Cloud File detection</span>
							</div>
						</div>
					)}

					{/* Uploaded Files Cards View */}
					{uploadedFiles.length > 0 && (
						<div className={`grid grid-cols-1 ${uploadedFiles.length === 2 ? 'sm:grid-cols-2' : ''} gap-4 ${uploadedFiles.length < 2 ? 'mt-4' : ''}`}>
							{uploadedFiles.map((f, idx) => {
								const role = getFileRole(f, uploadedFiles);
								const iconName = role.isBank ? 'account_balance' : role.isCloud ? 'cloud_sync' : (idx === 0 ? 'description' : 'fact_check');
								const iconBg = role.isBank ? 'bg-blue-100 text-blue-700' : role.isCloud ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-primary';
								const badgeBg = role.isBank ? 'bg-blue-100/90 text-blue-800' : role.isCloud ? 'bg-amber-100/90 text-amber-800' : 'bg-orange-100/70 text-primary';

								return (
									<div
										key={idx}
										className="relative flex items-center justify-between p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 shadow-2xs group hover:bg-white hover:border-primary/40 transition-all"
									>
										<div className="flex items-center gap-3 min-w-0 pr-3">
											<div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-xs`}>
												<span className="material-symbols-outlined text-[22px]">
													{iconName}
												</span>
											</div>
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span className={`text-[9px] font-extrabold uppercase tracking-wider ${badgeBg} px-2 rounded-md`}>
														{role.label}
													</span>
													<span className="text-[10px] text-slate-400 font-medium">
														{formatFileSize(f.size)}
													</span>
												</div>
												<div className="font-bold text-[13px] text-slate-900 truncate mt-0.5" title={f.name}>
													{f.name}
												</div>
											</div>
										</div>

										<button
											type="button"
											onClick={() => handleRemoveFile(idx)}
											title="Remove file"
											className="w-8 h-8 flex items-center justify-center hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors shrink-0"
										>
											<span className="material-symbols-outlined text-[18px]">close</span>
										</button>
									</div>
								);
							})}

							{/* If 2 files uploaded, show an auto-detect confirmation strip */}
							{uploadedFiles.length === 2 && (() => {
								const cloud = uploadedFiles.find((f) => isCloudFileName(f.name));
								const bank = cloud ? uploadedFiles.find((f) => f !== cloud) : null;
								return (
									<div className="sm:col-span-2 flex items-center justify-between p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-[12px] text-emerald-800">
										<div className="flex items-center gap-2 font-medium">
											<span className="material-symbols-outlined text-emerald-600 text-[18px]">auto_awesome</span>
											<span>
												{bank && cloud ? (
													<>
														<strong>Bank Statement:</strong> {bank.name} • <strong>All Cloud File:</strong> {cloud.name}.
													</>
												) : (
													<>Both files uploaded! Backend will auto-classify Bank Statement and Cloud File before matching.</>
												)}
											</span>
										</div>
										<button
											type="button"
											onClick={handleClearAllFiles}
											className="text-[11px] font-bold text-slate-500 hover:text-rose-600 underline transition-colors shrink-0 ml-2"
										>
											Reset Files
										</button>
									</div>
								);
							})()}
						</div>
					)}
				</div>

				{/* Voucher Numbering Configuration (Payment No and Receipt No starting numbers) */}
				{uploadedFiles.length === 2 && (
					<div className="mt-5 p-5 bg-gradient-to-r from-slate-50 to-orange-50/30 rounded-2xl border border-slate-200/90 shadow-2xs animate-fadeIn">
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
							<div className="flex items-center gap-2.5">
								<div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
									<span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
								</div>
								<div>
									<h3 className="text-[13px] font-extrabold text-slate-800">
										Voucher Starting Numbers
									</h3>
									<p className="text-[11px] text-slate-500">
										Configure what number the Payment No and Receipt No should start from in the output Excel
									</p>
								</div>
							</div>
							<span className="self-start sm:self-auto text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
								Output Numbering
							</span>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
							{/* Payment No starts with */}
							<div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
								<label className="block text-[12px] font-bold text-slate-800 mb-1 flex items-center justify-between">
									<span className="flex items-center gap-1.5">
										<span className="w-2 h-2 rounded-full bg-blue-500"></span>
										<span>Payment No starts with</span>
									</span>
									<span className="text-[10px] text-slate-400 font-medium">Payment sheet</span>
								</label>
								<input
									type="text"
									value={paymentNoStart}
									onChange={(e) => {
										setPaymentNoStart(e.target.value);
										setErrorMessage(null);
									}}
									placeholder="e.g. 1 or 1001"
									className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-900 focus:bg-white focus:outline-none transition-colors"
								/>
								<p className="text-[10px] text-slate-400 mt-1">
									First row on Payment sheet will start with this number and increment by 1.
								</p>
							</div>

							{/* Receipt No starts with */}
							<div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
								<label className="block text-[12px] font-bold text-slate-800 mb-1 flex items-center justify-between">
									<span className="flex items-center gap-1.5">
										<span className="w-2 h-2 rounded-full bg-emerald-500"></span>
										<span>Receipt No starts with</span>
									</span>
									<span className="text-[10px] text-slate-400 font-medium">Receipt sheet</span>
								</label>
								<input
									type="text"
									value={receiptNoStart}
									onChange={(e) => {
										setReceiptNoStart(e.target.value);
										setErrorMessage(null);
									}}
									placeholder="e.g. 1 or 1001"
									className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-900 focus:bg-white focus:outline-none transition-colors"
								/>
								<p className="text-[10px] text-slate-400 mt-1">
									First row on Receipt sheet will start with this number and increment by 1.
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Primary Comparison Action Button */}
				<div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
					<div className="text-[12px] text-slate-500 font-medium">
						{uploadedFiles.length === 2 ? (
							<span className="text-emerald-600 font-semibold flex items-center gap-1.5">
								<span className="w-2 h-2 rounded-full bg-emerald-500"></span>
								Ready to compare and generate Matched_Cheques.xlsx
							</span>
						) : (
							<span>Please upload {2 - uploadedFiles.length} more file to begin comparison</span>
						)}
					</div>

					<button
						type="button"
						onClick={handleCompareAndDownload}
						disabled={uploadedFiles.length < 2 || isProcessing}
						className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/95 text-white font-extrabold text-[14px] rounded-2xl shadow-md shadow-primary/20 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isProcessing ? (
							<>
								<span className="material-symbols-outlined text-[20px] animate-spin">
									progress_activity
								</span>
								<span>Comparing &amp; Generating Excel...</span>
							</>
						) : (
							<>
								<span className="material-symbols-outlined text-[20px]">
									compare_arrows
								</span>
								<span>Compare Files</span>
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
