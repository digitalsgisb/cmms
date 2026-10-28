import { FileBarChart, Mail } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./report-navigation.css";

export function ReportNavigation() {
  return <nav className="report-section-navigation" aria-label="Reporting sections">
    <NavLink to="/reports" end className={({ isActive }) => isActive ? "active" : ""}><FileBarChart size={17} aria-hidden="true" />Report library</NavLink>
    <NavLink to="/reports/email" className={({ isActive }) => isActive ? "active" : ""}><Mail size={17} aria-hidden="true" />Email reports</NavLink>
  </nav>;
}
