import React, { useEffect, useState } from "react";
import { GlobalFiltersType } from "../components/GlobalFilters";

type VehiculosProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Vehiculos({ filters }: VehiculosProps) {
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/vehicles/failures`)
      .then(res => res.json())
      .then(data => {
        setVehiculos(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar vehículos");
        setLoading(false);
      });
  }, []);

  // Filtrado por estado y fechas
  const filtrados = vehiculos.filter(v => {
    let ok = true;
    if (filters.estado && v.estado !== filters.estado) ok = false;
    if (filters.fechaInicio && v.ultima_inspeccion) {
      ok = ok && new Date(v.ultima_inspeccion) >= new Date(filters.fechaInicio);
    }
    if (filters.fechaFin && v.ultima_inspeccion) {
      ok = ok && new Date(v.ultima_inspeccion) <= new Date(filters.fechaFin);
    }
    return ok;
  });

  const colorCard = (estado: string) => {
    if (estado === "verde") return "border-green-400 bg-green-50";
    if (estado === "amarillo") return "border-yellow-300 bg-yellow-50";
    if (estado === "naranja") return "border-orange-300 bg-orange-50";
    return "border-red-400 bg-red-50";
  };
  const colorTitulo = (estado: string) => {
    if (estado === "verde") return "text-green-700";
    if (estado === "amarillo") return "text-yellow-700";
    if (estado === "naranja") return "text-orange-700";
    return "text-red-700";
  };

  return (
    <div className="p-8 bg-gradient-to-br from-purple-50 to-purple-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-purple-300" />
        <h1 className="text-3xl font-extrabold text-purple-900 tracking-tight">Control de Vehículos</h1>
      </div>
      <div className="mb-4">
        <span className="text-sm text-purple-700 font-semibold">Filtros activos:</span>
        <ul className="flex gap-4 mt-1 text-xs text-purple-900">
          {filters.estado && <li><b>Estado:</b> {filters.estado}</li>}
          {filters.fechaInicio && <li><b>Desde:</b> {filters.fechaInicio}</li>}
          {filters.fechaFin && <li><b>Hasta:</b> {filters.fechaFin}</li>}
          {!filters.estado && !filters.fechaInicio && !filters.fechaFin && <li>Sin filtros</li>}
        </ul>
      </div>
      {loading && <div className="text-purple-600">Cargando vehículos...</div>}
      {error && <div className="text-red-600 font-medium mb-4">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {filtrados.map((v, idx) => (
          <div key={idx} className={`rounded-2xl shadow-xl p-6 border-2 ${colorCard(v.estado)} relative overflow-hidden group transition-all duration-200`}>  
            <div className="flex items-center mb-2">
              <svg className="mr-2" width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="3" y="10" width="18" height="7" rx="2" fill="#a78bfa"/><rect x="6" y="7" width="12" height="5" rx="2" fill="#ddd"/><circle cx="7" cy="19" r="2" fill="#a78bfa"/><circle cx="17" cy="19" r="2" fill="#a78bfa"/></svg>
              <h2 className={`text-xl font-extrabold ${colorTitulo(v.estado)} drop-shadow`}>{v.placa}</h2>
            </div>
            <ul className="mb-2 text-sm">
              <li><b>Estado:</b> <span className={`font-bold ${colorTitulo(v.estado)}`}>{v.estado.toUpperCase()}</span></li>
              <li><b>Inspecciones:</b> {v.total_inspecciones}</li>
              <li><b>Días sin inspección:</b> {v.dias_sin_inspeccion}</li>
            </ul>
            <div className="mt-2 text-xs text-gray-500">Última inspección: {v.ultima_inspeccion ? new Date(v.ultima_inspeccion).toLocaleDateString() : "Sin datos"}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto border border-purple-100">
        <h2 className="text-xl font-semibold mb-2 text-purple-700 flex items-center">
          <svg className="mr-2" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M5 16l3-8h8l3 8H5zm2-2h10v2H7v-2z" fill="#a78bfa"/></svg>
          Tabla de Vehículos
        </h2>
        <table className="min-w-full border mt-4">
          <thead>
            <tr>
              <th className="px-2 py-1 border-b bg-purple-50 text-xs text-purple-700">Placa</th>
              <th className="px-2 py-1 border-b bg-purple-50 text-xs text-purple-700">Estado</th>
              <th className="px-2 py-1 border-b bg-purple-50 text-xs text-purple-700">Inspecciones</th>
              <th className="px-2 py-1 border-b bg-purple-50 text-xs text-purple-700">Días sin inspección</th>
              <th className="px-2 py-1 border-b bg-purple-50 text-xs text-purple-700">Última inspección</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((v, idx) => (
              <tr key={idx} className="hover:bg-purple-100 transition">
                <td className="px-2 py-1 border-b text-xs">{v.placa}</td>
                <td className={`px-2 py-1 border-b text-xs font-bold ${colorTitulo(v.estado)}`}>{v.estado.toUpperCase()}</td>
                <td className="px-2 py-1 border-b text-xs">{v.total_inspecciones}</td>
                <td className="px-2 py-1 border-b text-xs">{v.dias_sin_inspeccion}</td>
                <td className="px-2 py-1 border-b text-xs">{v.ultima_inspeccion ? new Date(v.ultima_inspeccion).toLocaleDateString() : "Sin datos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-2 text-purple-800">Métricas generales</h3>
          <ul className="mb-2">
            <li><b>Total vehículos:</b> {filtrados.length}</li>
            <li><b>Verdes:</b> {filtrados.filter(v => v.estado === "verde").length}</li>
            <li><b>Amarillos:</b> {filtrados.filter(v => v.estado === "amarillo").length}</li>
            <li><b>Naranja:</b> {filtrados.filter(v => v.estado === "naranja").length}</li>
            <li><b>Rojos:</b> {filtrados.filter(v => v.estado === "rojo").length}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
