import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { CONFIG } from "../../config.js";
import { fetchExpenses, createExpense, deleteExpense } from "../../api/expenses.js";
import { iso } from "../../lib/time.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

export function ExpensesTab({ userId }) {
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ expense_date: iso(new Date()), category: CONFIG.expenseCategories[0], amount: "", note: "" });
  const [monthOffset, setMonthOffset] = useState(0);

  const load = () => fetchExpenses().then(setExpenses).catch((e) => setError(e.message));
  useEffect(load, []);

  const now = new Date();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}`;

  const monthExpenses = (expenses || []).filter((e) => e.expense_date.startsWith(monthKey));
  const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount_cents, 0) / 100;
  const byCategory = CONFIG.expenseCategories
    .map((cat) => ({
      cat,
      total: monthExpenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount_cents, 0) / 100,
    }))
    .filter((c) => c.total > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    setSubmitting(true);
    setError("");
    try {
      await createExpense({
        expense_date: form.expense_date,
        category: form.category,
        amount_cents: Math.round(parseFloat(form.amount) * 100),
        note: form.note || null,
        created_by: userId,
      });
      setForm({ expense_date: iso(new Date()), category: CONFIG.expenseCategories[0], amount: "", note: "" });
      setShowForm(false);
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteExpense(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      {error && <ErrorBox message={error} />}

      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="p-1.5 border border-[#232529] rounded-md text-[#8B8F96]"><ChevronLeft size={14} /></button>
        <div className="flex-1 text-center bg-[#111214] border border-[#232529] rounded-lg py-2.5 text-sm font-medium">{monthLabel}</div>
        <button onClick={() => setMonthOffset((m) => Math.min(0, m + 1))} disabled={monthOffset === 0} className="p-1.5 border border-[#232529] rounded-md text-[#8B8F96] disabled:opacity-30"><ChevronRight size={14} /></button>
      </div>

      <div className="bg-[#111214] border border-[#232529] rounded-lg p-4 mb-5 text-center">
        <div className="text-[11px] text-[#8B8F96] uppercase tracking-wide mb-1">Total Spent</div>
        <div className="text-2xl font-bold">${monthTotal.toFixed(2)}</div>
      </div>

      {byCategory.length > 0 && (
        <div className="space-y-2 mb-5">
          {byCategory.map((c) => (
            <div key={c.cat} className="flex items-center justify-between text-[12px]">
              <span className="text-[#8B8F96]">{c.cat}</span>
              <span className="text-[#C9CDD3] font-medium">${c.total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg mb-5">
          + Add Expense
        </button>
      ) : (
        <form onSubmit={submit} className="bg-[#111214] border border-[#232529] rounded-lg p-4 space-y-3 mb-5">
          <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none">
            {CONFIG.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Amount ($)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="flex-1 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg disabled:opacity-60">
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[#232529] text-[#8B8F96] text-sm py-2.5 rounded-lg">Cancel</button>
          </div>
        </form>
      )}

      <h2 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[12px] font-bold uppercase tracking-wide text-[#8B8F96] mb-3">This Month's Expenses</h2>
      {!expenses ? <LoadingBox /> : monthExpenses.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No expenses logged for {monthLabel}.</div>
      ) : (
        <div className="space-y-2">
          {monthExpenses.map((e) => (
            <div key={e.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{e.category}</div>
                <div className="text-[11px] text-[#5C5F66]">{e.expense_date}{e.note ? ` · ${e.note}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#C9CDD3]">${(e.amount_cents / 100).toFixed(2)}</span>
                <button onClick={() => remove(e.id)} className="text-[#5C5F66] hover:text-[#E08A8A]"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
