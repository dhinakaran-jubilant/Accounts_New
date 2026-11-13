/*
Project: LoanDesk
Description: Windows Desktop Notification utility using HTML5 Web Notifications API.
Sends native toast alerts to the Windows Notification Panel for loan approvals and payout approvals.
*/

// Check if browser supports Web Notifications
export const isNotificationSupported = () => {
	return typeof window !== 'undefined' && 'Notification' in window;
};

// Request Notification Permission
export const requestDesktopNotificationPermission = async () => {
	if (!isNotificationSupported()) return 'unsupported';
	if (Notification.permission === 'granted') return 'granted';
	if (Notification.permission === 'denied') return 'denied';

	try {
		const permission = await Notification.requestPermission();
		return permission;
	} catch (err) {
		console.warn('Failed to request desktop notification permission:', err);
		return 'default';
	}
};

// Check if notifications are granted
export const isNotificationPermissionGranted = () => {
	return isNotificationSupported() && Notification.permission === 'granted';
};

// Session storage tracker to prevent duplicate notifications for the same event
const getNotifiedSet = () => {
	try {
		const raw = sessionStorage.getItem('loanDesk_windows_notified_keys');
		if (raw) {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr)) return new Set(arr);
		}
	} catch (e) {}
	return new Set();
};

export const markKeyAsNotified = (key) => {
	if (!key) return;
	try {
		const set = getNotifiedSet();
		set.add(String(key));
		sessionStorage.setItem(
			'loanDesk_windows_notified_keys',
			JSON.stringify(Array.from(set).slice(-300))
		);
	} catch (e) {}
};

export const hasBeenNotified = (key) => {
	if (!key) return false;
	const set = getNotifiedSet();
	return set.has(String(key));
};

// Core function to trigger a Windows Desktop Notification
export const showWindowsDesktopNotification = ({
	title,
	body,
	icon = '/favicon.ico',
	tag,
	loanId,
	onClick,
}) => {
	if (!isNotificationSupported() || Notification.permission !== 'granted') {
		return null;
	}

	try {
		const notif = new Notification(title, {
			body,
			icon,
			badge: icon,
			tag: tag || `loandesk-${Date.now()}`,
			renotify: false,
			silent: false,
		});

		notif.onclick = (e) => {
			e.preventDefault();
			try {
				window.focus();
			} catch (_) {}

			if (typeof onClick === 'function') {
				onClick();
			} else if (loanId) {
				const targetPath = `/joint-loan/${encodeURIComponent(loanId)}`;
				if (window.location.pathname !== targetPath) {
					window.history.pushState({}, '', targetPath);
					window.dispatchEvent(new PopStateEvent('popstate'));
				}
				window.dispatchEvent(new CustomEvent('loanDesk_open_loan', { detail: { loanId } }));
			}
			notif.close();
		};

		return notif;
	} catch (err) {
		console.warn('Could not display Windows Desktop Notification:', err);
		return null;
	}
};

/**
 * Display Windows Notification for New Loan Approval Request
 */
export const notifyNewLoanApproval = (loan, targetRoleName = 'Secondary Manager') => {
	if (!loan) return null;
	const loanId = loan.loan_ref_id || loan.id || 'N/A';
	const status = loan.approval_status || loan.approvalStatus || 'PENDING';
	const notifKey = `loan_approval_${loanId}_${status}`;

	if (hasBeenNotified(notifKey)) return null;

	const clientName = loan.client_account_name || loan.primaryBorrower?.name || loan.clientName || 'Joint Loan';
	const amount = loan.loan_amount || loan.amount || loan.sanctioned_amount;
	const formattedAmt = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';

	const isPendingAdmin = status === 'PENDING_ADMIN' || status === 'VERIFIED';
	const title = isPendingAdmin
		? '🏛️ Loan Final Authorization Needed'
		: '📋 New Loan Approval Request';

	const body = isPendingAdmin
		? `Loan ${loanId} (${clientName}) ${formattedAmt ? `for ${formattedAmt}` : ''} verified by Sec. Manager. Awaiting your Admin authorization.`
		: `New Joint Loan ${loanId} (${clientName}) ${formattedAmt ? `for ${formattedAmt}` : ''} created. Approval request pending for ${targetRoleName}.`;

	const notif = showWindowsDesktopNotification({
		title,
		body,
		tag: `loan-approval-${loanId}`,
		loanId,
	});

	if (notif) {
		markKeyAsNotified(notifKey);
	}
	return notif;
};

/**
 * Display Windows Notification for Payout Date Approval Request
 */
export const notifyPayoutDateApproval = ({
	loan,
	loanId,
	sNo,
	payoutDate,
	amount,
	targetRole = 'Secondary Manager',
	clientName,
}) => {
	const refId = loanId || loan?.loan_ref_id || loan?.id || 'N/A';
	const notifKey = `payout_approval_${refId}_${sNo}_${payoutDate}`;

	if (hasBeenNotified(notifKey)) return null;

	const client = clientName || loan?.client_account_name || loan?.primaryBorrower?.name || 'Joint Loan';
	const formattedAmt = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';

	const title = '💰 Payout Date Approval Required';
	const body = `Loan ${refId} (${client}) - EMI #${sNo} ${formattedAmt ? `(${formattedAmt}) ` : ''}payout date "${payoutDate}" requires ${targetRole} approval.`;

	const notif = showWindowsDesktopNotification({
		title,
		body,
		tag: `payout-approval-${refId}-${sNo}`,
		loanId: refId,
	});

	if (notif) {
		markKeyAsNotified(notifKey);
	}
	return notif;
};

