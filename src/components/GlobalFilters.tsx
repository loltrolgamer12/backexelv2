import React from "react";

export type GlobalFiltersType = {
  estado: string;
  fatiga: string;
  fechaInicio: string;
  fechaFin: string;
  onChange: (filters: GlobalFiltersType) => void;
};

export default function GlobalFilters({ estado, fatiga, fechaInicio, fechaFin, onChange }: GlobalFiltersType) {
  return (
    <div className="flex flex-wrap gap-4 items-center mb-6 bg-white rounded-xl shadow px-6 py-4 border border-blue-100">
      <div className="flex flex-col">
        <label htmlFor="estado" className="text-xs font-medium text-gray-700 mb-1">Estado</label>
        <select id="estado" value={estado} onChange={e => onChange({ estado: e.target.value, fatiga, fechaInicio, fechaFin, onChange })} className="border p-2 rounded focus:ring-2 focus:ring-blue-400">
          <option value="">Todos</option>
          <option value="verde">Verde</option>
          <option value="amarillo">Amarillo</option>
          <option value="rojo">Rojo</option>
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor="fatiga" className="text-xs font-medium text-gray-700 mb-1">Fatiga</label>
        <select id="fatiga" value={fatiga} onChange={e => onChange({ estado, fatiga: e.target.value, fechaInicio, fechaFin, onChange })} className="border p-2 rounded focus:ring-2 focus:ring-yellow-400">
          <option value="">Todos</option>
          <option value="ninguna">Ninguna</option>
          <option value="leve">Leve</option>
          <option value="grave">Grave</option>
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor="fechaInicio" className="text-xs font-medium text-gray-700 mb-1">Desde</label>
        <input id="fechaInicio" type="date" value={fechaInicio} onChange={e => onChange({ estado, fatiga, fechaInicio: e.target.value, fechaFin, onChange })} className="border p-2 rounded focus:ring-2 focus:ring-blue-400" />
      </div>
      <div className="flex flex-col">
        <label htmlFor="fechaFin" className="text-xs font-medium text-gray-700 mb-1">Hasta</label>
        <input id="fechaFin" type="date" value={fechaFin} onChange={e => onChange({ estado, fatiga, fechaInicio, fechaFin: e.target.value, onChange })} className="border p-2 rounded focus:ring-2 focus:ring-blue-400" />
      </div>
    </div>
  );
}
