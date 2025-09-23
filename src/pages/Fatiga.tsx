import React, { useEffect, useState } from "react";
import { GlobalFiltersType } from "../components/GlobalFilters";

type FatigaProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Fatiga({ filters }: FatigaProps) {
  const [fatiga, setFatiga] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/fatigue/critical`)
      .then(res => res.json())
      .then(data => {
        setFatiga(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar fatiga");
        setLoading(false);
      });
  }, []);

  // Filtrado por estado, fechas y fatiga
  const filtrados = fatiga.filter(f => {
    let ok = true;
    if (filters.estado && f.estado_fatiga !== filters.estado) ok = false;
    if (filters.fatiga && f.estado_fatiga !== filters.fatiga) ok = false;
    if (filters.fechaInicio && f.fecha_evaluacion) {
      ok = ok && new Date(f.fecha_evaluacion) >= new Date(filters.fechaInicio);
    }
    if (filters.fechaFin && f.fecha_evaluacion) {
      ok = ok && new Date(f.fecha_evaluacion) <= new Date(filters.fechaFin);
    }
    return ok;
  });

  return (
    <div className="p-8 bg-gradient-to-br from-yellow-50 to-yellow-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-yellow-300" />
        <h1 className="text-3xl font-extrabold text-yellow-900 tracking-tight">Control de Fatiga</h1>
      </div>
      <div className="mb-4">
        <span className="text-sm text-yellow-700 font-semibold">Filtros activos:</span>
        <ul className="flex gap-4 mt-1 text-xs text-yellow-900">
          {filters.estado && <li><b>Estado:</b> {filters.estado}</li>}
          {filters.fatiga && <li><b>Fatiga:</b> {filters.fatiga}</li>}
          {filters.fechaInicio && <li><b>Desde:</b> {filters.fechaInicio}</li>}
          {filters.fechaFin && <li><b>Hasta:</b> {filters.fechaFin}</li>}
          {!filters.estado && !filters.fatiga && !filters.fechaInicio && !filters.fechaFin && <li>Sin filtros</li>}
        </ul>
      </div>
      {loading && <div className="text-yellow-600">Cargando fatiga...</div>}
      {error && <div className="text-red-600 font-medium mb-4">{error}</div>}
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto border border-yellow-100">
        <h2 className="text-xl font-semibold mb-2 text-yellow-700 flex items-center">
          <svg className="mr-2" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 17.93c-3.95.49-7.44-2.54-7.93-6.49-.07-.61.45-1.13 1.06-1.13h.01c.54 0 .99.44 1.06.98.43 3.11 3.13 5.37 6.24 4.94 2.61-.36 4.7-2.45 5.06-5.06.43-3.11-1.83-5.81-4.94-6.24-.54-.07-.98-.52-.98-1.06v-.01c0-.61.52-1.13 1.13-1.06 3.95.49 6.98 3.98 6.49 7.93-.45 3.61-3.52 6.48-7.13 6.48z" fill="#facc15"/></svg>
          Tabla de Fatiga
        </h2>
        <table className="min-w-full border mt-4">
          <thead>
            <tr>
              <th className="px-2 py-1 border-b bg-yellow-50 text-xs text-yellow-700">Conductor</th>
              <th className="px-2 py-1 border-b bg-yellow-50 text-xs text-yellow-700">Placa</th>
              <th className="px-2 py-1 border-b bg-yellow-50 text-xs text-yellow-700">Score</th>
              <th className="px-2 py-1 border-b bg-yellow-50 text-xs text-yellow-700">Estado Fatiga</th>
              <th className="px-2 py-1 border-b bg-yellow-50 text-xs text-yellow-700">Fecha Evaluación</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f, idx) => (
              <tr key={idx} className="hover:bg-yellow-100 transition">
                <td className="px-2 py-1 border-b text-xs">{f.conductor}</td>
                <td className="px-2 py-1 border-b text-xs">{f.placa}</td>
                <td className="px-2 py-1 border-b text-xs">{f.score_fatiga}</td>
                <td className="px-2 py-1 border-b text-xs font-bold">{f.estado_fatiga}</td>
                <td className="px-2 py-1 border-b text-xs">{f.fecha_evaluacion ? new Date(f.fecha_evaluacion).toLocaleDateString() : "Sin datos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-2 text-yellow-800">Métricas generales</h3>
          <ul className="mb-2">
            <li><b>Total registros:</b> {filtrados.length}</li>
            <li><b>Fatiga crítica:</b> {filtrados.filter(f => f.estado_fatiga === "crítica").length}</li>
            <li><b>Fatiga leve:</b> {filtrados.filter(f => f.estado_fatiga === "leve").length}</li>
            <li><b>Fatiga baja:</b> {filtrados.filter(f => f.estado_fatiga === "baja").length}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
