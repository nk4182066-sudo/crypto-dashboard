"use client";
import { useState } from "react";

export default function RiskCalculator() {
  const [balance, setBalance] = useState(1000);
  const [leverage, setLeverage] = useState(1);
  const [riskPercent, setRiskPercent] = useState(1);

  const maxLoss = (balance * riskPercent) / 100;
  const totalPosition = balance * leverage;
  const safeTradeSize = maxLoss;

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="text-sm font-bold text-white mb-3">💰 Risk Calculator</h3>
      
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Account Balance ($)</label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-1">Leverage</label>
          <select
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
          >
            <option value="1">1x (No Leverage)</option>
            <option value="2">2x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
            <option value="20">20x</option>
            <option value="50">50x</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-1">Risk % (Max Loss)</label>
          <input
            type="number"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value))}
            step="0.5"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-zinc-700 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Max Loss:</span>
          <span className="text-red-400 font-bold">${maxLoss.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Position Size:</span>
          <span className="text-white font-bold">${totalPosition.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Safe Trade:</span>
          <span className="text-green-400 font-bold">${safeTradeSize.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-3 rounded bg-zinc-800 p-2 text-xs text-zinc-300 leading-relaxed">
        Aap is trade mein <strong className="text-red-400">${maxLoss.toFixed(2)}</strong> lose kar sakte hain.
        Total position <strong className="text-white">${totalPosition.toFixed(2)}</strong>.
        Safe raho, plan ke saath trade karo.
      </div>

      <p className="mt-3 text-[10px] text-zinc-500">
        ⚠️ Educational tool. Not financial advice.
      </p>
    </div>
  );
}
