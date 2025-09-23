
import React, { useState } from "react";
import axios from "axios";

import { GlobalFiltersType } from "../components/GlobalFilters";

type BusquedaProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Busqueda({ filters }: BusquedaProps) {
  const [params, setParams] = useState({
    placa: "",
    conductor: "",
    contrato: "",
    campo: "",
    mes: "",
    ano: ""
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const query = Object.entries(params)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      const url = `/api/search?${query}`;
      const response = await axios.get(url, {
        baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
      });
  setResults(response.data as any[]);
    } catch (err: any) {
      setError("Error al buscar. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gradient-to-br from-blue-50 to-blue-100 min-h-screen">
      <div className="flex items-center mb-6">
        <span className="inline-block mr-3">
          <svg width="40" height="40" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb"/><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99c.41.41 1.09.41 1.5 0s.41-1.09 0-1.5l-4.99-5zM9.5 14A4.5 4.5 0 119.5 5a4.5 4.5 0 010 9z" fill="#fff"/></svg>
        </span>
        <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">Búsqueda Predictiva</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-3xl mx-auto border border-blue-100">
        <h2 className="text-xl font-semibold mb-2 text-blue-700 flex items-center">
          <svg className="mr-2" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 17.93c-3.95.49-7.44-2.54-7.93-6.49-.07-.61.45-1.13 1.06-1.13h.01c.54 0 .99.44 1.06.98.43 3.11 3.13 5.37 6.24 4.94 2.61-.36 4.7-2.45 5.06-5.06.43-3.11-1.83-5.81-4.94-6.24-.54-.07-.98-.52-.98-1.06v-.01c0-.61.52-1.13 1.13-1.06 3.95.49 6.98 3.98 6.49 7.93-.45 3.61-3.52 6.48-7.13 6.48z" fill="#2563eb"/></svg>
          Motor de búsqueda inteligente
        </h2>
        <p className="mb-6 text-gray-600">Busca por placa, conductor, contrato, campo, mes o año. Resultados instantáneos y relevantes.</p>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 mb-8">
          <div className="flex flex-col">
            <label htmlFor="placa" className="text-sm font-medium text-gray-700 mb-1">Placa</label>
            <input id="placa" name="placa" value={params.placa} onChange={handleChange} placeholder="Placa" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="conductor" className="text-sm font-medium text-gray-700 mb-1">Conductor</label>
            <input id="conductor" name="conductor" value={params.conductor} onChange={handleChange} placeholder="Conductor" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="contrato" className="text-sm font-medium text-gray-700 mb-1">Contrato</label>
            <input id="contrato" name="contrato" value={params.contrato} onChange={handleChange} placeholder="Contrato" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="campo" className="text-sm font-medium text-gray-700 mb-1">Campo</label>
            <input id="campo" name="campo" value={params.campo} onChange={handleChange} placeholder="Campo" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="mes" className="text-sm font-medium text-gray-700 mb-1">Mes</label>
            <input id="mes" name="mes" value={params.mes} onChange={handleChange} placeholder="Mes" type="number" min="1" max="12" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="ano" className="text-sm font-medium text-gray-700 mb-1">Año</label>
            <input id="ano" name="ano" value={params.ano} onChange={handleChange} placeholder="Año" type="number" min="2000" max="2100" className="border p-2 rounded focus:ring-2 focus:ring-blue-400 transition" />
          </div>
          <button type="submit" disabled={loading} className="col-span-2 bg-gradient-to-r from-blue-600 to-blue-400 text-white px-6 py-2 rounded-lg font-semibold shadow hover:scale-105 hover:from-blue-700 transition-transform duration-150">
            {loading ? (
              <span className="flex items-center justify-center"><svg className="animate-spin mr-2" width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="4" opacity="0.2"/><path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="4"/></svg>Buscando...</span>
            ) : "Buscar"}
          </button>
        </form>
        {error && <div className="mb-4 text-red-600 font-medium">{error}</div>}
        {results.length > 0 && (
          <div className="animate-fade-in">
            <h3 className="text-lg font-bold mb-2 text-blue-800">Resultados ({results.length}):</h3>
            <div className="overflow-x-auto rounded-lg border border-blue-100 shadow">
              <table className="min-w-full border">
                <thead>
                  <tr>
                    {Object.keys(results[0]).map((col) => (
                      <th key={col} className="px-2 py-1 border-b bg-blue-50 text-xs text-blue-700 font-semibold uppercase tracking-wide">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-100 transition">
                      {Object.values(row).map((val, i) => (
                        <td key={i} className="px-2 py-1 border-b text-xs text-gray-800 font-mono">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {results.length === 0 && !loading && (
          <div className="text-gray-500">No hay resultados para los filtros seleccionados.</div>
        )}
      </div>
    </div>
  );
}
