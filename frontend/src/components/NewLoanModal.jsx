/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Modal dialog form component for booking new loan facilities and calculating partner allocations.
*/

import React, { useState } from 'react';

export default function NewLoanModal({ isOpen, onClose, onAddLoan }) {
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Commercial');
  const [termType, setTermType] = useState('Equip. Loan');
  const [rateOrScore, setRateOrScore] = useState('7.2% Fixed');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!company.trim() || !amount.trim()) return;

    const initials = company
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'LN';

    const newCard = {
      id: `app-${Date.now()}`,
      category: category,
      categoryColor:
        category === 'Commercial'
          ? 'bg-orange-50 text-orange-700 ring-orange-300'
          : category === 'SME Working Cap'
          ? 'bg-blue-50 text-blue-700 ring-blue-300'
          : 'bg-purple-50 text-purple-700 ring-purple-300',
      initials: initials,
      avatarBg: 'bg-primary-container text-on-primary',
      company: company,
      description: description || 'New Loan Intake',
      amount: amount.startsWith('$') ? amount : `$${amount}`,
      termType: termType,
      rateOrScore: rateOrScore,
      rateColor: 'text-slate-700 font-bold',
      progressLabel: 'Doc Intake',
      progressValue: '10% Complete',
      progressPercent: 10,
      statusText: 'Priority Review',
      statusColor: 'text-primary font-bold',
      hasPriorityDot: true,
      dueDate: 'Due in 3 days',
    };

    onAddLoan(newCard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-[18px] text-slate-900">New Loan Application</h3>
            <p className="text-[12px] text-slate-500">Add an applicant into the underwriting pipeline</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Borrower / Company Name
            </label>
            <input
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Acme Industrial Logistics"
              className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Business Profile / Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Commercial Freight Fleet • Tier 1"
              className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Requested Amount
              </label>
              <input
                type="text"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="$250,000"
                className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
              >
                <option value="Commercial">Commercial</option>
                <option value="SME Working Cap">SME Working Cap</option>
                <option value="Mortgage / RE">Mortgage / RE</option>
                <option value="Micro-Loan">Micro-Loan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Term Structure
              </label>
              <input
                type="text"
                value={termType}
                onChange={(e) => setTermType(e.target.value)}
                placeholder="Equip. Loan / 36 Mo"
                className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Indicative Rate / Score
              </label>
              <input
                type="text"
                value={rateOrScore}
                onChange={(e) => setRateOrScore(e.target.value)}
                placeholder="7.4% Fixed"
                className="w-full px-3.5 py-2 rounded-xl text-[14px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-[13px] font-bold bg-primary-container hover:bg-primary text-on-primary shadow-sm transition-all active:scale-95"
            >
              Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
