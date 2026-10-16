/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Composed Bar + Line chart visualizing joint loan creation velocity and facility volume over Week, Month, and Year periods.
*/

import React, { useState, useMemo } from 'react';
import {
	ResponsiveContainer,
	ComposedChart,
	Bar,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
} from 'recharts';
import {
	getLoanPeriodData,
	formatCompactCurrency,
	formatIndianCurrency,
} from '../../utils/jointLoanUtils';

export default function JointLoanCreatedPeriodChart({ loans = [] }) {
	const [period, setPeriod] = useState('month'); // 'week' | 'month' | 'year'

	// Reference date: current system date
	const periodData = useMemo(() => {
		const refDate = new Date();
		const raw = getLoanPeriodData(loans, period, refDate);
		return raw.map((item) => {
			const volCr = Number(((item.totalAmount || 0) / 10000000).toFixed(2));
			return {
				...item,
				volume: volCr,
				volumeCr: volCr,
			};
		});
	}, [loans, period]);

	// Period summary totals
	const summary = useMemo(() => {
		let totalLoans = 0;
		let totalAmt = 0;
		periodData.forEach((item) => {
			totalLoans += item.loanCount || 0;
			totalAmt += item.totalAmount || 0;
		});
		return { totalLoans, totalAmt };
	}, [periodData]);

	// Custom Tooltip
	const CustomTooltip = ({ active, payload, label }) => {
		if (!active || !payload || !payload.length) return null;
		const data = payload[0]?.payload || {};
		const count = data.loanCount || 0;
		const amount = data.totalAmount || 0;
		const avgTicket = count > 0 ? Math.round(amount / count) : 0;
		const title = data.fullLabel || data.tooltipTitle || data.label || label;

		return (
			<div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700/60 font-sans text-xs min-w-[210px] z-50">
				<div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/80">
					<span className="font-extrabold text-[13px] text-slate-100 flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
						{title}
					</span>
					<span className="text-[10px] text-slate-400 font-mono">
						{period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'Yearly'}
					</span>
				</div>
				<div className="space-y-1.5">
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400 flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-sm bg-primary"></span>
							Loans Created:
						</span>
						<span className="font-bold text-white text-[12.5px]">{count} facilities</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400 flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-emerald-400"></span>
							Total Facility:
						</span>
						<span className="font-bold text-emerald-300 text-[12.5px] font-mono">
							{formatIndianCurrency(amount)}
						</span>
					</div>
					{count > 0 && (
						<div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800 text-[10.5px]">
							<span className="text-slate-500">Avg Facility Size:</span>
							<span className="text-slate-300 font-mono">{formatCompactCurrency(avgTicket)}</span>
						</div>
					)}
				</div>
			</div>
		);
	};

	return (
		<div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/80 flex flex-col font-sans transition-all duration-300 hover:shadow-md">
			{/* Header Strip with Period Toggles */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
						<span className="material-symbols-outlined text-[22px]">trending_up</span>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
								Loan Creation &amp; Volume Velocity
							</h3>
						</div>
						<p className="text-[12px] text-slate-500 mt-0.5">
							{summary.totalLoans} {summary.totalLoans === 1 ? 'loan' : 'loans'} created (
							<strong className="text-slate-700 font-semibold">{formatCompactCurrency(summary.totalAmt)}</strong>)
							{period === 'year'
								? ' across last 10 years'
								: period === 'month'
								? ' across 12 calendar months'
								: ' across last 8 weeks (Sun - Sat)'}
						</p>
					</div>
				</div>

				{/* Period Switcher: Yearly / Monthly / Weekly */}
				<div className="flex items-center bg-slate-100/90 p-1 rounded-xl self-start sm:self-auto ring-1 ring-slate-200/60">
					<button
						type="button"
						onClick={() => setPeriod('year')}
						className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
							period === 'year'
								? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/60'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						title="Last 10 years loan creation history"
					>
						Yearly
					</button>
					<button
						type="button"
						onClick={() => setPeriod('month')}
						className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
							period === 'month'
								? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/60'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						title="12 calendar months aggregated across all years"
					>
						Monthly
					</button>
					<button
						type="button"
						onClick={() => setPeriod('week')}
						className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
							period === 'week'
								? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/60'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						title="Last 8 weeks cycle (Sunday to Saturday)"
					>
						Weekly
					</button>
				</div>
			</div>

			{/* Chart Area */}
			<div className="h-[280px] w-full pt-4">
				<ResponsiveContainer width="100%" height="100%">
					<ComposedChart data={periodData} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
						<defs>
							<linearGradient id="loanBarGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#ff5c00" stopOpacity={0.9} />
								<stop offset="100%" stopColor="#ff7f32" stopOpacity={0.4} />
							</linearGradient>
							<linearGradient id="volumeLineGlow" x1="0" y1="0" x2="1" y2="0">
								<stop offset="0%" stopColor="#059669" />
								<stop offset="100%" stopColor="#10b981" />
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
						<XAxis
							dataKey="label"
							tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
							axisLine={{ stroke: '#e2e8f0' }}
							tickLine={false}
							interval={0}
						/>
						{/* Left Y Axis for Loan Count */}
						<YAxis
							yAxisId="left"
							allowDecimals={false}
							tick={{ fill: '#64748b', fontSize: 11 }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(val) => `${val}`}
						/>
						{/* Right Y Axis for Volume in Crores */}
						<YAxis
							yAxisId="right"
							orientation="right"
							tick={{ fill: '#059669', fontSize: 10, fontWeight: 600 }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(val) => `₹${parseFloat(Number(val || 0).toFixed(2))} Cr`}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Legend
							verticalAlign="top"
							align="right"
							wrapperStyle={{ paddingBottom: '8px', fontSize: '11px', fontWeight: 600 }}
							iconSize={8}
							iconType="circle"
						/>
						{/* Bar: Loan count */}
						<Bar
							yAxisId="left"
							dataKey="loanCount"
							name="Loans Created (Count)"
							fill="url(#loanBarGradient)"
							radius={[6, 6, 0, 0]}
							maxBarSize={36}
						/>
						{/* Line: Volume in Crores */}
						<Line
							yAxisId="right"
							type="monotone"
							dataKey="volume"
							name="Facility Volume (₹ Cr)"
							stroke="url(#volumeLineGlow)"
							strokeWidth={3}
							dot={{ fill: '#059669', stroke: '#fff', strokeWidth: 2, r: 4 }}
							activeDot={{ fill: '#10b981', stroke: '#fff', strokeWidth: 2, r: 6 }}
						/>
					</ComposedChart>
				</ResponsiveContainer>
			</div>

			{/* Chart Footer Indicator */}
			<div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100 text-[11px] text-slate-500">
				<span className="text-slate-400 font-mono">
					{period === 'week'
						? 'Last 8 Weeks (Sun - Sat)'
						: period === 'month'
						? '12 Calendar Months (All Years)'
						: `Last 10 Years (${new Date().getFullYear() - 9} - ${new Date().getFullYear()})`}
				</span>
			</div>
		</div>
	);
}
