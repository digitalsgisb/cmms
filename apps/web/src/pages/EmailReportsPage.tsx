import { selectedPlant } from "../api/client";
import { PlantSelector } from "../components/PlantSelector";
import { ReportNavigation } from "../components/ReportNavigation";
import { WeeklyManagementReport } from "../components/WeeklyManagementReport";

export default function EmailReportsPage() {
  return <section className="page-stack" aria-label="Email reports">
    <ReportNavigation />
    <div className="analytics-plant-filter"><span>Email report plant</span><PlantSelector allowCombined compact /></div>
    <WeeklyManagementReport key={selectedPlant()} />
  </section>;
}
