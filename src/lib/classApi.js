import { supabase } from "./supabaseClient";

// Membaca data kelas (publik — hanya butuh tahu Kode Kelas).
export async function fetchClass(classId) {
  const { data, error } = await supabase
    .from("classes_public")
    .select("data, updated_at")
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

// Membuat kelas baru. Mengembalikan false jika Kode Kelas sudah dipakai.
export async function createClass(classId, adminCode, payload) {
  const { data, error } = await supabase.rpc("create_class", {
    p_class_id: classId,
    p_admin_code: adminCode,
    p_data: payload,
  });
  if (error) throw error;
  return data === true;
}

// Menyimpan perubahan. Hanya berhasil jika kode admin cocok.
export async function saveClassData(classId, adminCode, payload) {
  const { data, error } = await supabase.rpc("save_class_data", {
    p_class_id: classId,
    p_admin_code: adminCode,
    p_data: payload,
  });
  if (error) throw error;
  return data === true;
}

// Mengecek kode admin tanpa pernah menerima kode aslinya kembali.
export async function verifyAdminCode(classId, adminCode) {
  const { data, error } = await supabase.rpc("verify_admin_code", {
    p_class_id: classId,
    p_admin_code: adminCode,
  });
  if (error) throw error;
  return data === true;
}

// Daftar "kelas baru-baru ini dibuka" — disimpan lokal di browser, hanya
// untuk kenyamanan (bukan mekanisme keamanan).
export function getRecentClasses() {
  try {
    return JSON.parse(localStorage.getItem("kaskelas-recent") || "[]");
  } catch {
    return [];
  }
}
export function rememberRecentClass(classId) {
  try {
    const list = [classId, ...getRecentClasses().filter((c) => c !== classId)].slice(0, 6);
    localStorage.setItem("kaskelas-recent", JSON.stringify(list));
  } catch {}
}

// Sesi admin per-tab (hilang saat tab ditutup) supaya reload halaman
// tidak otomatis menurunkan status admin ke viewer.
export function getStoredAdminCode(classId) {
  try {
    return sessionStorage.getItem(`admin:${classId}`);
  } catch {
    return null;
  }
}
export function storeAdminCode(classId, code) {
  try {
    sessionStorage.setItem(`admin:${classId}`, code);
  } catch {}
}
export function clearStoredAdminCode(classId) {
  try {
    sessionStorage.removeItem(`admin:${classId}`);
  } catch {}
  }
