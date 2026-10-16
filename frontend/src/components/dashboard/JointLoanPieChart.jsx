/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Donut Pie chart visualization component displaying status-wise loan count and portfolio health.
*/

import React, { useState, useMemo } from 'react';
import {
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
	Tooltip,
} from 'recharts';
import {
	calculateStatusDistribution,
	formatCompactCurrency,
	formatIndianCurrency,
} from '../../utils/jointLoanUtils';

export default function JointLoanPieChart({ loans = [], onSelectFilter }) {
	const [hoveredStatus, setHoveredStatus] = useState(null);

	// Compute status distribution
	const statusData = useMemo(() => {
		const raw = calculateStatusDistribution(loans);
		// Filter out 0 count items if total > 0 so pie chart doesn't render empty slivers
		const nonZero = raw.filter((item) => item.count > 0);
		return nonZero.length > 0 ? nonZero : raw;
	}, [loans]);

	const totalLoans = useMemo(() => {
		return statusData.reduce((acc, curr) => acc + curr.count, 0);
	}, [statusData]);

	const totalAmount = useMemo(() => {
		return statusData.reduce((acc, curr) => acc + curr.amount, 0);
	}, [statusData]);

	// Custom Tooltip
	const CustomTooltip = ({ active, payload }) => {
		if (!active || !payload || !payload.length) return null;
		const data = payload[0]?.payload || {};

		return (
			<div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/60 font-sans text-xs min-w-[170px] z-50">
				<div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700/80">
					<span className="font-extrabold text-[12.5px] text-slate-100 flex items-center gap-1.5">
						<span
							className="w-2.5 h-2.5 rounded-full"
							style={{ backgroundColor: data.color }}
						></span>
						{data.status}
					</span>
					<span className="font-mono text-[11px] text-slate-400">{data.percentage}%</span>
				</div>
				<div className="space-y-1">
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400">Loan Count:</span>
						<span className="font-bold text-white text-[12px]">{data.count} loans</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-slate-400">Total Volume:</span>
						<span className="font-bold text-emerald-400 text-[12px] font-mono">
							{formatIndianCurrency(data.amount)}
						</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/80 flex flex-col font-sans transition-all duration-300 hover:shadow-md h-full">
			{/* Header Strip */}
			<div className="flex items-center justify-between pb-3 border-b border-slate-100">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
						<span className="material-symbols-outlined text-[22px]">donut_large</span>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
								Status-Wise Distribution
							</h3>
							<span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
								{totalLoans} Facilities
							</span>
						</div>
						<p className="text-[12px] text-slate-500 mt-0.5">
							Interactive status portfolio breakdown
						</p>
					</div>
				</div>
			</div>

			{/* Donut Chart with Centered Metric */}
			<div className="relative h-[210px] w-full flex items-center justify-center my-1">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={statusData}
							cx="50%"
							cy="50%"
							innerRadius={58}
							outerRadius={84}
							paddingAngle={3}
							dataKey="count"
							onMouseEnter={(_, index) => setHoveredStatus(statusData[index]?.status)}
							onMouseLeave={() => setHoveredStatus(null)}
							onClick={(entry) => onSelectFilter && onSelectFilter(entry?.status)}
							cursor="pointer"
						>
							{statusData.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
									fill={entry.color}
									stroke="#ffffff"
									strokeWidth={2}
									className="transition-all duration-200 hover:opacity-85"
								/>
							))}
						</Pie>
						<Tooltip content={<CustomTooltip />} />
					</PieChart>
				</ResponsiveContainer>

				{/* Center Donut Hole Content */}
				<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
					<span className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-none">
						{totalLoans}
					</span>
					<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
						{hoveredStatus || 'Total Loans'}
					</span>
				</div>
			</div>

			{/* Interactive Status Legend Pills */}
			<div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 mt-auto">
				{statusData.map((item) => (
					<button
						key={item.status}
						type="button"
						onClick={() => onSelectFilter && onSelectFilter(item.status)}
						onMouseEnter={() => setHoveredStatus(item.status)}
						onMouseLeave={() => setHoveredStatus(null)}
						className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 hover:bg-slate-100/90 border border-slate-200/60 transition-all text-left cursor-pointer group"
						title={`Filter table by ${item.status}`}
					>
						<div className="flex items-center gap-1.5 min-w-0">
							<span
								className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
								style={{ backgroundColor: item.color }}
							></span>
							<span className="text-[11px] font-bold text-slate-700 truncate">
								{item.status}
							</span>
						</div>
						<div className="text-right shrink-0 ml-1">
							<span className="font-mono text-[11px] font-extrabold text-slate-900">
								{item.count}
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
