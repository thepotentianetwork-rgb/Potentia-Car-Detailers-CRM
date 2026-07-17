import { useState, useEffect } from "react";
import { ExternalLink, Building2 } from "lucide-react";
import { fetchAllTenants } from "../../api/tenants.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

const STATUS_COLOR = {
  active: "bg-[#173D22] text-[#5FCB7C]",
  trial: "bg-[#3D3315] text-[#D4AF37]",
  suspended: "bg-[#3D1515] text-[#E08A8A]",
};

export function TenantsTab() {
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAllTenants().then(setTenants).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!tenants) return <LoadingBox center />;

  return (
    <div className="space-y-2">
      {tenants.map((t) => (
        <div key={t.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2.5">
            <Building2 size={16} className="text-[#5C5F66] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{t.name}</div>
              <div className="text-[11px] text-[#8B8F96]">{t.industry} · /{t.slug}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded ${STATUS_COLOR[t.status] || ""}`}>{t.status}</span>
            <a
              href={`/crm/${t.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1.5 rounded"
            >
              <ExternalLink size={10} /> Open
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
