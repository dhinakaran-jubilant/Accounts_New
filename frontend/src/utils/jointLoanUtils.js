/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Joint loan analytics, date parsers, currency formatters, and calculation utilities.
Operates strictly on live database loan records.
*/

// Helper to format number into Indian currency representation (e.g. ₹45,10,000)
export function formatIndianCurrency(num) {
	if (num === null || num === undefined || isNaN(num)) return '₹0';
	const absVal = Math.abs(Number(num));
	const isNegative = Number(num) < 0;
	const parts = Math.round(absVal).toString();
	let lastThree = parts.substring(parts.length - 3);
	const otherNumbers = parts.substring(0, parts.length - 3);
	if (otherNumbers !== '') {
		lastThree = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
	}
	return `${isNegative ? '-' : ''}₹${lastThree}`;
}

// Compact currency (e.g. ₹3.36 Cr, ₹45.1 L)
export function formatCompactCurrency(num) {
	if (num === null || num === undefined || isNaN(num)) return '₹0';
	const val = Number(num);
	if (val >= 10000000) {
		return `₹${(val / 10000000).toFixed(2)} Cr`;
	}
	if (val >= 100000) {
		return `₹${(val / 100000).toFixed(1)} L`;
	}
	return formatIndianCurrency(val);
}

// Merge real loans from backend (strictly live DB data)
export function mergeJointLoans(remoteLoans = []) {
	if (!Array.isArray(remoteLoans)) {
		return [];
	}
	return remoteLoans;
}

// Clean and normalize account string
export function cleanAccountKey(s) {
	return String(s || '').trim().toUpperCase().replace(/[\s._-]+/g, '');
}

// Resolve any raw account string (acronym or name or variations) to its canonical DB account entity
export function resolveCanonicalAccount(rawString, rawAccounts = []) {
	if (!rawString) return null;
	const clean = cleanAccountKey(rawString);
	if (!clean) return null;

	if (Array.isArray(rawAccounts)) {
		// 1. Exact match on clean name or clean acronym
		for (const acc of rawAccounts) {
			const nameClean = cleanAccountKey(acc.name);
			const acrClean = cleanAccountKey(acc.acronym);
			if (clean === nameClean || clean === acrClean) {
				return acc;
			}
		}
		// 2. Substring fallback only if clean is sufficiently long (>= 4 chars) to avoid 2-letter acronym collisions
		if (clean.length >= 4) {
			for (const acc of rawAccounts) {
				const nameClean = cleanAccountKey(acc.name);
				if (nameClean && (nameClean.includes(clean) || clean.includes(nameClean))) {
					return acc;
				}
			}
		}
	}
	return null;
}

// Helper to get all aliases (names, acronyms) for a given account key
export function getAccountAliases(accountKey, rawAccounts = []) {
	if (!accountKey || accountKey === 'ALL') return [];
	const clean = cleanAccountKey(accountKey);
	const aliases = new Set([clean]);

	const canonical = resolveCanonicalAccount(accountKey, rawAccounts);
	if (canonical) {
		const nameClean = cleanAccountKey(canonical.name);
		const acrClean = cleanAccountKey(canonical.acronym);
		if (nameClean) aliases.add(nameClean);
		if (acrClean) aliases.add(acrClean);
	}

	return Array.from(aliases);
}

// Helper to determine if a loan matches an account (as primary or secondary)
export function doesLoanMatchAccount(loan, accountKey, rawAccounts = []) {
	if (!loan) return false;
	if (!accountKey || accountKey === 'ALL') return true;

	const aliases = getAccountAliases(accountKey, rawAccounts);
	if (aliases.length === 0) return true;

	const matchesAlias = (str) => {
		if (!str) return false;
		return aliases.some((a) => {
			if (str === a) return true;
			if (a.length >= 4 && str.length >= 4 && (str.includes(a) || a.includes(str))) return true;
			return false;
		});
	};

	// Check primary account
	const priName = cleanAccountKey(loan.primaryAccountName || loan.primary_account_name);
	const priTag = cleanAccountKey(loan.primary || loan.primary_account_tag);
	if (matchesAlias(priName) || matchesAlias(priTag)) {
		return true;
	}

	// Check secondary accounts
	const secList = loan.remaining_accounts || loan.secondaryAccounts || loan.accountDetails || [];
	if (Array.isArray(secList)) {
		for (const s of secList) {
			const sName = cleanAccountKey(s.account_name || s.accountName);
			const sTag = cleanAccountKey(s.accountTag || s.tag);
			if (matchesAlias(sName) || matchesAlias(sTag)) {
				return true;
			}
		}
	}

	// Check secondary_account_name
	const secDirect = cleanAccountKey(loan.secondary_account_name || loan.secondaryAccountName);
	if (matchesAlias(secDirect)) {
		return true;
	}

	return false;
}

// Helper to determine if a loan matches an account strictly as the PRIMARY account
export function doesLoanMatchPrimaryAccount(loan, accountKey, rawAccounts = []) {
	if (!loan) return false;
	if (!accountKey || accountKey === 'ALL') return true;

	const aliases = getAccountAliases(accountKey, rawAccounts);
	if (aliases.length === 0) return true;

	const matchesAlias = (str) => {
		if (!str) return false;
		return aliases.some((a) => {
			if (str === a) return true;
			if (a.length >= 4 && str.length >= 4 && (str.includes(a) || a.includes(str))) return true;
			return false;
		});
	};

	// 1. Direct primary account fields
	const priName = cleanAccountKey(loan.primaryAccountName || loan.primary_account_name);
	const priTag = cleanAccountKey(loan.primary || loan.primary_account_tag || loan.leadAccount);
	if (matchesAlias(priName) || matchesAlias(priTag)) {
		return true;
	}

	// 2. Loan accountDetails where isPrimary is true
	if (Array.isArray(loan.accountDetails)) {
		const pri = loan.accountDetails.find((a) => a && a.isPrimary);
		if (pri) {
			const pName = cleanAccountKey(pri.accountName);
			const pTag = cleanAccountKey(pri.accountTag);
			if (matchesAlias(pName) || matchesAlias(pTag)) {
				return true;
			}
		}
	}

	return false;
}

// Helper to determine if a loan's primary account matches any key in userPrimaryKeys
export function doesLoanMatchUserPrimary(loan, userPrimaryKeys = [], rawAccounts = []) {
	if (!loan) return false;
	if (!Array.isArray(userPrimaryKeys) || userPrimaryKeys.length === 0) return false;
	return userPrimaryKeys.some((key) => doesLoanMatchPrimaryAccount(loan, key, rawAccounts));
}

// Helper to determine if a loan matches an account strictly as a SECONDARY account
export function doesLoanMatchSecondaryAccount(loan, accountKey = 'ALL', rawAccounts = []) {
	if (!loan) return false;

	const secList = loan.remaining_accounts || loan.secondaryAccounts || [];
	const hasSecInDetails = Array.isArray(loan.accountDetails) && loan.accountDetails.some((a) => a && !a.isPrimary);
	const hasAnySec =
		(Array.isArray(secList) && secList.length > 0) ||
		hasSecInDetails ||
		Boolean(loan.secondary_account_name || loan.secondaryAccountName);

	if (!accountKey || accountKey === 'ALL') {
		return hasAnySec;
	}

	const aliases = getAccountAliases(accountKey, rawAccounts);
	if (aliases.length === 0) return false;

	const matchesAlias = (str) => {
		if (!str) return false;
		return aliases.some((a) => {
			if (str === a) return true;
			if (a.length >= 4 && str.length >= 4 && (str.includes(a) || a.includes(str))) return true;
			return false;
		});
	};

	// 1. Check remaining_accounts
	if (Array.isArray(loan.remaining_accounts)) {
		for (const ra of loan.remaining_accounts) {
			const raName = cleanAccountKey(ra.account_name || ra.name);
			if (matchesAlias(raName)) return true;
		}
	}

	// 2. Check secondaryAccounts
	if (Array.isArray(loan.secondaryAccounts)) {
		for (const sa of loan.secondaryAccounts) {
			const saName = cleanAccountKey(sa.accountName || sa.account_name || sa.name);
			const saTag = cleanAccountKey(sa.accountTag || sa.tag);
			if (matchesAlias(saName) || matchesAlias(saTag)) return true;
		}
	}

	// 3. Check accountDetails where !isPrimary
	if (Array.isArray(loan.accountDetails)) {
		for (const ad of loan.accountDetails) {
			if (ad && !ad.isPrimary) {
				const adName = cleanAccountKey(ad.accountName || ad.account_name);
				const adTag = cleanAccountKey(ad.accountTag || ad.tag);
				if (matchesAlias(adName) || matchesAlias(adTag)) return true;
			}
		}
	}

	// 4. Direct fields
	const secDirect = cleanAccountKey(
		loan.secondary_account_name || loan.secondaryAccountName || loan.secAccountName
	);
	if (matchesAlias(secDirect)) return true;

	return false;
}

// Helper to determine if a loan matches any secondary account in userSecondaryKeys
export function doesLoanMatchUserSecondary(loan, userSecondaryKeys = [], rawAccounts = []) {
	if (!loan) return false;
	if (!Array.isArray(userSecondaryKeys) || userSecondaryKeys.length === 0) return false;
	return userSecondaryKeys.some((k) => doesLoanMatchSecondaryAccount(loan, k, rawAccounts));
}

// Extract secondary share and principal amount for a loan
export function getSecondaryAccountShareForLoan(loan, targetAccountKey = 'ALL', rawAccounts = []) {
	if (!loan) return { sharePct: 0, principalAmount: 0 };
	const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;
	const pShare = Number(loan.primaryShare ?? loan.primary_account_share ?? 70);
	const totalSecShare = Math.max(0, 100 - pShare);

	if (!targetAccountKey || targetAccountKey === 'ALL') {
		return {
			sharePct: totalSecShare,
			principalAmount: Number(loan.secondary_account_amount) || amt * (totalSecShare / 100),
		};
	}

	const aliases = getAccountAliases(targetAccountKey, rawAccounts);
	const matchesAlias = (str) => {
		if (!str) return false;
		return aliases.some((a) => str === a || (a.length >= 4 && str.length >= 4 && (str.includes(a) || a.includes(str))));
	};

	// 1. Check remaining_accounts
	if (Array.isArray(loan.remaining_accounts)) {
		const found = loan.remaining_accounts.find((ra) => matchesAlias(cleanAccountKey(ra.account_name || ra.name)));
		if (found) {
			const sPct = Number(found.share || found.account_share) || totalSecShare;
			const sAmt = Number(found.amount || found.account_amount) || amt * (sPct / 100);
			return { sharePct: sPct, principalAmount: sAmt };
		}
	}

	// 2. Check secondaryAccounts
	if (Array.isArray(loan.secondaryAccounts)) {
		const found = loan.secondaryAccounts.find((sa) =>
			matchesAlias(cleanAccountKey(sa.accountName || sa.account_name || sa.name)) ||
			matchesAlias(cleanAccountKey(sa.accountTag || sa.tag))
		);
		if (found) {
			const sPct = Number(found.share || found.account_share) || totalSecShare;
			const sAmt = Number(found.amount) || amt * (sPct / 100);
			return { sharePct: sPct, principalAmount: sAmt };
		}
	}

	// 3. Check accountDetails where !isPrimary
	if (Array.isArray(loan.accountDetails)) {
		const found = loan.accountDetails.find((ad) =>
			!ad.isPrimary && (
				matchesAlias(cleanAccountKey(ad.accountName || ad.account_name)) ||
				matchesAlias(cleanAccountKey(ad.accountTag || ad.tag))
			)
		);
		if (found) {
			const sPct = Number(found.share) || totalSecShare;
			const sAmt = Number(found.principal || found.amount) || amt * (sPct / 100);
			return { sharePct: sPct, principalAmount: sAmt };
		}
	}

	return {
		sharePct: totalSecShare,
		principalAmount: Number(loan.secondary_account_amount) || amt * (totalSecShare / 100),
	};
}

// Filter loans by account key or allowed accounts list
export function filterLoansByAccount(loans = [], selectedAccountKey = 'ALL', allowedAccountKeys = [], rawAccounts = []) {
	if (!Array.isArray(loans)) return [];

	if (selectedAccountKey === 'ALL') {
		return loans;
	}

	if (selectedAccountKey === 'ALL_ALLOWED' && Array.isArray(allowedAccountKeys) && allowedAccountKeys.length > 0) {
		return loans.filter((loan) =>
			allowedAccountKeys.some((key) => doesLoanMatchAccount(loan, key, rawAccounts))
		);
	}

	return loans.filter((loan) => doesLoanMatchAccount(loan, selectedAccountKey, rawAccounts));
}

// Robust loan date parser
export function parseLoanDate(dateStr) {
	if (!dateStr) return null;
	if (dateStr instanceof Date) return isNaN(dateStr) ? null : dateStr;
	const s = String(dateStr).trim();

	// Match DD-MM-YYYY or DD/MM/YYYY
	const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
	if (dmyMatch) {
		const day = parseInt(dmyMatch[1], 10);
		const month = parseInt(dmyMatch[2], 10) - 1;
		const year = parseInt(dmyMatch[3], 10);
		return new Date(year, month, day);
	}

	// Match YYYY-MM-DD
	const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
	if (ymdMatch) {
		const year = parseInt(ymdMatch[1], 10);
		const month = parseInt(ymdMatch[2], 10) - 1;
		const day = parseInt(ymdMatch[3], 10);
		return new Date(year, month, day);
	}

	const parsed = new Date(s);
	return isNaN(parsed.getTime()) ? null : parsed;
}

// Calculate loan creation trend over period (Weekly, Monthly, Yearly)
export function getLoanPeriodData(loans = [], periodType = 'month', refDate = new Date()) {
	const now = refDate instanceof Date && !isNaN(refDate) ? refDate : new Date();

	// 1. Weekly: Last 8 Weeks (Sunday to Saturday)
	if (periodType === 'week' || periodType === 'weekly') {
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const currSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay(), 0, 0, 0, 0);

		const weeks = [];
		for (let i = 7; i >= 0; i--) {
			const wStart = new Date(currSunday);
			wStart.setDate(currSunday.getDate() - i * 7);
			wStart.setHours(0, 0, 0, 0);

			const wEnd = new Date(wStart);
			wEnd.setDate(wStart.getDate() + 6);
			wEnd.setHours(23, 59, 59, 999);

			const sDay = wStart.getDate();
			const sMon = monthNames[wStart.getMonth()];
			const eDay = wEnd.getDate();
			const eMon = monthNames[wEnd.getMonth()];

			const label = sMon === eMon ? `${sDay}-${eDay} ${sMon}` : `${sDay} ${sMon}-${eDay} ${eMon}`;
			const fullLabel = `${sDay} ${sMon} - ${eDay} ${eMon} ${wEnd.getFullYear()} (Sun - Sat)`;

			weeks.push({
				key: `w_${wStart.getTime()}`,
				startDate: wStart,
				endDate: wEnd,
				label,
				fullLabel,
				tooltipTitle: fullLabel,
				loanCount: 0,
				totalAmount: 0,
				volume: 0,
				volumeCr: 0,
				volumeLakhs: 0,
			});
		}

		loans.forEach((loan) => {
			const d = parseLoanDate(loan.loan_date || loan.appliedDate || loan.created_at);
			if (!d) return;
			const time = d.getTime();
			const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;

			const match = weeks.find((w) => time >= w.startDate.getTime() && time <= w.endDate.getTime());
			if (match) {
				match.loanCount += 1;
				match.totalAmount += amt;
				match.volume = Number((match.totalAmount / 10000000).toFixed(2));
				match.volumeCr = Number((match.totalAmount / 10000000).toFixed(2));
				match.volumeLakhs = Number((match.totalAmount / 100000).toFixed(2));
			}
		});

		return weeks;
	}

	// 2. Monthly: 12 Calendar Months (All Years Aggregate)
	if (periodType === 'month' || periodType === 'monthly') {
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const monthFullNames = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		];

		const months = monthNames.map((m, idx) => ({
			key: `m_${idx}`,
			label: m,
			fullLabel: `${monthFullNames[idx]} (All Years)`,
			tooltipTitle: `${monthFullNames[idx]} (All Years)`,
			monthIndex: idx,
			loanCount: 0,
			totalAmount: 0,
			volume: 0,
			volumeCr: 0,
			volumeLakhs: 0,
		}));

		loans.forEach((loan) => {
			const d = parseLoanDate(loan.loan_date || loan.appliedDate || loan.created_at);
			if (!d) return;
			const mIdx = d.getMonth();
			const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;

			if (months[mIdx]) {
				months[mIdx].loanCount += 1;
				months[mIdx].totalAmount += amt;
				months[mIdx].volume = Number((months[mIdx].totalAmount / 10000000).toFixed(2));
				months[mIdx].volumeCr = Number((months[mIdx].totalAmount / 10000000).toFixed(2));
				months[mIdx].volumeLakhs = Number((months[mIdx].totalAmount / 100000).toFixed(2));
			}
		});

		return months;
	}

	// 3. Yearly: Last 10 Years
	const currYear = now.getFullYear();
	const startYear = currYear - 9;

	const years = [];
	for (let y = startYear; y <= currYear; y++) {
		years.push({
			key: `y_${y}`,
			label: String(y),
			fullLabel: `Year ${y}`,
			tooltipTitle: `Year ${y}`,
			year: y,
			loanCount: 0,
			totalAmount: 0,
			volume: 0,
			volumeCr: 0,
			volumeLakhs: 0,
		});
	}

	loans.forEach((loan) => {
		const d = parseLoanDate(loan.loan_date || loan.appliedDate || loan.created_at);
		if (!d) return;
		const y = d.getFullYear();
		const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;

		const match = years.find((item) => item.year === y);
		if (match) {
			match.loanCount += 1;
			match.totalAmount += amt;
			match.volume = Number((match.totalAmount / 10000000).toFixed(2));
			match.volumeCr = Number((match.totalAmount / 10000000).toFixed(2));
			match.volumeLakhs = Number((match.totalAmount / 100000).toFixed(2));
		}
	});

	return years;
}

// Calculate loan count & volume distributed across accounts
export function calculateAccountDistribution(loans = [], rawAccounts = []) {
	const map = {};

	loans.forEach((loan) => {
		const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;
		const pShare = Number(loan.primaryShare ?? loan.primary_account_share ?? 70) / 100;
		const priRaw = (loan.primaryAccountName || loan.primary_account_name || loan.primary || 'Primary Account').trim();
		const priCanon = resolveCanonicalAccount(priRaw, rawAccounts);
		const priName = priCanon ? priCanon.name : priRaw;
		const priTag = priCanon ? (priCanon.acronym || priCanon.name) : priRaw;

		// Primary Account
		if (!map[priName]) {
			map[priName] = {
				accountName: priName,
				accountTag: priTag,
				primaryLoansCount: 0,
				secondaryLoansCount: 0,
				totalLoansCount: 0,
				primaryVolume: 0,
				secondaryVolume: 0,
				totalVolume: 0,
			};
		}
		map[priName].primaryLoansCount += 1;
		map[priName].totalLoansCount += 1;
		const priAmt = Number(loan.primary_account_amount) || amt * pShare;
		map[priName].primaryVolume += priAmt;
		map[priName].totalVolume += priAmt;

		// Secondary Accounts
		const secList = loan.remaining_accounts || loan.secondaryAccounts || loan.accountDetails || [];
		if (Array.isArray(secList) && secList.length > 0) {
			secList.forEach((s) => {
				const sRaw = (s.account_name || s.accountName || s.accountTag || 'Secondary Account').trim();
				const secCanon = resolveCanonicalAccount(sRaw, rawAccounts);
				const sName = secCanon ? secCanon.name : sRaw;
				const sTag = secCanon ? (secCanon.acronym || secCanon.name) : sRaw;

				if (!map[sName]) {
					map[sName] = {
						accountName: sName,
						accountTag: sTag,
						primaryLoansCount: 0,
						secondaryLoansCount: 0,
						totalLoansCount: 0,
						primaryVolume: 0,
						secondaryVolume: 0,
						totalVolume: 0,
					};
				}
				map[sName].secondaryLoansCount += 1;
				map[sName].totalLoansCount += 1;
				const sAmt =
					Number(s.amount || s.principal) ||
					amt * (Number(s.share || s.percentage || (100 - pShare * 100) / secList.length) / 100);
				map[sName].secondaryVolume += sAmt;
				map[sName].totalVolume += sAmt;
			});
		} else if (loan.secondary_account_name || loan.secondaryAccountName) {
			const sRaw = (loan.secondary_account_name || loan.secondaryAccountName).trim();
			const secCanon = resolveCanonicalAccount(sRaw, rawAccounts);
			const sName = secCanon ? secCanon.name : sRaw;
			const sTag = secCanon ? (secCanon.acronym || secCanon.name) : sRaw;

			if (!map[sName]) {
				map[sName] = {
					accountName: sName,
					accountTag: sTag,
					primaryLoansCount: 0,
					secondaryLoansCount: 0,
					totalLoansCount: 0,
					primaryVolume: 0,
					secondaryVolume: 0,
					totalVolume: 0,
				};
			}
			map[sName].secondaryLoansCount += 1;
			map[sName].totalLoansCount += 1;
			const sAmt = amt * (1 - pShare);
			map[sName].secondaryVolume += sAmt;
			map[sName].totalVolume += sAmt;
		}
	});

	return Object.values(map).sort((a, b) => b.totalVolume - a.totalVolume);
}

// Calculate status-wise loan count and volume
export function calculateStatusDistribution(loans = []) {
	const counts = {
		Active: { count: 0, amount: 0, color: '#10b981' },
		Overdue: { count: 0, amount: 0, color: '#f43f5e' },
		'Date Overdue': { count: 0, amount: 0, color: '#f97316' },
		Pending: { count: 0, amount: 0, color: '#f59e0b' },
		Closed: { count: 0, amount: 0, color: '#94a3b8' },
	};

	let totalCount = 0;
	let totalAmount = 0;

	loans.forEach((loan) => {
		const rawStatus = (loan.status || 'Active').trim();
		const normStatus =
			rawStatus.toLowerCase() === 'date overdue'
				? 'Date Overdue'
				: rawStatus.toLowerCase() === 'overdue'
				? 'Overdue'
				: rawStatus.toLowerCase() === 'closed'
				? 'Closed'
				: rawStatus.toLowerCase() === 'pending'
				? 'Pending'
				: 'Active';

		const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;
		counts[normStatus].count += 1;
		counts[normStatus].amount += amt;
		totalCount += 1;
		totalAmount += amt;
	});

	return Object.entries(counts).map(([status, item]) => ({
		status,
		count: item.count,
		amount: item.amount,
		percentage: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0,
		color: item.color,
	}));
}

// Helper to verify if a date string is valid and filled (not empty and not '-')
export function isValidDateStr(val) {
	if (!val) return false;
	const s = String(val).trim();
	return s !== '' && s !== '-' && s !== '--' && s !== 'null' && s !== 'undefined' && s !== '—';
}

// Calculate per-account financial breakdown
export function calculatePerAccountFinancials(loans = [], rawAccounts = []) {
	const accountMap = {};

	// Initialize with known DB accounts if provided
	if (Array.isArray(rawAccounts)) {
		rawAccounts.forEach((acc) => {
			const key = acc.name || acc.acronym;
			if (key) {
				accountMap[key] = {
					accountKey: key,
					accountName: acc.name || acc.acronym || key,
					acronym: acc.acronym || '',
					color: acc.color || 'blue',
					totalLoansCount: 0,
					totalPrincipal: 0,
					totalCollected: 0,
					totalBalance: 0,
					activeCount: 0,
					overdueCount: 0,
					pendingCount: 0,
					closedCount: 0,
				};
			}
		});
	}

	loans.forEach((loan) => {
		const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;
		const pShare = Number(loan.primaryShare ?? loan.primary_account_share ?? 70) / 100;
		const status = (loan.status || 'Active').toLowerCase();

		let loanScheduled = 0;
		let loanCollected = 0;
		const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
		if (Array.isArray(schedule) && schedule.length > 0) {
			schedule.forEach((inst) => {
				const iAmt = Number(inst.amount) || 0;
				loanScheduled += iAmt;
				const st = (inst.status || '').toLowerCase().trim();

				let splitData = inst.splits;
				if (typeof splitData === 'string') {
					try {
						splitData = JSON.parse(splitData);
					} catch (e) {
						splitData = null;
					}
				}

				const subA = Array.isArray(inst.subInstallments) ? inst.subInstallments[0] : null;
				const subB = Array.isArray(inst.subInstallments) ? inst.subInstallments[1] : null;
				const subRecdA = subA?.receivedDate || subA?.received_date || subA?.recdDate || subA?.recd_date;
				const subRecdB = subB?.receivedDate || subB?.received_date || subB?.recdDate || subB?.recd_date;
				const hasSubRecdA = isValidDateStr(subRecdA);
				const hasSubRecdB = isValidDateStr(subRecdB);

				const recdMain =
					inst.receivedDate ||
					inst.received_date ||
					inst.recdDate ||
					inst.recd_date ||
					inst.payment_received_date ||
					inst.paymentReceivedDate;
				const hasMainRecdDate = isValidDateStr(recdMain);

				const recdA = splitData?.recdDateA || splitData?.recdDate || splitData?.receivedDate || splitData?.received_date;
				const hasRecdA = isValidDateStr(recdA) || hasSubRecdA;
				const recdB = splitData?.recdDateB || splitData?.receivedDateB;
				const hasRecdB = isValidDateStr(recdB) || hasSubRecdB;
				const isFinalSettled = Boolean(splitData?.isFinalSettled);

				const isStatusCollected =
					st === 'collected' ||
					st === 'settled' ||
					st === 'pending payout approval' ||
					st === 'payout discrepancy';

				const directPaid = Number(inst.paidAmount || inst.paid_amount || 0);
				const splitPaid = Number(splitData?.paidAmount || splitData?.amountA || subA?.amount || 0);
				const paidAmt = directPaid > 0 ? directPaid : splitPaid;

				if (hasMainRecdDate || isStatusCollected || isFinalSettled || (hasRecdA && hasRecdB)) {
					loanCollected += iAmt;
				} else if (hasRecdA || paidAmt > 0 || st === 'partial') {
					loanCollected += paidAmt > 0 ? paidAmt : (iAmt * 0.5);
				}
			});
		}
		if (loanScheduled === 0) {
			loanScheduled = amt;
		}

		// 1. Primary share allocation resolved to canonical DB account
		const priRaw = loan.primaryAccountName || loan.primary_account_name || loan.primary || 'Primary Account';
		const priCanonical = resolveCanonicalAccount(priRaw, rawAccounts);
		const priKey = priCanonical ? priCanonical.name : priRaw.trim();

		if (!accountMap[priKey]) {
			accountMap[priKey] = {
				accountKey: priKey,
				accountName: priCanonical?.name || priKey,
				acronym: priCanonical?.acronym || '',
				color: priCanonical?.color || 'blue',
				totalLoansCount: 0,
				totalPrincipal: 0,
				totalCollected: 0,
				totalBalance: 0,
				activeCount: 0,
				overdueCount: 0,
				pendingCount: 0,
				closedCount: 0,
			};
		}
		const priEntry = accountMap[priKey];
		const priPrincipal = Number(loan.primary_account_amount) || amt * pShare;
		const priCollected = loanCollected * pShare;
		const priScheduled = loanScheduled * pShare;

		priEntry.totalLoansCount += 1;
		priEntry.totalPrincipal += priPrincipal;
		priEntry.totalCollected += priCollected;
		priEntry.totalBalance += Math.max(0, priScheduled - priCollected);

		if (status === 'active') priEntry.activeCount += 1;
		else if (status === 'overdue' || status === 'date overdue') priEntry.overdueCount += 1;
		else if (status === 'pending') priEntry.pendingCount += 1;
		else if (status === 'closed') priEntry.closedCount += 1;

		// 2. Secondary shares allocation resolved to canonical DB account
		const secList = loan.remaining_accounts || loan.secondaryAccounts || loan.accountDetails || [];
		if (Array.isArray(secList) && secList.length > 0) {
			secList.forEach((s) => {
				const sRaw = s.account_name || s.accountName || s.accountTag || 'Secondary Account';
				const secCanonical = resolveCanonicalAccount(sRaw, rawAccounts);
				const secKey = secCanonical ? secCanonical.name : sRaw.trim();

				const sPct = (Number(s.share || s.percentage) || (100 - pShare * 100) / secList.length) / 100;
				const sPrincipal = Number(s.principal || s.amount) || amt * sPct;
				const sCollected = loanCollected * sPct;
				const sScheduled = loanScheduled * sPct;

				if (!accountMap[secKey]) {
					accountMap[secKey] = {
						accountKey: secKey,
						accountName: secCanonical?.name || secKey,
						acronym: secCanonical?.acronym || '',
						color: secCanonical?.color || 'blue',
						totalLoansCount: 0,
						totalPrincipal: 0,
						totalCollected: 0,
						totalBalance: 0,
						activeCount: 0,
						overdueCount: 0,
						pendingCount: 0,
						closedCount: 0,
					};
				}
				const sEntry = accountMap[secKey];
				sEntry.totalLoansCount += 1;
				sEntry.totalPrincipal += sPrincipal;
				sEntry.totalCollected += sCollected;
				sEntry.totalBalance += Math.max(0, sScheduled - sCollected);

				if (status === 'active') sEntry.activeCount += 1;
				else if (status === 'overdue' || status === 'date overdue') sEntry.overdueCount += 1;
				else if (status === 'pending') sEntry.pendingCount += 1;
				else if (status === 'closed') sEntry.closedCount += 1;
			});
		}
	});

	return Object.values(accountMap)
		.filter((a) => a.totalLoansCount > 0 || a.totalPrincipal > 0)
		.map((a) => ({
			...a,
			recoveryRate:
				a.totalCollected + a.totalBalance > 0
					? Math.round((a.totalCollected / (a.totalCollected + a.totalBalance)) * 100)
					: 0,
		}))
		.sort((a, b) => b.totalPrincipal - a.totalPrincipal);
}

// Calculate comprehensive Joint Loan KPIs strictly from live DB data
export function calculateJointLoanMetrics(loans = [], selectedAccountKey = 'ALL', roleFilter = 'primary', rawAccounts = []) {
	let totalVolume = 0;
	let activeVolume = 0;
	let activeCount = 0;
	let overdueCount = 0;
	let overdueAmount = 0;
	let totalCollected = 0;
	let totalScheduled = 0;
	let pendingCount = 0;
	let pendingSecCount = 0;
	let pendingAdminCount = 0;
	let closedCount = 0;
	let primaryCapital = 0;
	let secondaryCapital = 0;

	// Secondary-specific metrics
	let secondaryPrincipal = 0;
	let secondaryCollected = 0;
	let pendingFromPrimary = 0;
	let pendingPayoutCount = 0;
	let secondaryOverdue = 0;
	let secondaryScheduled = 0;
	let secondaryUpcoming = 0;

	// Primary-specific metrics
	let settlementPendingAmount = 0;
	let settlementPendingCount = 0;
	let pendingApprovalAmount = 0;
	let pendingApprovalCount = 0;
	let upcomingAmount = 0;
	let upcomingCount = 0;

	// Breakdown maps
	const primaryPartnersMap = {};
	const secondaryPartnersMap = {};

	loans.forEach((loan) => {
		const amt = Number(loan.amount || loan.loan_amount || loan.loanAmount) || 0;
		totalVolume += amt;

		const status = (loan.status || 'Active').toLowerCase();
		const appStatus = (loan.approval_status || loan.approvalStatus || '').toUpperCase();

		if (status === 'active') {
			activeCount += 1;
			activeVolume += amt;
		} else if (status === 'overdue' || status === 'date overdue') {
			overdueCount += 1;
		} else if (status === 'closed') {
			closedCount += 1;
		} else if (status === 'pending' || appStatus.includes('PENDING') || appStatus === 'VERIFIED') {
			pendingCount += 1;
		}

		if (appStatus === 'VERIFIED' || appStatus === 'PENDING_ADMIN') {
			pendingAdminCount += 1;
		} else if (appStatus === 'PENDING_SECONDARY' || (appStatus === 'PENDING' && !loan.verified_by) || (status === 'pending' && !loan.verified_by)) {
			pendingSecCount += 1;
		}

		const pShare = Number(loan.primaryShare ?? loan.primary_account_share ?? 70) / 100;
		const priAmt = Number(loan.primary_account_amount) || (amt * pShare);
		primaryCapital += priAmt;
		secondaryCapital += amt - priAmt;
		const secTotalSharePct = Math.max(0, 1 - pShare);

		const secInfo = getSecondaryAccountShareForLoan(loan, selectedAccountKey, rawAccounts);
		const secSharePct = secInfo.sharePct / 100;
		const secLoanAmt = secInfo.principalAmount;
		secondaryPrincipal += secLoanAmt;

		const loanId = loan.id || loan.loan_ref_id || `JL-${loan.db_id}`;
		const clientName = loan.client_account_name || 'Borrower';

		const priRaw = (loan.primaryAccountName || loan.primary_account_name || loan.primary || 'Primary Account').trim();
		const priCanon = resolveCanonicalAccount(priRaw, rawAccounts);
		const priName = priCanon ? priCanon.name : priRaw;
		const priTag = priCanon ? (priCanon.acronym || priCanon.name) : (loan.primary || priRaw);

		const schedule = loan.repaymentSchedule || loan.repayment_schedule || [];
		if (Array.isArray(schedule) && schedule.length > 0) {
			let loanHasPendingFromPri = false;
			let loanPendingFromPriAmt = 0;
			let loanPendingFromPriEmis = 0;

			schedule.forEach((inst) => {
				const iAmt = Number(inst.amount) || 0;
				totalScheduled += iAmt;
				const iStatus = (inst.status || '').toLowerCase().trim();

				let splitData = inst.splits;
				if (typeof splitData === 'string') {
					try {
						splitData = JSON.parse(splitData);
					} catch (e) {
						splitData = null;
					}
				}

				const subA = Array.isArray(inst.subInstallments) ? inst.subInstallments[0] : null;
				const subB = Array.isArray(inst.subInstallments) ? inst.subInstallments[1] : null;
				const subRecdA = subA?.receivedDate || subA?.received_date || subA?.recdDate || subA?.recd_date;
				const subRecdB = subB?.receivedDate || subB?.received_date || subB?.recdDate || subB?.recd_date;
				const hasSubRecdA = isValidDateStr(subRecdA);
				const hasSubRecdB = isValidDateStr(subRecdB);

				const recdMain =
					inst.receivedDate ||
					inst.received_date ||
					inst.recdDate ||
					inst.recd_date ||
					inst.payment_received_date ||
					inst.paymentReceivedDate;
				const hasMainRecdDate = isValidDateStr(recdMain);
				const recdA = splitData?.recdDateA || splitData?.recdDate || splitData?.receivedDate || splitData?.received_date;
				const hasRecdA = isValidDateStr(recdA) || hasSubRecdA;
				const recdB = splitData?.recdDateB || splitData?.receivedDateB;
				const hasRecdB = isValidDateStr(recdB) || hasSubRecdB;
				const isFinalSettled = Boolean(splitData?.isFinalSettled);

				const pAppStatus = (inst.payout_approval_status || inst.payoutApprovalStatus || splitData?.payoutApprovalStatus || '').toUpperCase();
				const paymentDateStr = inst.paymentDate || inst.payment_date || splitData?.dueDateA || splitData?.payoutDate;
				const hasValidPaymentDate = isValidDateStr(paymentDateStr);
				const isPayoutApproved = hasValidPaymentDate && (pAppStatus === 'APPROVED' || (!pAppStatus && hasValidPaymentDate));

				const isStatusCollected =
					iStatus === 'collected' ||
					iStatus === 'settled' ||
					iStatus === 'pending payout approval' ||
					iStatus === 'payout discrepancy';

				const directPaid = Number(inst.paidAmount || inst.paid_amount || 0);
				const splitPaid = Number(splitData?.paidAmount || splitData?.amountA || subA?.amount || 0);
				const paidAmt = directPaid > 0 ? directPaid : splitPaid;

				const isFullyCollectedFromClient = hasMainRecdDate || isStatusCollected || isFinalSettled || (hasRecdA && hasRecdB);
				const isPartiallyCollectedFromClient = !isFullyCollectedFromClient && (hasRecdA || paidAmt > 0 || iStatus === 'partial');

				// Primary Perspective
				if (isFullyCollectedFromClient) {
					totalCollected += iAmt;
					if (!isPayoutApproved && secTotalSharePct > 0) {
						const pPendingSec = iAmt * secTotalSharePct;
						if (!hasValidPaymentDate) {
							settlementPendingAmount += pPendingSec;
							settlementPendingCount += 1;
						} else {
							pendingApprovalAmount += pPendingSec;
							pendingApprovalCount += 1;
						}

						const secList = loan.remaining_accounts || loan.secondaryAccounts || [];
						if (secList.length > 0) {
							secList.forEach((s) => {
								const sRaw = (s.account_name || s.accountName || s.accountTag || 'Secondary Partner').trim();
								const secCanon = resolveCanonicalAccount(sRaw, rawAccounts);
								const sName = secCanon ? secCanon.name : sRaw;
								const sTag = secCanon ? (secCanon.acronym || secCanon.name) : sRaw;
								const sPct = (Number(s.share || s.percentage) || (secTotalSharePct * 100 / secList.length)) / 100;
								const sPendingAmt = iAmt * sPct;

								if (!secondaryPartnersMap[sName]) {
									secondaryPartnersMap[sName] = {
										secondaryName: sName,
										secondaryTag: sTag,
										color: secCanon?.color || 'purple',
										pendingAmount: 0,
										pendingEmisCount: 0,
										unscheduledAmount: 0,
										unscheduledEmisCount: 0,
										awaitingApprovalAmount: 0,
										awaitingApprovalEmisCount: 0,
										loansCount: 0,
										loanIds: new Set(),
										loans: [],
									};
								}
								secondaryPartnersMap[sName].pendingAmount += sPendingAmt;
								secondaryPartnersMap[sName].pendingEmisCount += 1;
								if (!hasValidPaymentDate) {
									secondaryPartnersMap[sName].unscheduledAmount += sPendingAmt;
									secondaryPartnersMap[sName].unscheduledEmisCount += 1;
								} else {
									secondaryPartnersMap[sName].awaitingApprovalAmount += sPendingAmt;
									secondaryPartnersMap[sName].awaitingApprovalEmisCount += 1;
								}
								if (!secondaryPartnersMap[sName].loanIds.has(loanId)) {
									secondaryPartnersMap[sName].loanIds.add(loanId);
									secondaryPartnersMap[sName].loansCount += 1;
									secondaryPartnersMap[sName].loans.push({
										id: loanId,
										clientName,
										pendingAmount: sPendingAmt,
										emisCount: 1,
									});
								} else {
									const existingL = secondaryPartnersMap[sName].loans.find((x) => x.id === loanId);
									if (existingL) {
										existingL.pendingAmount += sPendingAmt;
										existingL.emisCount += 1;
									}
								}
							});
						}
					}
				} else if (isPartiallyCollectedFromClient) {
					const paid = paidAmt > 0 ? paidAmt : (iAmt * 0.5);
					totalCollected += paid;
					if (paid > 0 && !isPayoutApproved && secTotalSharePct > 0) {
						const pPendingSec = paid * secTotalSharePct;
						if (!hasValidPaymentDate) {
							settlementPendingAmount += pPendingSec;
							settlementPendingCount += 1;
						} else {
							pendingApprovalAmount += pPendingSec;
							pendingApprovalCount += 1;
						}
					}
					overdueAmount += Math.max(0, iAmt - paid);
				} else if (iStatus === 'overdue' || iStatus === 'date overdue') {
					overdueAmount += iAmt;
				} else {
					upcomingAmount += iAmt;
					upcomingCount += 1;
				}

				// Secondary Perspective
				const secInstAmt = iAmt * secSharePct;
				secondaryScheduled += secInstAmt;

				if (isFullyCollectedFromClient) {
					if (isPayoutApproved) {
						secondaryCollected += secInstAmt;
					} else {
						pendingFromPrimary += secInstAmt;
						pendingPayoutCount += 1;

						loanHasPendingFromPri = true;
						loanPendingFromPriAmt += secInstAmt;
						loanPendingFromPriEmis += 1;
					}
				} else if (isPartiallyCollectedFromClient) {
					const paid = paidAmt > 0 ? paidAmt : (iAmt * 0.5);
					const secPaid = paid * secSharePct;
					if (isPayoutApproved) {
						secondaryCollected += secPaid;
					} else if (paid > 0) {
						pendingFromPrimary += secPaid;
						pendingPayoutCount += 1;

						loanHasPendingFromPri = true;
						loanPendingFromPriAmt += secPaid;
						loanPendingFromPriEmis += 1;
					}
					secondaryOverdue += Math.max(0, (iAmt - paid) * secSharePct);
				} else if (iStatus === 'overdue' || iStatus === 'date overdue') {
					secondaryOverdue += secInstAmt;
				} else {
					secondaryUpcoming += secInstAmt;
				}
			});

			if (loanHasPendingFromPri && secSharePct > 0) {
				if (!primaryPartnersMap[priName]) {
					primaryPartnersMap[priName] = {
						primaryName: priName,
						primaryTag: priTag,
						color: priCanon?.color || 'blue',
						pendingAmount: 0,
						pendingEmisCount: 0,
						loansCount: 0,
						loanIds: new Set(),
						loans: [],
					};
				}
				primaryPartnersMap[priName].pendingAmount += loanPendingFromPriAmt;
				primaryPartnersMap[priName].pendingEmisCount += loanPendingFromPriEmis;
				if (!primaryPartnersMap[priName].loanIds.has(loanId)) {
					primaryPartnersMap[priName].loanIds.add(loanId);
					primaryPartnersMap[priName].loansCount += 1;
					primaryPartnersMap[priName].loans.push({
						id: loanId,
						clientName,
						loanAmount: amt,
						secShare: Math.round(secSharePct * 100),
						pendingAmount: loanPendingFromPriAmt,
						emisCount: loanPendingFromPriEmis,
					});
				} else {
					const existingL = primaryPartnersMap[priName].loans.find((x) => x.id === loanId);
					if (existingL) {
						existingL.pendingAmount += loanPendingFromPriAmt;
						existingL.emisCount += loanPendingFromPriEmis;
					}
				}
			}
		} else {
			totalScheduled += amt;
			secondaryScheduled += secLoanAmt;
		}
	});

	const totalBalance = Math.max(0, totalScheduled - totalCollected);
	const recoveryRate = totalScheduled > 0 ? Math.round((totalCollected / totalScheduled) * 100) : 0;

	const secondaryBalance = Math.max(0, secondaryScheduled - secondaryCollected);
	const secondaryRecoveryRate = secondaryScheduled > 0 ? Math.round((secondaryCollected / secondaryScheduled) * 100) : 0;

	const pendingByPrimaryAccount = Object.values(primaryPartnersMap)
		.map(({ loanIds, ...rest }) => rest)
		.sort((a, b) => b.pendingAmount - a.pendingAmount);

	const settlementPendingPartners = Object.values(secondaryPartnersMap)
		.map(({ loanIds, ...rest }) => rest)
		.sort((a, b) => b.pendingAmount - a.pendingAmount);

	return {
		totalVolume,
		totalPrincipal: roleFilter === 'secondary' ? secondaryPrincipal : totalVolume,
		activeVolume,
		activeCount,
		overdueCount,
		overdueAmount: roleFilter === 'secondary' ? secondaryOverdue : overdueAmount,
		totalCollected: roleFilter === 'secondary' ? secondaryCollected : totalCollected,
		totalScheduled: roleFilter === 'secondary' ? secondaryScheduled : totalScheduled,
		totalBalance: roleFilter === 'secondary' ? secondaryBalance : totalBalance,
		pendingCount,
		pendingSecCount,
		pendingAdminCount,
		closedCount,
		recoveryRate: roleFilter === 'secondary' ? secondaryRecoveryRate : recoveryRate,
		primaryCapital,
		secondaryCapital,
		totalLoansCount: loans.length,

		settlementPendingAmount,
		settlementPendingCount,
		settlementPendingPartners,
		pendingApprovalAmount,
		pendingApprovalCount,
		upcomingAmount: roleFilter === 'secondary' ? secondaryUpcoming : upcomingAmount,
		upcomingCount,

		secondaryPrincipal,
		secondaryCollected,
		pendingFromPrimary,
		pendingPayoutCount,
		secondaryOverdue,
		secondaryBalance,
		pendingByPrimaryAccount,
	};
}
