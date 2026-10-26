/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Excel (.xlsx) export utility for joint loans, account allocations, and repayment schedules with borders and acronyms.
*/

import _XLSX from 'xlsx-js-style';
const XLSX = _XLSX.default || _XLSX;

// Helper to format share percent
export const formatSharePercent = (val) => {
	if (val === null || val === undefined || val === '') return '0';
	const num = Number(val);
	if (isNaN(num)) return '0';
	const rounded = Math.round(num * 100) / 100;
	return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(2);
};

// Clean string for filename
export const sanitizeForFilename = (str) => {
	return String(str || '')
		.trim()
		.toLowerCase()
		.replace(/[\s/\\?%*:|"<>]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toUpperCase();
};

// Helper to extract account acronym
export const getAccountAcronym = (acc) => {
	if (!acc) return '';
	if (typeof acc === 'string') return acc.trim();
	const tag = acc.accountTag || acc.acronym || acc.tag || acc.initials;
	if (tag && String(tag).trim()) return String(tag).trim();
	const accName = acc.accountName || acc.name;
	if (accName) {
		const words = String(accName).trim().split(/\s+/);
		if (words.length > 1) {
			return words.map((w) => w[0]).join('').slice(0, 5).toUpperCase();
		}
		return String(accName).slice(0, 4).toUpperCase();
	}
	return 'ACC';
};

/**
 * Export a joint loan's details, account allocations, and repayment schedule to an Excel file (.xlsx)
 * Output filename format: clientname_loanid_schedule.xlsx
 *
 * @param {Object} loan - The joint loan object
 * @param {Array} accounts - List of account objects (primary & secondary)
 * @param {Array} repaymentSchedule - List of installment repayment schedule objects
 * @returns {string} The generated filename
 */
export function exportJointLoanToExcel(loan, accounts = [], repaymentSchedule = []) {
	if (!loan) return null;

	const clientName = loan.client_account_name || loan.clientName || loan.primaryBorrower?.name || loan.client || 'Client';
	const loanId = loan.loan_ref_id || loan.id || 'Loan';
	const loanDate = loan.loan_date || loan.appliedDate || loan.date || '-';

	// 1. Resolve Accounts & Acronyms
	const effectiveAccounts = Array.isArray(accounts) && accounts.length > 0 ? accounts : [];
	const primaryAcc = effectiveAccounts.find((a) => a.isPrimary) || effectiveAccounts[0] || {
		accountName: loan.primary_account_name || loan.primaryAccountName || 'Primary Account',
		accountTag: loan.primary || 'PRI',
		principal: Number(loan.primary_account_amount) || Number(loan.amount) || 0,
		share: Number(loan.primaryShare ?? loan.primary_account_share ?? 70),
		repayAmount: 0,
	};
	const secondaryAccounts = effectiveAccounts.filter((a) => !a.isPrimary);

	const primaryTag = getAccountAcronym(primaryAcc) || 'PRI';

	// 2. Resolve Repayment Schedule
	const scheduleList = Array.isArray(repaymentSchedule) && repaymentSchedule.length > 0 ? repaymentSchedule : [];
	const scheduleTotalAmount = scheduleList.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

	const totalPrincipal = effectiveAccounts.reduce((sum, a) => sum + (Number(a.principal) || 0), 0) || Number(loan.amount || loan.loan_amount) || 0;
	const totalRepayAmount = scheduleTotalAmount > 0
		? scheduleTotalAmount
		: (effectiveAccounts.reduce((sum, a) => sum + (Number(a.repayAmount) || 0), 0) || Number(loan.total_repayment_amount || loan.amount) || 0);

	// Track row categories and cell merges for styling
	const rows = [];
	const rowStyles = {}; // rowIndex -> 'meta' | 'secHeader' | 'tblHeader' | 'accData' | 'schedData' | 'total'
	const merges = [];

	const addRow = (row, styleKey) => {
		rows.push(row);
		if (styleKey) {
			rowStyles[rows.length - 1] = styleKey;
		}
	};

	// Metadata Block: Client Name, Loan ID, Loan Date, Total Repayment
	addRow(['Client Name', clientName, 'Loan ID', loanId], 'meta');
	addRow(['Loan Date', loanDate, 'Total Repayment', totalRepayAmount], 'meta');

	// Blank Separator
	addRow([]);

	// Account Details Block Section Title (merged across 4 columns)
	const accHeaderRowIdx = rows.length;
	addRow(['ACCOUNT DETAILS', '', '', ''], 'secHeader');
	merges.push({ s: { r: accHeaderRowIdx, c: 0 }, e: { r: accHeaderRowIdx, c: 3 } });

	// Account Details Table Headers
	addRow(['Account', 'Principal', 'Share %', 'Repayment'], 'tblHeader');

	// Account Details Data Rows
	effectiveAccounts.forEach((acc) => {
		const accTag = getAccountAcronym(acc) || acc.accountName || 'ACC';
		const p = Number(acc.principal) || 0;
		const s = (totalPrincipal > 0 && p > 0)
			? formatSharePercent((p / totalPrincipal) * 100)
			: (acc.share != null ? formatSharePercent(acc.share) : '0');
		const r = Number(acc.repayAmount) || 0;
		addRow([`${accTag}`, p, `${s}%`, r], 'accData');
	});

	// Account Details Total Row
	addRow(['Total', totalPrincipal, '100%', totalRepayAmount], 'total');

	// Blank Separator
	addRow([]);

	// Repayment Schedule Headers (S.No, Date, Amount, Recd Date, Primary Tag, Payout Date, Secondary Tags with TDS)
	const schedHeaders = ['S.No', 'Date', 'Amount', 'Recd Date', primaryTag, 'Payout Date'];
	secondaryAccounts.forEach((sa) => {
		const saTag = getAccountAcronym(sa) || 'SEC';
		schedHeaders.push(saTag);
		schedHeaders.push(`${saTag} TDS`);
	});

	// Repayment Schedule Block Section Title (merged across table width)
	const schedHeaderRowIdx = rows.length;
	const schedSecRow = new Array(schedHeaders.length).fill('');
	schedSecRow[0] = 'REPAYMENT SCHEDULE';
	addRow(schedSecRow, 'secHeader');
	merges.push({ s: { r: schedHeaderRowIdx, c: 0 }, e: { r: schedHeaderRowIdx, c: schedHeaders.length - 1 } });

	// Repayment Schedule Table Headers
	addRow(schedHeaders, 'tblHeader');

	// Accumulators for Schedule Total Row
	let sumAmount = 0;
	let sumPriAmount = 0;
	const sumSecAmounts = secondaryAccounts.map(() => 0);
	const sumSecTds = secondaryAccounts.map(() => 0);

	// Flatten schedule rows, including sub-installments for partial payments if any
	const flattenedRows = [];
	scheduleList.forEach((inst, instIdx) => {
		const isFirstInstallment = (instIdx === 0 || inst.sNo === 1 || String(inst.sNo).trim() === '1');
		if (inst.isPartial && Array.isArray(inst.subInstallments) && inst.subInstallments.length > 0) {
			inst.subInstallments.forEach((sub, subIdx) => {
				flattenedRows.push({
					sNo: sub.sNo || `${inst.sNo}`,
					isFirstEmi: isFirstInstallment,
					date: sub.date || inst.date || '-',
					amount: Number(sub.amount) || 0,
					receivedDate: sub.receivedDate || '-',
					primaryAmount: Number(sub.primaryAmount) || 0,
					payoutDate: (sub.dueDate && sub.dueDate !== '-') ? sub.dueDate : (sub.paymentDate || '-'),
					secAccounts: sub.secAccounts || [],
					secAmount: Number(sub.secAmount) || 0,
					tds: Number(sub.tds) || 0,
				});
			});
		} else {
			flattenedRows.push({
				sNo: inst.sNo,
				isFirstEmi: isFirstInstallment,
				date: inst.date || '-',
				amount: Number(inst.amount) || 0,
				receivedDate: inst.receivedDate || '-',
				primaryAmount: Number(inst.primaryAmount) || 0,
				payoutDate: (inst.dueDate && inst.dueDate !== '-') ? inst.dueDate : (inst.paymentDate || '-'),
				secAccounts: inst.secAccounts || [],
				secAmount: Number(inst.secAmount) || 0,
				tds: Number(inst.tds) || 0,
			});
		}
	});

	flattenedRows.forEach((rowItem, rIdx) => {
		sumAmount += rowItem.amount;
		sumPriAmount += rowItem.primaryAmount;

		const isFirstEmi = Boolean(rowItem.isFirstEmi ?? (rIdx === 0));

		const row = [
			rowItem.sNo,
			rowItem.date,
			rowItem.amount,
			rowItem.receivedDate,
			rowItem.primaryAmount,
			rowItem.payoutDate,
		];

		secondaryAccounts.forEach((sa, idx) => {
			const saItem = rowItem.secAccounts?.[idx] || {};
			const amt = Number(saItem.amount ?? (idx === 0 ? rowItem.secAmount : 0)) || 0;
			const rawTds = Number(saItem.tds ?? (idx === 0 ? rowItem.tds : 0)) || 0;
			const tds = isFirstEmi ? rawTds : 0;
			sumSecAmounts[idx] += amt;
			sumSecTds[idx] += tds;
			row.push(amt);
			row.push(isFirstEmi ? tds : '');
		});

		addRow(row, 'schedData');
	});

	// Schedule Summary Total Row
	const scheduleTotalRow = ['Total', '', sumAmount, '', sumPriAmount, ''];
	secondaryAccounts.forEach((sa, idx) => {
		scheduleTotalRow.push(sumSecAmounts[idx]);
		scheduleTotalRow.push(sumSecTds[idx]);
	});
	addRow(scheduleTotalRow, 'total');

	// Schedule Grand Total Row (Secondary Amount + TDS)
	const grandTotalRowIdx = rows.length;
	const scheduleGrandTotalRow = ['Grand Total', '', sumAmount, '', sumPriAmount, ''];
	secondaryAccounts.forEach((sa, idx) => {
		const grandSecAmount = sumSecAmounts[idx] + sumSecTds[idx];
		scheduleGrandTotalRow.push(grandSecAmount);
		scheduleGrandTotalRow.push('');
		const secColIdx = 6 + idx * 2;
		merges.push({ s: { r: grandTotalRowIdx, c: secColIdx }, e: { r: grandTotalRowIdx, c: secColIdx + 1 } });
	});
	addRow(scheduleGrandTotalRow, 'grandTotal');

	// Convert Array of Arrays to Sheet
	const ws = XLSX.utils.aoa_to_sheet(rows);
	if (merges.length > 0) {
		ws['!merges'] = merges;
	}

	// 1px Solid Border Definition (OpenXML 'thin' represents standard 1px border)
	const border1px = {
		top: { style: 'thin', color: { rgb: '000000' } },
		bottom: { style: 'thin', color: { rgb: '000000' } },
		left: { style: 'thin', color: { rgb: '000000' } },
		right: { style: 'thin', color: { rgb: '000000' } },
	};

	// Apply Styling & Borders across all generated cells
	for (let r = 0; r < rows.length; r++) {
		const rowData = rows[r];
		if (!rowData || rowData.length === 0) continue;
		const rowType = rowStyles[r];

		for (let c = 0; c < rowData.length; c++) {
			const cellAddr = XLSX.utils.encode_cell({ r, c });
			if (!ws[cellAddr]) {
				ws[cellAddr] = { t: 's', v: '' };
			}
			const cell = ws[cellAddr];
			const isNumeric = cell.t === 'n';

			if (rowType === 'title') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 12 },
					alignment: { horizontal: 'left', vertical: 'center' },
				};
			} else if (rowType === 'secHeader') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 11 },
					fill: { fgColor: { rgb: 'B8CCE4' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
			} else if (rowType === 'meta') {
				const isLabel = c === 0 || c === 2;
				cell.s = {
					font: { bold: isLabel, color: { rgb: isLabel ? '475569' : '0F172A' }, sz: 10 },
					fill: isLabel ? { fgColor: { rgb: 'F8FAFC' } } : undefined,
					border: { ...border1px },
					alignment: { horizontal: isNumeric ? 'right' : 'left', vertical: 'center' },
				};
				if (isNumeric) cell.z = '#,##0';
			} else if (rowType === 'tblHeader') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10 },
					fill: { fgColor: { rgb: 'B8CCE4' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
			} else if (rowType === 'accData') {
				cell.s = {
					font: { color: { rgb: '0F172A' }, sz: 10 },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
				if (isNumeric) cell.z = '#,##0';
			} else if (rowType === 'schedData') {
				cell.s = {
					font: { color: { rgb: '0F172A' }, sz: 10 },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
				if (isNumeric && c !== 0) cell.z = '#,##0';
			} else if (rowType === 'total' || rowType === 'grandTotal') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10 },
					fill: { fgColor: { rgb: rowType === 'grandTotal' ? 'C4D79B' : 'D8E4BC' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
				if (isNumeric) cell.z = '#,##0';
			}
		}
	}

	// Set column widths
	const cols = [
		{ wch: 12 }, // Col A: S.No / Account Acronym / Labels
		{ wch: 18 }, // Col B: Date / Principal / Values
		{ wch: 20 }, // Col C: Amount / Share % / Loan ID Label
		{ wch: 16 }, // Col D: Recd Date / Repayment / Total Repayment Value
		{ wch: 16 }, // Col E: Primary Acronym (e.g. SS)
		{ wch: 16 }, // Col F: Payout Date
	];
	secondaryAccounts.forEach(() => {
		cols.push({ wch: 16 }); // Secondary Acronym (e.g. SCS)
		cols.push({ wch: 16 }); // Secondary TDS (e.g. SCS TDS)
	});
	ws['!cols'] = cols;

	// Create Workbook and append worksheet
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

	// Construct filename: clientname_loanid_schedule.xlsx
	const safeClient = sanitizeForFilename(clientName);
	const safeLoanId = sanitizeForFilename(loanId);
	const filename = `${safeClient}_${safeLoanId}_SCHEDULE.xlsx`;

	// Trigger browser download in .xlsx format
	XLSX.writeFile(wb, filename);
	return filename;
}

/**
 * Export a list of joint loans to an Excel file (.xlsx)
 * Output filename format: JOINT_LOANS_PORTFOLIO_YYYY-MM-DD.xlsx
 *
 * @param {Array} loansList - List of joint loan objects
 * @returns {string} The generated filename
 */
export function exportJointLoansListToExcel(loansList = []) {
	if (!Array.isArray(loansList) || loansList.length === 0) return null;

	const border1px = {
		top: { style: 'thin', color: { rgb: '000000' } },
		bottom: { style: 'thin', color: { rgb: '000000' } },
		left: { style: 'thin', color: { rgb: '000000' } },
		right: { style: 'thin', color: { rgb: '000000' } },
	};

	const rows = [];
	const rowStyles = [];

	const addRow = (rowCells, styleType = 'data') => {
		rows.push(rowCells);
		rowStyles.push(styleType);
	};

	// 1. Title Row
	addRow(['JOINT LOANS PORTFOLIO REPORT'], 'title');
	// 2. Subtitle / Metadata Row
	const now = new Date();
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	addRow([`Generated on: ${dateStr} | Total Facilities: ${loansList.length}`], 'meta');
	addRow([], 'empty');

	// 3. Table Headers
	const headers = [
		'#',
		'Loan ID',
		'Loan Date',
		'Client Name',
		'Primary Partner',
		'Primary Share %',
		'Secondary Partner(s)',
		'Sanctioned Amount',
		'Total Repayment',
		'Status',
	];
	addRow(headers, 'tblHeader');

	let grandSanctioned = 0;
	let grandRepay = 0;

	// 4. Data Rows
	loansList.forEach((loan, idx) => {
		const sNo = idx + 1;
		const loanId = loan.loan_ref_id || loan.id || '-';
		const loanDate = loan.loan_date || loan.appliedDate || loan.loanDate || loan.date || loan.applied_date || '-';
		const clientName = loan.client_account_name || loan.primaryBorrower?.name || loan.clientName || 'Client';
		const primaryTag = loan.primary || loan.primary_account_name || (loan.primaryAccountName ? loan.primaryAccountName.slice(0, 4).toUpperCase() : 'PRI');
		const priShareVal = loan.primaryShare ?? loan.primary_account_share ?? 60;
		const priShareFormatted = `${formatSharePercent(priShareVal)}%`;

		const secList = loan.secondaryAccounts || loan.remaining_accounts || (loan.accountDetails ? loan.accountDetails.filter((a) => !a.isPrimary) : []);
		const secDesc = secList.length > 0
			? secList.map((s) => {
				const tag = s.accountTag || s.tag || s.account_name || s.name || 'SEC';
				const share = s.share ?? s.percentage ?? '';
				return share !== '' ? `${tag} (${formatSharePercent(share)}%)` : tag;
			}).join(', ')
			: '-';

		const sanctionedAmt = Number(loan.amount || loan.loan_amount || loan.principal || 0);
		const repayAmt = Number(loan.total_repayment_amount || loan.total_repayment || loan.totalRepayAmount || loan.amount || 0);
		const status = loan.status || 'Active';

		grandSanctioned += sanctionedAmt;
		grandRepay += repayAmt;

		addRow([
			sNo,
			loanId,
			loanDate,
			clientName,
			primaryTag,
			priShareFormatted,
			secDesc,
			sanctionedAmt,
			repayAmt,
			status,
		], 'data');
	});

	// 5. Total Row
	const totalRowIdx = rows.length;
	addRow([
		'Total',
		'',
		'',
		'',
		'',
		'',
		'',
		grandSanctioned,
		grandRepay,
		'',
	], 'total');

	const merges = [
		{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
		{ s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
		{ s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 6 } },
	];

	// Convert to Sheet
	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws['!merges'] = merges;

	// Apply styles
	for (let r = 0; r < rows.length; r++) {
		const rowData = rows[r];
		if (!rowData || rowData.length === 0) continue;
		const rowType = rowStyles[r];

		for (let c = 0; c < rowData.length; c++) {
			const cellAddr = XLSX.utils.encode_cell({ r, c });
			if (!ws[cellAddr]) {
				ws[cellAddr] = { t: 's', v: '' };
			}
			const cell = ws[cellAddr];
			const isNumeric = cell.t === 'n';

			if (rowType === 'title') {
				cell.s = {
					font: { bold: true, color: { rgb: '1E3A8A' }, sz: 14 },
					alignment: { horizontal: 'left', vertical: 'center' },
				};
			} else if (rowType === 'meta') {
				cell.s = {
					font: { color: { rgb: '475569' }, sz: 10, italic: true },
					alignment: { horizontal: 'left', vertical: 'center' },
				};
			} else if (rowType === 'tblHeader') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10.5 },
					fill: { fgColor: { rgb: 'B8CCE4' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center' },
				};
			} else if (rowType === 'data') {
				cell.s = {
					font: { color: { rgb: '0F172A' }, sz: 10 },
					border: { ...border1px },
					alignment: {
						horizontal: isNumeric ? 'right' : (c === 0 || c === 1 || c === 2 || c === 4 || c === 5 || c === 9 ? 'center' : 'left'),
						vertical: 'center',
					},
				};
				if (isNumeric) cell.z = '#,##0';
			} else if (rowType === 'total') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10.5 },
					fill: { fgColor: { rgb: 'C4D79B' } },
					border: { ...border1px },
					alignment: { horizontal: isNumeric ? 'right' : 'center', vertical: 'center' },
				};
				if (isNumeric) cell.z = '#,##0';
			}
		}
	}

	ws['!cols'] = [
		{ wch: 6 },  // S.No
		{ wch: 14 }, // Loan ID
		{ wch: 14 }, // Date
		{ wch: 28 }, // Client Name
		{ wch: 16 }, // Primary
		{ wch: 16 }, // Primary Share %
		{ wch: 26 }, // Secondary Partners
		{ wch: 20 }, // Sanctioned Amount
		{ wch: 20 }, // Total Repayment
		{ wch: 14 }, // Status
	];

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Joint Loans');

	const datePart = new Date().toISOString().slice(0, 10);
	const filename = `JOINT_LOANS_PORTFOLIO_${datePart}.xlsx`;

	XLSX.writeFile(wb, filename);
	return filename;
}

/**
 * Format any date value into standard DD-MM-YYYY format for Excel presentation
 */
export const formatDisplayDate = (val) => {
	if (!val || val === '-' || val === '—') return '-';
	const s = String(val).trim();
	const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
	if (ymd) {
		const dd = String(ymd[3]).padStart(2, '0');
		const mm = String(ymd[2]).padStart(2, '0');
		const yyyy = ymd[1];
		return `${dd}-${mm}-${yyyy}`;
	}
	const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
	if (dmy) {
		const dd = String(dmy[1]).padStart(2, '0');
		const mm = String(dmy[2]).padStart(2, '0');
		const yyyy = dmy[3];
		return `${dd}-${mm}-${yyyy}`;
	}
	return s;
};

/**
 * Calculate days outstanding (D/o) between EMI due date and today
 * Only applies when Pri Not Recd Amount > 0 and the EMI date is in the past
 */
export const calculateDaysOutstanding = (emiDateStr, priNotRecdAmount) => {
	if (!priNotRecdAmount || Number(priNotRecdAmount) <= 0) return 0;
	if (!emiDateStr || emiDateStr === '-' || emiDateStr === '—') return 0;

	const str = String(emiDateStr).trim();
	let emiDate = null;
	const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
	if (dmy) {
		emiDate = new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
	} else {
		const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
		if (ymd) {
			emiDate = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
		} else {
			const d = new Date(str);
			if (!isNaN(d.getTime())) emiDate = d;
		}
	}

	if (!emiDate) return 0;

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const due = new Date(emiDate.getFullYear(), emiDate.getMonth(), emiDate.getDate());

	const diffMs = today.getTime() - due.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	return diffDays > 0 ? diffDays : 0;
};

/**
 * Resolve primary account tag and display name for a joint loan
 */
export const resolveLoanPrimaryAccount = (loan, availableAccounts = []) => {
	const rawTag = loan.primary || loan.primary_tag || loan.primaryTag || '';
	const rawName = loan.primary_account_name || loan.primaryAccountName || loan.primaryBorrower?.name || '';

	let tag = (rawTag && String(rawTag).trim()) || '';
	let name = (rawName && String(rawName).trim()) || '';

	if (!tag && name) {
		const words = name.split(/\s+/);
		tag = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 5).toUpperCase() : name.slice(0, 4).toUpperCase();
	}
	if (!name && tag) {
		if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
			const match = availableAccounts.find((a) => (a.acronym || a.tag || a.accountTag) === tag);
			if (match?.name || match?.accountName) name = match.name || match.accountName;
		}
		if (!name) name = tag;
	}
	return {
		tag: tag || 'PRI',
		name: name || tag || 'Primary Account',
	};
};

/**
 * Check if a date string is filled with a valid date (not empty, dash, or N/A)
 */
export const isDateFilled = (d) => {
	if (!d) return false;
	const str = String(d).trim();
	return str !== '' && str !== '-' && str !== '—' && str !== 'N/A' && str !== 'null' && str !== 'undefined';
};

/**
 * Build a styled worksheet for the Outstanding Report
 */
function buildOutstandingWorksheet(sheetTitle, loans = [], getScheduleFn = null) {
	const border1px = {
		top: { style: 'thin', color: { rgb: '000000' } },
		bottom: { style: 'thin', color: { rgb: '000000' } },
		left: { style: 'thin', color: { rgb: '000000' } },
		right: { style: 'thin', color: { rgb: '000000' } },
	};

	const rows = [];
	const rowStyles = []; // 'title' | 'meta' | 'empty' | 'tblHeader' | 'data' | 'total'
	const rowDataMeta = [];

	const addRow = (cells, styleType = 'data', meta = {}) => {
		rows.push(cells);
		rowStyles.push(styleType);
		rowDataMeta.push(meta);
	};

	// 1. Table Headers
	const headers = [
		'S.No',
		'Loan Date',
		'Loan ID',
		'Client Name',
		'EMI Date',
		'Dues',
		'EMI Amount',
		'Recd Amount',
		'Not Recd Amount',
		'Due Amount',
		'Payable',
		'Status',
	];
	addRow(headers, 'tblHeader');

	let rowIndexSeq = 0;

	loans.forEach((loan) => {
		const loanDate = formatDisplayDate(loan.loan_date || loan.appliedDate || loan.loanDate || loan.date || loan.applied_date);
		const loanId = loan.loan_ref_id || loan.id || '-';
		const clientName = loan.client_account_name || loan.primaryBorrower?.name || loan.clientName || 'Client';

		let rawSchedule = [];
		if (typeof getScheduleFn === 'function') {
			try {
				rawSchedule = getScheduleFn(loan) || [];
			} catch (err) {
				console.warn('Error generating schedule for loan:', loanId, err);
			}
		}
		if (!rawSchedule || rawSchedule.length === 0) {
			rawSchedule = loan.repaymentSchedule || loan.repayment_schedule || [];
		}

		const totalDuesCount = rawSchedule.length;

		// Flatten schedule items to handle partial subInstallments if any
		const scheduleItems = [];
		rawSchedule.forEach((inst, idx) => {
			if (inst.isPartial && Array.isArray(inst.subInstallments) && inst.subInstallments.length > 0) {
				inst.subInstallments.forEach((sub) => {
					scheduleItems.push({
						...sub,
						duesLabel: `${sub.sNo || inst.sNo} / ${totalDuesCount || 1}`,
						date: sub.date || inst.date || '-',
					});
				});
			} else {
				scheduleItems.push({
					...inst,
					duesLabel: `${inst.displaySNo?.replace('#', '') || inst.sNo || idx + 1} / ${totalDuesCount || 1}`,
					date: inst.date || '-',
				});
			}
		});

		scheduleItems.forEach((item) => {
			const recdDateRaw = item.receivedDate || item.received_date || item.recdDate || item.recd_date || item.recdDateA || item.recdDateB;
			let hasRecdDate = isDateFilled(recdDateRaw) || item.status === 'Collected';
			if (!hasRecdDate && item.splits) {
				try {
					const sp = typeof item.splits === 'string' ? JSON.parse(item.splits) : item.splits;
					if (sp && (isDateFilled(sp.recdDate) || isDateFilled(sp.recdDateA) || isDateFilled(sp.recdDateB))) {
						hasRecdDate = true;
					}
				} catch (_) {}
			}

			const payoutDateRaw = (item.paymentDate && item.paymentDate !== '-' && item.paymentDate !== '—')
				? item.paymentDate
				: ((item.payoutDate && item.payoutDate !== '-' && item.payoutDate !== '—')
					? item.payoutDate
					: ((item.payment_date && item.payment_date !== '-' && item.payment_date !== '—')
						? item.payment_date
						: ((item.payout_date && item.payout_date !== '-' && item.payout_date !== '—')
							? item.payout_date
							: ((item.dueDate && item.dueDate !== '-' && item.dueDate !== '—') ? item.dueDate : ''))));

			let hasPayoutDateFilled = isDateFilled(payoutDateRaw);

			if (item.splits) {
				try {
					const sp = typeof item.splits === 'string' ? JSON.parse(item.splits) : item.splits;
					if (sp) {
						const hasDueA = isDateFilled(sp.dueDateA) || (sp.dueDate && sp.dueDate !== '-' && sp.dueDate !== '—');
						const hasDueB = isDateFilled(sp.dueDateB);
						if (hasDueA || hasDueB) {
							hasPayoutDateFilled = true;
						}
					}
				} catch (_) {}
			}

			// Payout approval check: if payout date is filled but not approved from sec manager, consider it not filled
			const pStatus = String(
				item.payout_approval_status ||
				item.payoutApprovalStatus ||
				item.payout_status ||
				item.payoutStatus ||
				''
			).trim().toUpperCase();
			const isPayoutApproved = (pStatus === 'APPROVED' || item.status === 'Settled') && pStatus !== 'PENDING' && pStatus !== 'REJECTED';
			const hasPayoutDate = hasPayoutDateFilled && isPayoutApproved;

			// Rule: only include pending payment entries where received date not filled OR payout date not filled/approved
			// If BOTH received date is filled and payout date is filled & approved, payment is fully complete -> skip
			if (hasRecdDate && hasPayoutDate) {
				return;
			}

			// Determine payout approval status
			// Rule:
			// 1. If payout date is filled with pending from sec manager for approval -> 'Approval pending'
			// 2. If recd date only filled, payout date not filled -> 'Pending'
			// 3. If recd date not filled -> 'Not received from client'
			const isPayoutPending = hasPayoutDateFilled && !isPayoutApproved;

			let status = '';
			let recdAmount = 0;
			let outstandingAmount = 0;
			const emiAmount = Number(item.amount ?? item.totalEmi ?? 0);

			if (isPayoutPending) {
				status = 'Approval pending';
				recdAmount = emiAmount;
				outstandingAmount = 0;
			} else if (hasRecdDate) {
				status = 'Pending';
				recdAmount = emiAmount;
				outstandingAmount = 0;
			} else {
				status = 'Not received from client';
				recdAmount = 0;
				outstandingAmount = emiAmount;
			}

			let dueSecAmount = 0;
			if (Array.isArray(item.secAccounts) && item.secAccounts.length > 0) {
				dueSecAmount = item.secAccounts.reduce((sum, sa) => sum + (Number(sa.amount) || 0), 0);
			} else {
				dueSecAmount = Number(item.secAmount ?? 0);
			}

			let payableSecName = '-';
			if (Array.isArray(item.secAccounts) && item.secAccounts.length > 0) {
				payableSecName = item.secAccounts
					.map((sa) => sa.accountTag || sa.accountName || sa.initials || '')
					.filter(Boolean)
					.join(', ');
			} else if (item.secAccountTag || item.secAccountName) {
				payableSecName = item.secAccountTag || item.secAccountName;
			}
			if (!payableSecName || !payableSecName.trim()) payableSecName = 'SEC';

			rowIndexSeq += 1;
			const emiDate = formatDisplayDate(item.date || item.emiDate || '-');

			addRow([
				rowIndexSeq,
				loanDate,
				loanId,
				clientName,
				emiDate,
				item.duesLabel,
				emiAmount,
				recdAmount,
				outstandingAmount,
				dueSecAmount,
				payableSecName,
				status,
			], 'data', { status });
		});
	});

	const ws = XLSX.utils.aoa_to_sheet(rows);

	// Apply styles
	for (let r = 0; r < rows.length; r++) {
		const rowData = rows[r];
		if (!rowData || rowData.length === 0) continue;
		const rowType = rowStyles[r];
		const meta = rowDataMeta[r] || {};

		for (let c = 0; c < rowData.length; c++) {
			const cellAddr = XLSX.utils.encode_cell({ r, c });
			if (!ws[cellAddr]) {
				ws[cellAddr] = { t: 's', v: '' };
			}
			const cell = ws[cellAddr];
			const isNumeric = cell.t === 'n';

			if (rowType === 'title') {
				cell.s = {
					font: { bold: true, color: { rgb: '1E3A8A' }, sz: 13 },
					alignment: { horizontal: 'left', vertical: 'center' },
				};
			} else if (rowType === 'meta') {
				cell.s = {
					font: { italic: true, color: { rgb: '475569' }, sz: 10 },
					alignment: { horizontal: 'left', vertical: 'center' },
				};
			} else if (rowType === 'tblHeader') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10 },
					fill: { fgColor: { rgb: 'B8CCE4' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
				};
			} else if (rowType === 'data') {
				const isCurrencyCol = c === 6 || c === 7 || c === 8 || c === 9;
				const isStatusCol = c === 11;
				const isClientNameCol = c === 3;

				let fontColor = '0F172A';
				let isBold = false;

				if (isStatusCol) {
					if (meta.status === 'Not received from client' || meta.status === 'Overdue') {
						fontColor = 'BE123C';
						isBold = true;
					} else if (meta.status === 'Approval pending' || meta.status === 'Approval Pending' || meta.status === 'Partial') {
						fontColor = 'B45309';
						isBold = true;
					} else if (meta.status === 'Pending' || meta.status === 'Need to send') {
						fontColor = 'D97706';
						isBold = true;
					} else if (meta.status === 'Settled' || meta.status === 'Collected') {
						fontColor = '047857';
						isBold = true;
					}
				}

				cell.s = {
					font: { color: { rgb: fontColor }, bold: isBold, sz: 10 },
					border: { ...border1px },
					alignment: {
						horizontal: isCurrencyCol ? 'right' : (isClientNameCol ? 'left' : 'center'),
						vertical: 'center',
					},
				};
				if (isCurrencyCol) {
					cell.z = '#,##0';
				}
			}
		}
	}

	// Auto-fit column widths based on maximum content length with padding
	ws['!cols'] = headers.map((header, c) => {
		let maxLen = String(header || '').length;

		for (let r = 0; r < rows.length; r++) {
			const row = rows[r];
			if (!row) continue;
			const val = row[c];
			if (val == null || val === '') continue;

			let len = 0;
			if (typeof val === 'number') {
				len = Math.round(val).toLocaleString('en-IN').length;
			} else {
				len = String(val).length;
			}

			if (len > maxLen) {
				maxLen = len;
			}
		}

		return { wch: Math.max(maxLen + 3, 8) };
	});

	ws['!rows'] = [
		{ hpt: 26 }, // Header
	];
	ws['!rowCount'] = rowIndexSeq;

	return { ws, count: rowIndexSeq };
}

/**
 * Helper to match an account string or object against a target account's tag or name
 */
export const isAccountTagOrNameMatch = (value, targetTag, targetName, availableAccounts = []) => {
	if (!value) return false;
	const clean = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
	const vClean = clean(value);
	const tTagClean = clean(targetTag);
	const tNameClean = clean(targetName);

	if (vClean && tTagClean && vClean === tTagClean) return true;
	if (vClean && tNameClean && vClean === tNameClean) return true;

	if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
		const targetObj = availableAccounts.find((a) => {
			const aTag = clean(a.acronym || a.tag || a.accountTag);
			const aName = clean(a.name || a.accountName);
			return (tTagClean && aTag === tTagClean) || (tNameClean && aName === tNameClean);
		});
		if (targetObj) {
			const oTag = clean(targetObj.acronym || targetObj.tag || targetObj.accountTag);
			const oName = clean(targetObj.name || targetObj.accountName);
			if (vClean === oTag || vClean === oName) return true;
		}

		const valObj = availableAccounts.find((a) => {
			const aTag = clean(a.acronym || a.tag || a.accountTag);
			const aName = clean(a.name || a.accountName);
			return (vClean && (aTag === vClean || aName === vClean));
		});
		if (valObj) {
			const vTag = clean(valObj.acronym || valObj.tag || valObj.accountTag);
			const vName = clean(valObj.name || valObj.accountName);
			if (vTag === tTagClean || vName === tNameClean) return true;
		}
	}
	return false;
};

/**
 * Check if a loan has a specific account participating as secondary
 */
export const loanHasSecondaryAccount = (loan, targetTag, targetName, availableAccounts = []) => {
	if (!loan) return false;

	// 1. loan.secondaryAccounts
	if (Array.isArray(loan.secondaryAccounts)) {
		for (const sa of loan.secondaryAccounts) {
			if (!sa) continue;
			if (
				isAccountTagOrNameMatch(sa.accountTag, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.accountName, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.name, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.tag, targetTag, targetName, availableAccounts)
			) {
				return true;
			}
		}
	}

	// 2. loan.accountDetails (where !isPrimary)
	if (Array.isArray(loan.accountDetails)) {
		for (const acc of loan.accountDetails) {
			if (!acc || acc.isPrimary) continue;
			if (
				isAccountTagOrNameMatch(acc.accountTag, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(acc.accountName, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(acc.name, targetTag, targetName, availableAccounts)
			) {
				return true;
			}
		}
	}

	// 3. loan.remaining_accounts
	if (Array.isArray(loan.remaining_accounts)) {
		for (const ra of loan.remaining_accounts) {
			if (!ra) continue;
			if (
				isAccountTagOrNameMatch(ra.account_name, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(ra.name, targetTag, targetName, availableAccounts)
			) {
				return true;
			}
		}
	}

	// 4. Single secondary fields
	if (isAccountTagOrNameMatch(loan.secondaryAccountName, targetTag, targetName, availableAccounts)) return true;
	if (isAccountTagOrNameMatch(loan.secAccountName, targetTag, targetName, availableAccounts)) return true;
	if (isAccountTagOrNameMatch(loan.coBorrower?.name, targetTag, targetName, availableAccounts)) return true;

	return false;
};

/**
 * Resolve the secondary due amount for a specific account on an installment item
 */
export const getSecondaryDueAmountForItem = (item, loan, targetTag, targetName, availableAccounts = []) => {
	if (!item) return 0;

	// 1. Check item.secAccounts
	if (Array.isArray(item.secAccounts) && item.secAccounts.length > 0) {
		const matchedSec = item.secAccounts.find((sa) => {
			if (!sa) return false;
			return (
				isAccountTagOrNameMatch(sa.accountTag, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.accountName, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.name, targetTag, targetName, availableAccounts) ||
				isAccountTagOrNameMatch(sa.tag, targetTag, targetName, availableAccounts)
			);
		});
		if (matchedSec && matchedSec.amount != null && !isNaN(Number(matchedSec.amount))) {
			return Number(matchedSec.amount);
		}
		if (item.secAccounts.length === 1 && item.secAccounts[0].amount != null) {
			return Number(item.secAccounts[0].amount);
		}
	}

	// 2. Check item.secAmount
	if (item.secAmount != null && !isNaN(Number(item.secAmount)) && Number(item.secAmount) > 0) {
		return Number(item.secAmount);
	}

	// 3. Fallback based on loan percentage
	const totalEmi = Number(item.amount ?? item.totalEmi ?? 0);
	if (totalEmi > 0 && loan) {
		const secList = loan.secondaryAccounts || loan.accountDetails?.filter((a) => !a.isPrimary) || loan.remaining_accounts || [];
		if (Array.isArray(secList)) {
			const matched = secList.find((s) =>
				isAccountTagOrNameMatch(s.accountName || s.name || s.accountTag, targetTag, targetName, availableAccounts)
			);
			if (matched) {
				const sharePct = Number(matched.share ?? matched.percentage ?? 0);
				if (sharePct > 0) {
					return Math.round((totalEmi * sharePct) / 100);
				}
			}
		}
		const priShare = Number(loan.primaryShare ?? loan.primary_account_share ?? 60);
		const defaultSecShare = Math.max(0, 100 - priShare);
		return Math.round((totalEmi * defaultSecShare) / 100);
	}

	return 0;
};

/**
 * Build a styled worksheet for the Secondary Account Outstanding Report
 * Columns: S.No, Loan Date, Client Name, Loan ID, EMI Date, Receivable, Recd Amount, Not Recd Amount, Due Amount, Status
 */
function buildSecondaryOutstandingWorksheet(
	sheetTitle,
	targetAccountTag,
	targetAccountName,
	loans = [],
	getScheduleFn = null,
	availableAccounts = []
) {
	const border1px = {
		top: { style: 'thin', color: { rgb: '000000' } },
		bottom: { style: 'thin', color: { rgb: '000000' } },
		left: { style: 'thin', color: { rgb: '000000' } },
		right: { style: 'thin', color: { rgb: '000000' } },
	};

	const rows = [];
	const rowStyles = []; // 'tblHeader' | 'data'
	const rowDataMeta = [];

	const addRow = (cells, styleType = 'data', meta = {}) => {
		rows.push(cells);
		rowStyles.push(styleType);
		rowDataMeta.push(meta);
	};

	// 1. Table Headers: S.No, Loan Date, Loan ID, Client Name, EMI Date, Dues, EMI Amount, Receivable, Recd Amount, Not Recd Amount, Due Amount, Status
	const headers = [
		'S.No',
		'Loan Date',
		'Loan ID',
		'Client Name',
		'EMI Date',
		'Dues',
		'EMI Amount',
		'Receivable',
		'Recd Amount',
		'Not Recd Amount',
		'Due Amount',
		'Status',
	];
	addRow(headers, 'tblHeader');

	let rowIndexSeq = 0;

	loans.forEach((loan) => {
		const loanDate = formatDisplayDate(loan.loan_date || loan.appliedDate || loan.loanDate || loan.date || loan.applied_date);
		const loanId = loan.loan_ref_id || loan.id || '-';
		const clientName = loan.client_account_name || loan.primaryBorrower?.name || loan.clientName || 'Client';

		let rawSchedule = [];
		if (typeof getScheduleFn === 'function') {
			try {
				rawSchedule = getScheduleFn(loan) || [];
			} catch (err) {
				console.warn('Error generating schedule for loan:', loanId, err);
			}
		}
		if (!rawSchedule || rawSchedule.length === 0) {
			rawSchedule = loan.repaymentSchedule || loan.repayment_schedule || [];
		}

		const totalDuesCount = rawSchedule.length;

		// Flatten schedule items to handle partial subInstallments if any
		const scheduleItems = [];
		rawSchedule.forEach((inst, idx) => {
			if (inst.isPartial && Array.isArray(inst.subInstallments) && inst.subInstallments.length > 0) {
				inst.subInstallments.forEach((sub) => {
					scheduleItems.push({
						...sub,
						duesLabel: `${sub.sNo || inst.sNo} / ${totalDuesCount || 1}`,
						date: sub.date || inst.date || '-',
					});
				});
			} else {
				scheduleItems.push({
					...inst,
					duesLabel: `${inst.displaySNo?.replace('#', '') || inst.sNo || idx + 1} / ${totalDuesCount || 1}`,
					date: inst.date || '-',
				});
			}
		});

		scheduleItems.forEach((item) => {
			const recdDateRaw = item.receivedDate || item.received_date || item.recdDate || item.recd_date || item.recdDateA || item.recdDateB;
			let hasRecdDate = isDateFilled(recdDateRaw) || item.status === 'Collected';
			if (!hasRecdDate && item.splits) {
				try {
					const sp = typeof item.splits === 'string' ? JSON.parse(item.splits) : item.splits;
					if (sp && (isDateFilled(sp.recdDate) || isDateFilled(sp.recdDateA) || isDateFilled(sp.recdDateB))) {
						hasRecdDate = true;
					}
				} catch (_) {}
			}

			const payoutDateRaw = (item.paymentDate && item.paymentDate !== '-' && item.paymentDate !== '—')
				? item.paymentDate
				: ((item.payoutDate && item.payoutDate !== '-' && item.payoutDate !== '—')
					? item.payoutDate
					: ((item.payment_date && item.payment_date !== '-' && item.payment_date !== '—')
						? item.payment_date
						: ((item.payout_date && item.payout_date !== '-' && item.payout_date !== '—')
							? item.payout_date
							: ((item.dueDate && item.dueDate !== '-' && item.dueDate !== '—') ? item.dueDate : ''))));

			let hasPayoutDateFilled = isDateFilled(payoutDateRaw);

			if (item.splits) {
				try {
					const sp = typeof item.splits === 'string' ? JSON.parse(item.splits) : item.splits;
					if (sp) {
						const hasDueA = isDateFilled(sp.dueDateA) || (sp.dueDate && sp.dueDate !== '-' && sp.dueDate !== '—');
						const hasDueB = isDateFilled(sp.dueDateB);
						if (hasDueA || hasDueB) {
							hasPayoutDateFilled = true;
						}
					}
				} catch (_) {}
			}

			const pStatus = String(
				item.payout_approval_status ||
				item.payoutApprovalStatus ||
				item.payout_status ||
				item.payoutStatus ||
				''
			).trim().toUpperCase();
			const isPayoutApproved = (pStatus === 'APPROVED' || item.status === 'Settled') && pStatus !== 'PENDING' && pStatus !== 'REJECTED';
			const hasPayoutDate = hasPayoutDateFilled && isPayoutApproved;

			// If both recd and payout are complete, it's not outstanding
			if (hasRecdDate && hasPayoutDate) {
				return;
			}

			// Determine payout approval status
			// Rule:
			// 1. If payout date is filled with pending from sec manager for approval -> 'Approval pending'
			// 2. If recd date only filled, payout date not filled -> 'Pending'
			// 3. If recd date not filled -> 'Not received from client'
			const isPayoutPending = hasPayoutDateFilled && !isPayoutApproved;

			const emiAmount = Number(item.amount ?? item.totalEmi ?? 0);
			let status = '';
			let recdAmount = 0;
			let notRecdAmount = 0;

			if (isPayoutPending) {
				status = 'Approval pending';
				recdAmount = emiAmount;
				notRecdAmount = 0;
			} else if (hasRecdDate) {
				status = 'Pending';
				recdAmount = emiAmount;
				notRecdAmount = 0;
			} else {
				status = 'Not received from client';
				recdAmount = 0;
				notRecdAmount = emiAmount;
			}

			const dueSecAmount = getSecondaryDueAmountForItem(
				item,
				loan,
				targetAccountTag,
				targetAccountName,
				availableAccounts
			);

			rowIndexSeq += 1;
			const emiDate = formatDisplayDate(item.date || item.emiDate || '-');
			const pri = resolveLoanPrimaryAccount(loan, availableAccounts);
			const primaryAcronym = pri.tag || getAccountAcronym(loan.primary_account_name || loan.primaryAccountName || loan.primary) || 'PRI';

			addRow([
				rowIndexSeq,
				loanDate,
				loanId,
				clientName,
				emiDate,
				item.duesLabel,
				emiAmount,      // EMI Amount
				primaryAcronym, // Receivable: Primary Account Acronym of that loan (e.g. SCS, AS)
				recdAmount,     // Recd Amount
				notRecdAmount,  // Not Recd Amount
				dueSecAmount,   // Due Amount
				status,         // Status
			], 'data', { status });
		});
	});

	const ws = XLSX.utils.aoa_to_sheet(rows);

	// Apply styles
	for (let r = 0; r < rows.length; r++) {
		const rowData = rows[r];
		if (!rowData || rowData.length === 0) continue;
		const rowType = rowStyles[r];
		const meta = rowDataMeta[r] || {};

		for (let c = 0; c < rowData.length; c++) {
			const cellAddr = XLSX.utils.encode_cell({ r, c });
			if (!ws[cellAddr]) {
				ws[cellAddr] = { t: 's', v: '' };
			}
			const cell = ws[cellAddr];

			if (rowType === 'tblHeader') {
				cell.s = {
					font: { bold: true, color: { rgb: '0F172A' }, sz: 10 },
					fill: { fgColor: { rgb: 'B8CCE4' } },
					border: { ...border1px },
					alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
				};
			} else if (rowType === 'data') {
				const isCurrencyCol = c === 6 || c === 8 || c === 9 || c === 10;
				const isStatusCol = c === 11;
				const isClientNameCol = c === 3;

				let fontColor = '0F172A';
				let isBold = false;

				if (isStatusCol) {
					if (meta.status === 'Not received from client' || meta.status === 'Overdue') {
						fontColor = 'BE123C';
						isBold = true;
					} else if (meta.status === 'Approval pending' || meta.status === 'Approval Pending' || meta.status === 'Partial') {
						fontColor = 'B45309';
						isBold = true;
					} else if (meta.status === 'Pending' || meta.status === 'Need to receive' || meta.status === 'Need to send') {
						fontColor = 'D97706';
						isBold = true;
					} else if (meta.status === 'Settled' || meta.status === 'Collected') {
						fontColor = '047857';
						isBold = true;
					}
				}

				cell.s = {
					font: { color: { rgb: fontColor }, bold: isBold, sz: 10 },
					border: { ...border1px },
					alignment: {
						horizontal: isCurrencyCol ? 'right' : (isClientNameCol ? 'left' : 'center'),
						vertical: 'center',
					},
				};
				if (isCurrencyCol) {
					cell.z = '#,##0';
				}
			}
		}
	}

	// Auto-fit column widths based on maximum content length with padding
	ws['!cols'] = headers.map((header, c) => {
		let maxLen = String(header || '').length;
		for (let r = 0; r < rows.length; r++) {
			const row = rows[r];
			if (!row) continue;
			const val = row[c];
			if (val == null || val === '') continue;

			let len = 0;
			if (typeof val === 'number') {
				len = Math.round(val).toLocaleString('en-IN').length;
			} else {
				len = String(val).length;
			}
			if (len > maxLen) {
				maxLen = len;
			}
		}
		return { wch: Math.max(maxLen + 3, 10) };
	});

	ws['!rows'] = [
		{ hpt: 26 }, // Header
	];
	ws['!rowCount'] = rowIndexSeq;

	return { ws, count: rowIndexSeq };
}

/**
 * Export outstanding report with 2 sheets per account: Primary and Secondary.
 * - Primary sheet uses the prepared primary format:
 *   S.No, Loan Date, Loan ID, Client Name, EMI Date, Dues, EMI Amount, Recd Amount, Not Recd Amount, Due Amount, Payable, Status
 * - Secondary sheet uses the requested secondary format:
 *   S.No, Loan Date, Client Name, Loan ID, EMI Date, Receivable, Recd Amount, Not Recd Amount, Due Amount, Status
 *   where loans are those having that account participating as secondary.
 *
 * @param {Array} loansList - List of joint loan objects
 * @param {Function} getScheduleFn - Optional function to generate schedule for each loan
 * @param {Array} availableAccounts - Optional list of accounts to resolve tags/names
 * @param {Object|string} options - Optional settings or selected account name/tag
 * @returns {Object} Result object with { success, filename, count, message }
 */
export function exportOutstandingReportPerPrimaryAccount(
	loansList = [],
	getScheduleFn = null,
	availableAccounts = [],
	options = {}
) {
	if (!Array.isArray(loansList) || loansList.length === 0) {
		return { success: false, message: 'No outstanding loans', count: 0 };
	}

	const wb = XLSX.utils.book_new();

	// Parse selectedAccount if passed in options (object or direct string)
	const rawSelected = typeof options === 'string'
		? options
		: (options?.selectedAccount || options?.account || null);
	const selectedAccount = (rawSelected && String(rawSelected).trim() !== '' && String(rawSelected).trim().toUpperCase() !== 'ALL')
		? String(rawSelected).trim()
		: null;
	const isSingleAccount = Boolean(selectedAccount);

	// 1. Resolve distinct accounts that participate in availableAccounts or loansList
	const accountMap = new Map();

	if (isSingleAccount) {
		let targetTag = '';
		let targetName = '';

		const cleanStr = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
		const targetClean = cleanStr(selectedAccount);

		if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
			const matchedAcc = availableAccounts.find(
				(a) => cleanStr(a?.name) === targetClean || cleanStr(a?.acronym || a?.tag || a?.accountTag) === targetClean
			);
			if (matchedAcc) {
				targetTag = getAccountAcronym(matchedAcc) || matchedAcc.acronym || matchedAcc.tag;
				targetName = matchedAcc.name || matchedAcc.accountName || targetTag;
			}
		}

		if (!targetTag) {
			targetTag = getAccountAcronym(selectedAccount);
		}
		if (!targetName) {
			targetName = selectedAccount;
		}

		accountMap.set(targetTag, { tag: targetTag, name: targetName });
	} else {
		const addAccountToMap = (tag, name) => {
			if (!tag && !name) return;
			const cleanStr = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
			const tClean = cleanStr(tag);
			const nClean = cleanStr(name);

			for (const existing of accountMap.values()) {
				const exTag = cleanStr(existing.tag);
				const exName = cleanStr(existing.name);
				if ((tClean && exTag === tClean) || (nClean && exName === nClean)) {
					return;
				}
				if (
					isAccountTagOrNameMatch(tag, existing.tag, existing.name, availableAccounts) ||
					isAccountTagOrNameMatch(name, existing.tag, existing.name, availableAccounts)
				) {
					return;
				}
			}

			const resolvedTag = tag || getAccountAcronym(name) || 'ACC';
			const resolvedName = name || resolvedTag;
			accountMap.set(resolvedTag, { tag: resolvedTag, name: resolvedName });
		};

		if (Array.isArray(availableAccounts)) {
			availableAccounts.forEach((acc) => {
				if (!acc) return;
				const tag = getAccountAcronym(acc);
				const name = acc.name || acc.accountName || tag;
				addAccountToMap(tag, name);
			});
		}

		loansList.forEach((loan) => {
			const pri = resolveLoanPrimaryAccount(loan, availableAccounts);
			if (pri.tag) {
				addAccountToMap(pri.tag, pri.name);
			}
			const secList = loan.secondaryAccounts || loan.accountDetails?.filter((a) => !a.isPrimary) || loan.remaining_accounts || [];
			if (Array.isArray(secList)) {
				secList.forEach((s) => {
					const tag = getAccountAcronym(s);
					const name = s.accountName || s.name || tag;
					if (tag || name) {
						addAccountToMap(tag, name);
					}
				});
			}
		});
	}

	const usedSheetNames = new Set();
	const getUniqueSheetName = (name) => {
		let clean = String(name || 'Sheet')
			.replace(/[\\/?*:[\]]/g, '')
			.trim()
			.slice(0, 31);
		if (!clean) clean = 'Sheet';
		let result = clean;
		let counter = 1;
		while (usedSheetNames.has(result.toLowerCase())) {
			result = `${clean.slice(0, 27)}_${counter++}`;
		}
		usedSheetNames.add(result.toLowerCase());
		return result;
	};

	let totalEntriesAcrossAll = 0;
	const accountSheetsToAppend = [];

	accountMap.forEach(({ tag, name }) => {
		// Loans where this account is Primary
		const primaryLoans = loansList.filter((loan) => {
			const pri = resolveLoanPrimaryAccount(loan, availableAccounts);
			return isAccountTagOrNameMatch(pri.tag, tag, name, availableAccounts) ||
			       isAccountTagOrNameMatch(pri.name, tag, name, availableAccounts) ||
			       (isSingleAccount && selectedAccount && (
			           isAccountTagOrNameMatch(pri.tag, selectedAccount, selectedAccount, availableAccounts) ||
			           isAccountTagOrNameMatch(pri.name, selectedAccount, selectedAccount, availableAccounts)
			       ));
		});

		// Loans where this account is Secondary
		const secondaryLoans = loansList.filter((loan) => {
			return loanHasSecondaryAccount(loan, tag, name, availableAccounts) ||
			       (isSingleAccount && selectedAccount && loanHasSecondaryAccount(loan, selectedAccount, selectedAccount, availableAccounts));
		});

		// If this account has no loans at all in loansList, skip
		if (primaryLoans.length === 0 && secondaryLoans.length === 0) {
			return;
		}

		// Build Primary sheet (using the prepared primary format)
		const priTitle = name && name !== tag ? `${name} (${tag})` : tag;
		const { ws: priWs, count: priCount } = buildOutstandingWorksheet(priTitle, primaryLoans, getScheduleFn);

		// Build Secondary sheet
		const secTitle = `${tag} Secondary`;
		const { ws: secWs, count: secCount } = buildSecondaryOutstandingWorksheet(
			secTitle,
			tag,
			name,
			secondaryLoans,
			getScheduleFn,
			availableAccounts
		);

		totalEntriesAcrossAll += (priCount + secCount);

		// Add pair of sheets if this account has entries in either Primary or Secondary
		if (priCount > 0 || secCount > 0) {
			const priSheetName = getUniqueSheetName(`${tag} - Primary`);
			const secSheetName = getUniqueSheetName(`${tag} - Secondary`);
			accountSheetsToAppend.push({ ws: priWs, sheetName: priSheetName, tag, count: priCount });
			accountSheetsToAppend.push({ ws: secWs, sheetName: secSheetName, tag, count: secCount });
		}
	});

	// If no entries in any sheet across all accounts, do not download file
	if (totalEntriesAcrossAll === 0) {
		return { success: false, message: 'No outstanding loans', count: 0 };
	}

	// Append all pairs of Primary and Secondary sheets
	accountSheetsToAppend.forEach(({ ws, sheetName }) => {
		XLSX.utils.book_append_sheet(wb, ws, sheetName);
	});

	// Construct filename
	const datePart = new Date().toISOString().slice(0, 10);
	const tags = [...new Set(accountSheetsToAppend.map((s) => s.tag))];
	const filename = tags.length === 1
		? `OUTSTANDING_REPORT_${tags[0]}_${datePart}.xlsx`
		: `OUTSTANDING_REPORT_${datePart}.xlsx`;

	XLSX.writeFile(wb, filename);
	return { success: true, filename, count: totalEntriesAcrossAll };
}

export const exportOutstandingReport = exportOutstandingReportPerPrimaryAccount;


