import { productionSectionLabels, type ProductionSection } from "../utils/productionDashboard";

export function ProductionSectionFilter({ value, onChange }: { value: ProductionSection; onChange: (value: ProductionSection) => void }) {
  return <div className="production-section-filter" role="group" aria-label="Filter production section">
    {(Object.keys(productionSectionLabels) as ProductionSection[]).map((section) =>
      <button type="button" key={section} aria-pressed={value === section} onClick={() => onChange(section)}>{productionSectionLabels[section]}</button>)}
  </div>;
}
