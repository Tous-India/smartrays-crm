import { getOemGuidance } from "./oem.utils";

test("flags the manufacturers whose battery managers kill services, including brand aliases", () => {
  expect(getOemGuidance({ Manufacturer: "Xiaomi", Brand: "Redmi" }).key).toBe("xiaomi");
  expect(getOemGuidance({ Manufacturer: "unknown", Brand: "POCO" }).key).toBe("xiaomi");
  expect(getOemGuidance({ Manufacturer: "OPPO", Brand: "OPPO" }).key).toBe("oppo");
  expect(getOemGuidance({ Manufacturer: "realme", Brand: "realme" }).key).toBe("realme");
  expect(getOemGuidance({ Manufacturer: "vivo", Brand: "iQOO" }).key).toBe("vivo");
  expect(getOemGuidance({ Manufacturer: "OnePlus", Brand: "OnePlus" }).key).toBe("oneplus");
  expect(getOemGuidance({ Manufacturer: "samsung", Brand: "samsung" }).key).toBe("samsung");
});

test("stock-behaving hardware gets no guidance", () => {
  expect(getOemGuidance({ Manufacturer: "Google", Brand: "google" })).toBeNull();
  expect(getOemGuidance({})).toBeNull();
});

test("every entry has the steps the screen renders", () => {
  for (const brand of ["Xiaomi", "OPPO", "realme", "vivo", "OnePlus", "samsung"]) {
    const guidance = getOemGuidance({ Manufacturer: brand });
    expect(guidance.label).toBeTruthy();
    expect(guidance.steps.length).toBeGreaterThanOrEqual(2);
  }
});
