/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Modern Bar Chart visualizing loan counts and capital distribution across co-lending accounts (primary vs secondary).
*/

import React, { useState, useMemo } from 'react';
import {
	ResponsiveContainer,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
} from 'recharts';
import {
	calculateAccountDistribution,
	formatCompactCurrency,
	formatIndianCurrency,
	cleanAccountKey,
	getAccountAliases,
} from '../../utils/jointLoanUtils';

export default function JointLoanBarChart({
	loans = [],
	rawAccounts = [],
	isAdmin = false,
	allowedPrimaryKeys = [],
}) {
	const [viewMode, setViewMode] = useState('count'); // 'count' | 'volume'

	// Calculate account-wise distribution
	const accountData = useMemo(() => {
		let raw = calculateAccountDistribution(loans, rawAccounts);
		if (!isAdmin && Array.isArray(allowedPrimaryKeys) && allowedPrimaryKeys.length > 0) {
			const cleanAllowed = allowedPrimaryKeys.map(cleanAccountKey);
			raw = raw.filter((acc) => {
				const cName = cleanAccountKey(acc.accountName);
				const cTag = cleanAccountKey(acc.accountTag);
				return cleanAllowed.some((k) => {
					if (k === cName || k === cTag) return true;
					return getAccountAliases(k, rawAccounts).some((al) => {
						const cAl = cleanAccountKey(al);
						return cAl === cName || cAl === cTag;
					});
				});
			});
		}
		// Return top 8 accounts or all if fewer
		return raw.slice(0, 8).map((acc) => ({
			...acc,
			// Short label for X-axis
			shortName:
				acc.accountTag && acc.accountTag.length > 12
					? acc.accountTag.slice(0, 10) + '..'
					: acc.accountTag || acc.accountName,
			// Volume in Lakhs for clean chart scaling
			primaryVolumeLakhs: Number((acc.primaryVolume / 100000).toFixed(2)),
			secondaryVolumeLakhs: Number((acc.secondaryVolume / 100000).toFixed(2)),
			totalVolumeLakhs: Number((acc.totalVolume / 100000).toFixed(2)),
		}));
	}, [loans, rawAccounts, isAdmin, allowedPrimaryKeys]);

	const totalActiveAccounts = accountData.length;

	// Custom Tooltip
	const CustomTooltip = ({ active, payload, label }) => {
		if (!active || !payload || !payload.length) return null;
		const data = payload[0]?.payload || {};

		return (
			<div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700/60 font-sans text-xs min-w-[220px] z-50">
				<div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/80">
					<span className="font-extrabold text-[13px] text-slate-100 flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
						{data.accountName || label}
					</span>
					<span className="text-[10px] text-slate-400 font-mono">Account Activity</span>
				</div>
				<div className="space-y-1.5">
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400 flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-sm bg-primary"></span>
							Primary Facility Count:
						</span>
						<span className="font-bold text-white text-[12px]">{data.primaryLoansCount || 0}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400 flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-sm bg-violet-400"></span>
							Secondary Partner Count:
						</span>
						<span className="font-bold text-white text-[12px]">{data.secondaryLoansCount || 0}</span>
					</div>
					<div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800">
						<span className="text-slate-300 font-semibold">Total Facilities:</span>
						<span className="font-extrabold text-amber-300 text-[12.5px] font-mono">
							{data.totalLoansCount || 0} loans
						</span>
					</div>
					<div className="flex items-center justify-between gap-3 pt-0.5">
						<span className="text-slate-400">Total Allocated Capital:</span>
						<span className="font-bold text-emerald-400 text-[12px] font-mono">
							{formatIndianCurrency(data.totalVolume || 0)}
						</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/80 flex flex-col font-sans transition-all duration-300 hover:shadow-md">
			{/* Header Strip with Mode Toggle */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
						<span className="material-symbols-outlined text-[22px]">bar_chart</span>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
								Loan Distribution by Account
							</h3>
							<span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">
								{totalActiveAccounts} Accounts
							</span>
						</div>
						<p className="text-[12px] text-slate-500 mt-0.5">
							Primary vs Secondary co-lending distribution across accounts
						</p>
					</div>
				</div>

				{/* Toggle Switch: Loan Count vs Capital Volume */}
				<div className="flex items-center bg-slate-100/90 p-1 rounded-xl self-start sm:self-auto ring-1 ring-slate-200/60">
					<button
						type="button"
						onClick={() => setViewMode('count')}
						className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
							viewMode === 'count'
								? 'bg-white text-violet-700 shadow-xs ring-1 ring-slate-200/60'
								: 'text-slate-600 hover:text-slate-900'
						}`}
					>
						Loan Count
					</button>
					<button
						type="button"
						onClick={() => setViewMode('volume')}
						className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
							viewMode === 'volume'
								? 'bg-white text-violet-700 shadow-xs ring-1 ring-slate-200/60'
								: 'text-slate-600 hover:text-slate-900'
						}`}
					>
						Capital Volume (₹L)
					</button>
				</div>
			</div>

			{/* Chart Area */}
			<div className="h-[280px] w-full pt-4">
				{accountData.length === 0 ? (
					<div className="h-full flex items-center justify-center text-slate-400 text-xs">
						No account distribution data available for current filter.
					</div>
				) : (
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={accountData} margin={{ top: 12, right: 12, left: -16, bottom: 6 }}>
							<defs>
								<linearGradient id="primaryAccountGradient" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#ff5c00" stopOpacity={0.9} />
									<stop offset="100%" stopColor="#ff5c00" stopOpacity={0.6} />
								</linearGradient>
								<linearGradient id="secondaryAccountGradient" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
									<stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.5} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
							<XAxis
								dataKey="shortName"
								tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600, textAnchor: 'middle' }}
								axisLine={{ stroke: '#e2e8f0' }}
								tickLine={false}
								interval={0}
								dy={6}
							/>
							<YAxis
								allowDecimals={false}
								tick={{ fill: '#64748b', fontSize: 11 }}
								axisLine={false}
								tickLine={false}
								tickFormatter={(val) => (viewMode === 'volume' ? `₹${val}L` : `${val}`)}
							/>
							<Tooltip content={<CustomTooltip />} />
							<Legend
								verticalAlign="top"
								align="right"
								wrapperStyle={{ paddingBottom: '8px', fontSize: '11px', fontWeight: 600 }}
								iconSize={8}
								iconType="circle"
							/>
							{viewMode === 'count' ? (
								<>
									<Bar
										dataKey="primaryLoansCount"
										name="Primary Loans"
										fill="url(#primaryAccountGradient)"
										stackId="account"
										radius={[4, 4, 0, 0]}
										maxBarSize={36}
									/>
									<Bar
										dataKey="secondaryLoansCount"
										name="Secondary Loans"
										fill="url(#secondaryAccountGradient)"
										stackId="account"
										radius={[4, 4, 0, 0]}
										maxBarSize={36}
									/>
								</>
							) : (
								<>
									<Bar
										dataKey="primaryVolumeLakhs"
										name="Primary Share (₹L)"
										fill="url(#primaryAccountGradient)"
										stackId="account"
										radius={[4, 4, 0, 0]}
										maxBarSize={36}
									/>
									<Bar
										dataKey="secondaryVolumeLakhs"
										name="Secondary Share (₹L)"
										fill="url(#secondaryAccountGradient)"
										stackId="account"
										radius={[4, 4, 0, 0]}
										maxBarSize={36}
									/>
								</>
							)}
						</BarChart>
					</ResponsiveContainer>
				)}
			</div>

			{/* Chart Footer Indicator */}
			<div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100 text-[11px] text-slate-500">
				<div className="flex items-center gap-2">
					<span className="flex items-center gap-1 text-primary font-semibold">
						<span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block"></span>
						Primary Partner
					</span>
					<span className="mx-1 text-slate-300">•</span>
					<span className="flex items-center gap-1 text-violet-700 font-semibold">
						<span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block"></span>
						Secondary Partner
					</span>
				</div>
				<span className="text-slate-400 font-mono">
					{viewMode === 'count' ? 'Sorted by Total Loan Count' : 'Sorted by Total Volume'}
				</span>
			</div>
		</div>
	);
}
