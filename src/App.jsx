import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  LayoutGrid, Users, Receipt, Wallet, FileBarChart, Settings as SettingsIcon,
  Plus, Search, X, Check, ChevronRight, ChevronLeft, Download, Trash2, Pencil,
  AlertCircle, TrendingUp, TrendingDown, Clock, CheckCircle2, CircleDashed,
  CircleDot, LogOut, ShieldCheck, Eye, ArrowLeft, Printer, Loader2,
} from "lucide-react";
import { supabaseConfigured } from "./lib/supabaseClient";
import {
  fetchClass, createClass, saveClassData, verifyAdminCode,
  getRecentClasses, rememberRecentClass, getStoredAdminCode, storeAdminCode, clearStoredAdminCode,
} from "./lib/classApi";

/* ============================== helpers ============================== */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(
    Math.round(n || 0)
  );
const numFmt = (n) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const fmtDateShort = (iso) => {
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "-"; }
};

function jakartaNow() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date()) + " WIB";
}

function slugify(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12);
}
function suggestClassId(schoolName, className, schoolYear) {
  const yr = (schoolYear || "").match(/\d{2,4}/g);
  const yrTag = yr && yr.length ? yr[0].slice(-2) : "";
  return `${slugify(schoolName).slice(0, 6)}-${slugify(className)}-${yrTag}`.replace(/-+$/, "");
}

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function generateMonthlyPeriods(nominal, dueDay) {
  return MONTHS.map((m, i) => ({ id: uid(), label: m, order: i, start: null, end: null, nominal, dueDay: dueDay || 10, active: true }));
}
function generateWeeklyPeriods(startDateStr, weekCount, nominal, dueWeekday) {
  const periods = [];
  let cur = new Date(startDateStr);
  const day = cur.getDay();
  cur.setDate(cur.getDate() + (day === 0 ? -6 : 1 - day));
  for (let i = 0; i < weekCount; i++) {
    const start = new Date(cur);
    const end = new Date(cur); end.setDate(end.getDate() + 6);
    periods.push({ id: uid(), label: `Minggu ${i + 1}`, order: i, start: start.toISOString(), end: end.toISOString(), nominal, dueWeekday: dueWeekday || 5, active: true });
    cur.setDate(cur.getDate() + 7);
  }
  return periods;
}
function periodStatus(paid, nominal) {
  if (!paid || paid <= 0) return "Belum Bayar";
  if (paid < nominal) return "Sebagian";
  return "Lunas";
}
const CATEGORIES = ["Acara kelas", "Perlengkapan kelas", "Kebersihan", "Kegiatan sekolah", "Konsumsi", "Lainnya"];

function computePaidMap(payments) {
  const map = {};
  for (const p of payments) map[p.studentId + "|" + p.periodId] = (map[p.studentId + "|" + p.periodId] || 0) + p.amount;
  return map;
}
function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================== tiny UI atoms ============================== */

function StampBadge({ status }) {
  const styles = { "Lunas": "text-emerald-700 border-emerald-700", "Sebagian": "text-amber-700 border-amber-700", "Belum Bayar": "text-stone-400 border-stone-300" };
  const icon = { "Lunas": <CheckCircle2 size={11} />, "Sebagian": <CircleDot size={11} />, "Belum Bayar": <CircleDashed size={11} /> }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}
      style={{ fontFamily: "'IBM Plex Mono', monospace", transform: status === "Lunas" ? "rotate(-2deg)" : "none" }}>
      {icon}{status}
    </span>
  );
}
function Money({ value, className = "", positive, negative }) {
  const sign = positive ? "text-emerald-700" : negative ? "text-rose-700" : "text-[#1B2A2E]";
  return <span className={`tabular-nums ${sign} ${className}`} style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupiah(value)}</span>;
}
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "sm:max-w-xl" : "sm:max-w-md"} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-[#FCFBF9] shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#E4E0D6] bg-[#FCFBF9] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-[#5B6B6E] hover:bg-[#EFEBE2]"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;
  return (
    <Modal title={dialog.title || "Konfirmasi"} onClose={onClose}>
      <p className="text-sm text-[#4A5658] leading-relaxed">{dialog.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-[#5B6B6E] hover:bg-[#EFEBE2]">Batal</button>
        <button onClick={() => { dialog.onConfirm(); onClose(); }} className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800">{dialog.confirmLabel || "Hapus"}</button>
      </div>
    </Modal>
  );
}
function Field({ label, children }) {
  return <label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-[#5B6B6E]">{label}</span>{children}</label>;
}
const inputCls = "w-full rounded-md border border-[#DEDAD1] bg-white px-3 py-2 text-sm text-[#1B2A2E] outline-none focus:border-[#1F6F5C] focus:ring-1 focus:ring-[#1F6F5C]";

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#DEDAD1] bg-white/50 py-14 text-center">
      <Icon size={26} className="mb-2 text-[#B7AF9E]" />
      <p className="text-sm font-medium text-[#5B6B6E]">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-[#8A8578]">{hint}</p>}
    </div>
  );
       }
/* ============================== Landing ============================== */

function Landing({ onCreate, onEnter, toast }) {
  const [mode, setMode] = useState(null);
  const [classIdInput, setClassIdInput] = useState("");
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRecent(getRecentClasses()); }, []);

  const doEnter = async (idRaw) => {
    const id = idRaw.trim().toUpperCase();
    if (!id) return;
    if (!supabaseConfigured) { toast("Supabase belum dikonfigurasi. Lihat README untuk setup .env.", "error"); return; }
    setBusy(true);
    try {
      const data = await fetchClass(id);
      setBusy(false);
      if (!data) { toast("Kelas tidak ditemukan. Periksa kembali Kode Kelas.", "error"); return; }
      onEnter(id, data);
    } catch (e) {
      setBusy(false);
      toast("Gagal terhubung ke database. Cek koneksi internet.", "error");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F6F3] px-6" style={{ backgroundImage: "repeating-linear-gradient(#F7F6F3 0px, #F7F6F3 27px, #ECE8DD 28px)" }}>
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#1F6F5C] text-white"><Wallet size={22} /></div>
          <h1 className="text-3xl font-bold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>KasKelas</h1>
          <p className="mt-1.5 text-sm text-[#5B6B6E]">Kelola kas kelas dengan lebih mudah.</p>
        </div>

        {!supabaseConfigured && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800">
            Supabase belum dikonfigurasi. Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code> — lihat README.
          </div>
        )}

        {mode === "enter" ? (
          <div className="rounded-xl border border-[#E4E0D6] bg-white p-5 shadow-sm">
            <Field label="Kode Kelas">
              <input autoFocus value={classIdInput} onChange={(e) => setClassIdInput(e.target.value.toUpperCase())}
                placeholder="Contoh: SMA70-X1-26" className={inputCls} onKeyDown={(e) => e.key === "Enter" && doEnter(classIdInput)} />
            </Field>
            {recent.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {recent.map((r) => <button key={r} onClick={() => setClassIdInput(r)} className="rounded-full border border-[#DEDAD1] px-2.5 py-1 text-[11px] text-[#5B6B6E] hover:border-[#1F6F5C]">{r}</button>)}
              </div>
            )}
            <button disabled={busy} onClick={() => doEnter(classIdInput)} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white hover:bg-[#195a4a] disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} {busy ? "Memuat..." : "Masuk"}
            </button>
            <button onClick={() => setMode(null)} className="mt-2 w-full text-center text-xs text-[#8A8578]">Kembali</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button onClick={() => setMode("enter")} className="w-full rounded-md border border-[#1B2A2E] bg-[#1B2A2E] py-2.5 text-sm font-semibold text-white hover:opacity-90">Masuk</button>
            <button onClick={onCreate} className="w-full rounded-md border border-[#DEDAD1] bg-white py-2.5 text-sm font-semibold text-[#1B2A2E] hover:border-[#1F6F5C]">Buat Kelas</button>
          </div>
        )}
        <p className="mt-8 text-center text-[11px] leading-relaxed text-[#A6A08F]">Setiap kelas punya Kode Kelas &amp; ruang data sendiri di database — tersimpan permanen, bisa diakses dari perangkat mana pun.</p>
      </div>
    </div>
  );
}

/* ============================== Setup Wizard ============================== */

function SetupWizard({ onDone, toast }) {
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState({ schoolName: "", className: "", schoolYear: "", treasurerName: "", studentCount: "" });
  const [adminCode, setAdminCode] = useState("");
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([{ id: uid(), no: 1, name: "", absen: "1", active: true }]);
  const [bulkText, setBulkText] = useState("");
  const [kasType, setKasType] = useState("bulanan");
  const [nominal, setNominal] = useState(20000);
  const [dueDay, setDueDay] = useState(10);
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [weekCount, setWeekCount] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meta.schoolName || meta.className || meta.schoolYear) setClassId(suggestClassId(meta.schoolName, meta.className, meta.schoolYear));
  }, [meta.schoolName, meta.className, meta.schoolYear]);

  const addStudentRow = () => setStudents((s) => [...s, { id: uid(), no: s.length + 1, name: "", absen: String(s.length + 1), active: true }]);
  const removeStudentRow = (id) => setStudents((s) => s.filter((x) => x.id !== id).map((x, i) => ({ ...x, no: i + 1 })));
  const updateStudentRow = (id, field, val) => setStudents((s) => s.map((x) => (x.id === id ? { ...x, [field]: val } : x)));

  const applyBulk = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const parsed = lines.map((l, i) => {
      const parts = l.split(/[;,\t]/).map((p) => p.trim());
      if (parts.length >= 2) return { id: uid(), no: i + 1, name: parts[1], absen: parts[0], active: true };
      return { id: uid(), no: i + 1, name: parts[0], absen: String(i + 1), active: true };
    });
    setStudents(parsed); setBulkText("");
    toast(`${parsed.length} siswa ditambahkan dari daftar.`, "success");
  };

  const canNext = [!!(meta.schoolName && meta.className && meta.schoolYear && meta.treasurerName && adminCode), students.filter((s) => s.name.trim()).length > 0, true];

  const finish = async () => {
    if (!classId.trim()) { toast("Kode Kelas wajib diisi.", "error"); return; }
    if (!supabaseConfigured) { toast("Supabase belum dikonfigurasi. Lihat README.", "error"); return; }
    const cleanStudents = students.filter((s) => s.name.trim()).map((s, i) => ({ ...s, no: i + 1 }));
    const periods = kasType === "bulanan" ? generateMonthlyPeriods(Number(nominal), Number(dueDay)) : generateWeeklyPeriods(weekStart, Number(weekCount), Number(nominal), 5);
    const data = {
      meta: { ...meta, classId: classId.trim().toUpperCase(), kasType, nominal: Number(nominal), dueDay: Number(dueDay), createdAt: new Date().toISOString() },
      students: cleanStudents, periods, payments: [], expenses: [],
      auditLog: [{ id: uid(), timestamp: new Date().toISOString(), action: "Kelas dibuat", detail: `${meta.className} — ${meta.schoolName}` }],
    };
    setSaving(true);
    try {
      const ok = await createClass(classId.trim().toUpperCase(), adminCode, data);
      setSaving(false);
      if (!ok) { toast("Kode Kelas ini sudah dipakai. Coba kode lain.", "error"); return; }
      rememberRecentClass(classId.trim().toUpperCase());
      storeAdminCode(classId.trim().toUpperCase(), adminCode);
      onDone(classId.trim().toUpperCase(), data, adminCode);
    } catch (e) {
      setSaving(false);
      toast("Gagal membuat kelas. Cek koneksi & konfigurasi Supabase.", "error");
    }
  };

  const steps = ["Data Kelas", "Daftar Siswa", "Sistem Kas", "Konfirmasi"];
  return (
    <div className="min-h-screen bg-[#F7F6F3] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= step ? "bg-[#1F6F5C] text-white" : "bg-[#E4E0D6] text-[#8A8578]"}`}>{i + 1}</div>
              {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-[#1F6F5C]" : "bg-[#E4E0D6]"}`} />}
            </React.Fragment>
          ))}
        </div>
        <h2 className="mb-4 text-lg font-semibold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>{steps[step]}</h2>

        <div className="rounded-xl border border-[#E4E0D6] bg-white p-5 shadow-sm">
          {step === 0 && (
            <>
              <Field label="Nama Sekolah"><input className={inputCls} value={meta.schoolName} onChange={(e) => setMeta({ ...meta, schoolName: e.target.value })} placeholder="SMA Negeri 70 Jakarta" /></Field>
              <Field label="Nama Kelas"><input className={inputCls} value={meta.className} onChange={(e) => setMeta({ ...meta, className: e.target.value })} placeholder="XII IPA 1" /></Field>
              <Field label="Tahun Ajaran"><input className={inputCls} value={meta.schoolYear} onChange={(e) => setMeta({ ...meta, schoolYear: e.target.value })} placeholder="2026/2027" /></Field>
              <Field label="Nama Bendahara"><input className={inputCls} value={meta.treasurerName} onChange={(e) => setMeta({ ...meta, treasurerName: e.target.value })} placeholder="Nama bendahara kelas" /></Field>
              <Field label="Jumlah Siswa (perkiraan)"><input type="number" className={inputCls} value={meta.studentCount} onChange={(e) => setMeta({ ...meta, studentCount: e.target.value })} placeholder="36" /></Field>
              <Field label="Kode Kelas (Class ID)">
                <input className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value.toUpperCase())} />
                <span className="mt-1 block text-[11px] text-[#8A8578]">Bagikan kode ini ke teman sekelas agar bisa masuk ke ruang kas yang sama.</span>
              </Field>
              <Field label="Kode Admin (untuk bendahara)">
                <input className={inputCls} value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="Bebas, mis. BEN2026" />
                <span className="mt-1 block text-[11px] text-[#8A8578]">Dibutuhkan agar bisa masuk sebagai Admin (bisa edit data). Disimpan terenkripsi di database.</span>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <div className="mb-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {students.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-[#8A8578]">{s.no}</span>
                    <input className={inputCls + " flex-1"} placeholder="Nama siswa" value={s.name} onChange={(e) => updateStudentRow(s.id, "name", e.target.value)} />
                    <input className={inputCls + " w-16"} placeholder="Absen" value={s.absen} onChange={(e) => updateStudentRow(s.id, "absen", e.target.value)} />
                    <button onClick={() => removeStudentRow(s.id)} className="shrink-0 rounded p-1.5 text-[#B7AF9E] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addStudentRow} className="mb-4 flex items-center gap-1 text-xs font-medium text-[#1F6F5C]"><Plus size={13} /> Tambah baris</button>
              <div className="rounded-md border border-dashed border-[#DEDAD1] p-3">
                <span className="mb-1.5 block text-xs font-medium text-[#5B6B6E]">Atau tempel daftar siswa (satu per baris, format: absen;nama)</span>
                <textarea className={inputCls + " h-20 font-mono text-xs"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"1;Andi Saputra\n2;Budi Santoso"} />
                <button onClick={applyBulk} className="mt-2 rounded-md bg-[#EFEBE2] px-3 py-1.5 text-xs font-medium text-[#1B2A2E] hover:bg-[#E4E0D6]">Terapkan daftar</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Sistem Pembayaran Kas">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setKasType("bulanan")} className={`rounded-md border px-3 py-2 text-sm font-medium ${kasType === "bulanan" ? "border-[#1F6F5C] bg-[#E4EFEA] text-[#1F6F5C]" : "border-[#DEDAD1] text-[#5B6B6E]"}`}>Kas Bulanan</button>
                  <button onClick={() => setKasType("mingguan")} className={`rounded-md border px-3 py-2 text-sm font-medium ${kasType === "mingguan" ? "border-[#1F6F5C] bg-[#E4EFEA] text-[#1F6F5C]" : "border-[#DEDAD1] text-[#5B6B6E]"}`}>Kas Mingguan</button>
                </div>
              </Field>
              <Field label="Nominal Kas per Periode (Rp)"><input type="number" className={inputCls} value={nominal} onChange={(e) => setNominal(e.target.value)} /></Field>
              {kasType === "bulanan" ? (
                <Field label="Tanggal Jatuh Tempo (setiap bulan)"><input type="number" min={1} max={28} className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
              ) : (
                <>
                  <Field label="Mulai Minggu Ke-1 (tanggal)"><input type="date" className={inputCls} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /></Field>
                  <Field label="Jumlah Minggu Dibuat"><input type="number" className={inputCls} value={weekCount} onChange={(e) => setWeekCount(e.target.value)} /></Field>
                  <span className="text-[11px] text-[#8A8578]">Periode dibuat otomatis per rentang Senin–Minggu. Bisa diubah lagi nanti.</span>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-[#F7F6F3] p-3">
                <p className="font-semibold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>{meta.className} — {meta.schoolName}</p>
                <p className="text-xs text-[#5B6B6E]">Tahun Ajaran {meta.schoolYear} · Bendahara {meta.treasurerName}</p>
              </div>
              <div className="flex justify-between border-b border-[#EFEBE2] py-1.5"><span className="text-[#5B6B6E]">Kode Kelas</span><span className="font-mono font-semibold">{classId}</span></div>
              <div className="flex justify-between border-b border-[#EFEBE2] py-1.5"><span className="text-[#5B6B6E]">Jumlah Siswa</span><span>{students.filter((s) => s.name.trim()).length} siswa</span></div>
              <div className="flex justify-between border-b border-[#EFEBE2] py-1.5"><span className="text-[#5B6B6E]">Sistem Kas</span><span className="capitalize">{kasType} — {rupiah(nominal)}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#5B6B6E]">Jumlah Periode</span><span>{kasType === "bulanan" ? "12 bulan" : `${weekCount} minggu`}</span></div>
              <p className="pt-1 text-[11px] text-[#8A8578]">Data akan disimpan permanen ke database, bukan hanya di perangkat ini.</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-[#5B6B6E] disabled:opacity-0"><ChevronLeft size={15} /> Kembali</button>
          {step < 3 ? (
            <button disabled={!canNext[step]} onClick={() => setStep((s) => s + 1)} className="flex items-center gap-1 rounded-md bg-[#1F6F5C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Lanjut <ChevronRight size={15} /></button>
          ) : (
            <button disabled={saving} onClick={finish} className="flex items-center gap-1 rounded-md bg-[#1F6F5C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saving ? "Menyimpan..." : "Buat Kelas"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
                    }
/* ============================== Dashboard ============================== */

function DashboardPage({ data, activePeriodId, setActivePeriodId, openQuickExpense, role }) {
  const totals = useMemo(() => {
    const income = data.payments.reduce((a, p) => a + p.amount, 0);
    const expense = data.expenses.reduce((a, e) => a + e.amount, 0);
    return { income, expense, saldo: income - expense };
  }, [data.payments, data.expenses]);

  const activePeriod = data.periods.find((p) => p.id === activePeriodId) || data.periods[0];
  const paidMap = useMemo(() => computePaidMap(data.payments), [data.payments]);
  const activeStudents = data.students.filter((s) => s.active);

  const { paidCount, unpaidCount, tagihan } = useMemo(() => {
    if (!activePeriod) return { paidCount: 0, unpaidCount: 0, tagihan: 0 };
    let paid = 0;
    for (const s of activeStudents) if ((paidMap[s.id + "|" + activePeriod.id] || 0) >= activePeriod.nominal) paid++;
    return { paidCount: paid, unpaidCount: activeStudents.length - paid, tagihan: activeStudents.length * activePeriod.nominal };
  }, [activePeriod, activeStudents, paidMap]);

  const pct = activeStudents.length ? Math.round((paidCount / activeStudents.length) * 100) : 0;
  const chartData = data.periods.map((p) => ({ name: p.label.replace("Minggu ", "M"), Pemasukan: data.payments.filter((pay) => pay.periodId === p.id).reduce((a, b) => a + b.amount, 0) }));
  const recent = [...data.payments.map((p) => ({ ...p, kind: "in" })), ...data.expenses.map((e) => ({ ...e, kind: "out", name: e.name }))]
    .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)).slice(0, 6);

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <div className="rounded-xl border border-[#E4E0D6] bg-white p-5 shadow-sm" style={{ backgroundImage: "repeating-linear-gradient(#FFFFFF 0px, #FFFFFF 25px, #F3F1EA 26px)" }}>
        <p className="text-xs font-medium uppercase tracking-wider text-[#8A8578]">Saldo Kas Saat Ini</p>
        <p className="mt-1 text-4xl font-bold text-[#1B2A2E]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupiah(totals.saldo)}</p>
        <div className="mt-3 flex gap-4 text-xs">
          <span className="flex items-center gap-1 text-emerald-700"><TrendingUp size={13} /> {rupiah(totals.income)}</span>
          <span className="flex items-center gap-1 text-rose-700"><TrendingDown size={13} /> {rupiah(totals.expense)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4"><p className="text-[11px] font-medium text-[#8A8578]">Pemasukan</p><Money value={totals.income} positive className="mt-1 block text-lg font-semibold" /></div>
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4"><p className="text-[11px] font-medium text-[#8A8578]">Pengeluaran</p><Money value={totals.expense} negative className="mt-1 block text-lg font-semibold" /></div>
      </div>

      {activePeriod && (
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#8A8578]">Periode berjalan</p>
              <select value={activePeriodId} onChange={(e) => setActivePeriodId(e.target.value)} className="mt-0.5 rounded border-none bg-transparent p-0 text-sm font-semibold text-[#1B2A2E] outline-none">
                {data.periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {unpaidCount > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"><AlertCircle size={12} /> {unpaidCount} belum bayar</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFEBE2]"><div className="h-full rounded-full bg-[#1F6F5C]" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1.5 flex justify-between text-[11px] text-[#8A8578]"><span>{paidCount} / {activeStudents.length} lunas ({pct}%)</span><span>Tagihan periode: {rupiah(tagihan)}</span></div>
        </div>
      )}

      {role === "admin" && (
        <button onClick={openQuickExpense} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#DEDAD1] bg-white py-2.5 text-sm font-semibold text-[#5B6B6E]"><Plus size={15} /> Catat Pengeluaran</button>
      )}

      {chartData.some((c) => c.Pemasukan > 0) && (
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
          <p className="mb-3 text-xs font-medium text-[#8A8578]">Pemasukan per Periode</p>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer><BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEBE2" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8A8578" }} axisLine={false} tickLine={false} interval={Math.ceil(chartData.length / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#8A8578" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => rupiah(v)} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#E4E0D6" }} />
              <Bar dataKey="Pemasukan" fill="#1F6F5C" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-[#8A8578]">Transaksi Terbaru</p>
        {recent.length === 0 ? <EmptyState icon={Receipt} title="Belum ada transaksi" hint="Transaksi pembayaran & pengeluaran akan muncul di sini." /> : (
          <div className="divide-y divide-[#EFEBE2] rounded-lg border border-[#E4E0D6] bg-white">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#1B2A2E]">{t.kind === "in" ? (data.students.find((s) => s.id === t.studentId)?.name || "Siswa") : t.name}</p>
                  <p className="text-[11px] text-[#8A8578]">{fmtDateShort(t.date)}</p>
                </div>
                <Money value={t.amount} positive={t.kind === "in"} negative={t.kind === "out"} className="text-sm font-semibold" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== Students / Kas Siswa ============================== */

function StudentsCashPage({ data, mutate, role, toast, confirm }) {
  const [search, setSearch] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const paidMap = useMemo(() => computePaidMap(data.payments), [data.payments]);
  const filtered = data.students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B7AF9E]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama siswa..." className={inputCls + " pl-9"} />
        </div>
        {role === "admin" && <button onClick={() => setShowManage(true)} className="shrink-0 rounded-md border border-[#DEDAD1] bg-white px-3 py-2 text-sm font-medium text-[#5B6B6E]">Kelola</button>}
      </div>

      {data.students.length === 0 ? <EmptyState icon={Users} title="Belum ada siswa" hint="Tambahkan siswa lewat tombol Kelola." /> : (
        <div className="overflow-x-auto rounded-lg border border-[#E4E0D6] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4E0D6] text-left text-[11px] uppercase tracking-wide text-[#8A8578]">
                <th className="sticky left-0 z-10 bg-white px-3 py-2.5">Nama</th>
                {data.periods.map((p) => <th key={p.id} className="px-3 py-2.5 text-center font-medium">{p.label}</th>)}
                <th className="px-3 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE2]">
              {filtered.map((s) => {
                const totalPaid = data.periods.reduce((a, p) => a + (paidMap[s.id + "|" + p.id] || 0), 0);
                return (
                  <tr key={s.id} className={!s.active ? "opacity-40" : ""}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-medium text-[#1B2A2E]">{s.name}</td>
                    {data.periods.map((p) => {
                      const paid = paidMap[s.id + "|" + p.id] || 0;
                      const status = periodStatus(paid, p.nominal);
                      return (
                        <td key={p.id} className="px-3 py-2.5 text-center">
                          <button disabled={role !== "admin"} onClick={() => setPayModal({ studentId: s.id, periodId: p.id })} className="disabled:cursor-default">
                            <StampBadge status={status} />
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right"><Money value={totalPaid} className="text-xs font-semibold" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {payModal && <PaymentModal data={data} mutate={mutate} initial={payModal} onClose={() => setPayModal(null)} toast={toast} />}
      {showManage && <ManageStudentsModal data={data} mutate={mutate} onClose={() => setShowManage(false)} toast={toast} confirm={confirm} />}
    </div>
  );
  function PaymentModal({ data, mutate, initial, onClose, toast }) {
  const student = data.students.find((s) => s.id === initial.studentId);
  const period = data.periods.find((p) => p.id === initial.periodId);
  const paidSoFar = data.payments.filter((p) => p.studentId === initial.studentId && p.periodId === initial.periodId).reduce((a, b) => a + b.amount, 0);
  const [amount, setAmount] = useState(Math.max(period.nominal - paidSoFar, 0));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const save = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast("Nominal pembayaran tidak valid.", "error"); return; }
    mutate((d) => {
      d.payments.push({ id: uid(), studentId: initial.studentId, periodId: initial.periodId, amount: amt, date: new Date(date).toISOString(), note, timestamp: new Date().toISOString() });
      d.auditLog.unshift({ id: uid(), timestamp: new Date().toISOString(), action: "Pembayaran dicatat", detail: `${student.name} — ${period.label} — ${rupiah(amt)}` });
      return d;
    });
    toast(`Pembayaran ${student.name} untuk ${period.label} tersimpan.`, "success");
    onClose();
  };

  return (
    <Modal title={`Bayar Kas — ${period.label}`} onClose={onClose}>
      <p className="mb-3 text-sm text-[#5B6B6E]">{student.name} · Sudah dibayar: <Money value={paidSoFar} className="font-semibold" /> dari {rupiah(period.nominal)}</p>
      <Field label="Nominal (Rp)"><input type="number" autoFocus className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Tanggal Pembayaran"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Catatan (opsional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. dibayar tunai" /></Field>
      <button onClick={save} className="mt-1 w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Simpan Pembayaran</button>
    </Modal>
  );
}

function ManageStudentsModal({ data, mutate, onClose, toast, confirm }) {
  const [rows, setRows] = useState(data.students);
  const addRow = () => setRows((r) => [...r, { id: uid(), no: r.length + 1, name: "", absen: String(r.length + 1), active: true }]);
  const updateRow = (id, field, val) => setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  const removeRow = (id, name) => confirm({ title: "Hapus Siswa", message: `Hapus ${name || "siswa ini"}? Riwayat pembayaran siswa ini akan tetap tersimpan di transaksi.`, onConfirm: () => setRows((r) => r.filter((x) => x.id !== id)) });
  const save = () => { mutate((d) => { d.students = rows.filter((r) => r.name.trim()).map((r, i) => ({ ...r, no: i + 1 })); return d; }); toast("Data siswa diperbarui.", "success"); onClose(); };
  return (
    <Modal title="Kelola Siswa" onClose={onClose} wide>
      <div className="mb-3 max-h-96 space-y-2 overflow-y-auto pr-1">
        {rows.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <input className={inputCls + " flex-1"} value={s.name} onChange={(e) => updateRow(s.id, "name", e.target.value)} placeholder="Nama siswa" />
            <input className={inputCls + " w-16"} value={s.absen} onChange={(e) => updateRow(s.id, "absen", e.target.value)} placeholder="Absen" />
            <button onClick={() => updateRow(s.id, "active", !s.active)} className={`shrink-0 rounded px-2 py-1.5 text-[11px] font-medium ${s.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{s.active ? "Aktif" : "Nonaktif"}</button>
            <button onClick={() => removeRow(s.id, s.name)} className="shrink-0 rounded p-1.5 text-[#B7AF9E] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="mb-4 flex items-center gap-1 text-xs font-medium text-[#1F6F5C]"><Plus size={13} /> Tambah siswa</button>
      <button onClick={save} className="w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Simpan Perubahan</button>
    </Modal>
  );
}

/* ============================== Transactions ============================== */

function TransactionsPage({ data, mutate, role, confirm, toast }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editTx, setEditTx] = useState(null);

  const all = useMemo(() => {
    const list = [
      ...data.payments.map((p) => ({ ...p, kind: "in", name: data.students.find((s) => s.id === p.studentId)?.name || "Siswa", sub: data.periods.find((pd) => pd.id === p.periodId)?.label })),
      ...data.expenses.map((e) => ({ ...e, kind: "out", sub: e.category })),
    ].sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
    let running = 0;
    return list.map((t) => { running += t.kind === "in" ? t.amount : -t.amount; return { ...t, saldoAfter: running }; }).reverse();
  }, [data.payments, data.expenses, data.students, data.periods]);

  const filtered = all.filter((t) => {
    if (filter === "in" && t.kind !== "in") return false;
    if (filter === "out" && t.kind !== "out") return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const del = (t) => confirm({
    title: "Hapus Transaksi", message: `Hapus transaksi "${t.name}" sebesar ${rupiah(t.amount)}? Saldo kas akan diperbarui otomatis.`,
    onConfirm: () => mutate((d) => {
      if (t.kind === "in") d.payments = d.payments.filter((p) => p.id !== t.id);
      else d.expenses = d.expenses.filter((e) => e.id !== t.id);
      d.auditLog.unshift({ id: uid(), timestamp: new Date().toISOString(), action: "Transaksi dihapus", detail: `${t.name} — ${rupiah(t.amount)}` });
      return d;
    }),
  });

  return (
    <div className="space-y-3 pb-24 sm:pb-6">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B7AF9E]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari transaksi..." className={inputCls + " pl-9"} />
      </div>
      <div className="flex gap-1.5">
        {[["all", "Semua"], ["in", "Pemasukan"], ["out", "Pengeluaran"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter === k ? "bg-[#1B2A2E] text-white" : "bg-white text-[#5B6B6E] border border-[#DEDAD1]"}`}>{l}</button>
        ))}
      </div>

      {filtered.length === 0 ? <EmptyState icon={Receipt} title="Tidak ada transaksi" /> : (
        <div className="divide-y divide-[#EFEBE2] rounded-lg border border-[#E4E0D6] bg-white">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.kind === "in" ? "bg-emerald-600" : "bg-rose-600"}`} />
                  <p className="truncate text-sm font-medium text-[#1B2A2E]">{t.name}</p>
                </div>
                <p className="text-[11px] text-[#8A8578]">{fmtDateShort(t.date)} · {t.sub}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <Money value={t.amount} positive={t.kind === "in"} negative={t.kind === "out"} className="block text-sm font-semibold" />
                  <span className="text-[10px] text-[#B7AF9E]">Saldo {rupiah(t.saldoAfter)}</span>
                </div>
                {role === "admin" && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setEditTx(t)} className="rounded p-1 text-[#B7AF9E] hover:bg-[#EFEBE2]"><Pencil size={13} /></button>
                    <button onClick={() => del(t)} className="rounded p-1 text-[#B7AF9E] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editTx && <EditTxModal tx={editTx} mutate={mutate} onClose={() => setEditTx(null)} toast={toast} />}
    </div>
  );
}

function EditTxModal({ tx, mutate, onClose, toast }) {
  const [amount, setAmount] = useState(tx.amount);
  const [date, setDate] = useState(new Date(tx.date).toISOString().slice(0, 10));
  const [note, setNote] = useState(tx.note || "");
  const save = () => {
    mutate((d) => {
      if (tx.kind === "in") d.payments = d.payments.map((p) => (p.id === tx.id ? { ...p, amount: Number(amount), date: new Date(date).toISOString(), note } : p));
      else d.expenses = d.expenses.map((e) => (e.id === tx.id ? { ...e, amount: Number(amount), date: new Date(date).toISOString(), note } : e));
      d.auditLog.unshift({ id: uid(), timestamp: new Date().toISOString(), action: "Transaksi diedit", detail: `${tx.name} — ${rupiah(amount)}` });
      return d;
    });
    toast("Transaksi diperbarui.", "success");
    onClose();
  };
  return (
    <Modal title="Edit Transaksi" onClose={onClose}>
      <Field label="Nominal (Rp)"><input type="number" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Tanggal"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Catatan"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button onClick={save} className="w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Simpan Perubahan</button>
    </Modal>
  );
}

/* ============================== Expenses ============================== */

function ExpensesPage({ data, mutate, role, confirm, toast }) {
  const [showAdd, setShowAdd] = useState(false);
  const sorted = [...data.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  const del = (e) => confirm({ title: "Hapus Pengeluaran", message: `Hapus "${e.name}" sebesar ${rupiah(e.amount)}?`, onConfirm: () => mutate((d) => { d.expenses = d.expenses.filter((x) => x.id !== e.id); return d; }) });
  return (
    <div className="space-y-3 pb-24 sm:pb-6">
      {role === "admin" && <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1F6F5C] bg-[#E4EFEA] py-2.5 text-sm font-semibold text-[#1F6F5C]"><Plus size={15} /> Catat Pengeluaran</button>}
      {sorted.length === 0 ? <EmptyState icon={Wallet} title="Belum ada pengeluaran" /> : (
        <div className="divide-y divide-[#EFEBE2] rounded-lg border border-[#E4E0D6] bg-white">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#1B2A2E]">{e.name}</p>
                <p className="text-[11px] text-[#8A8578]">{fmtDateShort(e.date)} · {e.category}{e.note ? ` · ${e.note}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Money value={e.amount} negative className="text-sm font-semibold" />
                {role === "admin" && <button onClick={() => del(e)} className="rounded p-1 text-[#B7AF9E] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && <AddExpenseModal mutate={mutate} onClose={() => setShowAdd(false)} toast={toast} />}
    </div>
  );
}

function AddExpenseModal({ mutate, onClose, toast }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const save = () => {
    if (!name.trim() || !amount || Number(amount) <= 0) { toast("Nama dan nominal wajib diisi.", "error"); return; }
    mutate((d) => {
      d.expenses.push({ id: uid(), name: name.trim(), category, amount: Number(amount), date: new Date(date).toISOString(), note, timestamp: new Date().toISOString() });
      d.auditLog.unshift({ id: uid(), timestamp: new Date().toISOString(), action: "Pengeluaran dicatat", detail: `${name} — ${rupiah(amount)}` });
      return d;
    });
    toast("Pengeluaran tersimpan.", "success");
    onClose();
  };
  return (
    <Modal title="Catat Pengeluaran" onClose={onClose}>
      <Field label="Nama Pengeluaran"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Dekorasi kelas" /></Field>
      <Field label="Kategori"><select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
      <Field label="Nominal (Rp)"><input type="number" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Tanggal"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Keterangan (opsional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button onClick={save} className="w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Simpan Pengeluaran</button>
    </Modal>
  );
                                       }
                                                                                                                           }
/* ============================== Reports ============================== */

function ReportsPage({ data }) {
  const [periodFilter, setPeriodFilter] = useState("all");
  const paidMap = useMemo(() => computePaidMap(data.payments), [data.payments]);
  const activeStudents = data.students.filter((s) => s.active);
  const income = data.payments.reduce((a, p) => a + p.amount, 0);
  const expense = data.expenses.reduce((a, e) => a + e.amount, 0);

  const rekapSiswa = activeStudents.map((s) => ({ name: s.name, total: data.periods.reduce((a, p) => a + (paidMap[s.id + "|" + p.id] || 0), 0) })).sort((a, b) => b.total - a.total);
  const rekapPeriode = data.periods.map((p) => ({ name: p.label, Pemasukan: data.payments.filter((pay) => pay.periodId === p.id).reduce((a, b) => a + b.amount, 0) }));
  const sudahBayar = periodFilter !== "all" ? activeStudents.filter((s) => (paidMap[s.id + "|" + periodFilter] || 0) >= (data.periods.find((p) => p.id === periodFilter)?.nominal || Infinity)) : [];
  const belumBayar = periodFilter !== "all" ? activeStudents.filter((s) => !(paidMap[s.id + "|" + periodFilter] || 0) || (paidMap[s.id + "|" + periodFilter] || 0) < (data.periods.find((p) => p.id === periodFilter)?.nominal || 0)) : [];

  const exportRekapSiswa = () => downloadCSV("rekap-pembayaran-siswa.csv", [["No", "Nama", "Total Bayar"], ...rekapSiswa.map((r, i) => [i + 1, r.name, r.total])]);
  const exportPengeluaran = () => downloadCSV("rekap-pengeluaran.csv", [["Tanggal", "Nama", "Kategori", "Nominal", "Keterangan"], ...data.expenses.map((e) => [fmtDateShort(e.date), e.name, e.category, e.amount, e.note || ""])]);
  const exportBelumBayar = () => downloadCSV("belum-bayar.csv", [["No", "Nama"], ...belumBayar.map((s, i) => [i + 1, s.name])]);
  const exportLengkap = () => downloadCSV("laporan-kas-lengkap.csv", [["Ringkasan"], ["Total Pemasukan", income], ["Total Pengeluaran", expense], ["Saldo Akhir", income - expense], [], ["No", "Nama", "Total Bayar"], ...rekapSiswa.map((r, i) => [i + 1, r.name, r.total])]);

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <div className="no-print flex items-center justify-between gap-2">
        <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Semua Periode</option>
          {data.periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white px-3 py-2 text-xs font-medium text-[#5B6B6E]"><Printer size={13} /> Cetak / PDF</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-3"><p className="text-[10px] text-[#8A8578]">Pemasukan</p><Money value={income} positive className="text-sm font-semibold" /></div>
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-3"><p className="text-[10px] text-[#8A8578]">Pengeluaran</p><Money value={expense} negative className="text-sm font-semibold" /></div>
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-3"><p className="text-[10px] text-[#8A8578]">Saldo Akhir</p><Money value={income - expense} className="text-sm font-semibold" /></div>
      </div>

      {rekapPeriode.some((r) => r.Pemasukan > 0) && (
        <div className="no-print rounded-lg border border-[#E4E0D6] bg-white p-4">
          <p className="mb-3 text-xs font-medium text-[#8A8578]">Rekap Pemasukan per Periode</p>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer><LineChart data={rekapPeriode}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEBE2" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8A8578" }} axisLine={false} tickLine={false} interval={Math.ceil(rekapPeriode.length / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#8A8578" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => rupiah(v)} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#E4E0D6" }} />
              <Line type="monotone" dataKey="Pemasukan" stroke="#1F6F5C" strokeWidth={2} dot={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>
      )}

      {periodFilter !== "all" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#E4E0D6] bg-white p-4"><p className="mb-2 text-xs font-semibold text-emerald-700">Sudah Bayar ({sudahBayar.length})</p><ul className="space-y-1 text-sm text-[#1B2A2E]">{sudahBayar.map((s) => <li key={s.id}>{s.name}</li>)}</ul></div>
          <div className="rounded-lg border border-[#E4E0D6] bg-white p-4"><p className="mb-2 text-xs font-semibold text-rose-700">Belum Bayar ({belumBayar.length})</p><ul className="space-y-1 text-sm text-[#1B2A2E]">{belumBayar.map((s) => <li key={s.id}>{s.name}</li>)}</ul></div>
        </div>
      )}

      <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
        <p className="mb-2 text-xs font-medium text-[#8A8578]">Rekap Pembayaran Siswa</p>
        <div className="divide-y divide-[#EFEBE2]">{rekapSiswa.map((r) => <div key={r.name} className="flex justify-between py-1.5 text-sm"><span className="text-[#1B2A2E]">{r.name}</span><Money value={r.total} className="font-medium" /></div>)}</div>
      </div>

      <div className="no-print grid grid-cols-2 gap-2">
        <button onClick={exportRekapSiswa} className="flex items-center justify-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white py-2 text-xs font-medium text-[#5B6B6E]"><Download size={13} /> Rekap Siswa (CSV)</button>
        <button onClick={exportPengeluaran} className="flex items-center justify-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white py-2 text-xs font-medium text-[#5B6B6E]"><Download size={13} /> Pengeluaran (CSV)</button>
        <button onClick={exportBelumBayar} disabled={periodFilter === "all"} className="flex items-center justify-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white py-2 text-xs font-medium text-[#5B6B6E] disabled:opacity-40"><Download size={13} /> Belum Bayar (CSV)</button>
        <button onClick={exportLengkap} className="flex items-center justify-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white py-2 text-xs font-medium text-[#5B6B6E]"><Download size={13} /> Laporan Lengkap (CSV)</button>
      </div>

      <div className="print-only">
        <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-xl font-bold">LAPORAN KAS KELAS</h1>
        <p className="text-sm">{data.meta.schoolName}</p>
        <p className="text-sm">{data.meta.className} · Tahun Ajaran {data.meta.schoolYear}</p>
        <p className="mb-4 text-sm">Periode: {periodFilter === "all" ? "Semua Periode" : data.periods.find((p) => p.id === periodFilter)?.label}</p>
        <table className="w-full border-collapse text-sm">
          <thead><tr><th className="border p-1 text-left">Ringkasan</th><th className="border p-1 text-right">Nominal</th></tr></thead>
          <tbody>
            <tr><td className="border p-1">Total Pemasukan</td><td className="border p-1 text-right">{rupiah(income)}</td></tr>
            <tr><td className="border p-1">Total Pengeluaran</td><td className="border p-1 text-right">{rupiah(expense)}</td></tr>
            <tr><td className="border p-1">Saldo Akhir</td><td className="border p-1 text-right">{rupiah(income - expense)}</td></tr>
          </tbody>
        </table>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead><tr><th className="border p-1 text-left">No</th><th className="border p-1 text-left">Nama</th><th className="border p-1 text-right">Total Bayar</th></tr></thead>
          <tbody>{rekapSiswa.map((r, i) => <tr key={r.name}><td className="border p-1">{i + 1}</td><td className="border p-1">{r.name}</td><td className="border p-1 text-right">{rupiah(r.total)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== Settings ============================== */

function SettingsPage({ data, mutate, classId, role, toast, confirm, onLogout }) {
  const [meta, setMeta] = useState(data.meta);
  const saveMeta = () => { mutate((d) => { d.meta = { ...d.meta, ...meta }; return d; }); toast("Pengaturan disimpan.", "success"); };
  const resetData = () => confirm({
    title: "Hapus Semua Transaksi", message: "Semua data pembayaran dan pengeluaran akan dihapus permanen. Data siswa & pengaturan tetap tersimpan. Lanjutkan?",
    onConfirm: () => { mutate((d) => { d.payments = []; d.expenses = []; d.auditLog.unshift({ id: uid(), timestamp: new Date().toISOString(), action: "Reset transaksi", detail: "Semua pembayaran & pengeluaran dihapus" }); return d; }); toast("Data transaksi direset.", "success"); },
  });

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
        <p className="mb-3 text-xs font-medium text-[#8A8578]">Kode Kelas</p>
        <p className="rounded-md bg-[#F7F6F3] px-3 py-2 font-mono text-sm font-semibold text-[#1B2A2E]">{classId}</p>
      </div>

      {role === "admin" ? (
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
          <p className="mb-3 text-xs font-medium text-[#8A8578]">Data Kelas</p>
          <Field label="Nama Sekolah"><input className={inputCls} value={meta.schoolName} onChange={(e) => setMeta({ ...meta, schoolName: e.target.value })} /></Field>
          <Field label="Nama Kelas"><input className={inputCls} value={meta.className} onChange={(e) => setMeta({ ...meta, className: e.target.value })} /></Field>
          <Field label="Tahun Ajaran"><input className={inputCls} value={meta.schoolYear} onChange={(e) => setMeta({ ...meta, schoolYear: e.target.value })} /></Field>
          <Field label="Nama Bendahara"><input className={inputCls} value={meta.treasurerName} onChange={(e) => setMeta({ ...meta, treasurerName: e.target.value })} /></Field>
          <Field label="Nominal Kas per Periode (Rp)"><input type="number" className={inputCls} value={meta.nominal} onChange={(e) => setMeta({ ...meta, nominal: Number(e.target.value) })} /></Field>
          <button onClick={saveMeta} className="w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Simpan Pengaturan</button>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4 text-sm text-[#5B6B6E]">
          <p className="font-medium text-[#1B2A2E]">{meta.className} — {meta.schoolName}</p>
          <p className="mt-1">Tahun Ajaran {meta.schoolYear} · Bendahara {meta.treasurerName}</p>
        </div>
      )}

      {role === "admin" && data.auditLog?.length > 0 && (
        <div className="rounded-lg border border-[#E4E0D6] bg-white p-4">
          <p className="mb-2 text-xs font-medium text-[#8A8578]">Log Aktivitas</p>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {data.auditLog.slice(0, 30).map((l) => (
              <div key={l.id} className="text-xs">
                <span className="font-medium text-[#1B2A2E]">{l.action}</span>
                <span className="text-[#8A8578]"> — {l.detail}</span>
                <div className="text-[10px] text-[#B7AF9E]">{fmtDateShort(l.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {role === "admin" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
          <p className="mb-2 text-xs font-medium text-rose-700">Zona Berbahaya</p>
          <button onClick={resetData} className="w-full rounded-md border border-rose-300 bg-white py-2 text-sm font-medium text-rose-700">Hapus Semua Transaksi</button>
        </div>
      )}

      <button onClick={onLogout} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#DEDAD1] bg-white py-2.5 text-sm font-medium text-[#5B6B6E]"><LogOut size={14} /> Keluar dari Kelas</button>
    </div>
  );
}

/* ============================== Role gate ============================== */

function RoleGateModal({ meta, classId, onClose, onConfirm, toast }) {
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tryAdmin = async () => {
    setBusy(true); setError("");
    try {
      const ok = await verifyAdminCode(classId, code);
      setBusy(false);
      if (ok) onConfirm("admin", code);
      else setError("Kode admin salah.");
    } catch {
      setBusy(false);
      toast("Gagal memverifikasi. Cek koneksi internet.", "error");
    }
  };

  return (
    <Modal title={`Masuk ke ${meta.className}`} onClose={onClose}>
      <p className="mb-4 text-sm text-[#5B6B6E]">{meta.schoolName} · Tahun Ajaran {meta.schoolYear}</p>
      {mode !== "admin" ? (
        <div className="space-y-2">
          <button onClick={() => onConfirm("viewer", null)} className="w-full rounded-md border border-[#DEDAD1] bg-white py-2.5 text-sm font-semibold text-[#1B2A2E]">Masuk sebagai Viewer (lihat saja)</button>
          <button onClick={() => setMode("admin")} className="w-full rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white">Masuk sebagai Admin / Bendahara</button>
        </div>
      ) : (
        <>
          <Field label="Kode Admin"><input autoFocus className={inputCls} value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && tryAdmin()} /></Field>
          {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
          <button disabled={busy} onClick={tryAdmin} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1F6F5C] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} {busy ? "Memeriksa..." : "Masuk"}
          </button>
        </>
      )}
    </Modal>
  );
}

/* ============================== Shell ============================== */

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "students", label: "Kas Siswa", icon: Users },
  { key: "transactions", label: "Transaksi", icon: Receipt },
  { key: "expenses", label: "Pengeluaran", icon: Wallet },
  { key: "reports", label: "Laporan", icon: FileBarChart },
  { key: "settings", label: "Pengaturan", icon: SettingsIcon },
];

function Toast({ toast }) {
  if (!toast) return null;
  const styles = { success: "bg-[#1B2A2E] text-white", error: "bg-rose-700 text-white" };
  return <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 sm:bottom-6"><div className={`rounded-full px-4 py-2 text-xs font-medium shadow-lg ${styles[toast.type] || styles.success}`}>{toast.msg}</div></div>;
}

export default function App() {
  const [view, setView] = useState("landing");
  const [classId, setClassId] = useState(null);
  const [data, setData] = useState(null);
  const [role, setRole] = useState("viewer");
  const [adminCode, setAdminCode] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [now, setNow] = useState(jakartaNow());
  const [toastMsg, setToastMsg] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [activePeriodId, setActivePeriodId] = useState(null);
  const [showQuickExpense, setShowQuickExpense] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);

  const skipSave = useRef(true);
  const remoteUpdate = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => { const t = setInterval(() => setNow(jakartaNow()), 30000); return () => clearInterval(t); }, []);

  const toast = (msg, type = "success") => { setToastMsg({ msg, type }); setTimeout(() => setToastMsg(null), 2600); };
  const confirm = (d) => setConfirmDialog(d);

  useEffect(() => {
    if (!data || role !== "admin" || !classId || !adminCode) return;
    if (skipSave.current) { skipSave.current = false; return; }
    if (remoteUpdate.current) { remoteUpdate.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const ok = await saveClassData(classId, adminCode, data);
        if (!ok) toast("Gagal menyimpan — sesi admin mungkin tidak valid lagi.", "error");
      } catch { toast("Gagal menyimpan ke database. Cek koneksi internet.", "error"); }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  useEffect(() => {
    if (!classId) return;
    const t = setInterval(async () => {
      try {
        const fresh = await fetchClass(classId);
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(data)) { remoteUpdate.current = true; setData(fresh); }
      } catch {}
    }, 20000);
    return () => clearInterval(t);
  }, [classId, data]);

  useEffect(() => { if (data && data.periods.length && !activePeriodId) setActivePeriodId(data.periods[0].id); }, [data]);

  const mutate = (updater) => setData((prev) => updater(JSON.parse(JSON.stringify(prev))));

  const enterClass = (id, loadedData, chosenRole, code) => {
    setClassId(id); skipSave.current = true; setData(loadedData);
    setRole(chosenRole || "viewer"); setAdminCode(code || null);
    setView("app"); setPage("dashboard");
    rememberRecentClass(id);
  };

  const handleEnterRequest = async (id, loadedData) => {
    const stored = getStoredAdminCode(id);
    if (stored) {
      try {
        const ok = await verifyAdminCode(id, stored);
        if (ok) { enterClass(id, loadedData, "admin", stored); return; }
        clearStoredAdminCode(id);
      } catch {}
    }
    setPendingRole({ id, data: loadedData });
  };

  if (view === "landing") {
    return (
      <>
        <Landing onCreate={() => setView("setup")} onEnter={handleEnterRequest} toast={toast} />
        {pendingRole && (
          <RoleGateModal meta={pendingRole.data.meta} classId={pendingRole.id} onClose={() => setPendingRole(null)} toast={toast}
            onConfirm={(role, code) => { if (role === "admin" && code) storeAdminCode(pendingRole.id, code); enterClass(pendingRole.id, pendingRole.data, role, code); setPendingRole(null); }} />
        )}
        <Toast toast={toastMsg} />
      </>
    );
  }

  if (view === "setup") {
    return (
      <>
        <button onClick={() => setView("landing")} className="fixed left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#5B6B6E] shadow-sm"><ArrowLeft size={13} /> Kembali</button>
        <SetupWizard onDone={(id, d, code) => enterClass(id, d, "admin", code)} toast={toast} />
        <Toast toast={toastMsg} />
      </>
    );
  }

  if (!data) return null;
  const pageProps = { data, mutate, role, toast, confirm };

  return (
    <div className="min-h-screen bg-[#F7F6F3]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`.print-only{display:none}@media print{.no-print,nav,header{display:none !important}.print-only{display:block !important}body{background:white}}`}</style>

      <div className="hidden sm:fixed sm:inset-y-0 sm:left-0 sm:flex sm:w-56 sm:flex-col sm:border-r sm:border-[#E4E0D6] sm:bg-white">
        <div className="flex items-center gap-2 border-b border-[#E4E0D6] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1F6F5C] text-white"><Wallet size={16} /></div>
          <div><p className="text-sm font-bold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>KasKelas</p><p className="text-[10px] text-[#8A8578]">{data.meta.className}</p></div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setPage(n.key)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${page === n.key ? "bg-[#E4EFEA] text-[#1F6F5C]" : "text-[#5B6B6E] hover:bg-[#F7F6F3]"}`}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#E4E0D6] px-4 py-3">
          <p className="flex items-center gap-1 text-[10px] font-medium text-[#8A8578]">{role === "admin" ? <ShieldCheck size={12} /> : <Eye size={12} />} {role === "admin" ? "Admin" : "Viewer"}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-[#B7AF9E]"><Clock size={11} /> {now}</p>
        </div>
      </div>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E4E0D6] bg-white/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1F6F5C] text-white"><Wallet size={14} /></div>
          <p className="text-sm font-bold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>{NAV.find((n) => n.key === page)?.label}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-[#F7F6F3] px-2 py-1 text-[10px] font-medium text-[#5B6B6E]">{role === "admin" ? <ShieldCheck size={11} /> : <Eye size={11} />} {role === "admin" ? "Admin" : "Viewer"}</span>
      </div>

      <main className="px-4 py-4 sm:ml-56 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-3xl">
          <div className="no-print mb-4 hidden items-center justify-between sm:flex">
            <h2 className="text-xl font-semibold text-[#1B2A2E]" style={{ fontFamily: "'Fraunces', serif" }}>{NAV.find((n) => n.key === page)?.label}</h2>
          </div>
          {page === "dashboard" && <DashboardPage data={data} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} openQuickExpense={() => setShowQuickExpense(true)} role={role} />}
          {page === "students" && <StudentsCashPage {...pageProps} />}
          {page === "transactions" && <TransactionsPage {...pageProps} />}
          {page === "expenses" && <ExpensesPage {...pageProps} />}
          {page === "reports" && <ReportsPage data={data} />}
          {page === "settings" && <SettingsPage data={data} mutate={mutate} classId={classId} role={role} toast={toast} confirm={confirm} onLogout={() => { setView("landing"); setData(null); setClassId(null); setPage("dashboard"); }} />}
        </div>
      </main>

      <nav className="no-print fixed bottom-0 left-0 right-0 z-30 flex border-t border-[#E4E0D6] bg-white/95 backdrop-blur sm:hidden">
        {NAV.slice(0, 5).map((n) => (
          <button key={n.key} onClick={() => setPage(n.key)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${page === n.key ? "text-[#1F6F5C]" : "text-[#8A8578]"}`}><n.icon size={18} /> {n.label}</button>
        ))}
      </nav>

      {showQuickExpense && <AddExpenseModal mutate={mutate} onClose={() => setShowQuickExpense(false)} toast={toast} />}
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <Toast toast={toastMsg} />
    </div>
  );
}
