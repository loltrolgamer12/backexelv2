import React, { useState } from "react";
import axios from "axios";

export default function CargaExcel() {
  const [file, setFile] = useState<File | null>(null);
  const [plateMode, setPlateMode] = useState("flexible");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = `/api/upload-excel?plate_mode=${plateMode}`;
      const response = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
      });
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al subir el archivo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gradient-to-br from-orange-50 to-orange-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-orange-300" />
        <h1 className="text-3xl font-extrabold text-orange-900 tracking-tight">Carga Inteligente de Excel</h1>
      </div>
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-xl mx-auto border border-orange-200">
        <h2 className="text-2xl font-bold mb-3 text-orange-700 flex items-center gap-2">
          <svg className="mr-2" width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v8H8V8z" fill="#ea580c"/></svg>
          Procesamiento automático de archivos HQ-FO-40
        </h2>
        <p className="mb-6 text-gray-600 text-base">Sube tu archivo Excel para validación, deduplicación y análisis instantáneo. El sistema detecta duplicados y errores automáticamente.</p>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-orange-700" htmlFor="excel-upload">Archivo Excel</label>
            <input id="excel-upload" type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="border-2 border-orange-300 p-3 rounded-xl w-full focus:ring-2 focus:ring-orange-400 transition file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-100 file:text-orange-700" title="Selecciona un archivo Excel para cargar" placeholder="Selecciona archivo" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-orange-700" htmlFor="plate-mode">Modo de validación de placas</label>
            <select id="plate-mode" value={plateMode} onChange={e => setPlateMode(e.target.value)} className="border-2 border-orange-300 p-3 rounded-xl w-full focus:ring-2 focus:ring-orange-400 transition font-semibold text-orange-900 bg-orange-50" title="Selecciona el modo de validación de placas">
              <option value="strict">Estricto</option>
              <option value="flexible">Flexible</option>
              <option value="permissive">Permisivo</option>
            </select>
          </div>
          <button type="submit" disabled={loading || !file} className="bg-gradient-to-r from-orange-600 to-orange-400 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 hover:from-orange-700 transition-transform duration-150 flex items-center gap-2 text-lg">
            {loading ? (
              <span className="flex items-center justify-center"><svg className="animate-spin mr-2" width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="4" opacity="0.2"/><path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="4"/></svg>Procesando...</span>
            ) : (
              <>
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 12h16m-8-8v16" stroke="#fff" strokeWidth="2"/></svg>
                Subir y analizar
              </>
            )}
          </button>
        </form>
        {error && <div className="mt-6 text-red-600 font-semibold text-center animate-fade-in">{error}</div>}
        {result && (
          <div className="mt-8 animate-fade-in">
            <h3 className="text-xl font-bold mb-3 text-orange-800 flex items-center gap-2">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="#ea580c"/><rect x="7" y="7" width="10" height="10" rx="2" fill="#fff"/></svg>
              Resultado del análisis
            </h3>
            <ul className="mb-4 text-base text-gray-700">
              <li><b>Archivo:</b> <span className="font-mono text-orange-700">{result.filename}</span></li>
              <li><b>Filas totales:</b> {result.total_rows}</li>
              <li><b>Filas válidas:</b> <span className="font-bold text-green-700">{result.valid_rows}</span></li>
              <li><b>Filas inválidas:</b> <span className="font-bold text-red-700">{result.invalid_rows}</span></li>
              <li><b>Duplicados:</b> <span className="font-bold text-yellow-700">{result.duplicados}</span></li>
              <li><b>Nuevos insertados:</b> <span className="font-bold text-orange-700">{result.insertados}</span></li>
            </ul>
            {result.invalid && result.invalid.length > 0 && (
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-xl mb-2">
                <b className="text-orange-800">Errores (primeros 5):</b>
                <ul className="list-disc ml-6 text-sm text-red-700">
                  {result.invalid.slice(0, 5).map((err: any, idx: number) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
