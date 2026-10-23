/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Centralized HTTP API client managing network requests, endpoints, and backend communication.
*/

/**
 * Frontend API client communicating with backend.
 * In development, Vite proxies requests to the backend server.
 * In production, requests use VITE_API_URL if configured or default to relative '/api'.
 */
const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

async function request(endpoint, options = {}) {
	const url = `${API_BASE_URL}${endpoint}`;
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...(options.headers || {}),
	};

	try {
		const res = await fetch(url, {
			...options,
			headers,
		});

		if (!res.ok) {
			const errBody = await res.json().catch(() => ({}));
			throw new Error(errBody.error || `Request failed with status ${res.status}`);
		}

		return await res.json();
	} catch (err) {
		console.warn(`[API] ${options.method || 'GET'} ${endpoint} failed:`, err.message);
		throw err;
	}
}

export const api = {
	// Authentication
	login: (credentials) =>
		request('/login', {
			method: 'POST',
			body: JSON.stringify(credentials),
		}),
	initialSetup: (setupData) =>
		request('/initial-setup', {
			method: 'POST',
			body: JSON.stringify(setupData),
		}),
	forgotPasswordGetQuestion: (employeeCode) =>
		request('/forgot-password/get-question', {
			method: 'POST',
			body: JSON.stringify({ employee_code: employeeCode }),
		}),
	forgotPasswordVerify: (data) =>
		request('/forgot-password/verify', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	forgotPasswordReset: (data) =>
		request('/forgot-password/reset-password', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	// Health
	getHealth: () => request('/health'),

	// Dashboard
	getMetrics: () => request('/dashboard/metrics'),
	getPipeline: () => request('/dashboard/pipeline'),

	// Joint Loans
	getJointLoans: () => request('/joint-loans'),
	getJointLoan: (id) => request(`/joint-loans/${id}`),
	checkLoanIdExists: (loanId, clientName, loanDate) => {
		const params = new URLSearchParams();
		if (loanId) params.append('loan_id', loanId);
		if (clientName) params.append('client_name', clientName);
		if (loanDate) params.append('loan_date', loanDate);
		return request(`/joint-loans/check-id?${params.toString()}`);
	},
	createJointLoan: (loan) =>
		request('/joint-loans', {
			method: 'POST',
			body: JSON.stringify(loan),
		}),
	updateJointLoan: (id, loan) =>
		request(`/joint-loans/${id}`, {
			method: 'PUT',
			body: JSON.stringify(loan),
		}),
	deleteJointLoan: (id, payload = null) =>
		request(`/joint-loans/${id}`, {
			method: 'DELETE',
			...(payload ? { body: JSON.stringify(payload) } : {}),
		}),

	// Joint Loan Splits & Schedule Overrides
	getLoanSplits: (loanId) => request(`/joint-loans/${loanId}/splits`),
	saveLoanSplit: (loanId, splitData) =>
		request(`/joint-loans/${loanId}/splits`, {
			method: 'POST',
			body: JSON.stringify(splitData),
		}),
	revertLoanSplit: (loanId, sNo) =>
		request(`/joint-loans/${loanId}/splits/${sNo}`, {
			method: 'DELETE',
		}),
	saveScheduleOverride: (loanId, overrideData) =>
		request(`/joint-loans/${loanId}/overrides`, {
			method: 'POST',
			body: JSON.stringify(overrideData),
		}),
	addLoanHistory: (loanId, entry) =>
		request(`/joint-loans/${loanId}/history`, {
			method: 'POST',
			body: JSON.stringify({ entry }),
		}),
	approveJointLoanSecondary: (loanId, payload) =>
		request(`/joint-loans/${loanId}/approve-secondary`, {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	approveJointLoanAdmin: (loanId, payload) =>
		request(`/joint-loans/${loanId}/approve-admin`, {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	rejectJointLoan: (loanId, payload) =>
		request(`/joint-loans/${loanId}/reject`, {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	approvePayoutDate: (loanId, sNo, payload) =>
		request(`/joint-loans/${loanId}/schedule/${sNo}/payout-approval`, {
			method: 'POST',
			body: JSON.stringify({ action: 'APPROVE', ...(payload || {}) }),
		}),
	rejectPayoutDate: (loanId, sNo, payload) =>
		request(`/joint-loans/${loanId}/schedule/${sNo}/payout-approval`, {
			method: 'POST',
			body: JSON.stringify({ action: 'REJECT', ...(payload || {}) }),
		}),
	getNotifications: (user) =>
		request(`/notifications${user ? `?user=${encodeURIComponent(user)}` : ''}`),
	markNotificationRead: (id) =>
		request(`/notifications/${id}/read`, {
			method: 'POST',
		}),

	// Sync & SFTP
	syncData: async () => {
		let syncRes = {};
		try {
			syncRes = await request('/sync', { method: 'POST' });
		} catch (err) {
			console.warn('[API] /sync failed:', err);
		}
		// Also invoke SFTP sync-now to pull latest DayBook from SFTP server
		try {
			const sftpRes = await request('/sftp/sync-now', { method: 'POST' });
			const cfg = await request('/sftp/config');
			return {
				...syncRes,
				last_sync_time: cfg?.last_sync_time || syncRes?.last_sync_time,
				last_sync_status: cfg?.last_sync_status || syncRes?.last_sync_status,
				sftp_result: sftpRes,
			};
		} catch (sftpErr) {
			console.warn('[API] SFTP sync-now warning:', sftpErr);
		}
		// If last_sync_time is not in syncRes, attempt fallback to sftp config
		if (!syncRes?.last_sync_time) {
			try {
				const cfg = await request('/sftp/config');
				if (cfg?.last_sync_time) {
					return { ...syncRes, last_sync_time: cfg.last_sync_time, last_sync_status: cfg.last_sync_status };
				}
			} catch (e) {}
		}
		return syncRes;
	},
	getSyncStatus: async () => {
		try {
			const res = await request('/sync');
			if (res && res.last_sync_time) return res;
		} catch (e) {
			// Fallback if GET /sync is not allowed on running backend instance
		}
		try {
			const sftp = await request('/sftp/config');
			return {
				last_sync_time: sftp?.last_sync_time || null,
				last_sync_status: sftp?.last_sync_status || null,
			};
		} catch (e) {
			return { last_sync_time: null };
		}
	},
	getSftpConfig: () => request('/sftp/config'),
	syncSftpNow: () => request('/sftp/sync-now', { method: 'POST' }),

	// Account Names from DB
	getAccountNames: () => request('/account-names'),
	createAccountName: (data) =>
		request('/account-names', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	updateAccountName: (id, data) =>
		request(`/account-names/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
	deleteAccountName: (id) =>
		request(`/account-names/${id}`, {
			method: 'DELETE',
		}),

	// Users Management
	getUsers: () => request('/users'),
	createUser: (data) =>
		request('/users', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	updateUser: (id, data) =>
		request(`/users/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
	deleteUser: (id) =>
		request(`/users/${id}`, {
			method: 'DELETE',
		}),

	// PDF Upload & Parsing
	uploadPdf: async (file) => {
		const url = `${API_BASE_URL}/upload-pdf`;
		const formData = new FormData();
		formData.append('file', file);
		try {
			const res = await fetch(url, { method: 'POST', body: formData });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
			return json;
		} catch (err) {
			console.warn('[API] POST /upload-pdf failed:', err.message);
			throw err;
		}
	},

	// PDF Upload + Store to DB (with secondary accounts, employee_code, super admin status)
	uploadPdfAndStore: async (file, remainingAccounts, loanRefId, employeeCode, isSuperAdmin, role, userName) => {
		const url = `${API_BASE_URL}/upload-pdf`;
		const formData = new FormData();
		formData.append('file', file);
		formData.append('remaining_accounts', JSON.stringify(remainingAccounts));
		if (loanRefId) formData.append('loan_ref_id', loanRefId);
		if (employeeCode) formData.append('employee_code', employeeCode);
		if (isSuperAdmin !== undefined && isSuperAdmin !== null) {
			formData.append('is_super_admin', isSuperAdmin ? 'true' : 'false');
		}
		if (role) formData.append('role', role);
		if (userName) formData.append('user_name', userName);
		try {
			const res = await fetch(url, { method: 'POST', body: formData });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
			return json;
		} catch (err) {
			console.warn('[API] POST /upload-pdf (store) failed:', err.message);
			throw err;
		}
	},
	// Matchup Reconciliation (File 1 vs File 2 Comparison)
	compareMatchup: async (formData) => {
		const url = `${API_BASE_URL}/matchup/compare`;
		try {
			const res = await fetch(url, { method: 'POST', body: formData });
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody.error || `Comparison failed (${res.status})`);
			}
			const summaryHeader = res.headers.get('X-Matchup-Summary');
			let summary = null;
			if (summaryHeader) {
				try {
					summary = JSON.parse(summaryHeader);
				} catch (e) {
					console.warn('Could not parse X-Matchup-Summary header:', e);
				}
			}
			const totalEntries = res.headers.get('X-Total-Entries');
			const swCat = res.headers.get('X-SW-Categorized');
			const remaining = res.headers.get('X-Remaining');
			if (!summary && totalEntries !== null) {
				const tot = Number(totalEntries) || 0;
				const matched = Number(swCat) || 0;
				const rem = Number(remaining) || 0;
				summary = {
					total_entries: tot,
					sw_categorized: matched,
					remaining: rem,
					file1_rows: tot,
					matched_count: matched,
					only_file1_count: rem,
					match_rate: tot > 0 ? Math.round((matched / tot) * 100) : 0,
					match_key_used: 'Auto-Classification (Cheque / RTGS / SWEEP)'
				};
			}
			const blob = await res.blob();
			return { blob, summary };
		} catch (err) {
			console.warn('[API] POST /matchup/compare failed:', err.message);
			throw err;
		}
	},

	previewMatchup: async (formData) => {
		const url = `${API_BASE_URL}/matchup/preview`;
		try {
			const res = await fetch(url, { method: 'POST', body: formData });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.error || `Preview failed (${res.status})`);
			return json;
		} catch (err) {
			console.warn('[API] POST /matchup/preview failed:', err.message);
			throw err;
		}
	},

	// SFTP Auto-Sync & DayBook Management
	getSftpConfig: () => request('/sftp/config'),
	saveSftpConfig: (config) =>
		request('/sftp/config', {
			method: 'POST',
			body: JSON.stringify(config),
		}),
	testSftpConnection: (config) =>
		request('/sftp/test', {
			method: 'POST',
			body: JSON.stringify(config),
		}),
	syncSftpNow: () =>
		request('/sftp/sync-now', {
			method: 'POST',
		}),
};

export default api;
