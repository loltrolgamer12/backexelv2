import React, { useEffect, useState } from "react";
import { GlobalFiltersType } from "../components/GlobalFilters";

type ConductoresProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Conductores({ filters }: ConductoresProps) {
  const [conductores, setConductores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/drivers/status`)
      .then(res => res.json())
      .then(data => {
        setConductores(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar conductores");
        setLoading(false);
      });
  }, []);

  // Filtrado por estado, fatiga, fechas
  const filtrados = conductores.filter(c => {
    let ok = true;
    if (filters.estado && c.estado !== filters.estado) ok = false;
    // Si hay lógica de fatiga, agregar aquí
    if (filters.fechaInicio && c.ultima_inspeccion) {
      ok = ok && new Date(c.ultima_inspeccion) >= new Date(filters.fechaInicio);
    }
    if (filters.fechaFin && c.ultima_inspeccion) {
      ok = ok && new Date(c.ultima_inspeccion) <= new Date(filters.fechaFin);
    }
    return ok;
  });

  return (
    <div className="p-8 bg-gradient-to-br from-green-50 to-green-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-green-300" />
        <h1 className="text-3xl font-extrabold text-green-900 tracking-tight">Gestión de Conductores</h1>
      </div>
      <div className="mb-4">
        <span className="text-sm text-green-700 font-semibold">Filtros activos:</span>
        <ul className="flex gap-4 mt-1 text-xs text-green-900">
          {filters.estado && <li><b>Estado:</b> {filters.estado}</li>}
          {filters.fatiga && <li><b>Fatiga:</b> {filters.fatiga}</li>}
          {filters.fechaInicio && <li><b>Desde:</b> {filters.fechaInicio}</li>}
          {filters.fechaFin && <li><b>Hasta:</b> {filters.fechaFin}</li>}
          {!filters.estado && !filters.fatiga && !filters.fechaInicio && !filters.fechaFin && <li>Sin filtros</li>}
        </ul>
      </div>
      {loading && <div className="text-green-600">Cargando conductores...</div>}
      {error && <div className="text-red-600 font-medium mb-4">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {filtrados.map((c, idx) => (
          <div key={idx} className={`rounded-2xl shadow-lg p-6 border-2 ${c.estado === "rojo" ? "border-red-400 bg-red-50" : c.estado === "amarillo" ? "border-yellow-300 bg-yellow-50" : "border-green-400 bg-green-50"}`}>
            <h2 className={`text-xl font-bold mb-2 ${c.estado === "rojo" ? "text-red-700" : c.estado === "amarillo" ? "text-yellow-700" : "text-green-700"}`}>{c.conductor}</h2>
            <ul className="mb-2 text-sm">
              <li><b>Estado:</b> <span className={`font-bold ${c.estado === "rojo" ? "text-red-600" : c.estado === "amarillo" ? "text-yellow-600" : "text-green-600"}`}>{c.estado.toUpperCase()}</span></li>
              <li><b>Placa:</b> {c.placa}</li>
              <li><b>Contrato:</b> {c.contrato}</li>
              <li><b>Campo:</b> {c.campo_coordinacion}</li>
              <li><b>Días sin inspección:</b> {c.dias_sin_inspeccion}</li>
            </ul>
            <div className="mt-2 text-xs text-gray-500">Última inspección: {c.ultima_inspeccion ? new Date(c.ultima_inspeccion).toLocaleDateString() : "Sin datos"}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto border border-green-100">
        <h2 className="text-xl font-semibold mb-2 text-green-700 flex items-center">
          <svg className="mr-2" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#22c55e"/></svg>
          Tabla de Conductores
        </h2>
        <table className="min-w-full border mt-4">
          <thead>
            <tr>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Nombre</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Estado</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Placa</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Contrato</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Campo</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Días sin inspección</th>
              <th className="px-2 py-1 border-b bg-green-50 text-xs text-green-700">Última inspección</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c, idx) => (
              <tr key={idx} className="hover:bg-green-100 transition">
                <td className="px-2 py-1 border-b text-xs">{c.conductor}</td>
                <td className={`px-2 py-1 border-b text-xs font-bold ${c.estado === "rojo" ? "text-red-600" : c.estado === "amarillo" ? "text-yellow-600" : "text-green-600"}`}>{c.estado.toUpperCase()}</td>
                <td className="px-2 py-1 border-b text-xs">{c.placa}</td>
                <td className="px-2 py-1 border-b text-xs">{c.contrato}</td>
                <td className="px-2 py-1 border-b text-xs">{c.campo_coordinacion}</td>
                <td className="px-2 py-1 border-b text-xs">{c.dias_sin_inspeccion}</td>
                <td className="px-2 py-1 border-b text-xs">{c.ultima_inspeccion ? new Date(c.ultima_inspeccion).toLocaleDateString() : "Sin datos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-2 text-green-800">Métricas generales</h3>
          <ul className="mb-2">
            <li><b>Total conductores:</b> {filtrados.length}</li>
            <li><b>En estado amarillo:</b> {filtrados.filter(c => c.estado === "amarillo").length}</li>
            <li><b>En estado rojo:</b> {filtrados.filter(c => c.estado === "rojo").length}</li>
            <li><b>En estado verde:</b> {filtrados.filter(c => c.estado === "verde").length}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
