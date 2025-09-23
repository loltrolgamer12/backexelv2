
import React, { useEffect, useState } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

import { GlobalFiltersType } from "../components/GlobalFilters";

type DashboardProps = {
  filters: Omit<GlobalFiltersType, "onChange">;
};

export default function Dashboard({ filters }: DashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [cumplimiento, setCumplimiento] = useState<any[]>([]);
  const [fatiga, setFatiga] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Obtener métricas generales
        const resMetrics = await axios.get("/api/analysis", {
          baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
        });
        setMetrics(resMetrics.data);
        // Obtener inspecciones por mes para la gráfica
        const resChart = await axios.get("/api/analysis/inspecciones-por-mes", {
          baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
        });
          setChartData(resChart.data as any[]);
        // Obtener cumplimiento de conductores
        const resCumplimiento = await axios.get("/api/analysis/cumplimiento-conductores", {
          baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
        });
          setCumplimiento(resCumplimiento.data as any[]);
        // Obtener fatiga
        const resFatiga = await axios.get("/api/analysis/fatiga", {
          baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:8000",
        });
          setFatiga(resFatiga.data as any[]);
      } catch (err: any) {
        setError("Error al cargar métricas");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-8 bg-gradient-to-br from-blue-50 to-blue-100 min-h-screen">
      <div className="flex items-center mb-8">
        <img src="/logo192.png" alt="Logo empresa" className="w-14 h-14 rounded-full shadow-lg mr-4 border-2 border-blue-300" />
        <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">Dashboard Ejecutivo</h1>
      </div>
      {loading && <div className="text-blue-600">Cargando métricas...</div>}
      {error && <div className="text-red-600 font-medium mb-4">{error}</div>}
      {metrics && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
            <h2 className="text-lg font-semibold mb-2 text-green-700">Métricas en tiempo real</h2>
            <ul className="space-y-1">
              <li>Inspecciones totales: <span className="font-bold text-blue-700">{metrics.total_inspecciones}</span></li>
              <li>Conductores únicos: <span className="font-bold text-blue-700">{metrics.total_conductores}</span></li>
              <li>Vehículos únicos: <span className="font-bold text-blue-700">{metrics.total_vehiculos}</span></li>
            </ul>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
            <h2 className="text-lg font-semibold mb-2 text-blue-700">Alertas automáticas</h2>
            <ul className="space-y-1">
              <li>Fatiga detectada: <span className="font-bold text-red-600">{metrics.fatiga_detectada ?? '--'}</span></li>
              <li>Inspecciones vencidas: <span className="font-bold text-yellow-600">{metrics.inspecciones_vencidas ?? '--'}</span></li>
            </ul>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
          <h2 className="text-lg font-semibold mb-4 text-blue-900">Inspecciones por mes</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="inspecciones" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
          <h2 className="text-lg font-semibold mb-4 text-green-900">Cumplimiento de Conductores</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={cumplimiento} dataKey="value" nameKey="estado" cx="50%" cy="50%" outerRadius={70} label>
                {cumplimiento.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.estado === "verde" ? "#22c55e" : entry.estado === "amarillo" ? "#facc15" : entry.estado === "rojo" ? "#ef4444" : "#a3a3a3"} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
          <h2 className="text-lg font-semibold mb-4 text-yellow-900">Fatiga detectada</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={fatiga} dataKey="value" nameKey="estado" cx="50%" cy="50%" outerRadius={70} label>
                {fatiga.map((entry, idx) => (
                  <Cell key={`cell-fatiga-${idx}`} fill={entry.estado === "Apto" ? "#22c55e" : entry.estado === "Fatiga leve" ? "#facc15" : entry.estado === "Fatiga" ? "#ef4444" : "#a3a3a3"} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
          <h2 className="text-lg font-semibold mb-4 text-purple-900">Vehículos inspeccionados</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="vehiculos" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
