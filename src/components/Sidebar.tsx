import React from "react";
import { NavLink } from "react-router-dom";
import logo from "../logo.jpeg";

const menu = [
  { name: "Inicio", path: "/" },
  { name: "Dashboard", path: "/dashboard" },
  { name: "Conductores", path: "/conductores" },
  { name: "Vehículos", path: "/vehiculos" },
  { name: "Control de Fatiga", path: "/fatiga" },
  { name: "Carga Excel", path: "/carga-excel" },
  { name: "Reportes", path: "/reportes" },
  { name: "Búsqueda", path: "/busqueda" },
];

export default function Sidebar() {
  return (
    <aside className="bg-white shadow h-screen w-64 flex flex-col">
      <div className="flex items-center justify-center h-20 border-b">
        <img src={logo} alt="Logo" className="h-12 w-auto" />
      </div>
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {menu.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={(navData: { isActive: boolean }) =>
                  `block px-4 py-2 rounded hover:bg-blue-100 transition font-medium ${navData.isActive ? "bg-blue-200 text-blue-900" : "text-gray-700"}`
                }
              >
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <footer className="px-4 py-2 text-xs text-gray-400 border-t">Sistema de Inspección Vehicular © 2024 SAIQ</footer>
    </aside>
  );
}
