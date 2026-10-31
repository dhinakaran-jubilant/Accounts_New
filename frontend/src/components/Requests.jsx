/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Approval workflow management table for reviewing, approving, and rejecting loan modification requests.
*/

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import LottieLoader from './common/LottieLoader';
import {
	checkUserHasPrimaryAccessForLoanPrimary,
	checkUserHasPrimaryAccessForLoanSecondary,
	checkUserHasPrimaryAccessForAccount,
	getUsersWithPrimaryAccessForLoanPrimary,
	getUsersWithPrimaryAccessForLoanSecondary,
	getUsersWithPrimaryAccessForAccount,
	getLoanSecondaryAccounts,
	getPrimaryTagColor,
	isAccountMatch,
	formatLoanDate,
	EditableDateCell,
	getOffsetDateDDMMYYYY,
	getTodayDDMMYYYY,
	isDateBefore,
	parseDDMMYYYY,
} from './JointLoan';

// Helper to match a user against a username, name, employee_code, email, or formatted string "Name (Code)"
export const isMatchUser = (user, val) => {
	if (!user || !val) return false;
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const cVal = clean(val);
	if (!cVal) return false;
	const curName = clean(user.name);
	const curCode = clean(user.employee_code);
	const curUsername = clean(user.username);
	const curEmail = clean(user.email);

	// Formatted strings like "Name (Code)" or "Code (Name)"
	const raw = String(val).trim();
	const parenMatch = raw.match(/^(.*?)\s*\((.*?)\)$/);
	if (parenMatch) {
		const part1 = clean(parenMatch[1]);
		const part2 = clean(parenMatch[2]);
		if (curCode && (part1 === curCode || part2 === curCode)) return true;
		if (curName && (part1 === curName || part2 === curName)) return true;
		if (curUsername && (part1 === curUsername || part2 === curUsername)) return true;
		if (curEmail && (part1 === curEmail || part2 === curEmail)) return true;
	}

	if (curCode && cVal === curCode) return true;
	if (curName && cVal === curName) return true;
	if (curUsername && cVal === curUsername) return true;
	if (curEmail && cVal === curEmail) return true;
	return false;
};

// Helper to determine if a loan was created/initiated by a specific user (exact match only)
export const didUserCreateLoan = (loan, user, accountObjects = []) => {
	if (!loan || !user) return false;
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const curName = clean(user.name);
	const curCode = clean(user.employee_code);
	const curUsername = clean(user.username);
	const curEmail = clean(user.email);

	// Exact match checker - strict comparison only (no substring .includes() to avoid cross-user matches)
	const isUserMatch = (val) => {
		if (!val) return false;
		const cVal = clean(val);
		if (!cVal) return false;
		if (curCode && cVal === curCode) return true;
		if (curName && cVal === curName) return true;
		if (curUsername && cVal === curUsername) return true;
		if (curEmail && cVal === curEmail) return true;
		return false;
	};

	// 1. Direct creator fields on the loan
	const candidateFields = [
		loan.requester_name,
		loan.requesterName,
		loan.requester_code,
		loan.requesterCode,
		loan.created_by,
		loan.createdBy,
		loan.creator_name,
		loan.creator,
	];

	for (const f of candidateFields) {
		if (isUserMatch(f)) return true;
	}

	// 2. Audit history loan_created entry
	let historyList = loan.history;
	if (typeof historyList === 'string') {
		try {
			historyList = JSON.parse(historyList);
		} catch (e) {
			historyList = [];
		}
	}
	if (Array.isArray(historyList)) {
		const creationEntry = historyList.find(
			(h) => h && (h.type === 'loan_created' || h.type === 'created')
		);
		if (creationEntry) {
			const entryFields = [
				creationEntry.userEmployeeCode,
				creationEntry.employee_code,
				creationEntry.userCode,
				creationEntry.userName,
				creationEntry.user_name,
			];
			for (const f of entryFields) {
				if (isUserMatch(f)) return true;
			}
		}
	}

	return false;
};

// Helper to get a stable unique key for a loan
export const getLoanUniqueId = (loan) => {
	if (!loan) return '';
	return String(loan.db_id ?? loan.id ?? loan.loan_ref_id ?? '');
};

// Helper to determine if a loan was approved by the logged-in user (as secondary manager or admin)
export const didUserApproveLoan = (loan, user) => {
	if (!loan || !user) return false;

	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const curName = clean(user.name);
	const curCode = clean(user.employee_code);
	const curEmail = clean(user.email);
	const curUsername = clean(user.username);
	const isAdminUser =
		['admin', 'super admin'].includes((user.role || '').toLowerCase()) ||
		['admin', 'jc0033'].includes(curCode) ||
		curName === 'admin' ||
		curName === 'systemadmin';

	const isSingleStringMatch = (val) => {
		if (!val) return false;
		const raw = String(val).trim();
		if (!raw) return false;

		const c = clean(raw);
		if (curCode && c === curCode) return true;
		if (curName && c === curName) return true;
		if (curEmail && c === curEmail) return true;
		if (curUsername && c === curUsername) return true;

		// Format "Name (Code)" or "Code (Name)" e.g. "Test 1 (JC0002)"
		const parenMatch = raw.match(/^(.*?)\s*\((.*?)\)$/);
		if (parenMatch) {
			const part1 = clean(parenMatch[1]);
			const part2 = clean(parenMatch[2]);
			if (curCode && (part1 === curCode || part2 === curCode)) return true;
			if (curName && (part1 === curName || part2 === curName)) return true;
			if (curEmail && (part1 === curEmail || part2 === curEmail)) return true;
		}

		// Also match generic admin label if user is an admin
		if (
			isAdminUser &&
			(c === 'admin' ||
				c === 'administrator' ||
				c === 'systemadmin' ||
				c === 'systemadministrator')
		) {
			return true;
		}

		return false;
	};

	const isCandidateMatch = (val) => {
		if (!val) return false;
		if (Array.isArray(val)) {
			return val.some(isCandidateMatch);
		}
		if (typeof val === 'object') {
			return (
				isCandidateMatch(val.employee_code) ||
				isCandidateMatch(val.userEmployeeCode) ||
				isCandidateMatch(val.userCode) ||
				isCandidateMatch(val.name) ||
				isCandidateMatch(val.userName) ||
				isCandidateMatch(val.user_name)
			);
		}
		if (typeof val === 'string') {
			if (val.startsWith('[') || val.startsWith('{')) {
				try {
					const parsed = JSON.parse(val);
					return isCandidateMatch(parsed);
				} catch (e) { }
			}
			if (val.includes(',') || val.includes(';')) {
				return val.split(/[,;]+/).some(isSingleStringMatch);
			}
			return isSingleStringMatch(val);
		}
		return false;
	};

	// 1. Secondary approval verification fields
	const secondaryApprovers = [
		loan.verified_by,
		loan.verifiedBy,
	].filter(Boolean);
	if (secondaryApprovers.some(isCandidateMatch)) {
		return true;
	}

	// 2. Admin authorization fields
	const adminApprovers = [
		loan.actioned_by,
		loan.actionedBy,
	].filter(Boolean);
	if (adminApprovers.some(isCandidateMatch)) {
		return true;
	}

	// 3. Full audit history entries for all approval types
	let historyList = loan.history;
	if (typeof historyList === 'string') {
		try {
			historyList = JSON.parse(historyList);
		} catch (e) {
			historyList = [];
		}
	}
	if (Array.isArray(historyList) && historyList.length > 0) {
		const approvalEntries = historyList.filter(
			(h) =>
				h &&
				(h.type === 'sec_manager_approval' ||
					h.type === 'admin_approval' ||
					h.type === 'verified' ||
					h.type === 'approved')
		);
		for (const entry of approvalEntries) {
			if (
				isCandidateMatch(entry.userEmployeeCode) ||
				isCandidateMatch(entry.employee_code) ||
				isCandidateMatch(entry.userCode) ||
				isCandidateMatch(entry.userName) ||
				isCandidateMatch(entry.user_name)
			) {
				return true;
			}
		}
	}

	return false;
};

// Helper to format sign-off timestamps nicely
const formatSignOffTimestamp = (val) => {
	if (!val) return '';
	if (typeof val === 'string' && (val.includes('/') || (val.includes('-') && val.includes(':')))) {
		return val;
	}
	try {
		const d = new Date(val);
		if (!isNaN(d.getTime())) {
			const pad = (n) => String(n).padStart(2, '0');
			const day = pad(d.getDate());
			const month = pad(d.getMonth() + 1);
			const year = d.getFullYear();
			let hours = d.getHours();
			const minutes = pad(d.getMinutes());
			const ampm = hours >= 12 ? 'PM' : 'AM';
			hours = hours % 12 || 12;
			return `${day}-${month}-${year} ${pad(hours)}:${minutes} ${ampm}`;
		}
	} catch (e) {
		// ignore
	}
	return String(val);
};

// Helper to extract which secondary manager and admin approved the loan
export const getLoanSignOffDetails = (loan) => {
	if (!loan) return { secManager: null, admin: null, secManagers: [] };

	let historyList = loan.history;
	if (typeof historyList === 'string') {
		try {
			historyList = JSON.parse(historyList);
		} catch (e) {
			historyList = [];
		}
	}
	const histArr = Array.isArray(historyList) ? historyList : [];
	const secAccs = getLoanSecondaryAccounts(loan);

	// 1. Secondary Manager Approval Details
	const secEntries = histArr.filter(
		(h) =>
			h &&
			(h.type === 'sec_manager_approval' ||
				h.type === 'verified' ||
				(h.title && String(h.title).toLowerCase().includes('secondary')))
	);

	let secManagers = [];
	if (secEntries.length > 0) {
		secManagers = secEntries.map((secEntry) => {
			let rawName =
				secEntry.userName ||
				secEntry.user_name ||
				secEntry.name ||
				loan.verified_by ||
				loan.verifiedBy ||
				'';
			let code =
				secEntry.userEmployeeCode ||
				secEntry.employee_code ||
				secEntry.userCode ||
				'';
			let cleanName = rawName;
			if (rawName) {
				const match = String(rawName).trim().match(/^(.*?)\s*\((.*?)\)$/);
				if (match) {
					cleanName = match[1].trim();
					if (!code) code = match[2].trim();
				}
			}
			return {
				name: cleanName || 'Secondary Partner Manager',
				code: code,
				timestamp: formatSignOffTimestamp(
					secEntry.timestamp || secEntry.isoDate || loan.verified_at || loan.verifiedAt || ''
				),
				accountName:
					secEntry.accountName ||
					(secAccs.length === 1 ? secAccs[0] : ''),
			};
		});
	} else if (loan.verified_by || loan.verifiedBy) {
		const rawLabel = String(loan.verified_by || loan.verifiedBy).trim();
		const match = rawLabel.match(/^(.*?)\s*\((.*?)\)$/);
		secManagers = [
			{
				name: match ? match[1].trim() : rawLabel,
				code: match ? match[2].trim() : '',
				timestamp: formatSignOffTimestamp(loan.verified_at || loan.verifiedAt || ''),
				accountName: secAccs.length > 0 ? secAccs.join(', ') : '',
			},
		];
	} else if (
		loan.approval_status === 'APPROVED' ||
		loan.approvalStatus === 'APPROVED' ||
		loan.approval_status === 'PENDING_ADMIN' ||
		loan.approvalStatus === 'PENDING_ADMIN' ||
		loan.status === 'Active' ||
		loan.status === 'Closed'
	) {
		secManagers = [
			{
				name: 'Secondary Partner Manager',
				code: '',
				timestamp: formatSignOffTimestamp(loan.verified_at || loan.verifiedAt || ''),
				accountName: secAccs.length > 0 ? secAccs.join(', ') : 'Secondary Account',
			},
		];
	}

	const secManager = secManagers.length > 0 ? secManagers[0] : null;

	// 2. Admin Final Authorization Details
	const adminEntry = histArr.find(
		(h) =>
			h &&
			(h.type === 'admin_approval' ||
				h.type === 'approved' ||
				(h.title && String(h.title).toLowerCase().includes('admin')))
	);

	let admin = null;
	if (adminEntry) {
		let rawName =
			adminEntry.userName ||
			adminEntry.user_name ||
			adminEntry.name ||
			loan.actioned_by ||
			loan.actionedBy ||
			loan.approved_by ||
			loan.approvedBy ||
			'';
		let code =
			adminEntry.userEmployeeCode ||
			adminEntry.employee_code ||
			adminEntry.userCode ||
			'';
		let cleanName = rawName;
		if (rawName) {
			const match = String(rawName).trim().match(/^(.*?)\s*\((.*?)\)$/);
			if (match) {
				cleanName = match[1].trim();
				if (!code) code = match[2].trim();
			}
		}
		admin = {
			name: cleanName || 'System Administrator',
			code: code,
			timestamp: formatSignOffTimestamp(
				adminEntry.timestamp ||
				adminEntry.isoDate ||
				loan.actioned_at ||
				loan.actionedAt ||
				loan.approved_at ||
				loan.approvedAt ||
				''
			),
		};
	} else if (loan.actioned_by || loan.actionedBy || loan.approved_by || loan.approvedBy) {
		const rawLabel = String(loan.actioned_by || loan.actionedBy || loan.approved_by || loan.approvedBy).trim();
		const match = rawLabel.match(/^(.*?)\s*\((.*?)\)$/);
		admin = {
			name: match ? match[1].trim() : rawLabel,
			code: match ? match[2].trim() : '',
			timestamp: formatSignOffTimestamp(loan.actioned_at || loan.actionedAt || loan.approved_at || loan.approvedAt || ''),
		};
	} else if (
		loan.approval_status === 'APPROVED' ||
		loan.approvalStatus === 'APPROVED' ||
		loan.status === 'Active' ||
		loan.status === 'Closed'
	) {
		admin = {
			name: 'System Administrator',
			code: 'ADMIN',
			timestamp: formatSignOffTimestamp(loan.actioned_at || loan.actionedAt || loan.approved_at || loan.approvedAt || ''),
		};
	}

	return { secManager, admin, secManagers };
};

// Helper to determine if an approved loan was approved by the logged-in user
export const isUserApprovedLoan = (loan, user, accountObjects = []) => {
	if (!loan || !user) return false;
	if (loan.is_deleted) return false;

	const status = (loan.approval_status || loan.approvalStatus || '').toUpperCase();
	if (status === 'REJECTED' || loan.status === 'Rejected') return false;

	// Strictly verify that this loan was approved by the logged-in user
	const approvedByUser = didUserApproveLoan(loan, user);
	if (!approvedByUser) return false;

	// Eligible status: fully approved or secondary manager verified (awaiting admin)
	const isFullyApproved =
		status === 'APPROVED' || loan.status === 'Active' || loan.status === 'Closed';
	const isSecApproved =
		status === 'PENDING_ADMIN' || status === 'VERIFIED';

	return isFullyApproved || isSecApproved;
};

// Helper to determine if a pending loan requires approval from the logged-in user
export const isUserPendingLoan = (loan, user, accountObjects = [], meta = null) => {
	if (!loan || !user) return false;
	if (loan.is_deleted) return false;

	// Loans awaiting payout approval belong in "Payout Pending", not in initial "Pending"
	const loanStatus = (loan.status || '').toLowerCase();
	const appStatus = (loan.approval_status || loan.approvalStatus || '').toUpperCase();
	if (loanStatus === 'pending payout approval' || loanStatus === 'payout pending' || appStatus === 'PENDING_PAYOUT') {
		return false;
	}

	// Loans created by the logged-in user belong in "My Submissions", not in "Pending"
	// (users do not approve loans they created)
	if (didUserCreateLoan(loan, user, accountObjects)) {
		return false;
	}

	// If precomputed approval meta is provided, use needsUserAction directly
	if (meta && typeof meta.needsUserAction === 'boolean') {
		return meta.needsUserAction;
	}

	const status = (loan.approval_status || loan.approvalStatus || 'PENDING').toUpperCase();
	const isPendingSecondary =
		status === 'PENDING_SECONDARY' ||
		(status === 'PENDING' && !loan.verified_by && !['active', 'closed', 'settled', 'overdue', 'date overdue'].includes(loanStatus));
	const isPendingAdmin = status === 'PENDING_ADMIN' || status === 'VERIFIED';

	const isAdmin = ['admin', 'super admin'].includes((user.role || '').toLowerCase()) || ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase());

	// 1. Admin Final Authorization: only Admin when loan has been verified and awaits admin activation
	if (isAdmin) {
		return isPendingAdmin;
	}

	// 2. Secondary Partner Verification: only non-admin user with primary access to loan's secondary account
	if (isPendingSecondary) {
		return checkUserHasPrimaryAccessForLoanSecondary(user, loan, accountObjects);
	}

	return false;
};

// Helper to determine if an installment, sub-installment, or loan has a filled, non-empty payout date
export const hasValidPayoutDate = (item) => {
	if (!item) return false;
	let d = item.payment_date || item.paymentDate || item.payoutDate || item.payout_date;
	if (!d) {
		if (item.dueDate && (!item.date || item.dueDate !== item.date)) {
			d = item.dueDate;
		}
	}
	if (!d) return false;
	const s = String(d).trim();
	if (
		s === '' ||
		s === '-' ||
		s === '—' ||
		s === '–' ||
		s.toLowerCase() === 'null' ||
		s.toLowerCase() === 'none' ||
		s.toLowerCase() === 'undefined'
	) {
		return false;
	}
	return true;
};

/// Helper to determine if a loan has a secondary partner payout approval pending for the logged-in user
export const isUserPayoutPendingLoan = (loan, user, accountObjects = [], updatedKeys = null) => {
	if (!loan || !user) return false;
	if (loan.is_deleted) return false;

	const isAdmin = ['admin', 'super admin'].includes((user.role || '').toLowerCase()) || ['admin', 'jc0033'].includes((user.employee_code || '').toLowerCase());
	const isUserPri = checkUserHasPrimaryAccessForLoanPrimary(user, loan, accountObjects);
	const isUserSec = checkUserHasPrimaryAccessForLoanSecondary(user, loan, accountObjects);

	// User must either be an admin or have primary access to loan's primary or secondary account
	if (!isAdmin && !isUserPri && !isUserSec) {
		return false;
	}

	const loanKey = getLoanUniqueId(loan);

	// Extract loan history to find editor info if needed
	let historyList = loan.history;
	if (typeof historyList === 'string') {
		try {
			historyList = JSON.parse(historyList);
		} catch (e) {
			historyList = [];
		}
	}
	const histArr = Array.isArray(historyList) ? historyList : [];

	// 1. Check repayment schedule installments and subInstallments
	const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
	let hasPendingInstallment = false;

	if (Array.isArray(schedule)) {
		for (let idx = 0; idx < schedule.length; idx++) {
			const inst = schedule[idx];
			if (!inst) continue;
			const sNo = inst.sNo || inst.installmentNumber || idx + 1;
			const pStatus = (inst.payout_approval_status || inst.payoutApprovalStatus || '').toUpperCase();
			const instStatus = (inst.status || '').toLowerCase();
			const isMainPending = pStatus === 'PENDING' || instStatus === 'pending payout approval';

			// Check subInstallments if partial
			if (inst.isPartial && Array.isArray(inst.subInstallments)) {
				for (const sub of inst.subInstallments) {
					if (!sub) continue;
					const subSNo = sub.sNo || `${sNo}${sub.subType === 'paid' ? 'A' : 'B'}`;
					const subKey = `${loanKey}_${subSNo}`;
					const parentKey = `${loanKey}_${sNo}`;
					if (updatedKeys && (updatedKeys.has(subKey) || updatedKeys.has(parentKey))) {
						continue;
					}

					// Payout date field must be filled and waiting for approval
					if (!hasValidPayoutDate(sub)) {
						continue;
					}

					const subPStatus = (sub.payout_approval_status || sub.payoutApprovalStatus || '').toUpperCase();
					const subStatus = (sub.status || '').toLowerCase();
					if (subPStatus === 'PENDING' || subStatus === 'pending payout approval') {
						const subHistMatch = histArr
							.filter(
								(h) =>
									h &&
									(h.type === 'payout_date_update' || h.type === 'payout_approval_request') &&
									(String(h.emiNo) === String(subSNo) || Number(h.emiNo) === Number(sNo))
							)
							.slice(-1)[0];

						const subUpdatedBy =
							sub.payout_requested_by ||
							sub.payoutRequestedBy ||
							subHistMatch?.userName;

						if (isMatchUser(user, subUpdatedBy)) {
							continue;
						}

						const subEditorRole = (
							sub.payout_editor_role ||
							sub.payoutEditorRole ||
							sub.payout_requested_role ||
							sub.payoutRequestedRole ||
							(sub.payout_approval_target === 'PRIMARY' ? 'SECONDARY' : 'PRIMARY')
						).toUpperCase();

						const targetRole = (
							sub.payout_approval_target ||
							sub.payoutApprovalTarget ||
							(subEditorRole === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY')
						).toUpperCase();

						const specificSecAcc = sub.secondaryAccountName || sub.accountName || sub.accountTag || (Array.isArray(sub.secAccounts) && sub.secAccounts.length === 1 ? sub.secAccounts[0].accountName : null);
						const isCurUserSec = specificSecAcc
							? checkUserHasPrimaryAccessForAccount(user, specificSecAcc, accountObjects)
							: isUserSec;

						if (isAdmin) {
							hasPendingInstallment = true;
							break;
						}
						if (targetRole === 'PRIMARY' && isUserPri) {
							hasPendingInstallment = true;
							break;
						} else if (targetRole === 'SECONDARY' && isCurUserSec) {
							hasPendingInstallment = true;
							break;
						}
					}
				}
				if (hasPendingInstallment) break;
				continue;
			}

			// Main installment
			const itemKey = `${loanKey}_${sNo}`;
			if (updatedKeys && updatedKeys.has(itemKey)) {
				continue;
			}

			// Payout date field must be filled and waiting for approval
			if (!hasValidPayoutDate(inst)) {
				continue;
			}

			if (isMainPending) {
				const histMatch = histArr
					.filter(
						(h) =>
							h &&
							(h.type === 'payout_date_update' || h.type === 'payout_approval_request') &&
							(h.emiNo === sNo || Number(h.emiNo) === Number(sNo))
					)
					.slice(-1)[0];

				const updatedBy =
					inst.payout_requested_by ||
					inst.payoutRequestedBy ||
					histMatch?.userName;

				if (isMatchUser(user, updatedBy)) {
					continue;
				}

				const editorRole = (
					inst.payout_editor_role ||
					inst.payoutEditorRole ||
					inst.payout_requested_role ||
					inst.payoutRequestedRole ||
					(inst.payout_approval_target === 'PRIMARY' ? 'SECONDARY' : 'PRIMARY')
				).toUpperCase();

				const targetRole = (
					inst.payout_approval_target ||
					inst.payoutApprovalTarget ||
					(editorRole === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY')
				).toUpperCase();

				const specificSecAcc = inst.secondaryAccountName || inst.accountName || inst.accountTag || (Array.isArray(inst.secAccounts) && inst.secAccounts.length === 1 ? inst.secAccounts[0].accountName : null);
				const isCurUserSec = specificSecAcc
					? checkUserHasPrimaryAccessForAccount(user, specificSecAcc, accountObjects)
					: isUserSec;

				if (isAdmin) {
					hasPendingInstallment = true;
					break;
				}
				if (targetRole === 'PRIMARY' && isUserPri) {
					hasPendingInstallment = true;
					break;
				} else if (targetRole === 'SECONDARY' && isCurUserSec) {
					hasPendingInstallment = true;
					break;
				}
			}
		}
	}

	// 2. Check top-level loan status (facility payout)
	if (!hasPendingInstallment) {
		const loanStatus = (loan.status || '').toLowerCase();
		const approvalStatus = (loan.approval_status || loan.approvalStatus || '').toUpperCase();
		const hasTopLevelPayoutPending =
			loanStatus === 'pending payout approval' ||
			loanStatus === 'payout pending' ||
			approvalStatus === 'PENDING_PAYOUT';

		if (hasTopLevelPayoutPending && hasValidPayoutDate(loan)) {
			const topKey = `${loanKey}_All`;
			const topUpdatedBy = loan.requester_name || loan.created_by;
			if (!(updatedKeys && updatedKeys.has(topKey)) && !isMatchUser(user, topUpdatedBy)) {
				if (isAdmin || isUserPri) {
					return true;
				}
			}
		}
		return false;
	}

	return hasPendingInstallment;
};

// Helper to extract all pending payout EMIs for a loan, including who updated the payout date and who approves it
export const getLoanPendingPayoutItems = (
	loan,
	currentUser,
	accountObjects = [],
	allUsers = [],
	updatedKeys = null
) => {
	if (!loan) return [];
	const loanKey = getLoanUniqueId(loan);
	const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
	const pendingItems = [];

	const isAdmin = ['admin', 'super admin'].includes((currentUser?.role || '').toLowerCase()) || ['admin', 'jc0033'].includes((currentUser?.employee_code || '').toLowerCase());
	const isUserPri = checkUserHasPrimaryAccessForLoanPrimary(currentUser, loan, accountObjects);
	const isUserSec = checkUserHasPrimaryAccessForLoanSecondary(currentUser, loan, accountObjects);

	// Extract loan history to find editor info if needed
	let historyList = loan.history;
	if (typeof historyList === 'string') {
		try {
			historyList = JSON.parse(historyList);
		} catch (e) {
			historyList = [];
		}
	}
	const histArr = Array.isArray(historyList) ? historyList : [];

	// Eligible users for primary and secondary accounts
	const priUsers = getUsersWithPrimaryAccessForLoanPrimary(loan, allUsers, accountObjects);
	const secUsers = getUsersWithPrimaryAccessForLoanSecondary(loan, allUsers, accountObjects);

	if (Array.isArray(schedule)) {
		schedule.forEach((inst, idx) => {
			if (!inst) return;
			const sNo = inst.sNo || inst.installmentNumber || idx + 1;
			const pStatus = (inst.payout_approval_status || inst.payoutApprovalStatus || '').toUpperCase();
			const instStatus = (inst.status || '').toLowerCase();
			const isMainPending = pStatus === 'PENDING' || instStatus === 'pending payout approval';

			const hasPendingSub =
				inst.isPartial &&
				Array.isArray(inst.subInstallments) &&
				inst.subInstallments.some(
					(s) =>
						s &&
						hasValidPayoutDate(s) &&
						((s.payout_approval_status || s.payoutApprovalStatus || '').toUpperCase() === 'PENDING' ||
							(s.status || '').toLowerCase() === 'pending payout approval')
				);

			// If sub-installments are pending, list the pending sub-installments
			if (hasPendingSub) {
				inst.subInstallments.forEach((sub) => {
					if (!sub) return;
					if (!hasValidPayoutDate(sub)) return;
					const subPStatus = (sub.payout_approval_status || sub.payoutApprovalStatus || '').toUpperCase();
					const subInstStatus = (sub.status || '').toLowerCase();
					if (subPStatus !== 'PENDING' && subInstStatus !== 'pending payout approval') return;

					const subSNo = sub.sNo || `${sNo}${sub.subType === 'paid' ? 'A' : 'B'}`;
					const subKey = `${loanKey}_${subSNo}`;
					const parentKey = `${loanKey}_${sNo}`;
					if (updatedKeys && (updatedKeys.has(subKey) || updatedKeys.has(parentKey))) {
						return;
					}

					const subEditorRole = (
						sub.payout_editor_role ||
						sub.payoutEditorRole ||
						sub.payout_requested_role ||
						sub.payoutRequestedRole ||
						(sub.payout_approval_target === 'PRIMARY' ? 'SECONDARY' : 'PRIMARY')
					).toUpperCase();

					const histMatch = histArr
						.filter(
							(h) =>
								h &&
								(h.type === 'payout_date_update' || h.type === 'payout_approval_request') &&
								(String(h.emiNo) === String(subSNo) || Number(h.emiNo) === Number(sNo))
						)
						.slice(-1)[0];

					const subUpdatedBy =
						sub.payout_requested_by ||
						sub.payoutRequestedBy ||
						histMatch?.userName ||
						(subEditorRole === 'SECONDARY' ? 'Secondary Partner' : 'Primary Partner');

					if (isMatchUser(currentUser, subUpdatedBy)) {
						return;
					}

					const subUpdatedAt =
						sub.payout_requested_at ||
						sub.payoutRequestedAt ||
						histMatch?.timestamp ||
						'';

					const subTargetRole = (
						sub.payout_approval_target ||
						sub.payoutApprovalTarget ||
						(subEditorRole === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY')
					).toUpperCase();

					const specificSecAcc = sub.secondaryAccountName || sub.accountName || sub.accountTag || (Array.isArray(sub.secAccounts) && sub.secAccounts.length === 1 ? sub.secAccounts[0].accountName : null);
					let subSecUsers = secUsers;
					let isCurUserSec = isUserSec;
					if (specificSecAcc) {
						subSecUsers = allUsers.filter((u) => {
							if (['admin', 'super admin'].includes((u.role || '').toLowerCase())) return false;
							return checkUserHasPrimaryAccessForAccount(u, specificSecAcc, accountObjects);
						});
						isCurUserSec = checkUserHasPrimaryAccessForAccount(currentUser, specificSecAcc, accountObjects);
					}

					const subTargetUsers = subTargetRole === 'PRIMARY' ? priUsers : subSecUsers;
					const subTargetUserNames = subTargetUsers.map((u) => u.name || u.employee_code).filter(Boolean);

					const canSubApprove =
						isAdmin ||
						(subTargetRole === 'PRIMARY' && isUserPri) ||
						(subTargetRole === 'SECONDARY' && isCurUserSec);

					const isCurrentUserEditor = isMatchUser(currentUser, subUpdatedBy);

					const subTotalAmount = Number(sub.amount || 0);
					const priShare =
						loan?.primary_share != null
							? Number(loan.primary_share)
							: loan?.primaryShare != null
								? Number(loan.primaryShare)
								: 50;

					let subSecAmount = null;
					if (Array.isArray(sub.secAccounts) && sub.secAccounts.length > 0) {
						subSecAmount = sub.secAccounts.reduce((sum, sa) => sum + (Number(sa.amount) || 0), 0);
					} else if (sub.secAmount != null && !isNaN(Number(sub.secAmount))) {
						subSecAmount = Number(sub.secAmount);
					} else if (sub.sec_amount != null && !isNaN(Number(sub.sec_amount))) {
						subSecAmount = Number(sub.sec_amount);
					} else {
						const priAmt =
							sub.priAmount != null
								? Number(sub.priAmount)
								: sub.primaryAmount != null
									? Number(sub.primaryAmount)
									: Math.round((subTotalAmount * priShare) / 100);
						subSecAmount = Math.max(0, subTotalAmount - priAmt);
					}

					pendingItems.push({
						sNo: subSNo,
						parentSNo: sNo,
						label: `EMI #${subSNo}`,
						amount: sub.amount || 0,
						secAmount: subSecAmount,
						dueDate: sub.date || inst.date || sub.dueDate || '-',
						payoutDate: sub.paymentDate || sub.payment_date || sub.dueDate || sub.payoutDate || '-',
						recdDate: sub.receivedDate || '-',
						updatedBy: subUpdatedBy,
						updatedRole: subEditorRole === 'SECONDARY' ? 'Secondary Partner' : 'Primary Partner',
						updatedAt: subUpdatedAt,
						targetRole: subTargetRole === 'PRIMARY' ? 'Primary Partner' : 'Secondary Partner',
						targetUserNames: subTargetUserNames,
						approverDisplay:
							subTargetUserNames.length > 0
								? `${subTargetRole === 'PRIMARY' ? 'Primary Partner' : 'Secondary Partner'} (${subTargetUserNames.join(', ')})`
								: subTargetRole === 'PRIMARY'
									? 'Primary Partner Manager'
									: 'Secondary Partner Manager',
						canCurrentUserApprove: canSubApprove,
						isCurrentUserEditor,
						notes: sub.payout_notes || '',
						rawInst: sub,
					});
				});
				return;
			}

			// If main installment is pending and payout date field is filled
			if (isMainPending && hasValidPayoutDate(inst)) {
				const itemKey = `${loanKey}_${sNo}`;
				if (updatedKeys && updatedKeys.has(itemKey)) {
					return;
				}

				const editorRole = (
					inst.payout_editor_role ||
					inst.payoutEditorRole ||
					inst.payout_requested_role ||
					inst.payoutRequestedRole ||
					(inst.payout_approval_target === 'PRIMARY' ? 'SECONDARY' : 'PRIMARY')
				).toUpperCase();

				const histMatch = histArr
					.filter(
						(h) =>
							h &&
							(h.type === 'payout_date_update' || h.type === 'payout_approval_request') &&
							(h.emiNo === sNo || Number(h.emiNo) === Number(sNo))
					)
					.slice(-1)[0];

				const updatedBy =
					inst.payout_requested_by ||
					inst.payoutRequestedBy ||
					histMatch?.userName ||
					(editorRole === 'SECONDARY' ? 'Secondary Partner' : 'Primary Partner');

				if (isMatchUser(currentUser, updatedBy)) {
					return;
				}

				const updatedAt =
					inst.payout_requested_at ||
					inst.payoutRequestedAt ||
					histMatch?.timestamp ||
					'';

				const targetRole = (
					inst.payout_approval_target ||
					inst.payoutApprovalTarget ||
					(editorRole === 'SECONDARY' ? 'PRIMARY' : 'SECONDARY')
				).toUpperCase();

				const specificSecAcc = inst.secondaryAccountName || inst.accountName || inst.accountTag || (Array.isArray(inst.secAccounts) && inst.secAccounts.length === 1 ? inst.secAccounts[0].accountName : null);
				let instSecUsers = secUsers;
				let isCurUserSec = isUserSec;
				if (specificSecAcc) {
					instSecUsers = allUsers.filter((u) => {
						if (['admin', 'super admin'].includes((u.role || '').toLowerCase())) return false;
						return checkUserHasPrimaryAccessForAccount(u, specificSecAcc, accountObjects);
					});
					isCurUserSec = checkUserHasPrimaryAccessForAccount(currentUser, specificSecAcc, accountObjects);
				}

				const targetUsers = targetRole === 'PRIMARY' ? priUsers : instSecUsers;
				const targetUserNames = targetUsers.map((u) => u.name || u.employee_code).filter(Boolean);

				const canCurrentUserApprove =
					isAdmin ||
					(targetRole === 'PRIMARY' && isUserPri) ||
					(targetRole === 'SECONDARY' && isCurUserSec);

				const isCurrentUserEditor = isMatchUser(currentUser, updatedBy);

				const instTotalAmount = Number(inst.amount || 0);
				const priShare =
					loan?.primary_share != null
						? Number(loan.primary_share)
						: loan?.primaryShare != null
							? Number(loan.primaryShare)
							: 50;

				let instSecAmount = null;
				if (Array.isArray(inst.secAccounts) && inst.secAccounts.length > 0) {
					instSecAmount = inst.secAccounts.reduce((sum, sa) => sum + (Number(sa.amount) || 0), 0);
				} else if (inst.secAmount != null && !isNaN(Number(inst.secAmount))) {
					instSecAmount = Number(inst.secAmount);
				} else if (inst.sec_amount != null && !isNaN(Number(inst.sec_amount))) {
					instSecAmount = Number(inst.sec_amount);
				} else {
					const priAmt =
						inst.priAmount != null
							? Number(inst.priAmount)
							: inst.primaryAmount != null
								? Number(inst.primaryAmount)
								: Math.round((instTotalAmount * priShare) / 100);
					instSecAmount = Math.max(0, instTotalAmount - priAmt);
				}

				pendingItems.push({
					sNo,
					parentSNo: sNo,
					label: `EMI #${sNo}`,
					amount: inst.amount || 0,
					secAmount: instSecAmount,
					dueDate: inst.date || '-',
					payoutDate: inst.payment_date || inst.paymentDate || inst.dueDate || inst.payoutDate || '-',
					recdDate: inst.receivedDate || inst.recdDate || '-',
					updatedBy,
					updatedRole: editorRole === 'SECONDARY' ? 'Secondary Partner' : 'Primary Partner',
					updatedAt,
					targetRole: targetRole === 'PRIMARY' ? 'Primary Partner' : 'Secondary Partner',
					targetUserNames,
					approverDisplay:
						targetUserNames.length > 0
							? `${targetRole === 'PRIMARY' ? 'Primary Partner' : 'Secondary Partner'} (${targetUserNames.join(', ')})`
							: targetRole === 'PRIMARY'
								? 'Primary Partner Manager'
								: 'Secondary Partner Manager',
					canCurrentUserApprove,
					isCurrentUserEditor,
					notes: inst.payout_notes || '',
					rawInst: inst,
				});
			}
		});
	}

	// Fallback if top-level loan is in pending payout approval
	if (pendingItems.length === 0) {
		const loanStatus = (loan.status || '').toLowerCase();
		const appStatus = (loan.approval_status || loan.approvalStatus || '').toUpperCase();
		if (
			(loanStatus === 'pending payout approval' ||
			loanStatus === 'payout pending' ||
			appStatus === 'PENDING_PAYOUT') &&
			hasValidPayoutDate(loan)
		) {
			const topKey = `${loanKey}_All`;
			const topUpdatedBy = loan.requester_name || loan.created_by;
			if (!(updatedKeys && updatedKeys.has(topKey)) && !isMatchUser(currentUser, topUpdatedBy)) {
				const targetRole = 'Primary Partner';
				const targetUserNames = priUsers.map((u) => u.name || u.employee_code).filter(Boolean);
				const fallbackTotal = Number(loan.loan_amount || loan.amount || 0);
				const priShare =
					loan?.primary_share != null
						? Number(loan.primary_share)
						: loan?.primaryShare != null
							? Number(loan.primaryShare)
							: 50;
				const fallbackSecAmt = Math.max(0, fallbackTotal - Math.round((fallbackTotal * priShare) / 100));

				pendingItems.push({
					sNo: 'All',
					parentSNo: 1,
					label: 'Facility Payout',
					amount: loan.loan_amount || loan.amount || 0,
					secAmount: fallbackSecAmt,
					dueDate: loan.loan_date || '-',
					payoutDate: '-',
					recdDate: '-',
					updatedBy: topUpdatedBy || 'Partner Manager',
					updatedRole: 'Secondary Partner',
					updatedAt: loan.created_at || '',
					targetRole,
					targetUserNames,
					approverDisplay:
						targetUserNames.length > 0
							? `Primary Partner (${targetUserNames.join(', ')})`
							: 'Primary Partner Manager',
					canCurrentUserApprove: isAdmin || isUserPri,
					isCurrentUserEditor: false,
					notes: '',
					rawInst: null,
				});
			}
		}
	}

	return pendingItems;
};

// Calculate secondary account remittance amount for a payout item
export const getPayoutItemSecondaryAmount = (item, loan) => {
	if (!item) return 0;
	if (item.secAmount != null && !isNaN(Number(item.secAmount)) && Number(item.secAmount) > 0) {
		return Number(item.secAmount);
	}
	const raw = item.rawInst || {};
	if (Array.isArray(raw.secAccounts) && raw.secAccounts.length > 0) {
		const total = raw.secAccounts.reduce((sum, sa) => sum + (Number(sa.amount) || 0), 0);
		if (total > 0) return total;
	}
	if (raw.secAmount != null && !isNaN(Number(raw.secAmount)) && Number(raw.secAmount) > 0) {
		return Number(raw.secAmount);
	}
	if (raw.sec_amount != null && !isNaN(Number(raw.sec_amount)) && Number(raw.sec_amount) > 0) {
		return Number(raw.sec_amount);
	}
	const totalAmount = Number(item.amount || raw.amount || 0);
	const priShare =
		loan?.primary_share != null
			? Number(loan.primary_share)
			: loan?.primaryShare != null
				? Number(loan.primaryShare)
				: 50;
	const priAmount =
		raw.priAmount != null
			? Number(raw.priAmount)
			: raw.primaryAmount != null
				? Number(raw.primaryAmount)
				: Math.round((totalAmount * priShare) / 100);

	return Math.max(0, totalAmount - priAmount);
};

// Helper to determine if a loan was submitted/created by the logged-in user
export const isUserSubmissionLoan = (loan, user, accountObjects = [], meta = null) => {
	if (!loan || !user) return false;
	if (loan.is_deleted) return false;

	// Strictly verify that the logged-in user created/submitted this joint loan
	return didUserCreateLoan(loan, user, accountObjects);
};

// Indian Currency Formatter (handles numbers and currency strings like "₹550,000" or 550000)
export const formatCurrency = (val) => {
	if (val === null || val === undefined || val === '') return '₹0';
	if (typeof val === 'number') {
		if (isNaN(val)) return '₹0';
		const abs = Math.abs(val);
		const str = Math.round(abs).toString();
		let lastThree = str.substring(str.length - 3);
		const otherNumbers = str.substring(0, str.length - 3);
		if (otherNumbers !== '') {
			lastThree = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
		}
		return `${val < 0 ? '-' : ''}₹${lastThree}`;
	}

	const strVal = String(val).trim();
	const cleaned = strVal.replace(/[^0-9.-]/g, '');
	if (!cleaned || cleaned === '-' || cleaned === '.') {
		return strVal;
	}

	const num = Number(cleaned);
	if (isNaN(num)) return strVal;

	const abs = Math.abs(num);
	const str = Math.round(abs).toString();
	let lastThree = str.substring(str.length - 3);
	const otherNumbers = str.substring(0, str.length - 3);
	if (otherNumbers !== '') {
		lastThree = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
	}
	return `${num < 0 ? '-' : ''}₹${lastThree}`;
};

// Helper to get formatted installment EMI in Indian currency format
export const getLoanInstallmentEmi = (loan) => {
	if (!loan) return 'Schedule';
	const rawEmi =
		loan.monthlyPayment ||
		loan.monthly_payment ||
		loan.installment_emi ||
		loan.installmentEmi ||
		loan.emi;
	if (rawEmi) {
		return formatCurrency(rawEmi);
	}
	if (Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0) {
		const firstItem = loan.repaymentSchedule[0];
		if (firstItem && (firstItem.amount || firstItem.installment_amount)) {
			return formatCurrency(firstItem.amount || firstItem.installment_amount);
		}
	}
	return 'Schedule';
};

// Helper to get formatted total facility repayment
export const getLoanTotalRepayment = (loan) => {
	if (!loan) return '₹0';
	let totalRepay = Number(
		loan.total_repayment_amount ||
		loan.total_repayment ||
		loan.totalRepayAmount ||
		0
	);
	if (totalRepay <= 0 && Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0) {
		totalRepay = loan.repaymentSchedule.reduce(
			(sum, s) => sum + (Number(s.amount || s.repayment_amount || s.total_amount) || 0),
			0
		);
	}
	if (totalRepay <= 0 && Array.isArray(loan.repayment_schedule) && loan.repayment_schedule.length > 0) {
		totalRepay = loan.repayment_schedule.reduce(
			(sum, s) => sum + (Number(s.amount || s.repayment_amount || s.total_amount) || 0),
			0
		);
	}
	if (totalRepay <= 0) {
		totalRepay = Number(loan.loan_amount || loan.amount || 0);
	}
	return formatCurrency(totalRepay);
};

// Helper to format loan interest rate from uploaded PDF without artificial defaults
export const getLoanInterestRateDisplay = (loan) => {
	if (!loan) return '-';
	const raw =
		loan.interest_rate ||
		loan.interestRate ||
		loan.rate;
	if (!raw) return '-';
	const str = String(raw).trim();
	if (!str || str.toLowerCase() === 'none' || str === '-') return '-';
	if (str === '7.2% Fixed' || str === '12% Fixed') {
		// Old hardcoded default detected — do not show default value!
		return '-';
	}
	// If it has (Y) or (y) format, replace with per year
	if (str.includes('(Y)') || str.includes('(y)')) {
		return str.replace(/\(Y\)/i, 'per year').replace(/\s+/g, ' ').trim();
	}
	return str;
};

// Helper to get total dues / EMIs count display (e.g. "20 Dues")
export const getLoanTotalDuesDisplay = (loan) => {
	if (!loan) return '-';
	const raw =
		loan.total_due ||
		loan.totalDue ||
		loan.total_dues ||
		loan.totalDues ||
		loan.total_emi ||
		loan.totalEmi ||
		loan.total_emis ||
		loan.totalEmis;
	if (raw) {
		const str = String(raw).trim();
		if (str.toLowerCase().includes('due') || str.toLowerCase().includes('emi')) {
			return str;
		}
		const m = str.match(/\d+/);
		if (m) {
			const n = parseInt(m[0], 10);
			return `${n} ${n === 1 ? 'Due' : 'Dues'}`;
		}
	}
	if (Array.isArray(loan.repaymentSchedule) && loan.repaymentSchedule.length > 0) {
		const n = loan.repaymentSchedule.length;
		return `${n} ${n === 1 ? 'Due' : 'Dues'}`;
	}
	if (Array.isArray(loan.repayment_schedule) && loan.repayment_schedule.length > 0) {
		const n = loan.repayment_schedule.length;
		return `${n} ${n === 1 ? 'Due' : 'Dues'}`;
	}
	if (loan.total_installments || loan.totalInstallments) {
		const m = String(loan.total_installments || loan.totalInstallments).match(/\d+/);
		if (m) {
			const n = parseInt(m[0], 10);
			return `${n} ${n === 1 ? 'Due' : 'Dues'}`;
		}
	}
	if (loan.tenure) {
		const m = String(loan.tenure).match(/\d+/);
		if (m) {
			const n = parseInt(m[0], 10);
			return `${n} ${n === 1 ? 'Due' : 'Dues'}`;
		}
	}
	return '-';
};

// Formatted current timestamp
const getFormattedNow = () => {
	const d = new Date();
	const day = String(d.getDate()).padStart(2, '0');
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const year = d.getFullYear();
	let hours = d.getHours();
	const minutes = String(d.getMinutes()).padStart(2, '0');
	const ampm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12 || 12;
	return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

// Clean string helper for case/symbol-insensitive comparison
const cleanAccountKey = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');

// Resolve any account string (acronym, uppercase name, partial, etc.) to the canonical account name from accountObjects
export const getCanonicalAccountName = (rawName, accountObjects = []) => {
	if (!rawName || rawName === 'ALL') return rawName;
	const targetClean = cleanAccountKey(rawName);
	if (!targetClean) return rawName;

	if (Array.isArray(accountObjects) && accountObjects.length > 0) {
		// 1. Exact or clean match by account name
		const byName = accountObjects.find(
			(a) => cleanAccountKey(a.name) === targetClean
		);
		if (byName && byName.name) return byName.name.trim();

		// 2. Match by acronym (e.g. 'SCS' -> 'Surge Capital Solutions', 'AS' -> 'Ascend Solutions')
		const byAcronym = accountObjects.find(
			(a) => cleanAccountKey(a.acronym) === targetClean
		);
		if (byAcronym && byAcronym.name) return byAcronym.name.trim();

		// 3. Match via isAccountMatch
		const byMatch = accountObjects.find(
			(a) => isAccountMatch(rawName, a.name, accountObjects) || isAccountMatch(rawName, a.acronym, accountObjects)
		);
		if (byMatch && byMatch.name) return byMatch.name.trim();
	}

	return String(rawName).trim();
};

// Resolve acronym for an account name (e.g. "S.Sudhakar" -> "SS", "Surge Capital Solutions" -> "SCS")
export const getAccountAcronym = (rawName, accountObjects = []) => {
	if (!rawName || rawName === '-') return '-';
	const targetClean = cleanAccountKey(rawName);
	if (!targetClean) return '-';

	if (Array.isArray(accountObjects) && accountObjects.length > 0) {
		const found = accountObjects.find(
			(a) => cleanAccountKey(a.name) === targetClean || cleanAccountKey(a.acronym) === targetClean
		);
		if (found && found.acronym) return found.acronym.trim().toUpperCase();
		if (found && found.name) return found.name.trim();
	}

	return String(rawName).trim();
};

// Color styling helper for Account tag badges
export const getAccountTagColor = (acronymOrName, accountObjects = []) => {
	const clean = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
	const targetClean = clean(acronymOrName);
	if (Array.isArray(accountObjects) && accountObjects.length > 0) {
		const acc = accountObjects.find(
			(a) => clean(a.acronym) === targetClean || clean(a.name) === targetClean
		);
		if (acc) {
			const color = acc.color || 'blue';
			switch (color) {
				case 'purple':
					return 'bg-purple-50 text-purple-700 ring-purple-300';
				case 'blue':
					return 'bg-blue-50 text-blue-700 ring-blue-300';
				case 'teal':
					return 'bg-teal-50 text-teal-700 ring-teal-300';
				case 'amber':
				case 'orange':
					return 'bg-amber-50 text-amber-700 ring-amber-300';
				case 'rose':
				case 'red':
					return 'bg-rose-50 text-rose-700 ring-rose-300';
				case 'emerald':
				case 'green':
					return 'bg-emerald-50 text-emerald-700 ring-emerald-300';
				default:
					return 'bg-slate-100 text-slate-700 ring-slate-300';
			}
		}
	}
	return getPrimaryTagColor(acronymOrName);
};

// Helper to determine if a loan matches an account name (primary or secondary)
export const doesLoanMatchAccount = (loan, targetAccountName, accountObjects = []) => {
	if (!targetAccountName || targetAccountName === 'ALL') return true;
	if (!loan) return false;

	const targetCanonical = getCanonicalAccountName(targetAccountName, accountObjects);
	const targetKey = cleanAccountKey(targetCanonical || targetAccountName);
	const targetLow = String(targetAccountName).toLowerCase().trim();

	const pri = loan.primaryAccountName || loan.primary || loan.primary_account_name || '';
	const priCanonical = getCanonicalAccountName(pri, accountObjects);
	const priKey = cleanAccountKey(priCanonical || pri);

	if (priKey && targetKey && priKey === targetKey) return true;
	if (isAccountMatch(pri, targetAccountName, accountObjects)) return true;

	const secs = getLoanSecondaryAccounts(loan);
	for (const sec of secs) {
		const secCanonical = getCanonicalAccountName(sec, accountObjects);
		const secKey = cleanAccountKey(secCanonical || sec);
		if (secKey && targetKey && secKey === targetKey) return true;
		if (isAccountMatch(sec, targetAccountName, accountObjects)) return true;
	}

	if (pri.toLowerCase().includes(targetLow)) return true;
	if (secs.some((s) => s.toLowerCase().includes(targetLow))) return true;
	return false;
};

// Modern Custom Dropdown Component for Accounts Filter in Requests
function ModernAccountDropdown({ value = 'ALL', onChange, options = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const dropdownRef = useRef(null);
	const searchInputRef = useRef(null);

	const selectedOption =
		options.find((o) => o.id === value) ||
		options[0] || { id: 'ALL', label: 'All Accounts' };

	const filteredOptions = useMemo(() => {
		if (!searchTerm.trim()) return options;
		const q = searchTerm.toLowerCase();
		return options.filter((o) => {
			const labelMatch = o.label && o.label.toLowerCase().includes(q);
			const acronymMatch = o.acronym && o.acronym.toLowerCase().includes(q);
			return labelMatch || acronymMatch;
		});
	}, [options, searchTerm]);

	// Close on click outside or Escape
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsOpen(false);
				setSearchTerm('');
			}
		};
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsOpen(false);
				setSearchTerm('');
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	// Focus search input when opened
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
		if (isOpen) setSearchTerm('');
	};

	const handleSelect = (id) => {
		onChange(id);
		setIsOpen(false);
		setSearchTerm('');
	};

	const isFiltered = value !== 'ALL';

	return (
		<div ref={dropdownRef} className="relative inline-block text-left">
			{/* Trigger Button */}
			<button
				type="button"
				onClick={handleToggle}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={`h-9 inline-flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isOpen
					? 'bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs'
					: isFiltered
						? 'bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs'
						: 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
					}`}
			>
				<span className="max-w-[130px] sm:max-w-[150px] truncate text-left">
					{selectedOption.label}
				</span>

				{selectedOption.count !== undefined && (
					<span
						className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${isFiltered
							? 'bg-primary text-white'
							: 'bg-slate-200/90 text-slate-700'
							}`}
					>
						{selectedOption.count}
					</span>
				)}

				{isFiltered && (
					<span
						role="button"
						tabIndex={0}
						onClick={(e) => {
							e.stopPropagation();
							onChange('ALL');
							setSearchTerm('');
						}}
						title="Clear account filter"
						className="p-0.5 hover:bg-primary/15 rounded text-primary/70 hover:text-primary transition-colors cursor-pointer"
					>
						<span className="material-symbols-outlined text-[14px]">close</span>
					</span>
				)}

				<span
					className={`material-symbols-outlined text-[17px] text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-primary' : ''
						}`}
				>
					expand_more
				</span>
			</button>

			{/* Dropdown Menu Popover */}
			{isOpen && (
				<div
					role="listbox"
					className="absolute left-0 sm:left-auto sm:right-0 lg:left-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/90 p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100"
				>
					{/* Header */}
					<div className="flex items-center justify-between px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
						<span className="flex items-center gap-1.5">
							<span className="material-symbols-outlined text-[14px]">filter_list</span>
							Filter by Account
						</span>
						{isFiltered && (
							<button
								type="button"
								onClick={() => handleSelect('ALL')}
								className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
							>
								Show All
							</button>
						)}
					</div>

					{/* Options List */}
					<div className="overflow-y-auto flex flex-col gap-0.5 p-0.5 max-h-56">
						{filteredOptions.length > 0 ? (
							filteredOptions.map((opt) => {
								const isSelected = opt.id === value;
								return (
									<button
										key={opt.id}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => handleSelect(opt.id)}
										className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group text-left ${isSelected
											? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20'
											: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
											}`}
									>
										<div className="flex items-center gap-2 min-w-0 pr-2">
											<span className="truncate">{opt.label}</span>
											{opt.acronym && opt.id !== 'ALL' && opt.acronym.toLowerCase() !== opt.label.toLowerCase() && (
												<span className="text-[10px] font-bold text-slate-400 shrink-0">
													({opt.acronym})
												</span>
											)}
										</div>

										<div className="flex items-center gap-1.5 shrink-0">
											{opt.count !== undefined && (
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${isSelected
														? 'bg-primary text-white'
														: opt.count > 0
															? 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
															: 'bg-slate-50 text-slate-400'
														}`}
												>
													{opt.count}
												</span>
											)}
											{isSelected && (
												<span className="material-symbols-outlined text-[16px] text-primary">
													check
												</span>
											)}
										</div>
									</button>
								);
							})
						) : (
							<div className="px-3 py-4 text-center text-slate-400 text-xs">
								No accounts found
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default function Requests({
	currentUser: propCurrentUser,
	searchQuery = '',
	onNavigateToJointLoan,
}) {
	const currentUser = useMemo(() => {
		if (propCurrentUser) return propCurrentUser;
		try {
			const stored = sessionStorage.getItem('loanDesk_user') || localStorage.getItem('loanDesk_user');
			return stored ? JSON.parse(stored) : null;
		} catch (e) {
			return null;
		}
	}, [propCurrentUser]);

	// Current user role flags
	const isAdmin = useMemo(() => {
		return (
			['admin', 'super admin'].includes((currentUser?.role || '').toLowerCase()) ||
			['admin', 'jc0033'].includes((currentUser?.employee_code || '').toLowerCase())
		);
	}, [currentUser]);

	const [loans, setLoans] = useState([]);
	const [availableAccountObjects, setAvailableAccountObjects] = useState([]);
	const [allUsers, setAllUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
	const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved' | 'payout-pending' | 'others-approval'
	const [filterAccount, setFilterAccount] = useState('ALL');
	const [localSearch, setLocalSearch] = useState('');
	const [selectedLoan, setSelectedLoan] = useState(null);
	const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
	const [loanToReject, setLoanToReject] = useState(null);
	const [rejectReason, setRejectReason] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedbackMsg, setFeedbackMsg] = useState(null);

	// Payout Approval & Rejection States
	const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
	const [submittingPayoutSNo, setSubmittingPayoutSNo] = useState(null);
	const [payoutToReject, setPayoutToReject] = useState(null);
	const [isPayoutRejectModalOpen, setIsPayoutRejectModalOpen] = useState(false);
	const [payoutRejectReason, setPayoutRejectReason] = useState('');

	// Payout Pending expandable dropdown states
	const [expandedPayoutLoanMap, setExpandedPayoutLoanMap] = useState({});
	const [showAllScheduleMap, setShowAllScheduleMap] = useState({});
	const [payoutDateOverrides, setPayoutDateOverrides] = useState({});
	const [updatedPayoutKeys, setUpdatedPayoutKeys] = useState(() => new Set());
	const committedDatesRef = useRef({});

	// Payout Pending batch selection states
	const [selectedPayoutItemKeys, setSelectedPayoutItemKeys] = useState([]);
	const [isBatchPayoutApproveOpen, setIsBatchPayoutApproveOpen] = useState(false);
	const [isBatchPayoutRejectOpen, setIsBatchPayoutRejectOpen] = useState(false);
	const [batchPayoutRejectReason, setBatchPayoutRejectReason] = useState('');
	const [isBatchPayoutSubmitting, setIsBatchPayoutSubmitting] = useState(false);

	const handleToggleExpandPayout = (loanKey, currentExpandedState) => {
		setExpandedPayoutLoanMap((prev) => ({
			...prev,
			[loanKey]: currentExpandedState !== undefined ? !currentExpandedState : !prev[loanKey],
		}));
	};

	const toggleShowAllSchedule = (loanKey) => {
		setShowAllScheduleMap((prev) => ({
			...prev,
			[loanKey]: !prev[loanKey],
		}));
	};

	// Batch selection states for pending tab
	const [selectedLoanIds, setSelectedLoanIds] = useState([]);
	const [isBatchRejectModalOpen, setIsBatchRejectModalOpen] = useState(false);
	const [batchRejectReason, setBatchRejectReason] = useState('');
	const [isBatchConfirmApproveOpen, setIsBatchConfirmApproveOpen] = useState(false);
	const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
	const masterCheckboxRef = useRef(null);

	// Load loans, account names, and users
	const loadData = useCallback(async (silent = false) => {
		try {
			if (!silent) setIsLoading(true);
			const [loansRes, accsRes, usersRes] = await Promise.allSettled([
				api.getJointLoans(),
				api.getAccountNames(),
				api.getUsers(),
			]);

			if (loansRes.status === 'fulfilled' && Array.isArray(loansRes.value)) {
				setLoans(loansRes.value);
			}
			if (accsRes.status === 'fulfilled' && Array.isArray(accsRes.value)) {
				setAvailableAccountObjects(accsRes.value);
			}
			if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
				setAllUsers(usersRes.value);
			}
		} catch (err) {
			console.warn('Error loading requests data:', err);
		} finally {
			if (!silent) setIsLoading(false);
			setIsSyncing(false);
		}
	}, []);

	useEffect(() => {
		loadData();
		const handleRefresh = () => loadData(true);
		window.addEventListener('loanDesk_notifications_updated', handleRefresh);
		window.addEventListener('loanDesk_loans_updated', handleRefresh);
		window.addEventListener('loan_updated', handleRefresh);
		window.addEventListener('loan_approved', handleRefresh);
		return () => {
			window.removeEventListener('loanDesk_notifications_updated', handleRefresh);
			window.removeEventListener('loanDesk_loans_updated', handleRefresh);
			window.removeEventListener('loan_updated', handleRefresh);
			window.removeEventListener('loan_approved', handleRefresh);
		};
	}, [loadData]);

	// Helper to focus date input
	const focusScheduleInput = useCallback((id) => {
		setTimeout(() => {
			const el = document.getElementById(id);
			if (el) {
				el.focus();
				if (el.select) el.select();
			}
		}, 60);
	}, []);

	// Move cursor to next EMI Payout Date on Enter
	const handlePayoutDateEnter = useCallback((pIdx, pendingPayouts, loanKey) => {
		if (pIdx < pendingPayouts.length - 1) {
			const nextItem = pendingPayouts[pIdx + 1];
			focusScheduleInput(`req-payout-${loanKey}-${nextItem.sNo}`);
		}
	}, [focusScheduleInput]);

	// Handle payout date change and auto-save override to backend
	const handlePayoutDateChange = useCallback(
		async (loan, item, newVal) => {
			const loanId = loan.db_id || loan.id;
			const loanKey = getLoanUniqueId(loan);
			const itemKey = `${loanKey}_${item.sNo}`;

			let finalVal = newVal;
			const raw = item.rawInst || {};
			const recdDate = item.recdDate && item.recdDate !== '-' ? item.recdDate : (raw.receivedDate || '-');
			const emiDate = raw.date || raw.dueDate || item.dueDate || '-';
			const effectiveMinDate = (recdDate && recdDate !== '-') ? recdDate : (emiDate && emiDate !== '-' ? emiDate : '');

			// Auto-correct if complete date is typed and is before minDate
			if (finalVal && finalVal.length === 10 && parseDDMMYYYY(finalVal)) {
				if (effectiveMinDate && parseDDMMYYYY(effectiveMinDate) && isDateBefore(finalVal, effectiveMinDate)) {
					finalVal = effectiveMinDate;
				}
			}

			setPayoutDateOverrides((prev) => ({
				...prev,
				[itemKey]: finalVal,
			}));

			const isCompleteDate = Boolean(finalVal && finalVal.length === 10 && parseDDMMYYYY(finalVal) !== null);
			const isExplicitlyCleared = !finalVal || finalVal === '-' || finalVal === '';
			const isFullyChanged = isCompleteDate || isExplicitlyCleared;

			if (committedDatesRef.current[itemKey] === undefined) {
				const origVal = item.payoutDate || '';
				committedDatesRef.current[itemKey] = (origVal && origVal !== '-') ? origVal : '';
			}
			const baselineVal = committedDatesRef.current[itemKey];

			if (isFullyChanged && finalVal !== baselineVal) {
				committedDatesRef.current[itemKey] = finalVal;

				const isUserSec = checkUserHasPrimaryAccessForLoanSecondary(currentUser, loan, availableAccountObjects);
				const isSecEditor = !isAdmin && Boolean(isUserSec);
				const targetRole = isSecEditor ? 'PRIMARY' : 'SECONDARY';
				const editorRole = isSecEditor ? 'SECONDARY' : 'PRIMARY';
				const editorName = currentUser?.name || currentUser?.employee_code || (isSecEditor ? 'Secondary Manager' : 'Primary Manager');
				const nowStr = getFormattedNow();
				const isValFilled = Boolean(finalVal && finalVal !== '-' && finalVal !== '');

				if (isValFilled) {
					// Immediately exclude this updated EMI from the Payout Pending table for this user
					setUpdatedPayoutKeys((prev) => new Set(prev).add(itemKey));
					setSelectedPayoutItemKeys((prev) => prev.filter((k) => k !== itemKey));
				}

				const payload = {
					sNo: item.sNo,
					field: 'dueDate',
					value: finalVal || '-',
					payout_approval_status: isValFilled ? 'PENDING' : null,
					payoutApprovalStatus: isValFilled ? 'PENDING' : null,
					payout_approval_target: isValFilled ? targetRole : null,
					payoutApprovalTarget: isValFilled ? targetRole : null,
					payout_editor_role: isValFilled ? editorRole : null,
					payoutEditorRole: isValFilled ? editorRole : null,
					payout_requested_role: isValFilled ? editorRole : null,
					payoutRequestedRole: isValFilled ? editorRole : null,
					payout_requested_by: isValFilled ? editorName : null,
					payout_requested_at: isValFilled ? nowStr : null,
					payout_approved_by: null,
					payout_approved_at: null,
					payout_notes: null,
				};

				try {
					await api.saveScheduleOverride(loanId, payload);
					// Update loans state locally so client card reflection is immediate
					setLoans((prevLoans) =>
						prevLoans.map((l) => {
							const currentId = l.db_id || l.id;
							if (String(currentId) !== String(loanId)) return l;
							const schedule = [...(l.repaymentSchedule || l.repayment_schedule || [])];
							const updatedSchedule = schedule.map((inst, idx) => {
								const sNoStr = String(inst.sNo || inst.installmentNumber || idx + 1);
								const targetSNo = String(item.sNo);
								if (sNoStr === targetSNo || targetSNo.startsWith(sNoStr)) {
									if (inst.isPartial && Array.isArray(inst.subInstallments)) {
										const updatedSubs = inst.subInstallments.map((sub) => {
											if (String(sub.sNo) === targetSNo) {
												return {
													...sub,
													dueDate: finalVal,
													paymentDate: finalVal,
													payout_approval_status: isValFilled ? 'PENDING' : null,
													payoutApprovalStatus: isValFilled ? 'PENDING' : null,
													payout_approval_target: isValFilled ? targetRole : null,
													payoutApprovalTarget: isValFilled ? targetRole : null,
													payout_editor_role: isValFilled ? editorRole : null,
													payoutEditorRole: isValFilled ? editorRole : null,
													payout_requested_role: isValFilled ? editorRole : null,
													payoutRequestedRole: isValFilled ? editorRole : null,
													payout_requested_by: isValFilled ? editorName : null,
													payout_requested_at: isValFilled ? nowStr : null,
												};
											}
											return sub;
										});
										return { ...inst, subInstallments: updatedSubs };
									}
									return {
										...inst,
										dueDate: finalVal,
										paymentDate: finalVal,
										payment_date: finalVal,
										payout_approval_status: isValFilled ? 'PENDING' : null,
										payoutApprovalStatus: isValFilled ? 'PENDING' : null,
										payout_approval_target: isValFilled ? targetRole : null,
										payoutApprovalTarget: isValFilled ? targetRole : null,
										payout_editor_role: isValFilled ? editorRole : null,
										payoutEditorRole: isValFilled ? editorRole : null,
										payout_requested_role: isValFilled ? editorRole : null,
										payoutRequestedRole: isValFilled ? editorRole : null,
										payout_requested_by: isValFilled ? editorName : null,
										payout_requested_at: isValFilled ? nowStr : null,
									};
								}
								return inst;
							});
							return {
								...l,
								repaymentSchedule: updatedSchedule,
								repayment_schedule: updatedSchedule,
							};
						})
					);
					if (isValFilled) {
						setFeedbackMsg({
							type: 'success',
							text: `Payout date updated for ${item.label}. It has been submitted for partner authorization.`,
						});
					}
					window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
					window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
				} catch (err) {
					console.error('Failed to save payout date override:', err);
					if (isValFilled) {
						setUpdatedPayoutKeys((prev) => {
							const next = new Set(prev);
							next.delete(itemKey);
							return next;
						});
					}
					setFeedbackMsg({
						type: 'error',
						text: `Failed to save payout date: ${err.message || 'Server error'}`,
					});
				}
			}
		},
		[currentUser, availableAccountObjects, isAdmin]
	);

	// Helper to determine approval stage and whether current user has action
	const getLoanApprovalMeta = useCallback(
		(loan) => {
			const status = (loan.approval_status || loan.approvalStatus || 'PENDING').toUpperCase();
			const loanStatus = (loan.status || '').toLowerCase();
			const isPayoutPendingLoan =
				loanStatus === 'pending payout approval' ||
				loanStatus === 'payout pending' ||
				status === 'PENDING_PAYOUT';

			const isPendingSecondary =
				!isPayoutPendingLoan &&
				(status === 'PENDING_SECONDARY' ||
					(status === 'PENDING' && !loan.verified_by && !['active', 'closed', 'settled', 'overdue', 'date overdue'].includes(loanStatus)));
			const isPendingAdmin = !isPayoutPendingLoan && (status === 'PENDING_ADMIN' || status === 'VERIFIED');
			const isApproved = status === 'APPROVED' || loan.status === 'Active' || loan.status === 'Closed';
			const isRejected = status === 'REJECTED' || loan.status === 'Rejected';

			// A user who created/submitted the loan cannot approve their own loan
			const isCreator = didUserCreateLoan(loan, currentUser, availableAccountObjects);

			// Can the logged-in user act on this loan right now?
			// 1. Secondary approval: only non-admin user who has primary access to this loan's secondary account
			const canApproveSecondary =
				!isCreator &&
				isPendingSecondary &&
				!isAdmin &&
				checkUserHasPrimaryAccessForLoanSecondary(
					currentUser,
					loan,
					availableAccountObjects
				);

			// 2. Admin approval: only Admin when in PENDING_ADMIN
			const canApproveAdmin = !isCreator && isPendingAdmin && isAdmin;
			const needsUserAction = canApproveSecondary || canApproveAdmin;

			return {
				status,
				isPendingSecondary,
				isPendingAdmin,
				isApproved,
				isRejected,
				canApproveSecondary,
				canApproveAdmin,
				needsUserAction,
			};
		},
		[currentUser, isAdmin, availableAccountObjects]
	);

	// Metrics summary: 4 tabs ('pending', 'approved', 'payout-pending', 'others-approval')
	const metrics = useMemo(() => {
		let pendingCount = 0;
		let othersApprovalCount = 0;
		let approvedCount = 0;
		let payoutPendingCount = 0;

		loans.forEach((l) => {
			const meta = getLoanApprovalMeta(l);
			if (isUserPendingLoan(l, currentUser, availableAccountObjects, meta)) {
				pendingCount += 1;
			}
			if (isUserSubmissionLoan(l, currentUser, availableAccountObjects, meta)) {
				othersApprovalCount += 1;
			}
			if (isUserApprovedLoan(l, currentUser, availableAccountObjects)) {
				approvedCount += 1;
			}
			if (isUserPayoutPendingLoan(l, currentUser, availableAccountObjects, updatedPayoutKeys)) {
				const pendingItems = getLoanPendingPayoutItems(l, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys);
				payoutPendingCount += pendingItems.length;
			}
		});

		return {
			pendingCount,
			myApprovalCount: pendingCount, // backwards compatibility
			othersApprovalCount,
			approvedCount,
			payoutPendingCount,
			totalWaiting: pendingCount + othersApprovalCount + payoutPendingCount,
		};
	}, [loans, getLoanApprovalMeta, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys]);


	// Normalize filterAccount to canonical name if set to an acronym or non-canonical casing
	useEffect(() => {
		if (filterAccount && filterAccount !== 'ALL' && availableAccountObjects.length > 0) {
			const canonical = getCanonicalAccountName(filterAccount, availableAccountObjects);
			if (canonical && canonical !== filterAccount) {
				setFilterAccount(canonical);
			}
		}
	}, [filterAccount, availableAccountObjects]);

	// Automatically dismiss alert / feedback notification after 5 seconds
	useEffect(() => {
		if (!feedbackMsg) return;
		const timer = setTimeout(() => {
			setFeedbackMsg(null);
		}, 5000);
		return () => clearTimeout(timer);
	}, [feedbackMsg]);

	// Filter loans according to active tab (only 2 tabs), search, and account filter
	const effectiveSearch = (localSearch || searchQuery || '').trim().toLowerCase();

	const filteredLoans = useMemo(() => {
		return loans.filter((loan) => {
			const meta = getLoanApprovalMeta(loan);

			// 4 tabs:
			// Tab 1: Pending (joint loans awaiting current logged-in user's approval)
			if (activeTab === 'pending' || activeTab === 'my-approval') {
				if (!isUserPendingLoan(loan, currentUser, availableAccountObjects, meta)) {
					return false;
				}
			}
			// Tab 2: Approved (loans that have been approved)
			else if (activeTab === 'approved') {
				if (!isUserApprovedLoan(loan, currentUser, availableAccountObjects)) {
					return false;
				}
			}
			// Tab 3: Payout Pending (loans awaiting secondary payout approval)
			else if (activeTab === 'payout-pending') {
				if (!isUserPayoutPendingLoan(loan, currentUser, availableAccountObjects, updatedPayoutKeys)) {
					return false;
				}
				const pendingItems = getLoanPendingPayoutItems(loan, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys);
				if (pendingItems.length === 0) {
					return false;
				}
			}
			// Tab 4: My Submissions (all joint loans created/submitted by logged-in user)
			else if (activeTab === 'others-approval') {
				if (!isUserSubmissionLoan(loan, currentUser, availableAccountObjects, meta)) {
					return false;
				}
			}

			// Account dropdown filter
			if (filterAccount !== 'ALL') {
				if (!doesLoanMatchAccount(loan, filterAccount, availableAccountObjects)) {
					return false;
				}
			}

			// Text search filter
			if (effectiveSearch) {
				const client = (loan.client_account_name || loan.borrower?.name || '').toLowerCase();
				const idStr = (loan.loan_ref_id || loan.id || '').toString().toLowerCase();
				const priAcc = (loan.primaryAccountName || loan.primary || '').toLowerCase();
				const secAccs = getLoanSecondaryAccounts(loan).join(' ').toLowerCase();
				const amountStr = String(loan.loan_amount || loan.amount || '');

				const matches =
					client.includes(effectiveSearch) ||
					idStr.includes(effectiveSearch) ||
					priAcc.includes(effectiveSearch) ||
					secAccs.includes(effectiveSearch) ||
					amountStr.includes(effectiveSearch);

				if (!matches) return false;
			}

			return true;
		});
	}, [loans, activeTab, filterAccount, effectiveSearch, getLoanApprovalMeta, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys]);

	const isPendingTab = activeTab === 'pending' || activeTab === 'my-approval';

	// Pagination state (default 10 records per page, matching JointLoan.jsx)
	const [currentPage, setCurrentPage] = useState(1);
	const pageSize = 10;

	// Pagination calculations
	const totalItems = filteredLoans.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	// Keep currentPage in valid range when filtered items or page size changes
	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(Math.max(1, totalPages));
		}
	}, [currentPage, totalPages]);

	// Reset to page 1 whenever tab, account filter, or search changes
	useEffect(() => {
		setCurrentPage(1);
	}, [activeTab, filterAccount, effectiveSearch]);

	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, totalItems);

	const paginatedLoans = useMemo(() => {
		return filteredLoans.slice(startIndex, endIndex);
	}, [filteredLoans, startIndex, endIndex]);

	// Helper to generate page numbers with ellipsis (same style as JointLoan.jsx)
	const getPageNumbers = () => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		const pages = [];
		if (currentPage <= 3) {
			pages.push(1, 2, 3, 4, '...', totalPages);
		} else if (currentPage >= totalPages - 2) {
			pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
		} else {
			pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
		}
		return pages;
	};

	// Clear selection and close any open modal on tab change
	useEffect(() => {
		setSelectedLoanIds([]);
		setSelectedPayoutItemKeys([]);
		setSelectedLoan(null);
	}, [activeTab]);

	// Prune selection if items are filtered out
	useEffect(() => {
		if (selectedLoanIds.length > 0) {
			const visibleKeys = new Set(filteredLoans.map(getLoanUniqueId));
			setSelectedLoanIds((prev) => prev.filter((id) => visibleKeys.has(id)));
		}
	}, [filteredLoans]);

	// Derived selection stats
	const selectedLoans = useMemo(() => {
		if (!isPendingTab) return [];
		const idSet = new Set(selectedLoanIds);
		return filteredLoans.filter((l) => idSet.has(getLoanUniqueId(l)));
	}, [filteredLoans, selectedLoanIds, isPendingTab]);

	const selectedTotalAmount = useMemo(() => {
		return selectedLoans.reduce(
			(sum, l) => sum + Number(l.loan_amount || l.amount || 0),
			0
		);
	}, [selectedLoans]);

	const isAllVisibleSelected = useMemo(() => {
		if (!isPendingTab || paginatedLoans.length === 0) return false;
		const idSet = new Set(selectedLoanIds);
		return paginatedLoans.every((l) => idSet.has(getLoanUniqueId(l)));
	}, [paginatedLoans, selectedLoanIds, isPendingTab]);

	const isSomeVisibleSelected = useMemo(() => {
		if (!isPendingTab || paginatedLoans.length === 0) return false;
		const idSet = new Set(selectedLoanIds);
		return (
			paginatedLoans.some((l) => idSet.has(getLoanUniqueId(l))) &&
			!isAllVisibleSelected
		);
	}, [paginatedLoans, selectedLoanIds, isPendingTab, isAllVisibleSelected]);

	useEffect(() => {
		if (masterCheckboxRef.current) {
			masterCheckboxRef.current.indeterminate = isSomeVisibleSelected;
		}
	}, [isSomeVisibleSelected]);

	const handleToggleLoanSelect = useCallback((loan) => {
		const id = getLoanUniqueId(loan);
		if (!id) return;
		setSelectedLoanIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
		);
	}, []);

	const handleToggleSelectAll = useCallback(() => {
		if (isAllVisibleSelected) {
			const pageKeys = new Set(paginatedLoans.map(getLoanUniqueId));
			setSelectedLoanIds((prev) => prev.filter((id) => !pageKeys.has(id)));
		} else {
			const pageKeys = paginatedLoans.map(getLoanUniqueId);
			setSelectedLoanIds((prev) => Array.from(new Set([...prev, ...pageKeys])));
		}
	}, [isAllVisibleSelected, paginatedLoans]);

	const handleClearSelection = useCallback(() => {
		setSelectedLoanIds([]);
	}, []);

	// Payout Pending: visible dues and selection
	const visiblePayoutItems = useMemo(() => {
		if (activeTab !== 'payout-pending') return [];
		const list = [];
		paginatedLoans.forEach((loan) => {
			const items = getLoanPendingPayoutItems(loan, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys);
			items.forEach((item) => {
				const loanKey = getLoanUniqueId(loan);
				const itemKey = `${loanKey}_${item.sNo}`;
				list.push({
					key: itemKey,
					loanKey,
					loan,
					item,
					canApprove: Boolean(item.canCurrentUserApprove),
				});
			});
		});
		return list;
	}, [activeTab, paginatedLoans, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys]);

	const selectedPayoutDues = useMemo(() => {
		if (activeTab !== 'payout-pending' || selectedPayoutItemKeys.length === 0) return [];
		const keySet = new Set(selectedPayoutItemKeys);
		return visiblePayoutItems.filter((entry) => keySet.has(entry.key) && entry.canApprove);
	}, [activeTab, selectedPayoutItemKeys, visiblePayoutItems]);

	const selectedPayoutTotalAmount = useMemo(() => {
		return selectedPayoutDues.reduce(
			(sum, entry) => sum + getPayoutItemSecondaryAmount(entry.item, entry.loan),
			0
		);
	}, [selectedPayoutDues]);

	const totalApprovablePayoutCount = useMemo(() => {
		return visiblePayoutItems.filter((e) => e.canApprove).length;
	}, [visiblePayoutItems]);

	const isAllPayoutVisibleSelected = useMemo(() => {
		const approvable = visiblePayoutItems.filter((e) => e.canApprove);
		if (approvable.length === 0) return false;
		const keySet = new Set(selectedPayoutItemKeys);
		return approvable.every((e) => keySet.has(e.key));
	}, [visiblePayoutItems, selectedPayoutItemKeys]);

	const isSomePayoutVisibleSelected = useMemo(() => {
		const approvable = visiblePayoutItems.filter((e) => e.canApprove);
		if (approvable.length === 0) return false;
		const keySet = new Set(selectedPayoutItemKeys);
		return approvable.some((e) => keySet.has(e.key)) && !isAllPayoutVisibleSelected;
	}, [visiblePayoutItems, selectedPayoutItemKeys, isAllPayoutVisibleSelected]);

	const handleTogglePayoutItemSelect = useCallback((key) => {
		setSelectedPayoutItemKeys((prev) =>
			prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
		);
	}, []);

	const handleToggleLoanPayoutSelect = useCallback(
		(loan) => {
			const loanKey = getLoanUniqueId(loan);
			const loanApprovableKeys = visiblePayoutItems
				.filter((e) => e.loanKey === loanKey && e.canApprove)
				.map((e) => e.key);
			if (loanApprovableKeys.length === 0) return;

			const allSelected = loanApprovableKeys.every((k) => selectedPayoutItemKeys.includes(k));
			if (allSelected) {
				setSelectedPayoutItemKeys((prev) => prev.filter((k) => !loanApprovableKeys.includes(k)));
			} else {
				setSelectedPayoutItemKeys((prev) => Array.from(new Set([...prev, ...loanApprovableKeys])));
			}
		},
		[visiblePayoutItems, selectedPayoutItemKeys]
	);

	const handleToggleSelectAllPayouts = useCallback(() => {
		const approvableKeys = visiblePayoutItems.filter((e) => e.canApprove).map((e) => e.key);
		if (isAllPayoutVisibleSelected) {
			setSelectedPayoutItemKeys((prev) => prev.filter((k) => !approvableKeys.includes(k)));
		} else {
			setSelectedPayoutItemKeys((prev) => Array.from(new Set([...prev, ...approvableKeys])));
		}
	}, [visiblePayoutItems, isAllPayoutVisibleSelected]);

	// Handle Secondary Approval
	const handleApproveSecondary = async (loan) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setFeedbackMsg(null);

		const nowStr = getFormattedNow();
		const mgrName = currentUser?.name || 'Secondary Manager';
		const mgrCode = currentUser?.employee_code || '';
		const secAccounts = getLoanSecondaryAccounts(loan);
		const mgrAccount = secAccounts[0] || 'Secondary Account';
		const verifiedLabel = `${mgrName}${mgrCode ? ` (${mgrCode})` : ''}`;

		const loanIdentifier = loan?.db_id || loan?.id;

		try {
			await api.approveJointLoanSecondary(loanIdentifier, {
				userName: mgrName,
				userCode: mgrCode,
				accountName: mgrAccount,
			});

			// Update in local state
			setLoans((prev) =>
				prev.map((l) => {
					if (l.id === loan.id || l.db_id === loan.db_id) {
						return {
							...l,
							verified_by: verifiedLabel,
							verifiedBy: verifiedLabel,
							approval_status: 'PENDING_ADMIN',
							approvalStatus: 'PENDING_ADMIN',
							status: 'Pending',
						};
					}
					return l;
				})
			);

			if (selectedLoan && (selectedLoan.id === loan.id || selectedLoan.db_id === loan.db_id)) {
				setSelectedLoan(null);
			}
			setSelectedLoanIds((prev) => prev.filter((id) => id !== getLoanUniqueId(loan)));

			window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
			window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));

			setFeedbackMsg({
				type: 'success',
				text: `Secondary approval recorded! Loan ${loan.loan_ref_id || loan.id} has moved to Admin for final authorization.`,
			});
		} catch (err) {
			setFeedbackMsg({
				type: 'error',
				text: `Approval failed: ${err.message || 'Could not record secondary approval.'}`,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	// Handle Admin Final Approval
	const handleApproveAdmin = async (loan) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setFeedbackMsg(null);

		const nowStr = getFormattedNow();
		const adminName = currentUser?.name || 'Administrator';
		const adminCode = currentUser?.employee_code || '';
		const loanIdentifier = loan?.db_id || loan?.id;

		try {
			await api.approveJointLoanAdmin(loanIdentifier, {
				userName: adminName,
				userCode: adminCode,
			});

			// Update in local state
			setLoans((prev) =>
				prev.map((l) => {
					if (l.id === loan.id || l.db_id === loan.db_id) {
						return {
							...l,
							status: 'Active',
							approval_status: 'APPROVED',
							approvalStatus: 'APPROVED',
							actioned_by: adminName,
							actionedBy: adminName,
							actioned_at: nowStr,
							actionedAt: nowStr,
						};
					}
					return l;
				})
			);

			if (selectedLoan && (selectedLoan.id === loan.id || selectedLoan.db_id === loan.db_id)) {
				setSelectedLoan(null);
			}
			setSelectedLoanIds((prev) => prev.filter((id) => id !== getLoanUniqueId(loan)));

			window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
			window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));

			setFeedbackMsg({
				type: 'success',
				text: `Loan ${loan.loan_ref_id || loan.id} has received final Administrator approval and is now Active!`,
			});
		} catch (err) {
			setFeedbackMsg({
				type: 'error',
				text: `Approval failed: ${err.message || 'Could not record final approval.'}`,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	// Open Reject Modal
	const handleOpenRejectModal = (loan) => {
		setLoanToReject(loan);
		setRejectReason('');
		setIsRejectModalOpen(true);
	};

	// Confirm Rejection
	const handleConfirmReject = async () => {
		if (!loanToReject || isSubmitting) return;
		setIsSubmitting(true);
		setFeedbackMsg(null);

		const nowStr = getFormattedNow();
		const reviewerName = currentUser?.name || 'Reviewer';
		const reviewerCode = currentUser?.employee_code || '';
		const reviewerRole = isAdmin ? 'admin' : 'manager';
		const loanIdentifier = loanToReject?.db_id || loanToReject?.id;
		const reason = rejectReason.trim() || 'Terms not accepted during verification.';

		try {
			await api.rejectJointLoan(loanIdentifier, {
				reason,
				userName: reviewerName,
				userCode: reviewerCode,
				userRole: reviewerRole,
			});

			// Update local state
			setLoans((prev) =>
				prev.map((l) => {
					if (l.id === loanToReject.id || l.db_id === loanToReject.db_id) {
						return {
							...l,
							status: 'Rejected',
							approval_status: 'REJECTED',
							approvalStatus: 'REJECTED',
							rejection_reason: reason,
						};
					}
					return l;
				})
			);

			setIsRejectModalOpen(false);
			setLoanToReject(null);
			setSelectedLoan(null);
			setSelectedLoanIds((prev) => prev.filter((id) => id !== getLoanUniqueId(loanToReject)));
			window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
			window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
			setFeedbackMsg({
				type: 'success',
				text: `Loan application ${loanToReject.loan_ref_id || loanToReject.id} has been rejected.`,
			});
		} catch (err) {
			setFeedbackMsg({
				type: 'error',
				text: `Rejection failed: ${err.message || 'Could not record rejection.'}`,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	// Handle Batch Approval
	const handleBatchApprove = async () => {
		if (isBatchSubmitting || selectedLoans.length === 0) return;
		setIsBatchSubmitting(true);
		setFeedbackMsg(null);

		const nowStr = getFormattedNow();
		const mgrName = currentUser?.name || 'Secondary Manager';
		const mgrCode = currentUser?.employee_code || '';
		const adminName = currentUser?.name || 'Administrator';
		const adminCode = currentUser?.employee_code || '';

		let successCount = 0;
		let failCount = 0;
		const updatedLoansMap = {};

		for (const loan of selectedLoans) {
			const meta = getLoanApprovalMeta(loan);
			const loanIdentifier = loan?.db_id || loan?.id;
			const loanKey = getLoanUniqueId(loan);

			try {
				if (meta.canApproveSecondary) {
					const secAccounts = getLoanSecondaryAccounts(loan);
					const mgrAccount = secAccounts[0] || 'Secondary Account';
					const verifiedLabel = `${mgrName}${mgrCode ? ` (${mgrCode})` : ''}`;

					await api.approveJointLoanSecondary(loanIdentifier, {
						userName: mgrName,
						userCode: mgrCode,
						accountName: mgrAccount,
					});

					updatedLoansMap[loanKey] = {
						...loan,
						verified_by: verifiedLabel,
						verifiedBy: verifiedLabel,
						approval_status: 'PENDING_ADMIN',
						approvalStatus: 'PENDING_ADMIN',
						status: 'Pending',
					};
					successCount++;
				} else if (meta.canApproveAdmin) {
					await api.approveJointLoanAdmin(loanIdentifier, {
						userName: adminName,
						userCode: adminCode,
					});

					updatedLoansMap[loanKey] = {
						...loan,
						status: 'Active',
						approval_status: 'APPROVED',
						approvalStatus: 'APPROVED',
						actioned_by: adminName,
						actionedBy: adminName,
						actioned_at: nowStr,
						actionedAt: nowStr,
					};
					successCount++;
				} else {
					failCount++;
				}
			} catch (err) {
				console.error(`Failed to batch approve loan ${loanIdentifier}:`, err);
				failCount++;
			}
		}

		// Update in local state
		setLoans((prev) =>
			prev.map((l) => {
				const key = getLoanUniqueId(l);
				return updatedLoansMap[key] || l;
			})
		);

		setSelectedLoanIds((prev) => prev.filter((id) => !updatedLoansMap[id]));
		setIsBatchConfirmApproveOpen(false);
		setIsBatchSubmitting(false);

		if (successCount > 0) {
			window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
			window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
		}

		if (successCount > 0 && failCount === 0) {
			setFeedbackMsg({
				type: 'success',
				text: `Successfully approved ${successCount} loan application${successCount > 1 ? 's' : ''}!`,
			});
		} else if (successCount > 0 && failCount > 0) {
			setFeedbackMsg({
				type: 'warning',
				text: `Approved ${successCount} loan${successCount > 1 ? 's' : ''}, but ${failCount} encountered an error.`,
			});
		} else {
			setFeedbackMsg({
				type: 'error',
				text: 'Batch approval failed. Please verify your permissions and try again.',
			});
		}
	};

	// Handle Batch Rejection
	const handleBatchReject = async () => {
		if (isBatchSubmitting || selectedLoans.length === 0) return;
		setIsBatchSubmitting(true);
		setFeedbackMsg(null);

		const reviewerName = currentUser?.name || 'Reviewer';
		const reviewerCode = currentUser?.employee_code || '';
		const reviewerRole = isAdmin ? 'admin' : 'manager';
		const reason = batchRejectReason.trim() || 'Terms not accepted during verification.';

		let successCount = 0;
		let failCount = 0;
		const updatedLoansMap = {};

		for (const loan of selectedLoans) {
			const loanIdentifier = loan?.db_id || loan?.id;
			const loanKey = getLoanUniqueId(loan);

			try {
				await api.rejectJointLoan(loanIdentifier, {
					reason,
					userName: reviewerName,
					userCode: reviewerCode,
					userRole: reviewerRole,
				});

				updatedLoansMap[loanKey] = {
					...loan,
					status: 'Rejected',
					approval_status: 'REJECTED',
					approvalStatus: 'REJECTED',
					rejection_reason: reason,
				};
				successCount++;
			} catch (err) {
				console.error(`Failed to batch reject loan ${loanIdentifier}:`, err);
				failCount++;
			}
		}

		setLoans((prev) =>
			prev.map((l) => {
				const key = getLoanUniqueId(l);
				return updatedLoansMap[key] || l;
			})
		);

		setSelectedLoanIds((prev) => prev.filter((id) => !updatedLoansMap[id]));
		setIsBatchRejectModalOpen(false);
		setBatchRejectReason('');
		setIsBatchSubmitting(false);

		if (successCount > 0) {
			window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
			window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
		}

		if (successCount > 0 && failCount === 0) {
			setFeedbackMsg({
				type: 'success',
				text: `Successfully rejected ${successCount} loan application${successCount > 1 ? 's' : ''}.`,
			});
		} else if (successCount > 0 && failCount > 0) {
			setFeedbackMsg({
				type: 'warning',
				text: `Rejected ${successCount} loan${successCount > 1 ? 's' : ''}, but ${failCount} encountered an error.`,
			});
		} else {
			setFeedbackMsg({
				type: 'error',
				text: 'Batch rejection failed. Please try again.',
			});
		}
	};

	// Direct approve payout date for an EMI
	const handleDirectApprovePayout = async (loan, item) => {
		if (!loan || !item) return;
		try {
			setIsSubmittingPayout(true);
			setSubmittingPayoutSNo(item.sNo);
			const loanId = loan.db_id || loan.id;
			const sNo = item.parentSNo || item.sNo;
			const approverName = currentUser?.name || currentUser?.employee_code || 'Manager';
			const approverCode = currentUser?.employee_code || '';
			const targetRole = item.targetRole === 'Primary Partner' ? 'PRIMARY' : 'SECONDARY';

			const payload = {
				approver_name: approverName,
				approver_employee_code: approverCode,
				approver_role: targetRole,
				notes: 'Confirmed secondary remittance and approved payout date',
			};

			const res = await api.approvePayoutDate(loanId, sNo, payload);
			if (res && (res.success || !res.error)) {
				setFeedbackMsg({
					type: 'success',
					text: `Successfully approved payout date for ${item.label} of loan ${loan.loan_ref_id || loan.id}.`,
				});
				await loadData();
				const loanKey = getLoanUniqueId(loan);
				const itemKey = `${loanKey}_${item.sNo}`;
				setPayoutDateOverrides((prev) => {
					const next = { ...prev };
					delete next[itemKey];
					return next;
				});
				if (committedDatesRef.current) {
					delete committedDatesRef.current[itemKey];
				}
				window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
				window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
				setSelectedLoan(null);
			} else {
				setFeedbackMsg({
					type: 'error',
					text: res?.message || res?.error || `Failed to approve payout date for ${item.label}.`,
				});
			}
		} catch (err) {
			console.error('Error approving payout date:', err);
			setFeedbackMsg({
				type: 'error',
				text: err?.message || 'Error occurred while approving payout date.',
			});
		} finally {
			setIsSubmittingPayout(false);
			setSubmittingPayoutSNo(null);
		}
	};

	// Open payout rejection modal
	const handleOpenRejectPayoutModal = (loan, item) => {
		setPayoutToReject({ loan, item });
		setPayoutRejectReason('');
		setIsPayoutRejectModalOpen(true);
	};

	// Confirm payout rejection / flag discrepancy
	const handleConfirmRejectPayout = async () => {
		if (!payoutToReject) return;
		try {
			setIsSubmittingPayout(true);
			const { loan, item } = payoutToReject;
			const loanId = loan.db_id || loan.id;
			const sNo = item.parentSNo || item.sNo;
			const approverName = currentUser?.name || currentUser?.employee_code || 'Manager';
			const approverCode = currentUser?.employee_code || '';
			const targetRole = item.targetRole === 'Primary Partner' ? 'PRIMARY' : 'SECONDARY';

			const payload = {
				approver_name: approverName,
				approver_employee_code: approverCode,
				approver_role: targetRole,
				notes: payoutRejectReason.trim() || 'Payout date rejected due to remittance discrepancy',
			};

			const res = await api.rejectPayoutDate(loanId, sNo, payload);
			if (res && (res.success || !res.error)) {
				setFeedbackMsg({
					type: 'success',
					text: `Flagged discrepancy & rejected payout date for ${item.label}.`,
				});
				setIsPayoutRejectModalOpen(false);
				setPayoutToReject(null);
				setPayoutRejectReason('');
				await loadData();
				const loanKey = getLoanUniqueId(loan);
				const itemKey = `${loanKey}_${item.sNo}`;
				setPayoutDateOverrides((prev) => {
					const next = { ...prev };
					delete next[itemKey];
					return next;
				});
				if (committedDatesRef.current) {
					delete committedDatesRef.current[itemKey];
				}
				window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
				window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));
				setSelectedLoan(null);
			} else {
				setFeedbackMsg({
					type: 'error',
					text: res?.message || res?.error || `Failed to reject payout date for ${item.label}.`,
				});
			}
		} catch (err) {
			console.error('Error rejecting payout date:', err);
			setFeedbackMsg({
				type: 'error',
				text: err?.message || 'Error occurred while rejecting payout date.',
			});
		} finally {
			setIsSubmittingPayout(false);
		}
	};

	// Handle Batch Payout Approval
	const handleBatchPayoutApprove = async () => {
		if (isBatchPayoutSubmitting || selectedPayoutDues.length === 0) return;
		setIsBatchPayoutSubmitting(true);
		setFeedbackMsg(null);

		const approverName = currentUser?.name || currentUser?.employee_code || 'Manager';
		const approverCode = currentUser?.employee_code || '';
		let successCount = 0;
		let failCount = 0;

		for (const { loan, item } of selectedPayoutDues) {
			const loanId = loan.db_id || loan.id;
			const sNo = item.parentSNo || item.sNo;
			const targetRole = item.targetRole === 'Primary Partner' ? 'PRIMARY' : 'SECONDARY';
			const payload = {
				approver_name: approverName,
				approver_employee_code: approverCode,
				approver_role: targetRole,
				notes: 'Confirmed secondary remittance and approved payout date',
			};

			try {
				const res = await api.approvePayoutDate(loanId, sNo, payload);
				if (res && (res.success || !res.error)) {
					successCount++;
				} else {
					failCount++;
				}
			} catch (err) {
				console.error(`Failed to approve payout for loan ${loanId} sNo ${sNo}:`, err);
				failCount++;
			}
		}

		setIsBatchPayoutApproveOpen(false);
		setIsBatchPayoutSubmitting(false);

		// Clear local overrides and selection for actioned items
		setPayoutDateOverrides((prev) => {
			const next = { ...prev };
			selectedPayoutDues.forEach(({ loan, item }) => {
				const loanKey = getLoanUniqueId(loan);
				const key = `${loanKey}_${item.sNo}`;
				delete next[key];
				if (committedDatesRef.current) delete committedDatesRef.current[key];
			});
			return next;
		});
		setSelectedPayoutItemKeys([]);

		await loadData();
		window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
		window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));

		if (successCount > 0 && failCount === 0) {
			setFeedbackMsg({
				type: 'success',
				text: `Successfully approved ${successCount} payout remittance${successCount > 1 ? 's' : ''}!`,
			});
		} else if (successCount > 0 && failCount > 0) {
			setFeedbackMsg({
				type: 'warning',
				text: `Approved ${successCount} payout remittance${successCount > 1 ? 's' : ''}, but ${failCount} encountered an error.`,
			});
		} else {
			setFeedbackMsg({
				type: 'error',
				text: 'Batch payout approval failed. Please try again.',
			});
		}
	};

	// Handle Batch Payout Rejection
	const handleBatchPayoutReject = async () => {
		if (isBatchPayoutSubmitting || selectedPayoutDues.length === 0) return;
		setIsBatchPayoutSubmitting(true);
		setFeedbackMsg(null);

		const approverName = currentUser?.name || currentUser?.employee_code || 'Manager';
		const approverCode = currentUser?.employee_code || '';
		const notes = batchPayoutRejectReason.trim() || 'Payout date rejected due to remittance discrepancy';
		let successCount = 0;
		let failCount = 0;

		for (const { loan, item } of selectedPayoutDues) {
			const loanId = loan.db_id || loan.id;
			const sNo = item.parentSNo || item.sNo;
			const targetRole = item.targetRole === 'Primary Partner' ? 'PRIMARY' : 'SECONDARY';
			const payload = {
				approver_name: approverName,
				approver_employee_code: approverCode,
				approver_role: targetRole,
				notes,
			};

			try {
				const res = await api.rejectPayoutDate(loanId, sNo, payload);
				if (res && (res.success || !res.error)) {
					successCount++;
				} else {
					failCount++;
				}
			} catch (err) {
				console.error(`Failed to reject payout for loan ${loanId} sNo ${sNo}:`, err);
				failCount++;
			}
		}

		setIsBatchPayoutRejectOpen(false);
		setIsBatchPayoutSubmitting(false);
		setBatchPayoutRejectReason('');

		// Clear local overrides and selection for actioned items
		setPayoutDateOverrides((prev) => {
			const next = { ...prev };
			selectedPayoutDues.forEach(({ loan, item }) => {
				const loanKey = getLoanUniqueId(loan);
				const key = `${loanKey}_${item.sNo}`;
				delete next[key];
				if (committedDatesRef.current) delete committedDatesRef.current[key];
			});
			return next;
		});
		setSelectedPayoutItemKeys([]);

		await loadData();
		window.dispatchEvent(new CustomEvent('loanDesk_notifications_updated'));
		window.dispatchEvent(new CustomEvent('loanDesk_loans_updated'));

		if (successCount > 0 && failCount === 0) {
			setFeedbackMsg({
				type: 'success',
				text: `Flagged discrepancy & rejected ${successCount} payout remittance${successCount > 1 ? 's' : ''}.`,
			});
		} else if (successCount > 0 && failCount > 0) {
			setFeedbackMsg({
				type: 'warning',
				text: `Rejected ${successCount} payout remittance${successCount > 1 ? 's' : ''}, but ${failCount} encountered an error.`,
			});
		} else {
			setFeedbackMsg({
				type: 'error',
				text: 'Batch payout rejection failed. Please try again.',
			});
		}
	};

	// Relevant loans for the active tab (before account and search filters are applied)
	const tabLoans = useMemo(() => {
		return loans.filter((loan) => {
			const meta = getLoanApprovalMeta(loan);
			if (activeTab === 'pending' || activeTab === 'my-approval') {
				return isUserPendingLoan(loan, currentUser, availableAccountObjects, meta);
			} else if (activeTab === 'approved') {
				return isUserApprovedLoan(loan, currentUser, availableAccountObjects);
			} else if (activeTab === 'payout-pending') {
				if (!isUserPayoutPendingLoan(loan, currentUser, availableAccountObjects, updatedPayoutKeys)) {
					return false;
				}
				const pendingItems = getLoanPendingPayoutItems(loan, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys);
				return pendingItems.length > 0;
			} else if (activeTab === 'others-approval') {
				return isUserSubmissionLoan(loan, currentUser, availableAccountObjects, meta);
			}
			return true;
		});
	}, [loans, activeTab, getLoanApprovalMeta, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys]);

	// Dynamic account filter options with live loan counts for active tab
	// Strictly deduplicates accounts and eliminates standalone acronym values
	const accountFilterOptions = useMemo(() => {
		const accountMap = new Map(); // cleanKey -> { id, label, acronym }

		// 1. Populate canonical options from availableAccountObjects (official DB accounts)
		if (Array.isArray(availableAccountObjects) && availableAccountObjects.length > 0) {
			availableAccountObjects.forEach((acc) => {
				if (!acc) return;
				const fullName = (acc.name || '').trim();
				const acronym = (acc.acronym || '').trim();
				const displayName = fullName || acronym;
				if (!displayName) return;

				const key = cleanAccountKey(fullName || displayName);
				if (!accountMap.has(key)) {
					accountMap.set(key, {
						id: displayName,
						label: displayName,
						acronym: acronym,
					});
				}
			});
		}

		// 2. Discover any accounts from existing loans that might not be in availableAccountObjects
		// ALWAYS resolve to canonical name to eliminate acronyms ('SCS', 'AS') and case duplicates ('S.SUDHAKAR')
		loans.forEach((loan) => {
			const candidateNames = [
				loan.primaryAccountName,
				loan.primary,
				loan.primary_account_name,
				...getLoanSecondaryAccounts(loan),
			].filter(Boolean);

			candidateNames.forEach((raw) => {
				const trimmed = String(raw).trim();
				if (!trimmed) return;

				// If it's a known acronym (e.g. SCS, AS, SS), do NOT add as a standalone option!
				const isAcronymOfKnown = availableAccountObjects.some(
					(a) => a && cleanAccountKey(a.acronym) === cleanAccountKey(trimmed)
				);
				if (isAcronymOfKnown) return;

				const canonical = getCanonicalAccountName(trimmed, availableAccountObjects);
				const key = cleanAccountKey(canonical);
				if (!accountMap.has(key)) {
					accountMap.set(key, {
						id: canonical,
						label: canonical,
						acronym: '',
					});
				}
			});
		});

		// 3. Compute live count of active tab loans matching each account
		const list = Array.from(accountMap.values()).map((acc) => {
			const count = tabLoans.filter((l) =>
				doesLoanMatchAccount(l, acc.label, availableAccountObjects)
			).length;
			return {
				...acc,
				count,
			};
		});

		// 4. Sort: accounts with loans in this tab first (sorted by count descending), then alphabetically
		list.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return a.label.localeCompare(b.label);
		});

		return [
			{
				id: 'ALL',
				label: 'All Accounts',
				count: tabLoans.length,
			},
			...list,
		];
	}, [availableAccountObjects, loans, tabLoans]);

	// Shared pagination controls for table and card views
	const renderPagination = (isTableFooter = false) => (
		<div
			className={`px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none ${
				isTableFooter
					? 'border-t border-slate-100 rounded-b-2xl'
					: 'rounded-2xl border border-slate-200 bg-white shadow-2xs'
			}`}
		>
			{/* Left: Summary Count */}
			<div className="flex items-center gap-2 text-slate-500 font-medium text-center sm:text-left">
				<span>
					Showing{' '}
					<span className="font-bold text-slate-900">
						{totalItems === 0 ? 0 : startIndex + 1}
					</span>{' '}
					to <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
					<span className="font-bold text-slate-900">{totalItems}</span> loans
				</span>
				{totalItems !== tabLoans.length && (
					<span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200/70">
						{tabLoans.length} total
					</span>
				)}
			</div>

			{/* Right: Page Navigation Buttons */}
			<div className="flex items-center gap-1">
				{/* First Page */}
				<button
					type="button"
					onClick={() => setCurrentPage(1)}
					disabled={currentPage === 1}
					className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
					title="First page"
					aria-label="First page"
				>
					<span className="material-symbols-outlined text-[18px]">first_page</span>
				</button>

				{/* Previous Page */}
				<button
					type="button"
					onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
					disabled={currentPage === 1}
					className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
					title="Previous page"
					aria-label="Previous page"
				>
					<span className="material-symbols-outlined text-[18px]">chevron_left</span>
				</button>

				{/* Numeric Page Buttons */}
				<div className="flex items-center gap-1 mx-0.5">
					{getPageNumbers().map((page, pIdx) => {
						if (page === '...') {
							return (
								<span
									key={`ellipsis-${pIdx}`}
									className="h-8 w-6 flex items-center justify-center text-slate-400 font-bold text-[12px]"
								>
									…
								</span>
							);
						}
						const isCurrent = page === currentPage;
						return (
							<button
								key={page}
								type="button"
								onClick={() => setCurrentPage(page)}
								aria-label={`Page ${page}`}
								aria-current={isCurrent ? 'page' : undefined}
								className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-xl text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${
									isCurrent
										? 'bg-primary text-white shadow-xs'
										: 'text-slate-700 hover:text-slate-900 hover:bg-white'
								}`}
							>
								{page}
							</button>
						);
					})}
				</div>

				{/* Next Page */}
				<button
					type="button"
					onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
					disabled={currentPage === totalPages || totalItems === 0}
					className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
					title="Next page"
					aria-label="Next page"
				>
					<span className="material-symbols-outlined text-[18px]">chevron_right</span>
				</button>

				{/* Last Page */}
				<button
					type="button"
					onClick={() => setCurrentPage(totalPages)}
					disabled={currentPage === totalPages || totalItems === 0}
					className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
					title="Last page"
					aria-label="Last page"
				>
					<span className="material-symbols-outlined text-[18px]">last_page</span>
				</button>
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-6 font-sans">
			{/* Top Header Strip matching Matchup styling */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs shrink-0">
							<span className="material-symbols-outlined text-[24px]">
								pending_actions
							</span>
						</div>
						<div>
							<div className="flex flex-wrap items-center gap-2.5">
								<h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
									Approval Requests
								</h1>
								{metrics.pendingCount > 0 && (
									<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
										<span className="w-2 h-2 rounded-full bg-amber-500"></span>
										{metrics.pendingCount} Pending Approval
									</span>
								)}
							</div>
							<p className="text-[12px] text-slate-500 mt-0.5">
								Multi-stage authorization portal for co-lending joint loans: Secondary Partner Verification &amp; System Admin Activation
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Main Card: Controls & Filter Navigation */}
			<div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-200/80 flex flex-col gap-2">
				{/* Top Controls: Tabs and Search */}
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
					{/* Category Tabs: Grouped [Pending | Approved] & [Payout Pending] & [My Submissions] */}
					<div className="flex items-center gap-3 overflow-x-auto pb-1 -mb-1 scrollbar-none">
						{/* Grouped Approvals Segmented Control: Pending & Approved */}
						<div className="inline-flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/70 shadow-2xs shrink-0">
							<button
								type="button"
								onClick={() => setActiveTab('pending')}
								className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'pending' || activeTab === 'my-approval'
										? 'bg-amber-600 text-white shadow-xs'
										: 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
									}`}
							>
								<span className="material-symbols-outlined text-[17px]">
									pending_actions
								</span>
								<span>Pending</span>
								{metrics.pendingCount > 0 && (
									<span
										className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${activeTab === 'pending' || activeTab === 'my-approval'
												? 'bg-white text-amber-700'
												: 'bg-amber-500 text-white'
											}`}
									>
										{metrics.pendingCount}
									</span>
								)}
							</button>

							<button
								type="button"
								onClick={() => setActiveTab('approved')}
								className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'approved'
										? 'bg-emerald-600 text-white shadow-xs'
										: 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
									}`}
							>
								<span className="material-symbols-outlined text-[17px]">
									task_alt
								</span>
								<span>Approved</span>
								{metrics.approvedCount > 0 && (
									<span
										className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${activeTab === 'approved'
												? 'bg-white text-emerald-700'
												: 'bg-emerald-600 text-white'
											}`}
									>
										{metrics.approvedCount}
									</span>
								)}
							</button>
						</div>

						{/* Payout Pending Tab */}
						<button
							type="button"
							onClick={() => setActiveTab('payout-pending')}
							className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${activeTab === 'payout-pending'
									? 'bg-blue-600 text-white shadow-xs'
									: 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 border border-slate-200/70'
								}`}
						>
							<span className="material-symbols-outlined text-[17px]">
								payments
							</span>
							<span>Payout Pending</span>
							{metrics.payoutPendingCount > 0 && (
								<span
									className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${activeTab === 'payout-pending'
											? 'bg-white text-blue-700'
											: 'bg-blue-600 text-white'
										}`}
								>
									{metrics.payoutPendingCount}
								</span>
							)}
						</button>

						{/* My Submissions Tab */}
						<button
							type="button"
							onClick={() => setActiveTab('others-approval')}
							className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${activeTab === 'others-approval'
									? 'bg-slate-900 text-white shadow-xs'
									: 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 border border-slate-200/70'
								}`}
						>
							<span className="material-symbols-outlined text-[17px]">
								outbox
							</span>
							<span>My Submissions</span>
							{metrics.othersApprovalCount > 0 && (
								<span
									className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold leading-none shrink-0 ${activeTab === 'others-approval'
											? 'bg-white text-slate-900'
											: 'bg-slate-200 text-slate-700'
										}`}
								>
									{metrics.othersApprovalCount}
								</span>
							)}
						</button>
					</div>

					{/* Search & Account Dropdown Filter */}
					<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
						{/* Modern Account Dropdown Filter */}
						<ModernAccountDropdown
							value={filterAccount}
							onChange={setFilterAccount}
							options={accountFilterOptions}
						/>

						{/* Search Input */}
						<div className="relative min-w-[200px]">
							<span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
								search
							</span>
							<input
								type="text"
								value={localSearch}
								onChange={(e) => setLocalSearch(e.target.value)}
								placeholder="Search borrower, ID, amount..."
								className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:bg-white placeholder:text-slate-400"
							/>
							{localSearch && (
								<button
									type="button"
									onClick={() => setLocalSearch('')}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
								>
									<span className="material-symbols-outlined text-[16px]">close</span>
								</button>
							)}
						</div>
					</div>
				</div>

				{/* Loans List */}
				{isLoading ? (
					<div className="py-16 text-center">
						<LottieLoader text="Loading approval requests..." size="lg" />
					</div>
				) : filteredLoans.length === 0 ? (
					<div className="py-16 text-center max-w-sm mx-auto">
						<div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
							<span className="material-symbols-outlined text-[28px]">
								{activeTab === 'approved'
									? 'task_alt'
									: activeTab === 'payout-pending'
										? 'payments'
										: activeTab === 'others-approval'
											? 'outbox'
											: 'fact_check'}
							</span>
						</div>
						<h3 className="text-sm font-bold text-slate-800">
							{activeTab === 'approved'
								? 'No approved loans found'
								: activeTab === 'payout-pending'
									? 'No payout pending loans found'
									: activeTab === 'others-approval'
										? 'No loan submissions found'
										: 'No pending loans found'}
						</h3>
						<p className="text-xs text-slate-500 mt-1">
							{activeTab === 'pending' || activeTab === 'my-approval'
								? 'All caught up! You have no loan applications pending approval right now.'
								: activeTab === 'payout-pending'
									? 'There are no secondary partner remittance payout requests awaiting approval.'
									: activeTab === 'others-approval'
										? 'You have no pending or approved loan submissions yet.'
										: 'You do not have any approved loans yet.'}
						</p>
						{(filterAccount !== 'ALL' || localSearch) && (
							<button
								type="button"
								onClick={() => {
									setFilterAccount('ALL');
									setLocalSearch('');
								}}
								className="mt-3 text-xs font-bold text-primary hover:underline"
							>
								Clear filters
							</button>
						)}
					</div>
				) : activeTab === 'payout-pending' ? (
					<div className="space-y-3">
						{totalApprovablePayoutCount > 0 && (
							<div className="flex items-center justify-between px-4 py-2.5 text-xs">
								<label className="inline-flex items-center gap-2.5 cursor-pointer select-none font-bold text-slate-700">
									<input
										type="checkbox"
										checked={isAllPayoutVisibleSelected}
										ref={(el) => {
											if (el) el.indeterminate = isSomePayoutVisibleSelected;
										}}
										onChange={handleToggleSelectAllPayouts}
										className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
									/>
									<span>Select All ({totalApprovablePayoutCount} {totalApprovablePayoutCount === 1 ? 'Due' : 'Dues'})</span>
								</label>
								{selectedPayoutDues.length > 0 && (
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => setSelectedPayoutItemKeys([])}
											className="text-[11px] font-bold text-slate-400 hover:text-slate-700 underline cursor-pointer"
										>
											Clear
										</button>
									</div>
								)}
							</div>
						)}
						{paginatedLoans.map((loan, loanIdx) => {
							const loanKey = getLoanUniqueId(loan);
							const clientName =
								loan.client_account_name ||
								loan.borrower?.name ||
								loan.clientName ||
								'Borrower';
							const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
							const isExpanded = expandedPayoutLoanMap[loanKey] !== undefined
								? Boolean(expandedPayoutLoanMap[loanKey])
								: loanIdx === 0;
							const pendingPayouts = getLoanPendingPayoutItems(
								loan,
								currentUser,
								availableAccountObjects,
								allUsers,
								updatedPayoutKeys
							);
							if (pendingPayouts.length === 0) return null;
							const firstPending = pendingPayouts[0];
							const primaryRaw = loan.primaryAccountName || loan.primary || loan.primary_account_name || 'Primary';
							const priAcronym = getAccountAcronym(primaryRaw, availableAccountObjects) || 'AS';
							const secAccountsRaw = getLoanSecondaryAccounts(loan);
							const secAcronym = secAccountsRaw.length > 0 ? (getAccountAcronym(secAccountsRaw[0], availableAccountObjects) || 'SCS') : 'SCS';
							const priShare =
								loan.primary_share != null
									? Number(loan.primary_share)
									: loan.primaryShare != null
										? Number(loan.primaryShare)
										: 50;

							const loanApprovableKeys = pendingPayouts
								.filter((item) => item.canCurrentUserApprove)
								.map((item) => `${loanKey}_${item.sNo}`);
							const hasApprovableDues = loanApprovableKeys.length > 0;
							const isLoanAllSelected = hasApprovableDues && loanApprovableKeys.every((k) => selectedPayoutItemKeys.includes(k));
							const isLoanSomeSelected = hasApprovableDues && loanApprovableKeys.some((k) => selectedPayoutItemKeys.includes(k)) && !isLoanAllSelected;

							return (
								<div
									key={loanKey}
									className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
										isExpanded
											? 'bg-white border-blue-300 ring-2 ring-blue-100 shadow-md'
											: 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-xs'
									}`}
								>
									{/* Header Row: Displays strictly Client Name, Loan ID, with who updated payout date */}
									<div
										onClick={() => handleToggleExpandPayout(loanKey, isExpanded)}
										className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group"
										title={isExpanded ? 'Click to collapse repayment schedule' : 'Click to view repayment schedule'}
									>
										{/* Client Name & Loan ID */}
										<div className="flex items-center gap-3 min-w-0">
											<div
												onClick={(e) => {
													e.stopPropagation();
													handleToggleLoanPayoutSelect(loan);
												}}
												className="flex items-center justify-center p-0.5"
												title={isLoanAllSelected ? 'Deselect all dues for this loan' : 'Select all approvable dues for this loan'}
											>
												<input
													type="checkbox"
													checked={isLoanAllSelected}
													ref={(el) => {
														if (el) el.indeterminate = isLoanSomeSelected;
													}}
													disabled={!hasApprovableDues}
													onChange={() => handleToggleLoanPayoutSelect(loan)}
													className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
												/>
											</div>

											<div className="min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<h3 className="text-[12px] font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
														{clientName}
													</h3>
													<span className="font-mono text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
														{loanId}
													</span>
													{pendingPayouts.length > 0 && (
														<span
															className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 shrink-0"
															title={`${pendingPayouts.length} payout pending ${pendingPayouts.length === 1 ? 'EMI' : 'EMIs'}`}
														>
															<span>{pendingPayouts.length} Approval Pending</span>
														</span>
													)}
												</div>
											</div>
										</div>

										{/* Who Updated Payout Date & Expand Indicator */}
										<div className="flex items-center sm:justify-end gap-3 pl-12 sm:pl-0 flex-wrap">
											{firstPending ? (
												<div className="flex flex-col sm:items-end gap-1">
													<div className="flex items-center gap-1.5 flex-wrap">
														<div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
															<span className="material-symbols-outlined text-blue-600" style={{fontSize: "18px"}}>person</span>
															<span className="text-[12px] font-bold text-slate-800">{firstPending.updatedBy}</span>
															{firstPending.isCurrentUserEditor && (
																<span className="text-[10px] text-blue-700 font-extrabold bg-blue-100 px-1.5 py-0.2 rounded">
																	You
																</span>
															)}
														</div>
													</div>
												</div>
											) : (
												<span className="text-xs text-slate-400 italic">Payout date updated</span>
											)}
											<span
												className={`material-symbols-outlined text-slate-400 text-[20px] transition-transform duration-200 shrink-0 ${
													isExpanded ? 'rotate-180 text-blue-600' : 'group-hover:text-slate-600'
												}`}
											>
												expand_more
											</span>
										</div>
									</div>

									{/* Expandable Dropdown: Repayment Schedule of Pending Payout Date EMIs */}
									{isExpanded && (
										<div className="border-t border-blue-100 bg-gradient-to-b from-blue-50/30 via-white to-slate-50/50 p-4 sm:p-5 space-y-4 animate-in fade-in-50 duration-200">

											{/* Repayment Schedule Table */}
											<div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto min-h-[80px] shadow-2xs">
													<table className="w-full text-left text-xs border-collapse">
														<thead>
															<tr className="bg-slate-100/80 text-[10.5px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
																<th className="py-2.5 px-3 text-center whitespace-nowrap w-8"></th>
																<th className="py-2.5 px-3 text-center whitespace-nowrap">EMI</th>
																<th className="py-2.5 px-3 whitespace-nowrap">Date</th>
																<th className="py-2.5 px-3 text-right whitespace-nowrap">Amount</th>
																<th className="py-2.5 px-3 whitespace-nowrap">Recd Date</th>
																<th className="py-2.5 px-3 text-right whitespace-nowrap">{priAcronym}</th>
																<th className="py-2.5 px-3 text-center min-w-[155px] whitespace-nowrap">Payout Date</th>
																<th className="py-2.5 px-3 text-right whitespace-nowrap">{secAcronym}</th>
																<th className="py-2.5 px-3 text-center whitespace-nowrap">{secAcronym} TDS</th>
																<th className="py-2.5 px-3 whitespace-nowrap text-center">Action</th>
															</tr>
														</thead>
														<tbody className="divide-y divide-slate-100">
															{pendingPayouts.map((item, pIdx) => {
																const raw = item.rawInst || {};
																const totalAmount = Number(item.amount || raw.amount || 0);
																const priAmount =
																	raw.priAmount != null
																		? Number(raw.priAmount)
																		: raw.primaryAmount != null
																			? Number(raw.primaryAmount)
																			: Math.round((totalAmount * priShare) / 100);

																const firstSecAcc = Array.isArray(raw.secAccounts) ? raw.secAccounts[0] : null;
																const secAmount = getPayoutItemSecondaryAmount(item, loan);

																const tdsAmount =
																	firstSecAcc?.tds != null
																		? Number(firstSecAcc.tds)
																		: raw.tds != null
																			? Number(raw.tds)
																			: 0;

																const recdDate = item.recdDate && item.recdDate !== '-' ? item.recdDate : (raw.receivedDate || '-');
																const emiDate = raw.date || raw.dueDate || item.dueDate || '-';
																const sNoDisplay = item.sNo != null ? item.sNo : (raw.sNo || pIdx + 1);
																const effectiveMinDate = (recdDate && recdDate !== '-') ? recdDate : (emiDate && emiDate !== '-' ? emiDate : '');

																const itemKey = `${loanKey}_${item.sNo}`;
																const isSelected = selectedPayoutItemKeys.includes(itemKey);
																const canApprove = Boolean(item.canCurrentUserApprove);
																const currentPayoutDate = payoutDateOverrides[itemKey] !== undefined
																	? payoutDateOverrides[itemKey]
																	: (item.payoutDate && item.payoutDate !== '-' ? item.payoutDate : '');

																const isUserPri = checkUserHasPrimaryAccessForLoanPrimary(currentUser, loan, availableAccountObjects);
																const isUserSec = checkUserHasPrimaryAccessForLoanSecondary(currentUser, loan, availableAccountObjects);
																const canEditPayoutDate = Boolean(isAdmin || isUserPri || isUserSec || item.canCurrentUserApprove || item.isCurrentUserEditor);

																const sameDay = getOffsetDateDDMMYYYY(effectiveMinDate, 0);
																const nextDay = getOffsetDateDDMMYYYY(effectiveMinDate, 1);
																const todayDate = getTodayDDMMYYYY();
																const isTodayPastOfRecd = isDateBefore(todayDate, effectiveMinDate);

																const payoutSuggestions =
																	canEditPayoutDate && effectiveMinDate && parseDDMMYYYY(effectiveMinDate)
																		? [
																			{
																				date: sameDay,
																				label: 'Same Day',
																				badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
																			},
																			{
																				date: nextDay,
																				label: 'Next Day',
																				badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
																			},
																			{
																				date: todayDate,
																				label: 'Today',
																				badgeClass: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
																				disabled: isTodayPastOfRecd,
																				tooltip: isTodayPastOfRecd
																					? `Today (${todayDate}) is earlier than Recd Date (${effectiveMinDate})`
																					: '',
																			},
																		]
																		: null;

																return (
																	<tr key={pIdx} className={`transition-colors ${isSelected ? 'bg-blue-50/70' : 'hover:bg-blue-50/30'}`}>
																		<td className="py-2.5 px-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
																			<input
																				type="checkbox"
																				checked={isSelected}
																				disabled={!canApprove}
																				onChange={() => handleTogglePayoutItemSelect(itemKey)}
																				className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
																				title={canApprove ? 'Select for batch approval/rejection' : 'Awaiting partner authorization'}
																			/>
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap text-center">
																			<span className="font-extrabold text-[11px] px-2 py-0.5 rounded-md text-slate-400">
																				#{sNoDisplay}
																			</span>
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">
																			{emiDate}
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap font-extrabold text-slate-900 font-mono text-right">
																			{formatCurrency(totalAmount)}
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">
																			{recdDate}
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap font-bold text-blue-900 font-mono text-right">
																			{formatCurrency(priAmount)}
																		</td>
																		<td className="py-2 px-3 whitespace-nowrap text-center">
																			<div className="inline-flex flex-col items-center justify-center">
																				<EditableDateCell
																					id={`req-payout-${loanKey}-${item.sNo}`}
																					value={currentPayoutDate}
																					minDate={effectiveMinDate}
																					minDateLabel="Recd Date"
																					disabled={!canEditPayoutDate}
																					tooltip={
																						!canEditPayoutDate
																							? 'You do not have permission to edit this payout date'
																							: (effectiveMinDate && effectiveMinDate !== '-'
																								? `Payout date cannot be earlier than client receipt date (${effectiveMinDate})`
																								: 'Edit payout date')
																					}
																					suggestions={payoutSuggestions}
																					openUpward="auto"
																					align="right"
																					onChange={(newVal) => handlePayoutDateChange(loan, item, newVal)}
																					onEnter={() => handlePayoutDateEnter(pIdx, pendingPayouts, loanKey)}
																					placeholder="dd-mm-yyyy"
																				/>
																			</div>
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap font-bold text-purple-900 font-mono text-right">
																			{formatCurrency(secAmount)}
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap text-center font-mono">
																			{tdsAmount > 0 ? (
																				<span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded ring-1 ring-amber-200/70 text-[11px]">
																					{formatCurrency(tdsAmount)}
																				</span>
																			) : (
																				<span className="text-slate-400 text-xs">-</span>
																			)}
																		</td>
																		<td className="py-2.5 px-3 whitespace-nowrap text-center">
																			{item.canCurrentUserApprove ? (
																				<div className="flex items-center justify-center gap-1.5">
																					<button
																						type="button"
																						disabled={isSubmittingPayout}
																						onClick={(e) => {
																							e.stopPropagation();
																							handleDirectApprovePayout(loan, item);
																						}}
																						className="inline-flex items-center gap-1 p-1 rounded-lg text-xs font-bold text-emerald-600 bg-emerald-100 hover:bg-emerald-200 ring-1 ring-emerald-600 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
																						title="Confirm remittance and approve payout date"
																					>
																						{isSubmittingPayout && submittingPayoutSNo === item.sNo ? (
																							<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
																						) : (
																							<span className="material-symbols-outlined" style={{fontSize: "16px"}}>check</span>
																						)}
																					</button>
																					<button
																						type="button"
																						disabled={isSubmittingPayout}
																						onClick={(e) => {
																							e.stopPropagation();
																							handleOpenRejectPayoutModal(loan, item);
																						}}
																						className="inline-flex items-center gap-1 p-1 rounded-lg text-xs font-bold text-rose-600 bg-rose-100 hover:bg-rose-200 ring-1 ring-rose-600 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
																						title="Flag discrepancy / reject payout date"
																					>
																						<span className="material-symbols-outlined" style={{fontSize: "16px"}}>close</span>
																					</button>
																				</div>
																			) : (
																				<span className="text-[11px] text-slate-400 font-medium italic">
																					Awaiting {item.targetRole}
																				</span>
																			)}
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>
										</div>
									)}
								</div>
							);
						})}

						{/* Pagination Controls for Payout Pending */}
						{renderPagination(false)}
					</div>
				) : (
					<div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
						<table className="w-full text-left border-collapse">
							<thead>
								<tr className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
									{isPendingTab && (
										<th className="py-3.5 px-3 whitespace-nowrap w-10 text-center" onClick={(e) => e.stopPropagation()}>
											<div className="flex items-center justify-center">
												<input
													ref={masterCheckboxRef}
													type="checkbox"
													aria-label="Select all visible loans"
													checked={isAllVisibleSelected}
													onChange={handleToggleSelectAll}
													className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500/20 border-slate-300 cursor-pointer accent-amber-600 transition-all"
												/>
											</div>
										</th>
									)}
									<th className="py-3.5 px-4 whitespace-nowrap w-14 text-center">S.No</th>
									<th className="py-3.5 px-4 whitespace-nowrap">Loan Date</th>
									<th className="py-3.5 px-4 whitespace-nowrap">Loan ID</th>
									<th className="py-3.5 px-4 whitespace-nowrap">Client Name</th>
									{activeTab !== 'others-approval' && (
										<th className="py-3.5 px-4 whitespace-nowrap">Requester</th>
									)}
									<th className="py-3.5 px-4 whitespace-nowrap">Amount</th>
									<th className="py-3.5 px-4 whitespace-nowrap">Primary</th>
									<th className="py-3.5 px-4 whitespace-nowrap">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 text-[13px] bg-white">
								{paginatedLoans.map((loan, idx) => {
									const meta = getLoanApprovalMeta(loan);
									const loanKey = getLoanUniqueId(loan);
									const isSelected = isPendingTab && selectedLoanIds.includes(loanKey);
									const clientName =
										loan.client_account_name ||
										loan.borrower?.name ||
										loan.clientName ||
										'Borrower';
									const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
									const primaryRaw =
										loan.primaryAccountName || loan.primary || loan.primary_account_name || '-';
									const primaryName = getCanonicalAccountName(primaryRaw, availableAccountObjects);
									const primaryAcronym = getAccountAcronym(primaryRaw, availableAccountObjects);
									const requesterName =
										loan.requester_name ||
										loan.requesterName ||
										loan.created_by ||
										loan.createdBy ||
										loan.userName ||
										'-';
									const amount = loan.loan_amount || loan.amount || 0;

									const isApproved = meta.isApproved;
									const isRejected = meta.isRejected;

									return (
										<tr
											key={loanKey}
											onClick={() => setSelectedLoan(loan)}
											title="Click to view loan details and approve/reject"
											className={`cursor-pointer transition-colors group ${
												isSelected
													? 'bg-amber-50/80 hover:bg-amber-100/70'
													: meta.needsUserAction
														? 'bg-amber-50/20 hover:bg-amber-50/60'
														: 'hover:bg-slate-50'
											}`}
										>
											{isPendingTab && (
												<td
													className="py-2.5 px-3 text-center w-10"
													onClick={(e) => {
														e.stopPropagation();
														handleToggleLoanSelect(loan);
													}}
												>
													<div className="flex items-center justify-center">
														<input
															type="checkbox"
															aria-label={`Select loan ${loanId}`}
															checked={isSelected}
															onChange={() => handleToggleLoanSelect(loan)}
															onClick={(e) => e.stopPropagation()}
															className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500/20 border-slate-300 cursor-pointer accent-amber-600 transition-all"
														/>
													</div>
												</td>
											)}

											{/* S.No */}
											<td className="py-2.5 px-4 text-center text-xs font-bold text-slate-500">
												{startIndex + idx + 1}
											</td>

											{/* Loan Date */}
											<td className="py-2.5 px-4 whitespace-nowrap text-xs font-semibold text-slate-600">
												{formatLoanDate(
													loan.loan_date ||
													loan.appliedDate ||
													loan.loanDate ||
													loan.date ||
													loan.applied_date
												)}
											</td>

											{/* Loan ID */}
											<td className="py-3 px-4 whitespace-nowrap">
												<span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
													{loanId}
												</span>
											</td>

											{/* Client Name */}
											<td className="py-3 px-4">
												<div className="font-extrabold text-[13px] text-slate-900 group-hover:text-primary transition-colors flex items-center gap-1.5">
													<span>{clientName}</span>
												</div>
											</td>

											{/* Requester Name */}
											{activeTab !== 'others-approval' && (
												<td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-700">
													<div className="flex items-center gap-1.5 capitalize">
														<span>{requesterName}</span>
													</div>
												</td>
											)}

											{/* Amount */}
											<td className="py-3 px-4 whitespace-nowrap">
												<div className="font-extrabold text-[13.5px] text-slate-900">
													{formatCurrency(amount)}
												</div>
											</td>

											{/* Primary */}
											<td className="py-3 px-4 whitespace-nowrap">
												<span
													title={primaryName}
													className={`inline-block font-extrabold text-[10.5px] px-2 py-0.5 rounded-md uppercase tracking-wider ring-1 ${getAccountTagColor(
														primaryAcronym,
														availableAccountObjects
													)}`}
												>
													{primaryAcronym}
												</span>
											</td>

											{/* Status */}
											<td className="py-3 px-4 whitespace-nowrap">
												{isApproved ? (
													<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
														<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
														Approved
													</span>
												) : isRejected ? (
													<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
														<span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
														Rejected
													</span>
												) : (loan.approval_status === 'PENDING_ADMIN' || loan.approvalStatus === 'PENDING_ADMIN') ? (
													<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300" title="Secondary verification approved. Awaiting final Admin authorization.">
														<span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
														Verified (Pending Admin)
													</span>
												) : (
													<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
														<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
														Pending
													</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>

						{/* Pagination Footer */}
						{renderPagination(true)}
					</div>
				)}
			</div>

			{/* Full Loan Inspection Modal */}
			{selectedLoan && (
				<div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-3 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
						{/* Modal Header (Fixed at top) */}
						<div className="flex items-start justify-between px-6 sm:px-7 pt-6 pb-4 border-b border-slate-100 shrink-0 bg-white">
							<div>
								<div className="flex items-center gap-2 mb-1.5">
									<span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
										{selectedLoan.loan_ref_id || selectedLoan.id}
									</span>
									<span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
										{selectedLoan.loan_date || selectedLoan.appliedDate}
									</span>
								</div>
								<h3 className="text-[20px] font-extrabold text-slate-900 tracking-tight">
									{selectedLoan.client_account_name || selectedLoan.borrower?.name}
								</h3>
							</div>

							<button
								type="button"
								onClick={() => setSelectedLoan(null)}
								className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
							>
								<span className="material-symbols-outlined text-[20px]">close</span>
							</button>
						</div>

						{/* Modal Scrollable Body */}
						<div className="px-6 sm:px-7 py-5 overflow-y-auto flex-1 flex flex-col gap-5 min-h-0">
							{/* Highlights Grid */}
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
								<div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
									<span className="text-[11px] font-bold text-slate-400 uppercase">Loan Amount</span>
									<div className="text-[16px] font-black text-slate-900 mt-0.5">
										{formatCurrency(selectedLoan.loan_amount || selectedLoan.amount)}
									</div>
								</div>
								<div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
									<span className="text-[11px] font-bold text-slate-400 uppercase">Interest Rate</span>
									<div className="text-[16px] font-black text-slate-900 mt-0.5">
										{getLoanInterestRateDisplay(selectedLoan)}
									</div>
								</div>
								<div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
									<span className="text-[11px] font-bold text-slate-400 uppercase">Total Due</span>
									<div className="text-[16px] font-black text-slate-900 mt-0.5">
										{getLoanTotalDuesDisplay(selectedLoan)}
									</div>
								</div>
								<div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
									<span className="text-[11px] font-bold text-slate-400 uppercase">Total Repayment</span>
									<div className="text-[16px] font-black text-slate-900 mt-0.5">
										{getLoanTotalRepayment(selectedLoan)}
									</div>
								</div>
							</div>

							{/* Dedicated Pending Payout Approvals Breakdown Card */}
							{(() => {
								const modalPayouts = getLoanPendingPayoutItems(selectedLoan, currentUser, availableAccountObjects, allUsers, updatedPayoutKeys);
								if (modalPayouts.length === 0) return null;
								return (
									<div className="bg-gradient-to-br from-blue-50/70 via-slate-50 to-indigo-50/40 rounded-2xl border border-blue-200/90 p-4 space-y-3">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
													<span className="material-symbols-outlined text-[18px]">payments</span>
												</div>
												<div>
													<h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
														Pending EMI Payout Approvals
													</h4>
													<p className="text-[11px] text-slate-500">
														{modalPayouts.length} EMI installment{modalPayouts.length > 1 ? 's' : ''} awaiting remittance payout authorization
													</p>
												</div>
											</div>
											{onNavigateToJointLoan && (
												<button
													type="button"
													onClick={() => {
														const target = selectedLoan;
														setSelectedLoan(null);
														onNavigateToJointLoan(target);
													}}
													className="px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 bg-white border border-blue-200 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs"
												>
													<span className="material-symbols-outlined text-[14px]">open_in_new</span>
													<span>Facility Schedule</span>
												</button>
											)}
										</div>

										<div className="grid grid-cols-1 gap-2.5">
											{modalPayouts.map((item, pIdx) => (
												<div
													key={pIdx}
													className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
												>
													<div className="flex items-start sm:items-center gap-3">
														<div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex flex-col items-center justify-center shrink-0">
															<span className="text-[8.5px] font-black uppercase text-amber-600">EMI</span>
															<span className="text-sm font-black text-amber-900 leading-none">#{item.sNo}</span>
														</div>
														<div className="space-y-0.5">
															<div className="flex flex-wrap items-center gap-2">
																<span className="font-black text-slate-900 text-[13px]">
																	{formatCurrency(item.amount)}
																</span>
																<span className="text-[11px] text-slate-400">•</span>
																<span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/70 inline-flex items-center gap-1">
																	<span className="material-symbols-outlined text-[13px]">calendar_month</span>
																	Requested Payout: {item.payoutDate}
																</span>
																{item.recdDate && item.recdDate !== '-' && (
																	<span className="text-[11px] text-slate-500 font-medium">
																		(Payment Recd: {item.recdDate})
																	</span>
																)}
															</div>
															<div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
																<span>
																	Payout date updated by: <strong className="text-slate-800">{item.updatedBy}</strong>
																	<span className="text-slate-500 font-normal"> ({item.updatedRole})</span>
																	{item.isCurrentUserEditor && <span className="text-primary font-bold ml-1">(You)</span>}
																	{item.updatedAt && <span className="text-slate-400 font-mono text-[10px] ml-1">• {item.updatedAt}</span>}
																</span>
															</div>
															<div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-1.5">
																<span>Approver:</span>
																<strong className="text-slate-800">{item.approverDisplay}</strong>
																{item.canCurrentUserApprove ? (
																	<span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 ml-1">
																		<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
																		You can approve
																	</span>
																) : (
																	<span className="text-[10px] text-slate-400 font-medium ml-1">
																		(Awaiting partner action)
																	</span>
																)}
															</div>
														</div>
													</div>

													{item.canCurrentUserApprove && item.rawInst && (
														<div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
															<button
																type="button"
																disabled={isSubmittingPayout}
																onClick={() => handleDirectApprovePayout(selectedLoan, item)}
																className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
																title="Confirm remittance and approve payout date"
															>
																{isSubmittingPayout && submittingPayoutSNo === item.sNo ? (
																	<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
																) : (
																	<span className="material-symbols-outlined text-[15px]">check_circle</span>
																)}
																<span>Approve Payout</span>
															</button>
															<button
																type="button"
																disabled={isSubmittingPayout}
																onClick={() => handleOpenRejectPayoutModal(selectedLoan, item)}
																className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
																title="Flag discrepancy / reject payout date"
															>
																<span className="material-symbols-outlined text-[15px]">cancel</span>
																<span>Reject</span>
															</button>
														</div>
													)}
												</div>
											))}
										</div>
									</div>
								);
							})()}

							{/* Accounts Breakdown Table */}
							{(() => {
								const totalPrincipal = Number(selectedLoan.loan_amount || selectedLoan.amount || 0);

								// Determine total facility repayment
								let totalFacilityRepay = Number(
									selectedLoan.total_repayment_amount ||
									selectedLoan.total_repayment ||
									selectedLoan.totalRepayAmount ||
									0
								);

								if (totalFacilityRepay <= 0 && Array.isArray(selectedLoan.repaymentSchedule) && selectedLoan.repaymentSchedule.length > 0) {
									totalFacilityRepay = selectedLoan.repaymentSchedule.reduce(
										(sum, s) => sum + (Number(s.amount || s.repayment_amount || s.total_amount) || 0),
										0
									);
								}
								if (totalFacilityRepay <= 0) {
									totalFacilityRepay = totalPrincipal;
								}

								// 1. Primary Partner
								const primaryAcc = Array.isArray(selectedLoan.accountDetails)
									? selectedLoan.accountDetails.find((a) => a?.isPrimary)
									: null;

								const priShare = primaryAcc?.share != null && !isNaN(Number(primaryAcc.share))
									? Number(primaryAcc.share)
									: Number(selectedLoan.primary_account_share || selectedLoan.primaryShare || 60);

								const priPrincipal = primaryAcc?.principal != null && !isNaN(Number(primaryAcc.principal))
									? Number(primaryAcc.principal)
									: Math.round((totalPrincipal * priShare) / 100);

								const priRepay = primaryAcc?.repayAmount != null && Number(primaryAcc.repayAmount) > 0
									? Number(primaryAcc.repayAmount)
									: Math.round((totalFacilityRepay * priShare) / 100);

								// 2. Secondary Partners
								const secNames = getLoanSecondaryAccounts(selectedLoan);
								const secAccountDetails = Array.isArray(selectedLoan.accountDetails)
									? selectedLoan.accountDetails.filter((a) => a && !a.isPrimary)
									: [];
								const secAccountsList = Array.isArray(selectedLoan.secondaryAccounts)
									? selectedLoan.secondaryAccounts
									: [];
								const remAccountsList = Array.isArray(selectedLoan.remaining_accounts)
									? selectedLoan.remaining_accounts
									: [];

								const remainingSharePct = Math.max(0, 100 - priShare);
								const fallbackSecShare = secNames.length > 0 ? remainingSharePct / secNames.length : remainingSharePct;

								const secondaryRows = secNames.map((secName, idx) => {
									const secDetail =
										secAccountDetails.find(
											(a) => a.accountName === secName || a.accountTag === secName
										) || (secAccountDetails.length === secNames.length ? secAccountDetails[idx] : null);

									const secObj =
										secAccountsList.find(
											(s) => s.accountName === secName || s.name === secName
										) || (secAccountsList.length === secNames.length ? secAccountsList[idx] : null);

									const remObj =
										remAccountsList.find(
											(r) => r.account_name === secName
										) || (remAccountsList.length === secNames.length ? remAccountsList[idx] : null);

									let sharePct = fallbackSecShare;
									if (secDetail?.share != null && !isNaN(Number(secDetail.share))) {
										sharePct = Number(secDetail.share);
									} else if (secObj?.share != null && !isNaN(Number(secObj.share))) {
										sharePct = Number(secObj.share);
									} else if (remObj?.percentage != null && !isNaN(Number(remObj.percentage))) {
										sharePct = Number(remObj.percentage);
									}

									let principal = 0;
									if (secDetail?.principal != null && !isNaN(Number(secDetail.principal))) {
										principal = Number(secDetail.principal);
									} else if (secObj?.amount != null && !isNaN(Number(secObj.amount))) {
										principal = Number(secObj.amount);
									} else if (remObj?.share != null && !isNaN(Number(remObj.share))) {
										principal = Number(remObj.share);
									} else {
										principal = Math.round((totalPrincipal * sharePct) / 100);
									}

									let repay = 0;
									if (secDetail?.repayAmount != null && Number(secDetail.repayAmount) > 0) {
										repay = Number(secDetail.repayAmount);
									} else if (secObj?.interest != null && secObj?.amount != null) {
										repay = Number(secObj.amount || 0) + Number(secObj.interest || 0);
									} else {
										repay = Math.round((totalFacilityRepay * sharePct) / 100);
									}

									return {
										name: secName,
										share: sharePct,
										principal,
										repay,
									};
								});

								// Summary Totals
								const totalShareSum = Math.round(priShare + secondaryRows.reduce((sum, r) => sum + r.share, 0));
								const totalPrincipalSum = priPrincipal + secondaryRows.reduce((sum, r) => sum + r.principal, 0);
								const totalRepaySum = priRepay + secondaryRows.reduce((sum, r) => sum + r.repay, 0);

								return (
									<div>
										<h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
											Partner Capital Allocation
										</h4>
										<div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
											<table className="w-full text-left text-xs">
												<thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
													<tr>
														<th className="p-3">Account Name</th>
														<th className="p-3">Role</th>
														<th className="p-3 text-right">Share %</th>
														<th className="p-3 text-right">Principal Amount</th>
														<th className="p-3 text-right">Total Repayment</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-slate-100">
													<tr className="bg-white hover:bg-slate-50/50 transition-colors">
														<td className="p-3 font-bold text-slate-900">
															{selectedLoan.primaryAccountName || selectedLoan.primary || 'Primary Account'}
														</td>
														<td className="p-3 text-slate-500">
															<span className="px-2 py-1 bg-primary/10 text-primary font-bold rounded-md text-[10px]">
																Primary Partner
															</span>
														</td>
														<td className="p-3 text-right font-mono font-bold">
															{priShare}%
														</td>
														<td className="p-3 text-right font-mono font-bold text-slate-900">
															{formatCurrency(priPrincipal)}
														</td>
														<td className="p-3 text-right font-mono font-bold text-emerald-700">
															{formatCurrency(priRepay)}
														</td>
													</tr>
													{secondaryRows.map((sec, idx) => (
														<tr key={idx} className="bg-slate-50/50 hover:bg-slate-100/50 transition-colors">
															<td className="p-3 font-bold text-slate-900">{sec.name}</td>
															<td className="p-3 text-slate-500">
																<span className="px-2 py-1 bg-amber-100 text-amber-800 font-bold rounded-md text-[10px]">
																	Secondary Partner
																</span>
															</td>
															<td className="p-3 text-right font-mono font-bold">{sec.share}%</td>
															<td className="p-3 text-right font-mono font-bold text-slate-900">
																{formatCurrency(sec.principal)}
															</td>
															<td className="p-3 text-right font-mono font-bold text-emerald-700">
																{formatCurrency(sec.repay)}
															</td>
														</tr>
													))}
												</tbody>
												<tfoot className="bg-slate-100/90 border-t-2 border-slate-200 font-bold text-slate-900">
													<tr>
														<td className="p-3 font-extrabold text-slate-900">Total</td>
														<td className="p-3 text-slate-400 font-normal">—</td>
														<td className="p-3 text-right font-mono font-extrabold text-slate-900">
															{totalShareSum}%
														</td>
														<td className="p-3 text-right font-mono font-extrabold text-slate-900">
															{formatCurrency(totalPrincipalSum || totalPrincipal)}
														</td>
														<td className="p-3 text-right font-mono font-extrabold text-emerald-800">
															{formatCurrency(totalRepaySum || totalFacilityRepay)}
														</td>
													</tr>
												</tfoot>
											</table>
										</div>
									</div>
								);
							})()}

							{/* Approval Details Section */}
							{(() => {
								const { secManager, admin, secManagers } = getLoanSignOffDetails(selectedLoan);
								const meta = getLoanApprovalMeta(selectedLoan);
								const isPendingAdmin =
									selectedLoan.approval_status === 'PENDING_ADMIN' ||
									selectedLoan.approvalStatus === 'PENDING_ADMIN' ||
									(secManager && !admin && !meta.isApproved);

								return (
									<div>
										<h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
											<span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
											<span>Approval &amp; Authorization Details</span>
										</h4>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{/* Secondary Manager Card */}
											<div className="p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 flex flex-col justify-between gap-3">
												<div className="flex items-start justify-between gap-2">
													<div className="flex items-center gap-2.5 min-w-0">
														<div
															className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${secManager
																	? 'bg-amber-100 text-amber-800'
																	: 'bg-slate-100 text-slate-400'
																}`}
														>
															<span className="material-symbols-outlined text-[19px]">
																{secManager ? 'shield_person' : 'hourglass_top'}
															</span>
														</div>
														<div className="min-w-0">
															<div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
																Secondary Manager
															</div>
															<div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
																<span className="truncate">
																	{secManager ? secManager.name : 'Pending Secondary Verification'}
																</span>
																{secManager?.code && (
																	<span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0">
																		{secManager.code}
																	</span>
																)}
															</div>
														</div>
													</div>
													{secManager ? (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
															<span className="material-symbols-outlined text-[12px]">check</span>
															Verified
														</span>
													) : (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
															<span className="material-symbols-outlined text-[12px]">schedule</span>
															Pending
														</span>
													)}
												</div>

												{(secManager?.accountName || secManager?.timestamp) && (
													<div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 font-medium">
														{secManager.accountName ? (
															<span className="truncate max-w-[170px]" title={secManager.accountName}>
																{secManager.accountName}
															</span>
														) : (
															<span />
														)}
														{secManager.timestamp && (
															<span className="text-[10px] text-slate-400 font-mono ml-auto">
																{secManager.timestamp}
															</span>
														)}
													</div>
												)}
											</div>

											{/* Administrator Card */}
											<div className="p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 flex flex-col justify-between gap-3">
												<div className="flex items-start justify-between gap-2">
													<div className="flex items-center gap-2.5 min-w-0">
														<div
															className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${admin
																	? 'bg-emerald-100 text-emerald-800'
																	: isPendingAdmin
																		? 'bg-purple-100 text-purple-800'
																		: 'bg-slate-100 text-slate-400'
																}`}
														>
															<span className="material-symbols-outlined text-[19px]">
																{admin
																	? 'admin_panel_settings'
																	: isPendingAdmin
																		? 'pending_actions'
																		: 'hourglass_top'}
															</span>
														</div>
														<div className="min-w-0">
															<div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
																Administrator
															</div>
															<div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
																<span className="truncate">
																	{admin
																		? admin.name
																		: isPendingAdmin
																			? 'Awaiting Admin Authorization'
																			: 'Awaiting Prior Verification'}
																</span>
																{admin?.code && (
																	<span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0">
																		{admin.code}
																	</span>
																)}
															</div>
														</div>
													</div>
													{admin ? (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
															<span className="material-symbols-outlined text-[12px]">verified</span>
															Authorized
														</span>
													) : isPendingAdmin ? (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
															<span className="material-symbols-outlined text-[12px]">schedule</span>
															Pending Admin
														</span>
													) : (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
															<span className="material-symbols-outlined text-[12px]">schedule</span>
															Pending
														</span>
													)}
												</div>

												{admin?.timestamp && (
													<div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 font-medium">
														<span className="text-[10px] text-slate-400">Authorized Date</span>
														<span className="text-[10px] text-slate-400 font-mono ml-auto">
															{admin.timestamp}
														</span>
													</div>
												)}
											</div>
										</div>
									</div>
								);
							})()}
						</div>

						{/* Modal Actions (Fixed at bottom) */}
						<div className="px-6 sm:px-7 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0 bg-slate-50/70">
							{onNavigateToJointLoan && (
								<button
									type="button"
									onClick={() => {
										const target = selectedLoan;
										setSelectedLoan(null);
										onNavigateToJointLoan(target);
									}}
									className="px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 border border-primary/20 rounded-xl transition-all inline-flex items-center gap-1 mr-auto cursor-pointer"
								>
									<span className="material-symbols-outlined text-[15px]">open_in_new</span>
									<span>View in Joint Loans</span>
								</button>
							)}

							<button
								type="button"
								onClick={() => setSelectedLoan(null)}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Close
							</button>

							{getLoanApprovalMeta(selectedLoan).canApproveSecondary && (
								<>
									<button
										type="button"
										onClick={() => handleOpenRejectModal(selectedLoan)}
										className="px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all cursor-pointer"
									>
										Reject
									</button>
									<button
										type="button"
										disabled={isSubmitting}
										onClick={() => handleApproveSecondary(selectedLoan)}
										className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
									>
										Approve
									</button>
								</>
							)}

							{getLoanApprovalMeta(selectedLoan).canApproveAdmin && (
								<>
									<button
										type="button"
										onClick={() => handleOpenRejectModal(selectedLoan)}
										className="px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all cursor-pointer"
									>
										Reject
									</button>
									<button
										type="button"
										disabled={isSubmitting}
										onClick={() => handleApproveAdmin(selectedLoan)}
										className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
									>
										Approve
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Payout Rejection / Discrepancy Modal */}
			{isPayoutRejectModalOpen && payoutToReject && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[20px]">cancel</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Reject Payout Date ({payoutToReject.item.label})
								</h3>
								<p className="text-xs text-slate-500">
									{payoutToReject.loan.loan_ref_id || payoutToReject.loan.id} • {payoutToReject.loan.client_account_name || payoutToReject.loan.borrower?.name}
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							Please enter the reason for rejecting the requested payout date ({payoutToReject.item.payoutDate}). This will flag a payout discrepancy in the repayment schedule.
						</p>

						<div>
							<label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
								Discrepancy / Rejection Reason
							</label>
							<textarea
								rows={3}
								value={payoutRejectReason}
								onChange={(e) => setPayoutRejectReason(e.target.value)}
								placeholder="e.g. Payment not received in bank, date discrepancy, incorrect deduction..."
								className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:bg-white placeholder:text-slate-400"
							/>
						</div>

						<div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
							<button
								type="button"
								onClick={() => {
									setIsPayoutRejectModalOpen(false);
									setPayoutToReject(null);
									setPayoutRejectReason('');
								}}
								disabled={isSubmittingPayout}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmRejectPayout}
								disabled={isSubmittingPayout}
								className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
							>
								{isSubmittingPayout && (
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
								)}
								<span>{isSubmittingPayout ? 'Rejecting...' : 'Confirm Discrepancy'}</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Rejection Modal */}
			{isRejectModalOpen && loanToReject && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[20px]">cancel</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Reject Loan Application
								</h3>
								<p className="text-xs text-slate-500">
									{loanToReject.loan_ref_id || loanToReject.id} • {loanToReject.client_account_name || loanToReject.borrower?.name}
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							Please enter the reason for rejecting this loan. The reason will be permanently recorded in the facility audit trail.
						</p>

						<div>
							<label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
								Rejection Reason
							</label>
							<textarea
								rows={3}
								value={rejectReason}
								onChange={(e) => setRejectReason(e.target.value)}
								placeholder="e.g. Incompatible share distribution, partner credit declined, documentation discrepancy..."
								className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:bg-white placeholder:text-slate-400"
							/>
						</div>

						<div className="flex items-center justify-end gap-2.5 pt-2">
							<button
								type="button"
								onClick={() => {
									setIsRejectModalOpen(false);
									setLoanToReject(null);
								}}
								disabled={isSubmitting}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmReject}
								disabled={isSubmitting}
								className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all disabled:opacity-50"
							>
								{isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Floating Batch Action Pill (Stays in view while scrolling on Pending Tab) */}
			{isPendingTab && selectedLoans.length > 0 && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[calc(100%-2rem)] sm:w-auto bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
							<span className="text-xs sm:text-sm font-extrabold text-white">
								{selectedLoans.length} Selected
							</span>
						</div>
						<button
							type="button"
							onClick={handleClearSelection}
							className="text-[11px] font-bold text-slate-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
						>
							Deselect
						</button>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								setBatchRejectReason('');
								setIsBatchRejectModalOpen(true);
							}}
							disabled={isBatchSubmitting}
							className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">cancel</span>
							<span>Reject ({selectedLoans.length})</span>
						</button>
						<button
							type="button"
							onClick={() => setIsBatchConfirmApproveOpen(true)}
							disabled={isBatchSubmitting}
							className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">check_circle</span>
							<span>Approve ({selectedLoans.length})</span>
						</button>
					</div>
				</div>
			)}

			{/* Batch Approval Confirmation Modal */}
			{isBatchConfirmApproveOpen && selectedLoans.length > 0 && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[22px]">check_circle</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Approve {selectedLoans.length} Selected {selectedLoans.length === 1 ? 'Loan' : 'Loans'}
								</h3>
								<p className="text-xs text-slate-500">
									Total Amount: <span className="font-bold text-slate-800">{formatCurrency(selectedTotalAmount)}</span>
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							You are about to authorize the following joint loan applications. This will advance each loan in the multi-stage authorization workflow.
						</p>

						{/* List of selected loans */}
						<div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-slate-50/50 p-2 text-xs">
							{selectedLoans.map((loan, idx) => {
								const client = loan.client_account_name || loan.borrower?.name || 'Borrower';
								const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
								const amt = loan.loan_amount || loan.amount || 0;
								const meta = getLoanApprovalMeta(loan);
								const stageLabel = meta.canApproveAdmin
									? 'Admin Final Approval'
									: meta.canApproveSecondary
										? 'Secondary Partner Verification'
										: 'Approval';
								return (
									<div key={loan.id || loan.db_id || idx} className="py-2 px-2 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="font-bold text-slate-800 truncate">{client}</div>
											<div className="text-[10px] text-slate-500 font-mono">{loanId} • {stageLabel}</div>
										</div>
										<div className="font-extrabold text-slate-900 shrink-0">
											{formatCurrency(amt)}
										</div>
									</div>
								);
							})}
						</div>

						<div className="flex items-center justify-end gap-2.5">
							<button
								type="button"
								onClick={() => setIsBatchConfirmApproveOpen(false)}
								disabled={isBatchSubmitting}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleBatchApprove}
								disabled={isBatchSubmitting}
								className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
							>
								{isBatchSubmitting && (
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
								)}
								<span>{isBatchSubmitting ? 'Approving...' : `Confirm & Approve (${selectedLoans.length})`}</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Batch Rejection Modal */}
			{isBatchRejectModalOpen && selectedLoans.length > 0 && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[22px]">cancel</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Reject {selectedLoans.length} Selected {selectedLoans.length === 1 ? 'Loan' : 'Loans'}
								</h3>
								<p className="text-xs text-slate-500">
									Total Amount: <span className="font-bold text-slate-800">{formatCurrency(selectedTotalAmount)}</span>
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							Please enter the reason for rejecting these {selectedLoans.length} loan applications. The reason will be recorded in the facility audit trail for each loan.
						</p>

						{/* List of selected loans */}
						<div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-slate-50/50 p-2 text-xs">
							{selectedLoans.map((loan, idx) => {
								const client = loan.client_account_name || loan.borrower?.name || 'Borrower';
								const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
								const amt = loan.loan_amount || loan.amount || 0;
								return (
									<div key={loan.id || loan.db_id || idx} className="py-1.5 px-2 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<span className="font-bold text-slate-800 truncate">{client}</span>
											<span className="text-[10px] text-slate-500 font-mono ml-2">({loanId})</span>
										</div>
										<span className="font-bold text-slate-900 shrink-0">
											{formatCurrency(amt)}
										</span>
									</div>
								);
							})}
						</div>

						<div>
							<label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
								Rejection Reason
							</label>
							<textarea
								rows={3}
								value={batchRejectReason}
								onChange={(e) => setBatchRejectReason(e.target.value)}
								placeholder="e.g. Terms not accepted during verification, partner credit declined, documentation discrepancy..."
								className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:bg-white placeholder:text-slate-400"
							/>
						</div>

						<div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
							<button
								type="button"
								onClick={() => {
									setIsBatchRejectModalOpen(false);
									setBatchRejectReason('');
								}}
								disabled={isBatchSubmitting}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleBatchReject}
								disabled={isBatchSubmitting}
								className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
							>
								{isBatchSubmitting && (
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
								)}
								<span>{isBatchSubmitting ? 'Rejecting...' : `Confirm Rejection (${selectedLoans.length})`}</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Floating Batch Action Pill for Payout Pending Tab */}
			{activeTab === 'payout-pending' && selectedPayoutDues.length > 0 && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[calc(100%-2rem)] sm:w-auto bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
							<span className="text-xs sm:text-sm font-extrabold text-white">
								{selectedPayoutDues.length} {selectedPayoutDues.length === 1 ? 'Due' : 'Dues'} Selected
							</span>
							<span className="text-xs text-blue-200 font-mono font-bold">
								• {formatCurrency(selectedPayoutTotalAmount)}
							</span>
						</div>
						<button
							type="button"
							onClick={() => setSelectedPayoutItemKeys([])}
							className="text-[11px] font-bold text-slate-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
						>
							Deselect
						</button>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								setBatchPayoutRejectReason('');
								setIsBatchPayoutRejectOpen(true);
							}}
							disabled={isBatchPayoutSubmitting}
							className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">cancel</span>
							<span>Reject ({selectedPayoutDues.length})</span>
						</button>
						<button
							type="button"
							onClick={() => setIsBatchPayoutApproveOpen(true)}
							disabled={isBatchPayoutSubmitting}
							className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
						>
							<span className="material-symbols-outlined text-[16px]">check_circle</span>
							<span>Approve ({selectedPayoutDues.length})</span>
						</button>
					</div>
				</div>
			)}

			{/* Batch Payout Approval Confirmation Modal */}
			{isBatchPayoutApproveOpen && selectedPayoutDues.length > 0 && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[22px]">check_circle</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Approve {selectedPayoutDues.length} Selected Payout {selectedPayoutDues.length === 1 ? 'Due' : 'Dues'}
								</h3>
								<p className="text-xs text-slate-500">
									Total Remittance: <span className="font-bold text-slate-800">{formatCurrency(selectedPayoutTotalAmount)}</span>
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							This confirms payment receipt and synchronizes secondary partner settlements.
						</p>

						{/* List of selected payout dues */}
						<div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-slate-50/50 p-2 text-xs">
							{selectedPayoutDues.map(({ loan, item, key }) => {
								const client = loan.client_account_name || loan.borrower?.name || 'Borrower';
								const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
								const secAmt = getPayoutItemSecondaryAmount(item, loan);
								const payoutDate = payoutDateOverrides[key] || item.payoutDate || '-';
								return (
									<div key={key} className="py-2 px-2 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="font-bold text-slate-800 truncate">{client}</div>
											<div className="text-[10px] text-slate-500 font-mono">
												{loanId} • EMI #{item.sNo} • Payout: <span className="font-semibold text-slate-700">{payoutDate}</span>
											</div>
										</div>
										<div className="font-extrabold text-slate-900 shrink-0 font-mono">
											{formatCurrency(secAmt)}
										</div>
									</div>
								);
							})}
						</div>

						<div className="flex items-center justify-end gap-2.5">
							<button
								type="button"
								onClick={() => setIsBatchPayoutApproveOpen(false)}
								disabled={isBatchPayoutSubmitting}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleBatchPayoutApprove}
								disabled={isBatchPayoutSubmitting}
								className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
							>
								{isBatchPayoutSubmitting && (
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
								)}
								<span>{isBatchPayoutSubmitting ? 'Approving...' : `Confirm & Approve (${selectedPayoutDues.length})`}</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Batch Payout Rejection / Discrepancy Modal */}
			{isBatchPayoutRejectOpen && selectedPayoutDues.length > 0 && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm font-sans animate-in fade-in duration-150">
					<div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
								<span className="material-symbols-outlined text-[22px]">cancel</span>
							</div>
							<div>
								<h3 className="text-base font-extrabold text-slate-900">
									Reject / Flag Discrepancy ({selectedPayoutDues.length} {selectedPayoutDues.length === 1 ? 'Due' : 'Dues'})
								</h3>
								<p className="text-xs text-slate-500">
									Total Remittance: <span className="font-bold text-slate-800">{formatCurrency(selectedPayoutTotalAmount)}</span>
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600">
							Please enter the discrepancy reason for rejecting the payout date on these {selectedPayoutDues.length} dues. The reason will be recorded and flagged in the facility schedule.
						</p>

						{/* List of selected payout dues */}
						<div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-slate-50/50 p-2 text-xs">
							{selectedPayoutDues.map(({ loan, item, key }) => {
								const client = loan.client_account_name || loan.borrower?.name || 'Borrower';
								const loanId = loan.loan_ref_id || loan.id || `JL-${loan.db_id}`;
								const secAmt = getPayoutItemSecondaryAmount(item, loan);
								const payoutDate = payoutDateOverrides[key] || item.payoutDate || '-';
								return (
									<div key={key} className="py-1.5 px-2 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<span className="font-bold text-slate-800 truncate">{client}</span>
											<span className="text-[10px] text-slate-500 font-mono ml-2">({loanId} • #{item.sNo} • {payoutDate})</span>
										</div>
										<span className="font-bold text-slate-900 shrink-0 font-mono">
											{formatCurrency(secAmt)}
										</span>
									</div>
								);
							})}
						</div>

						<div>
							<label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
								Discrepancy / Rejection Reason
							</label>
							<textarea
								rows={3}
								value={batchPayoutRejectReason}
								onChange={(e) => setBatchPayoutRejectReason(e.target.value)}
								placeholder="e.g. Payment not received in bank, date discrepancy, incorrect deduction..."
								className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:bg-white placeholder:text-slate-400"
							/>
						</div>

						<div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
							<button
								type="button"
								onClick={() => {
									setIsBatchPayoutRejectOpen(false);
									setBatchPayoutRejectReason('');
								}}
								disabled={isBatchPayoutSubmitting}
								className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleBatchPayoutReject}
								disabled={isBatchPayoutSubmitting}
								className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
							>
								{isBatchPayoutSubmitting && (
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
								)}
								<span>{isBatchPayoutSubmitting ? 'Rejecting...' : `Confirm Discrepancy (${selectedPayoutDues.length})`}</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
