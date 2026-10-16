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
	const num = Number(val);
	if (isNaN(num)) return '0';
	const rounded = Math.round(num * 10) / 10;
	return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
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
	if (acc.accountName) {
		const words = String(acc.accountName).trim().split(/\s+/);
		if (words.length > 1) {
			return words.map((w) => w[0]).join('').slice(0, 5).toUpperCase();
		}
		return acc.accountName.slice(0, 4).toUpperCase();
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
		const s = acc.share != null ? formatSharePercent(acc.share) : (totalPrincipal > 0 ? formatSharePercent((p / totalPrincipal) * 100) : '0');
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
