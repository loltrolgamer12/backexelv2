import React from "react";

import Sidebar from "./components/Sidebar";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Conductores from "./pages/Conductores";
import Vehiculos from "./pages/Vehiculos";
import Fatiga from "./pages/Fatiga";
import CargaExcel from "./pages/CargaExcel";
import Reportes from "./pages/Reportes";
import Busqueda from "./pages/Busqueda";

function Inicio() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4 text-blue-900">Sistema de Inspección Vehicular</h1>
      <p className="text-lg text-gray-700 mb-6">Plataforma integral de gestión vehicular con IA integrada, análisis predictivo y alertas automáticas para la optimización total de su flota.</p>
      {/* Aquí irán los cards y métricas del estado del sistema */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded shadow p-6">
          <h2 className="text-xl font-semibold mb-2 text-green-700">Estado del Sistema en Tiempo Real</h2>
          <ul className="space-y-1">
            <li><span className="font-medium">Base de Datos:</span> <span className="text-green-600">Conectada</span></li>
            <li><span className="font-medium">API Status:</span> <span className="text-green-600">Operativo</span></li>
            <li><span className="font-medium">Performance:</span> <span className="text-yellow-500">N/A</span></li>
          </ul>
        </div>
        <div className="bg-white rounded shadow p-6">
          <h2 className="text-xl font-semibold mb-2 text-blue-700">Dashboard Ejecutivo</h2>
          <ul className="space-y-1">
            <li>Métricas en tiempo real</li>
            <li>Análisis predictivo</li>
            <li>Alertas automáticas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [filters, setFilters] = React.useState({
    estado: "",
    fatiga: "",
    fechaInicio: "",
    fechaFin: "",
    onChange: (f: any) => setFilters({ ...filters, ...f })
  });
  const GlobalFilters = require('./components/GlobalFilters').default;
  return (
    <Router>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1">
          <GlobalFilters {...filters} />
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/dashboard" element={<Dashboard filters={filters} />} />
            <Route path="/conductores" element={<Conductores filters={filters} />} />
            <Route path="/vehiculos" element={<Vehiculos filters={filters} />} />
            <Route path="/fatiga" element={<Fatiga filters={filters} />} />
            <Route path="/carga-excel" element={<CargaExcel />} />
            <Route path="/reportes" element={<Reportes filters={filters} />} />
            <Route path="/busqueda" element={<Busqueda filters={filters} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
