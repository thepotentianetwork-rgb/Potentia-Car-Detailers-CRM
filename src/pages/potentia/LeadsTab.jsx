import { useState, useEffect, useMemo } from "react";
import { Plus, Phone, Mail, DollarSign, CheckSquare, Square, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { fetchLeads, createLead, updateLead, deleteLead, fetchLeadTasks, createLeadTask, updateLeadTask, deleteLeadTask } from "../../api/leads.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

const STATUSES = ["new", "contacted", "quoted", "won", "lost"];
const STATUS_LABEL = { new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost" };
const STATUS_COLOR = {
  new: "bg-[#1D2A3D] text-[#7EA8D8]",
  contacted: "bg-[#3D3315] text-[#D4AF37]",
  quoted: "bg-[#3D2A15] text-[#D89A4A]",
  won: "bg-[#173D22] text-[#5FCB7C]",
  lost: "bg-[#3D1515] text-[#E08A8A]",
};

export function LeadsTab() {
  const [leads, setLeads] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", industry: "", deal_value: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    Promise.all([fetchLeads(), fetchLeadTasks()])
      .then(([l, t]) => { setLeads(l); setTasks(t); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (filter === "all") return leads;
    return leads.filter((l) => l.status === filter);
  }, [leads, filter]);

  const counts = useMemo(() => {
    const c = { all: leads?.length || 0 };
    for (const s of STATUSES) c[s] = leads?.filter((l) => l.status === s).length || 0;
    return c;
  }, [leads]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name.trim()) { setError("Enter a business name."); return; }
    setSubmitting(true);
    setError("");
    try {
      await createLead({
        business_name: form.business_name.trim(),
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        industry: form.industry || null,
        deal_value: form.deal_value ? parseFloat(form.deal_value) : null,
        notes: form.notes || null,
      });
      setForm({ business_name: "", contact_name: "", phone: "", email: "", industry: "", deal_value: "", notes: "" });
      setShowForm(false);
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await updateLead(id, { status });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await deleteLead(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <ErrorBox message={error} />;
  if (!leads) return <LoadingBox center />;

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
        <FilterChip active={filter === "all"} label={`All (${counts.all})`} onClick={() => setFilter("all")} />
        {STATUSES.map((s) => (
          <FilterChip key={s} active={filter === s} label={`${STATUS_LABEL[s]} (${counts[s]})`} onClick={() => setFilter(s)} />
        ))}
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-1.5 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg mb-5">
          <Plus size={14} /> Add Lead
        </button>
      ) : (
        <form onSubmit={submit} className="bg-[#111214] border border-[#232529] rounded-lg p-4 space-y-3 mb-5">
          <input placeholder="Business name" value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <input placeholder="Contact name" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <div className="flex gap-2">
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-1/2 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-1/2 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <div className="flex gap-2">
            <input placeholder="Industry" value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              className="w-1/2 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
            <input type="number" step="0.01" placeholder="Deal value ($)" value={form.deal_value} onChange={(e) => setForm((f) => ({ ...f, deal_value: e.target.value }))}
              className="w-1/2 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <textarea placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="flex-1 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg disabled:opacity-60">
              {submitting ? "Saving…" : "Save Lead"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[#232529] text-[#8B8F96] text-sm py-2.5 rounded-lg">Cancel</button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No leads here yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              tasks={tasks.filter((t) => t.lead_id === lead.id)}
              expanded={expandedId === lead.id}
              onToggleExpand={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
              onSetStatus={(s) => setStatus(lead.id, s)}
              onDelete={() => remove(lead.id)}
              onRefresh={load}
              setError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
        active ? "bg-[#E4E7EB] text-[#0A0A0B] border-[#E4E7EB]" : "border-[#232529] text-[#8B8F96] hover:border-[#4A4D53]"
      }`}
    >
      {label}
    </button>
  );
}

function LeadCard({ lead, tasks, expanded, onToggleExpand, onSetStatus, onDelete, onRefresh, setError }) {
  const [taskTitle, setTaskTitle] = useState("");

  const addTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      await createLeadTask({ lead_id: lead.id, title: taskTitle.trim() });
      setTaskTitle("");
      onRefresh();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggleTask = async (task) => {
    try {
      await updateLeadTask(task.id, { completed: !task.completed });
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const removeTask = async (id) => {
    try {
      await deleteLeadTask(id);
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={onToggleExpand}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{lead.business_name}</div>
          {lead.contact_name && <div className="text-[12px] text-[#8B8F96]">{lead.contact_name}</div>}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-[#5C5F66]">
            {lead.phone && <span className="flex items-center gap-1"><Phone size={10} /> {lead.phone}</span>}
            {lead.email && <span className="flex items-center gap-1"><Mail size={10} /> {lead.email}</span>}
            {lead.deal_value != null && <span className="flex items-center gap-1"><DollarSign size={10} /> {Number(lead.deal_value).toFixed(0)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
          {expanded ? <ChevronUp size={14} className="text-[#5C5F66]" /> : <ChevronDown size={14} className="text-[#5C5F66]" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#232529] space-y-3">
          {lead.industry && <div className="text-[12px] text-[#8B8F96]">Industry: {lead.industry}</div>}
          {lead.notes && <div className="text-[12px] text-[#8B8F96] whitespace-pre-wrap">{lead.notes}</div>}

          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onSetStatus(s)}
                className={`text-[10px] font-medium px-2 py-1 rounded ${lead.status === s ? "bg-[#E4E7EB] text-[#0A0A0B]" : "border border-[#232529] text-[#8B8F96]"}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#5C5F66] mb-1.5">Tasks</div>
            {tasks.length === 0 ? (
              <div className="text-[11px] text-[#5C5F66] mb-2">No tasks yet.</div>
            ) : (
              <div className="space-y-1 mb-2">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-[12px]">
                    <button onClick={() => toggleTask(t)} className="shrink-0 text-[#8B8F96]">
                      {t.completed ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                    <span className={`flex-1 ${t.completed ? "line-through text-[#5C5F66]" : ""}`}>{t.title}</span>
                    <button onClick={() => removeTask(t.id)} className="shrink-0 text-[#5C5F66] hover:text-[#E08A8A]">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={addTask} className="flex gap-1.5">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Add a follow-up task…"
                className="flex-1 bg-[#0D0E10] border border-[#232529] rounded-md px-2.5 py-1.5 text-[12px] outline-none"
              />
              <button type="submit" className="text-[11px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white px-2.5 rounded-md">Add</button>
            </form>
          </div>

          <button onClick={onDelete} className="text-[11px] text-[#5C5F66] hover:text-[#E08A8A]">Delete lead</button>
        </div>
      )}
    </div>
  );
}
