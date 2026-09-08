import { plantLabels, type PlantId } from "@sugi-cmms/shared";
import { useLocation } from "react-router-dom";
import { selectedPlant, setSelectedPlant } from "../api/client";
import { useCurrentUser } from "../state/UserContext";

export function PlantSelector() {
  const { currentUser, loadingUsers } = useCurrentUser();
  const { pathname } = useLocation();
  if (loadingUsers || pathname === "/login" || pathname.startsWith("/requester/track/")) return null;
  if (!currentUser && pathname !== "/requester") return null;
  const plants: PlantId[] = !currentUser || currentUser.plantAccess === "both"
    ? ["port-klang", "sendayan"] : [currentUser.plantAccess];
  const combined = currentUser?.plantAccess === "both" && ["/performance", "/reports", "/", "/tv"].includes(pathname);
  const value = selectedPlant();
  return <div className="plant-scope-bar">
    <label htmlFor="plant-scope">Plant</label>
    <select id="plant-scope" value={value} disabled={plants.length === 1} onChange={(event) => {
      setSelectedPlant(event.target.value as PlantId | "all");
      // Reload clears page caches and pending selections from the previous plant.
      const target = pathname.startsWith("/work-orders/") ? "/work-orders"
        : pathname.startsWith("/spare-parts/") ? "/spare-parts"
        : pathname.startsWith("/preventive-maintenance/") ? "/preventive-maintenance" : pathname;
      window.location.assign(target + (target === "/requester" ? `?plant=${event.target.value}` : ""));
    }}>
      {plants.map((plant) => <option key={plant} value={plant}>{plantLabels[plant]}</option>)}
      {combined && <option value="all">Both plants</option>}
    </select>
    <span>{value === "all" ? "Combined reporting" : "Records and actions apply to this plant"}</span>
  </div>;
}
