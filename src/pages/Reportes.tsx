import React from "react";
import { GlobalFiltersType } from "../components/GlobalFilters";

// Simulación de métricas, reemplazar por fetch real en producción
const METRICAS = [
  { indicador: "Inspecciones realizadas", valor: 120 },
  { indicador: "Conductores en estado crítico", valor: 4 },
  { indicador: "Vehículos con fallas", valor: 7 },
  { indicador: "Fatiga detectada", valor: 2 },
];

// Filtra las métricas según los filtros activos
function filtrarMetricas(metricas: typeof METRICAS, filters: Omit<GlobalFiltersType, "onChange">) {
  // Aquí podrías aplicar lógica real de filtrado según los datos y filtros
  // Por ahora, solo se muestra todo si no hay filtros
  return metricas;
}

type ReportesProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Reportes({ filters }: ReportesProps) {
  const metricasFiltradas = filtrarMetricas(METRICAS, filters);

  return (
    <div className="p-8 bg-gradient-to-br from-blue-50 to-blue-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-blue-300" />
        <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">Reportes Ejecutivos</h1>
      </div>
      <div className="mb-4">
        <span className="text-sm text-blue-700 font-semibold">Filtros activos:</span>
        <ul className="flex gap-4 mt-1 text-xs text-blue-900">
          {filters.estado && <li><b>Estado:</b> {filters.estado}</li>}
          {filters.fatiga && <li><b>Fatiga:</b> {filters.fatiga}</li>}
          {filters.fechaInicio && <li><b>Desde:</b> {filters.fechaInicio}</li>}
          {filters.fechaFin && <li><b>Hasta:</b> {filters.fechaFin}</li>}
          {!filters.estado && !filters.fatiga && !filters.fechaInicio && !filters.fechaFin && <li>Sin filtros</li>}
        </ul>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto border border-blue-100">
        <h2 className="text-xl font-semibold mb-2 text-blue-700 flex items-center">
          <svg className="mr-2" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M6 2h9a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v16h9V4H6zm2 2h5v2H8V6zm0 4h5v2H8v-2zm0 4h5v2H8v-2z" fill="#2563eb"/></svg>
          Generación automática de informes
        </h2>
        <p className="mb-6 text-gray-600">Descarga informes profesionales en PDF con métricas personalizadas y análisis comparativo.</p>
        <div className="flex gap-4 mb-6">
          <a
            href={`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/reports/generate-pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gradient-to-r from-orange-600 to-orange-400 text-white px-6 py-2 rounded-lg font-semibold shadow hover:scale-105 transition-transform flex items-center gap-2"
            download
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 16v-8m0 8l-4-4m4 4l4-4" stroke="#fff" strokeWidth="2"/></svg>
            Descargar reporte PDF
          </a>
          <a
            href={`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/reports/generate-txt`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gradient-to-r from-blue-600 to-blue-400 text-white px-6 py-2 rounded-lg font-semibold shadow hover:scale-105 transition-transform flex items-center gap-2"
            download
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 2h9a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v16h9V4H6zm2 2h5v2H8V6zm0 4h5v2H8v-2zm0 4h5v2H8v-2z" fill="#fff"/></svg>
            Descargar reporte TXT
          </a>
        </div>
        <h3 className="text-lg font-bold mb-2 text-blue-800">Métricas del último informe</h3>
        <table className="min-w-full border mb-4 rounded-xl overflow-hidden shadow">
          <thead>
            <tr>
              <th className="px-2 py-2 border-b bg-blue-50 text-xs text-blue-700 text-left">Indicador</th>
              <th className="px-2 py-2 border-b bg-blue-50 text-xs text-blue-700 text-left">Valor</th>
            </tr>
          </thead>
          <tbody>
            {metricasFiltradas.map((m, idx) => (
              <tr key={idx} className="hover:bg-blue-100 transition">
                <td className="px-2 py-2 border-b text-xs font-semibold text-blue-900">{m.indicador}</td>
                <td className="px-2 py-2 border-b text-xs text-blue-700">{m.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 text-xs text-gray-500 text-center">
          <span>Última actualización: 23/09/2025 &bull; Fuente: Sistema de Inspección Vehicular</span>
        </div>
      </div>
    </div>
  );
}
